import PDFDocument from "pdfkit";
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface PdfOrderItem {
  productId: string;
  productName: string;
  size: string;
  color: string;
  price: number;
  quantity: number;
}

export interface PdfOrderPayload {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerAddress?: string;
  deliveryMethod: "pickup" | "delivery";
  items: PdfOrderItem[];
  totalAmount: number;
  status: string;
  createdAt: string;
  paymentMethod?: string;
  paymentChannel?: "cod" | "upi" | "card";
  paymentStatus?: "unpaid" | "paid";
  transactionId?: string;
  billNumber?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  razorpayMeUrl?: string;
  gatewayConfirmedAt?: string;
}

interface StoredBillRecord {
  billNumber: string;
  filename: string;
  filePath: string;
  buffer: Buffer;
  order: PdfOrderPayload;
  createdAt: string;
  token: string;
}

const BILLS_DIR = "/tmp/thread_den_bills";
const BILL_TOKEN_SECRET =
  process.env.RAZORPAY_KEY_SECRET?.trim() || "thread_den_pdf_bill_secret_v1";

try {
  if (!fs.existsSync(BILLS_DIR)) {
    fs.mkdirSync(BILLS_DIR, { recursive: true });
  }
} catch {
  // Ignore mkdir failures and rely on memory store
}

const storedBills = new Map<string, StoredBillRecord>();

function formatPdfAmount(amount: number, currencySymbol = "₹"): string {
  const prefix = currencySymbol === "₹" ? "Rs. " : `${currencySymbol} `;
  return `${prefix}${Number(amount || 0).toLocaleString("en-IN")}`;
}

export function createBillAccessToken(billNumber: string): string {
  return crypto
    .createHmac("sha256", BILL_TOKEN_SECRET)
    .update(billNumber)
    .digest("hex")
    .slice(0, 20);
}

export function getPublicBaseUrl(req?: express.Request): string {
  const fromEnv = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (req) {
    const proto =
      (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() ||
      req.protocol ||
      "http";
    const host =
      (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() ||
      req.get("host");
    if (host) {
      return `${proto}://${host}`;
    }
  }
  if (fromEnv && !fromEnv.includes("MY_APP_URL")) {
    return fromEnv;
  }
  return "http://localhost:3000";
}

export async function generateInvoicePdfBuffer(
  order: PdfOrderPayload,
  currencySymbol = "₹",
  brandName = "THREAD DEN"
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 44,
        info: {
          Title: `${brandName} Invoice ${order.billNumber || order.id}`,
          Author: brandName,
          Subject: `Tax Invoice & Razorpay Payment Receipt for Order ${order.id}`,
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      const isCod = order.paymentChannel === "cod" || order.paymentStatus === "unpaid";
      const billNo = order.billNumber || `BILL-${order.id}`;
      const deliveryFee = order.deliveryMethod === "delivery" ? 100 : 0;
      const subtotal = Math.max(0, Number(order.totalAmount || 0) - deliveryFee);
      const gstIncluded = Math.round(Number(order.totalAmount || 0) * 0.0476);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const left = doc.page.margins.left;

      // Top Brand Header Banner
      doc.roundedRect(left, 36, pageWidth, 86, 10).fill("#09090b");
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(20)
        .text(brandName.toUpperCase(), left + 20, 52, { width: 280 });
      doc
        .fillColor("#a1a1aa")
        .font("Helvetica")
        .fontSize(9.5)
        .text("OFFICIAL TAX INVOICE & PAYMENT RECEIPT", left + 20, 77, { width: 300 });
      doc
        .fillColor("#34d399")
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(
          isCod
            ? "CASH ON DELIVERY — PAY AT DOORSTEP"
            : "RAZORPAY GATEWAY CONFIRMED • PAID",
          left + 20,
          94,
          { width: 320 }
        );

      // Right side Bill No in Banner
      doc
        .fillColor("#a1a1aa")
        .font("Helvetica")
        .fontSize(8)
        .text("INVOICE / BILL NO", left + pageWidth - 190, 52, {
          width: 170,
          align: "right",
        });
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(11.5)
        .text(billNo, left + pageWidth - 220, 65, {
          width: 200,
          align: "right",
        });
      doc
        .fillColor("#d4d4d8")
        .font("Helvetica")
        .fontSize(8.5)
        .text(`Order ID: ${order.id}`, left + pageWidth - 220, 82, {
          width: 200,
          align: "right",
        });
      doc
        .fillColor("#a1a1aa")
        .font("Helvetica")
        .fontSize(8)
        .text(`Date: ${order.createdAt}`, left + pageWidth - 220, 96, {
          width: 200,
          align: "right",
        });

      // Metadata & Customer Two-Column Box
      let y = 138;
      const colGap = 14;
      const colW = (pageWidth - colGap) / 2;

      doc.roundedRect(left, y, colW, 118, 8).fillAndStroke("#fafafa", "#e4e4e7");
      doc.roundedRect(left + colW + colGap, y, colW, 118, 8).fillAndStroke("#fafafa", "#e4e4e7");

      // Left Column: Registered Customer Details
      doc
        .fillColor("#71717a")
        .font("Helvetica-Bold")
        .fontSize(8)
        .text("BILLED TO (REGISTERED CUSTOMER)", left + 14, y + 12);
      doc
        .fillColor("#18181b")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(order.customerName || "Valued Customer", left + 14, y + 27, {
          width: colW - 28,
        });
      doc
        .fillColor("#3f3f46")
        .font("Helvetica")
        .fontSize(9)
        .text(`Mobile: ${order.customerPhone || "N/A"}`, left + 14, y + 45, {
          width: colW - 28,
        })
        .text(`Email: ${order.customerEmail || "Not provided"}`, left + 14, y + 59, {
          width: colW - 28,
        })
        .text(
          `Logistics: ${
            order.deliveryMethod === "delivery" ? "Hand Delivery" : "Studio Pick-up"
          }`,
          left + 14,
          y + 73,
          { width: colW - 28 }
        );
      if (order.customerAddress) {
        doc
          .fontSize(8.5)
          .fillColor("#52525b")
          .text(`Address: ${order.customerAddress}`, left + 14, y + 87, {
            width: colW - 28,
            height: 26,
            ellipsis: true,
          });
      }

      // Right Column: Razorpay / Payment Gateway Confirmation
      const rx = left + colW + colGap + 14;
      doc
        .fillColor("#71717a")
        .font("Helvetica-Bold")
        .fontSize(8)
        .text("PAYMENT & GATEWAY CONFIRMATION", rx, y + 12);
      doc
        .fillColor("#18181b")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(
          order.paymentMethod || (isCod ? "Cash on Delivery (COD)" : "Razorpay Gateway"),
          rx,
          y + 27,
          { width: colW - 28 }
        );
      doc
        .fillColor("#3f3f46")
        .font("Helvetica")
        .fontSize(8.5)
        .text(
          `Payment Status: ${isCod ? "PAY ON DELIVERY (COD)" : "CONFIRMED & PAID"}`,
          rx,
          y + 45,
          { width: colW - 28 }
        )
        .text(
          `Razorpay Pay ID: ${order.razorpayPaymentId || order.transactionId || "N/A"}`,
          rx,
          y + 59,
          { width: colW - 28 }
        )
        .text(
          `Razorpay Order ID: ${order.razorpayOrderId || "N/A"}`,
          rx,
          y + 73,
          { width: colW - 28 }
        );
      if (order.razorpayMeUrl) {
        doc
          .fillColor("#047857")
          .font("Helvetica-Bold")
          .fontSize(8.5)
          .text(`Gateway: ${order.razorpayMeUrl}`, rx, y + 88, {
            width: colW - 28,
          });
      }
      if (order.gatewayConfirmedAt) {
        doc
          .fillColor("#52525b")
          .font("Helvetica")
          .fontSize(7.5)
          .text(`Confirmed At: ${order.gatewayConfirmedAt}`, rx, y + 101, {
            width: colW - 28,
          });
      }

      // Line Items Table Header
      y = 276;
      doc
        .fillColor("#18181b")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("PURCHASED ITEMS", left, y);

      y += 18;
      doc.roundedRect(left, y, pageWidth, 24, 4).fill("#18181b");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5);
      doc.text("#", left + 10, y + 8, { width: 22 });
      doc.text("ARTICLE / VARIANT", left + 34, y + 8, { width: 245 });
      doc.text("QTY", left + 290, y + 8, { width: 40, align: "center" });
      doc.text("RATE", left + 340, y + 8, { width: 75, align: "right" });
      doc.text("TOTAL", left + 425, y + 8, { width: pageWidth - 435, align: "right" });

      y += 28;
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item, index) => {
        if (y > 680) {
          doc.addPage();
          y = 50;
        }

        const rowH = 34;
        if (index % 2 === 1) {
          doc.rect(left, y - 4, pageWidth, rowH).fill("#fafafa");
        }

        doc.fillColor("#52525b").font("Helvetica").fontSize(9);
        doc.text(String(index + 1), left + 10, y + 4, { width: 22 });

        doc.fillColor("#18181b").font("Helvetica-Bold").fontSize(9.5);
        doc.text(item.productName, left + 34, y + 1, { width: 245, ellipsis: true });

        doc.fillColor("#71717a").font("Helvetica").fontSize(8);
        doc.text(`Size: ${item.size}  |  Color: ${item.color}`, left + 34, y + 14, {
          width: 245,
        });

        doc.fillColor("#18181b").font("Helvetica").fontSize(9);
        doc.text(String(item.quantity), left + 290, y + 6, {
          width: 40,
          align: "center",
        });
        doc.text(formatPdfAmount(item.price, currencySymbol), left + 340, y + 6, {
          width: 75,
          align: "right",
        });
        doc.font("Helvetica-Bold");
        doc.text(
          formatPdfAmount(item.price * item.quantity, currencySymbol),
          left + 425,
          y + 6,
          { width: pageWidth - 435, align: "right" }
        );

        doc
          .moveTo(left, y + rowH - 4)
          .lineTo(left + pageWidth, y + rowH - 4)
          .strokeColor("#f4f4f5")
          .lineWidth(1)
          .stroke();

        y += rowH;
      });

      // Totals Summary Box
      if (y > 640) {
        doc.addPage();
        y = 50;
      }

      y += 14;
      const summaryW = 240;
      const summaryX = left + pageWidth - summaryW;
      doc.roundedRect(summaryX, y, summaryW, 108, 8).fillAndStroke("#fafafa", "#e4e4e7");

      const row = (label: string, val: string, offsetY: number, bold = false, accent = false) => {
        doc
          .fillColor(accent ? "#047857" : bold ? "#18181b" : "#52525b")
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(bold ? 10.5 : 9)
          .text(label, summaryX + 14, y + offsetY, { width: 120 });
        doc
          .fillColor(accent ? "#047857" : "#18181b")
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(bold ? 11 : 9)
          .text(val, summaryX + 120, y + offsetY, { width: summaryW - 134, align: "right" });
      };

      row("Subtotal", formatPdfAmount(subtotal, currencySymbol), 14);
      row(
        "Delivery Fee",
        deliveryFee > 0 ? formatPdfAmount(deliveryFee, currencySymbol) : "Free",
        33
      );
      row("GST (5% Included)", formatPdfAmount(gstIncluded, currencySymbol), 52);

      doc
        .moveTo(summaryX + 12, y + 71)
        .lineTo(summaryX + summaryW - 12, y + 71)
        .strokeColor("#d4d4d8")
        .lineWidth(1)
        .stroke();

      row(
        isCod ? "TOTAL COD DUE" : "TOTAL PAID",
        formatPdfAmount(order.totalAmount, currencySymbol),
        81,
        true,
        !isCod
      );

      // Signature / Gateway Verification Strip on Left of Totals
      if (order.razorpaySignature || order.razorpayPaymentId) {
        doc
          .roundedRect(left, y, pageWidth - summaryW - 16, 108, 8)
          .fillAndStroke("#ecfdf5", "#a7f3d0");
        doc
          .fillColor("#065f46")
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("RAZORPAY GATEWAY VERIFICATION", left + 14, y + 14);
        doc
          .fillColor("#047857")
          .font("Helvetica")
          .fontSize(8)
          .text(
            `Payment ID: ${order.razorpayPaymentId || "N/A"}`,
            left + 14,
            y + 32,
            { width: pageWidth - summaryW - 44 }
          )
          .text(
            `Order ID: ${order.razorpayOrderId || "N/A"}`,
            left + 14,
            y + 46,
            { width: pageWidth - summaryW - 44 }
          )
          .text(
            `Gateway: ${order.razorpayMeUrl || "https://razorpay.me/@johnraj"}`,
            left + 14,
            y + 60,
            { width: pageWidth - summaryW - 44 }
          );
        if (order.razorpaySignature) {
          doc
            .fontSize(7.5)
            .text(
              `HMAC Ref: ${order.razorpaySignature.slice(0, 32)}...`,
              left + 14,
              y + 76,
              { width: pageWidth - summaryW - 44 }
            );
        }
      }

      // Footer
      const footerY = doc.page.height - 72;
      doc
        .moveTo(left, footerY)
        .lineTo(left + pageWidth, footerY)
        .strokeColor("#e4e4e7")
        .lineWidth(1)
        .stroke();

      doc
        .fillColor("#71717a")
        .font("Helvetica")
        .fontSize(8.5)
        .text(
          `Thank you for shopping at ${brandName}! This is a computer-generated PDF invoice sent to ${
            order.customerEmail || "your registered email"
          } and ${order.customerPhone || "your registered WhatsApp mobile"}.`,
          left,
          footerY + 12,
          { width: pageWidth, align: "center" }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function generateAndStorePdfBill(params: {
  order: PdfOrderPayload;
  currencySymbol?: string;
  brandName?: string;
  baseUrl?: string;
  overrideBuffer?: Buffer;
  overrideFilename?: string;
}): Promise<{
  billNumber: string;
  filename: string;
  buffer: Buffer;
  token: string;
  pdfPath: string;
  pdfUrl: string;
}> {
  const {
    order,
    currencySymbol = "₹",
    brandName = "THREAD DEN",
    baseUrl = "",
    overrideBuffer,
    overrideFilename,
  } = params;
  const billNumber = (order.billNumber || `BILL-${order.id}`).replace(/[^a-zA-Z0-9._-]/g, "");
  const cleanBrand = brandName.replace(/[^a-zA-Z0-9]+/g, "_");
  const filename = overrideFilename
    ? overrideFilename.replace(/[^a-zA-Z0-9._-]/g, "")
    : `${cleanBrand}_Invoice_${billNumber}.pdf`;
  const hasValidClientPdf =
    Boolean(overrideBuffer) &&
    overrideBuffer!.length > 64 &&
    overrideBuffer!.subarray(0, 5).toString("utf8") === "%PDF-";
  const buffer = hasValidClientPdf
    ? overrideBuffer!
    : await generateInvoicePdfBuffer(order, currencySymbol, brandName);
  const token = createBillAccessToken(billNumber);
  const filePath = path.join(BILLS_DIR, `${billNumber}.pdf`);

  try {
    fs.writeFileSync(filePath, buffer);
  } catch {
    // Memory cache still holds the full buffer
  }

  storedBills.set(billNumber, {
    billNumber,
    filename,
    filePath,
    buffer,
    order,
    createdAt: new Date().toISOString(),
    token,
  });

  const pdfPath = `/api/bills/${encodeURIComponent(billNumber)}.pdf?token=${token}`;
  const pdfUrl = baseUrl ? `${baseUrl.replace(/\/+$/, "")}${pdfPath}` : pdfPath;

  return {
    billNumber,
    filename,
    buffer,
    token,
    pdfPath,
    pdfUrl,
  };
}

export function getStoredPdfBill(billNumber: string): StoredBillRecord | undefined {
  const clean = billNumber.replace(/[^a-zA-Z0-9._-]/g, "");
  return storedBills.get(clean);
}

export function registerBillPdfRoutes(app: express.Application) {
  /**
   * Serve a stored generated PDF invoice by billNumber
   */
  app.get("/api/bills/:billNumber.pdf", (req, res) => {
    const rawBill = String(req.params.billNumber || "");
    const cleanBill = rawBill.replace(/[^a-zA-Z0-9._-]/g, "");
    const record = getStoredPdfBill(cleanBill);

    if (record) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${record.filename}"`);
      res.setHeader("Cache-Control", "no-store");
      return res.send(record.buffer);
    }

    const diskPath = path.join(BILLS_DIR, `${cleanBill}.pdf`);
    if (fs.existsSync(diskPath)) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Invoice_${cleanBill}.pdf"`);
      return res.sendFile(diskPath);
    }

    return res.status(404).json({ error: "Generated PDF invoice not found or expired." });
  });

  /**
   * Generate & download/stream a fresh PDF invoice from an Order payload
   */
  app.post("/api/bills/pdf", async (req, res) => {
    try {
      const {
        order,
        currencySymbol = "₹",
        brandName = "THREAD DEN",
        download = true,
      } = req.body as {
        order?: PdfOrderPayload;
        currencySymbol?: string;
        brandName?: string;
        download?: boolean;
      };

      if (!order || !order.id) {
        return res.status(400).json({ error: "Missing order payload to generate PDF bill." });
      }

      const generated = await generateAndStorePdfBill({
        order,
        currencySymbol,
        brandName,
        baseUrl: getPublicBaseUrl(req),
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `${download ? "attachment" : "inline"}; filename="${generated.filename}"`
      );
      return res.send(generated.buffer);
    } catch (err: any) {
      console.error("Generate PDF bill error:", err);
      return res.status(500).json({ error: err?.message || "Failed to generate PDF invoice." });
    }
  });
}
