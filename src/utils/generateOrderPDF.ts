import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Order } from "../types";

export interface GenerateOrderPdfOptions {
  brandName?: string;
  currencySymbol?: string;
  autoDownload?: boolean;
}

export interface GeneratedOrderPdfResult {
  doc: jsPDF;
  blob: Blob;
  base64: string;
  dataUri: string;
  filename: string;
  billNumber: string;
  orderId: string;
  download: () => void;
}

function formatPdfCurrency(amount: number, currencySymbol = "₹"): string {
  const prefix = currencySymbol === "₹" ? "Rs. " : `${currencySymbol} `;
  return `${prefix}${Number(amount || 0).toLocaleString("en-IN")}`;
}

function sanitizeBillNumber(order: Order): string {
  const raw = order.billNumber || `BILL-${order.id}`;
  return raw.replace(/[^a-zA-Z0-9._-]/g, "");
}

/**
 * Generates a professional A4 Tax Invoice & Payment Receipt PDF from an Order
 * using jsPDF + jspdf-autotable. Returns the PDF Blob, base64 payload (for
 * WhatsApp/Email dispatch triggers), data URI, filename, and a download helper.
 */
export function generateOrderPDF(
  order: Order,
  options: GenerateOrderPdfOptions = {}
): GeneratedOrderPdfResult {
  const brandName = (options.brandName || "THREAD DEN").trim();
  const currencySymbol = options.currencySymbol || "₹";
  const billNumber = sanitizeBillNumber(order);
  const cleanBrand = brandName.replace(/[^a-zA-Z0-9]+/g, "_") || "THREAD_DEN";
  const filename = `${cleanBrand}_Invoice_${billNumber}.pdf`;

  const isCod = order.paymentChannel === "cod" || order.paymentStatus === "unpaid";
  const deliveryFee = order.deliveryMethod === "delivery" ? 100 : 0;
  const subtotal = Math.max(0, Number(order.totalAmount || 0) - deliveryFee);
  const gstIncluded = Math.round(Number(order.totalAmount || 0) * 0.0476);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  doc.setProperties({
    title: `${brandName} Invoice ${billNumber}`,
    subject: `Official Tax Invoice & Payment Receipt for Order ${order.id}`,
    author: brandName,
    creator: `${brandName} Billing Engine`,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageWidth - margin * 2;

  // =========================================================================
  // 1. TOP BRAND HEADER BANNER
  // =========================================================================
  const headerTop = 12;
  const headerH = 34;
  doc.setFillColor(9, 9, 11);
  doc.roundedRect(margin, headerTop, contentW, headerH, 3, 3, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(brandName.toUpperCase(), margin + 7, headerTop + 11);

  doc.setTextColor(161, 161, 170);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("OFFICIAL TAX INVOICE & PAYMENT RECEIPT", margin + 7, headerTop + 17.5);

  if (isCod) {
    doc.setTextColor(251, 191, 36);
  } else {
    doc.setTextColor(52, 211, 153);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(
    isCod
      ? "CASH ON DELIVERY — PAYABLE AT DOORSTEP"
      : "RAZORPAY GATEWAY CONFIRMED • PAID",
    margin + 7,
    headerTop + 26
  );

  // Right-side invoice metadata
  const rightX = margin + contentW - 7;
  doc.setTextColor(161, 161, 170);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("INVOICE / BILL NO", rightX, headerTop + 9, { align: "right" });

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(billNumber, rightX, headerTop + 14.5, { align: "right" });

  doc.setTextColor(212, 212, 216);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Order ID: ${order.id}`, rightX, headerTop + 20.5, { align: "right" });
  doc.setTextColor(161, 161, 170);
  doc.text(`Date: ${order.createdAt}`, rightX, headerTop + 26, { align: "right" });

  // =========================================================================
  // 2. CUSTOMER & PAYMENT METADATA TWO-COLUMN CARDS
  // =========================================================================
  const cardTop = headerTop + headerH + 6;
  const colGap = 5;
  const colW = (contentW - colGap) / 2;

  const addressLines = order.customerAddress
    ? doc.splitTextToSize(`Address: ${order.customerAddress}`, colW - 10)
    : [];
  const cardH = Math.max(42, 34 + addressLines.length * 4.2);

  // Left card: Billed To
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(228, 228, 231);
  doc.roundedRect(margin, cardTop, colW, cardH, 2.5, 2.5, "FD");

  doc.setTextColor(113, 113, 122);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("BILLED TO (REGISTERED CUSTOMER)", margin + 5, cardTop + 6.5);

  doc.setTextColor(24, 24, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(order.customerName || "Valued Customer", margin + 5, cardTop + 13, {
    maxWidth: colW - 10,
  });

  doc.setTextColor(63, 63, 70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Mobile / WhatsApp: ${order.customerPhone || "N/A"}`, margin + 5, cardTop + 19, {
    maxWidth: colW - 10,
  });
  doc.text(
    `Email: ${order.customerEmail || "Not provided"}`,
    margin + 5,
    cardTop + 24,
    { maxWidth: colW - 10 }
  );
  doc.text(
    `Fulfillment: ${
      order.deliveryMethod === "delivery" ? "Hand Delivery" : "Local Studio Pick-up"
    }`,
    margin + 5,
    cardTop + 29,
    { maxWidth: colW - 10 }
  );
  if (addressLines.length > 0) {
    doc.setTextColor(82, 82, 91);
    doc.setFontSize(8);
    doc.text(addressLines.slice(0, 3), margin + 5, cardTop + 34);
  }

  // Right card: Payment & Gateway Details
  const rightCardX = margin + colW + colGap;
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(228, 228, 231);
  doc.roundedRect(rightCardX, cardTop, colW, cardH, 2.5, 2.5, "FD");

  doc.setTextColor(113, 113, 122);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("PAYMENT & GATEWAY CONFIRMATION", rightCardX + 5, cardTop + 6.5);

  doc.setTextColor(24, 24, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(
    order.paymentMethod || (isCod ? "Cash on Delivery (COD)" : "Razorpay Gateway"),
    rightCardX + 5,
    cardTop + 13,
    { maxWidth: colW - 10 }
  );

  doc.setTextColor(63, 63, 70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.text(
    `Payment Status: ${isCod ? "PAY ON DELIVERY (COD)" : "CONFIRMED & PAID"}`,
    rightCardX + 5,
    cardTop + 19,
    { maxWidth: colW - 10 }
  );
  doc.text(
    `Transaction / Pay ID: ${order.razorpayPaymentId || order.transactionId || "N/A"}`,
    rightCardX + 5,
    cardTop + 24,
    { maxWidth: colW - 10 }
  );
  doc.text(
    `Razorpay Order ID: ${order.razorpayOrderId || "N/A"}`,
    rightCardX + 5,
    cardTop + 29,
    { maxWidth: colW - 10 }
  );
  if (order.razorpayMeUrl) {
    doc.setTextColor(4, 120, 87);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.text(`Gateway: ${order.razorpayMeUrl}`, rightCardX + 5, cardTop + 34.5, {
      maxWidth: colW - 10,
    });
  }

  // =========================================================================
  // 3. PURCHASED ITEMS TABLE (jspdf-autotable)
  // =========================================================================
  const tableStartY = cardTop + cardH + 8;
  doc.setTextColor(24, 24, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("PURCHASED ITEMS", margin, tableStartY - 2.5);

  const itemRows = (order.items || []).map((item, idx) => [
    String(idx + 1),
    `${item.productName}\nSize: ${item.size}  |  Color: ${item.color}`,
    String(item.quantity),
    formatPdfCurrency(item.price, currencySymbol),
    formatPdfCurrency(item.price * item.quantity, currencySymbol),
  ]);

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: margin, right: margin },
    head: [["#", "ARTICLE / VARIANT", "QTY", "RATE", "TOTAL"]],
    body: itemRows,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      textColor: [24, 24, 27],
      cellPadding: { top: 3.2, right: 3, bottom: 3.2, left: 3 },
      lineColor: [244, 244, 245],
      lineWidth: 0.25,
      valign: "middle",
    },
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: { top: 3.2, right: 3, bottom: 3.2, left: 3 },
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "left", textColor: [82, 82, 91] },
      1: { cellWidth: "auto", halign: "left" },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 32, halign: "right", fontStyle: "bold" },
    },
  });

  // =========================================================================
  // 4. TOTALS SUMMARY & VERIFICATION CALLOUT
  // =========================================================================
  const lastTableY = (doc as unknown as { lastAutoTable?: { finalY?: number } })
    .lastAutoTable?.finalY;
  let summaryY = (lastTableY || tableStartY + 30) + 8;

  if (summaryY + 46 > pageHeight - 24) {
    doc.addPage();
    summaryY = 18;
  }

  const summaryBoxW = 78;
  const summaryBoxX = margin + contentW - summaryBoxW;
  const summaryBoxH = 38;

  // Left verification badge card
  const leftBoxW = contentW - summaryBoxW - 6;
  if (isCod) {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(252, 211, 77);
  } else {
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(167, 243, 208);
  }
  doc.roundedRect(margin, summaryY, leftBoxW, summaryBoxH, 2.5, 2.5, "FD");

  doc.setTextColor(isCod ? 180 : 6, isCod ? 83 : 95, isCod ? 9 : 70);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(
    isCod ? "COD DISPATCH CONFIRMATION" : "RAZORPAY GATEWAY VERIFICATION",
    margin + 5,
    summaryY + 7.5
  );

  doc.setTextColor(isCod ? 146 : 4, isCod ? 64 : 120, isCod ? 14 : 87);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.text(
    `Ref ID: ${order.razorpayPaymentId || order.transactionId || billNumber}`,
    margin + 5,
    summaryY + 14.5,
    { maxWidth: leftBoxW - 10 }
  );
  doc.text(
    `WhatsApp Mobile: ${order.customerPhone || "N/A"}`,
    margin + 5,
    summaryY + 20.5,
    { maxWidth: leftBoxW - 10 }
  );
  doc.text(
    `Email Receipt: ${order.customerEmail || "N/A"}`,
    margin + 5,
    summaryY + 26.5,
    { maxWidth: leftBoxW - 10 }
  );
  if (order.razorpaySignature) {
    doc.setFontSize(7);
    doc.text(
      `HMAC Sig: ${order.razorpaySignature.slice(0, 28)}...`,
      margin + 5,
      summaryY + 32.5,
      { maxWidth: leftBoxW - 10 }
    );
  }

  // Right totals card
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(228, 228, 231);
  doc.roundedRect(summaryBoxX, summaryY, summaryBoxW, summaryBoxH, 2.5, 2.5, "FD");

  const drawTotalRow = (
    label: string,
    val: string,
    offsetY: number,
    bold = false,
    accent = false
  ) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 9.5 : 8.2);
    if (accent) {
      doc.setTextColor(4, 120, 87);
    } else if (bold) {
      doc.setTextColor(24, 24, 27);
    } else {
      doc.setTextColor(82, 82, 91);
    }
    doc.text(label, summaryBoxX + 5, summaryY + offsetY);
    if (accent) {
      doc.setTextColor(4, 120, 87);
    } else {
      doc.setTextColor(24, 24, 27);
    }
    doc.text(val, summaryBoxX + summaryBoxW - 5, summaryY + offsetY, {
      align: "right",
    });
  };

  drawTotalRow("Subtotal", formatPdfCurrency(subtotal, currencySymbol), 7.5);
  drawTotalRow(
    "Delivery Fee",
    deliveryFee > 0 ? formatPdfCurrency(deliveryFee, currencySymbol) : "Free",
    14
  );
  drawTotalRow(
    "GST (5% Included)",
    formatPdfCurrency(gstIncluded, currencySymbol),
    20.5
  );

  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(0.35);
  doc.line(summaryBoxX + 4, summaryY + 24.5, summaryBoxX + summaryBoxW - 4, summaryY + 24.5);

  drawTotalRow(
    isCod ? "TOTAL COD DUE" : "TOTAL PAID",
    formatPdfCurrency(order.totalAmount, currencySymbol),
    32,
    true,
    !isCod
  );

  // =========================================================================
  // 5. FOOTER
  // =========================================================================
  const footerY = pageHeight - 18;
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, margin + contentW, footerY);

  doc.setTextColor(113, 113, 122);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.text(
    `Thank you for shopping at ${brandName}! This official PDF invoice (${billNumber}) is ready for ${
      order.customerEmail || "your registered email"
    } and WhatsApp (${order.customerPhone || "registered mobile"}).`,
    pageWidth / 2,
    footerY + 6.5,
    { maxWidth: contentW, align: "center" }
  );

  // Export ready-to-use Blob & base64 payload for WhatsApp/Email dispatch
  const dataUri = doc.output("datauristring");
  const commaIdx = dataUri.indexOf(",");
  const base64 = commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : "";
  const blob = doc.output("blob");

  if (options.autoDownload) {
    doc.save(filename);
  }

  return {
    doc,
    blob,
    base64,
    dataUri,
    filename,
    billNumber,
    orderId: order.id,
    download: () => doc.save(filename),
  };
}

/**
 * Convenience helper to immediately generate and download the Order PDF invoice.
 */
export function downloadOrderPDF(
  order: Order,
  options: Omit<GenerateOrderPdfOptions, "autoDownload"> = {}
): GeneratedOrderPdfResult {
  return generateOrderPDF(order, { ...options, autoDownload: true });
}
