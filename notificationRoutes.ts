import express from "express";
import nodemailer from "nodemailer";
import {
  generateAndStorePdfBill,
  getPublicBaseUrl,
  PdfOrderPayload,
} from "./pdfInvoice";

export interface DispatchOrderItem {
  productId: string;
  productName: string;
  size: string;
  color: string;
  price: number;
  quantity: number;
}

export interface DispatchOrderPayload extends PdfOrderPayload {}

export interface ChannelDispatchResult {
  channel: "whatsapp" | "sms" | "email" | "bill_email";
  delivered: boolean;
  mode: "api" | "fallback_link";
  provider: string;
  recipient: string;
  reason?: string;
  messageId?: string;
  fallbackUrl?: string;
  timestamp: string;
}

export interface OrderDispatchResponse {
  dispatchedAt: string;
  pdfGenerated: boolean;
  pdfFilename?: string;
  pdfPath?: string;
  pdfUrl?: string;
  whatsappText?: string;
  whatsapp: ChannelDispatchResult;
  sms: ChannelDispatchResult;
  email: ChannelDispatchResult;
  billEmail: ChannelDispatchResult;
}

function normalizePhoneDigits(phone: string, defaultCountryCode = "91"): string {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  if (digits.startsWith("0") && digits.length === 11) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }
  return digits;
}

function toE164(phone: string, defaultCountryCode = "91"): string {
  const digits = normalizePhoneDigits(phone, defaultCountryCode);
  return digits ? `+${digits}` : "";
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasSmtpConfig(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function hasResendConfig(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function hasWhatsAppConfig(): boolean {
  const hasMeta = Boolean(process.env.WHATSAPP_CLOUD_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const hasTwilioWa = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM
  );
  return hasMeta || hasTwilioWa;
}

function hasSmsConfig(): boolean {
  const hasTwilioSms = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_SMS_FROM
  );
  const hasFast2Sms = Boolean(process.env.FAST2SMS_API_KEY);
  return hasTwilioSms || hasFast2Sms;
}

function buildWhatsAppBillText(
  order: DispatchOrderPayload,
  currencySymbol: string,
  brandName: string,
  pdfUrl?: string
): string {
  const isCod = order.paymentChannel === "cod" || order.paymentStatus === "unpaid";
  const billNo = order.billNumber || `BILL-${order.id}`;
  const itemLines = order.items
    .map(
      (item, idx) =>
        `${idx + 1}. ${item.productName} (${item.size} / ${item.color}) x${item.quantity} = ${currencySymbol}${(item.price * item.quantity).toLocaleString()}`
    )
    .join("\n");

  return [
    `*${brandName.toUpperCase()} — ${
      isCod ? "COD ORDER CONFIRMED" : "RAZORPAY PAYMENT CONFIRMED"
    }*`,
    `Order ID: ${order.id}`,
    `Invoice / Bill No: ${billNo}`,
    isCod
      ? `Amount Payable on Delivery: ${currencySymbol}${order.totalAmount.toLocaleString()} (Cash on Delivery)`
      : `Amount Paid: ${currencySymbol}${order.totalAmount.toLocaleString()} (${
          order.paymentMethod || "Razorpay Gateway"
        })`,
    ...(order.razorpayPaymentId
      ? [`Razorpay Payment ID: ${order.razorpayPaymentId}`]
      : []),
    ...(order.razorpayOrderId ? [`Razorpay Order ID: ${order.razorpayOrderId}`] : []),
    ...(order.razorpayMeUrl ? [`Razorpay Gateway: ${order.razorpayMeUrl}`] : []),
    `Registered Customer: ${order.customerName} (${order.customerPhone})`,
    `Registered Email: ${order.customerEmail || "N/A"}`,
    `Fulfillment: ${
      order.deliveryMethod === "delivery"
        ? `Delivery to ${order.customerAddress || "Registered Address"}`
        : "Local Studio Pickup"
    }`,
    "",
    "*Items Ordered:*",
    itemLines,
    "",
    ...(pdfUrl
      ? [
          `*Download Official PDF Invoice (${billNo}.pdf):*`,
          pdfUrl,
          "",
        ]
      : []),
    `Your official PDF invoice (${billNo}.pdf) has also been sent to ${
      order.customerEmail || "your registered email"
    }. Thank you for shopping with ${brandName}!`,
  ].join("\n");
}

function buildSmsText(
  order: DispatchOrderPayload,
  currencySymbol: string,
  brandName: string
): string {
  const isCod = order.paymentChannel === "cod" || order.paymentStatus === "unpaid";
  const billNo = order.billNumber || `BILL-${order.id}`;
  const itemsCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
  return isCod
    ? `${brandName}: Order ${order.id} CONFIRMED (COD)! Payable on delivery: ${currencySymbol}${order.totalAmount.toLocaleString()} (${itemsCount} item${itemsCount === 1 ? "" : "s"}). PDF Bill ${billNo} sent to ${order.customerEmail || "your email"}.`
    : `${brandName}: Order ${order.id} CONFIRMED via Razorpay! ${currencySymbol}${order.totalAmount.toLocaleString()} (${itemsCount} item${itemsCount === 1 ? "" : "s"}). Pay ID: ${order.razorpayPaymentId || order.transactionId || "VERIFIED"}. PDF Bill ${billNo} sent to ${order.customerEmail || "your email"} & WhatsApp.`;
}

function buildPlainTextBill(
  order: DispatchOrderPayload,
  currencySymbol: string,
  brandName: string,
  pdfUrl?: string
): string {
  const deliveryFee = order.deliveryMethod === "delivery" ? 100 : 0;
  const subtotal = Math.max(0, order.totalAmount - deliveryFee);
  const gstIncluded = Math.round(order.totalAmount * 0.0476);
  const isCod = order.paymentChannel === "cod" || order.paymentStatus === "unpaid";
  const billNo = order.billNumber || `BILL-${order.id}`;

  const lines = [
    "====================================================",
    `              ${brandName.toUpperCase()} STREETWEAR`,
    "        OFFICIAL TAX INVOICE & PAYMENT RECEIPT",
    "====================================================",
    "",
    `Invoice / Bill No:  ${billNo}`,
    `Order ID:           ${order.id}`,
    `Date & Time:        ${order.createdAt}`,
    `Payment Method:     ${
      order.paymentMethod || (isCod ? "Cash on Delivery (COD)" : "Razorpay Gateway")
    }`,
    ...(order.razorpayOrderId ? [`Razorpay Order ID:  ${order.razorpayOrderId}`] : []),
    ...(order.razorpayPaymentId ? [`Razorpay Pay ID:    ${order.razorpayPaymentId}`] : []),
    ...(order.razorpayMeUrl ? [`Razorpay Link:      ${order.razorpayMeUrl}`] : []),
    `Transaction Ref:    ${order.transactionId || (isCod ? "PAYABLE ON DELIVERY" : "N/A")}`,
    `Payment Status:     ${
      isCod
        ? "CASH ON DELIVERY — PAYABLE AT DOORSTEP"
        : "RAZORPAY GATEWAY CONFIRMED — PAID"
    }`,
    ...(pdfUrl ? [`PDF Invoice Link:   ${pdfUrl}`] : []),
    "",
    "----------------------------------------------------",
    "CUSTOMER DETAILS (REGISTERED)",
    "----------------------------------------------------",
    `Billed To:          ${order.customerName}`,
    `Email:              ${order.customerEmail || "Not provided"}`,
    `Mobile / WhatsApp:  ${order.customerPhone}`,
    `Logistics Option:   ${
      order.deliveryMethod === "delivery" ? "Hand Delivery" : "Local Pickup"
    }`,
  ];

  if (order.customerAddress) {
    lines.push(`Delivery Address:   ${order.customerAddress}`);
  }

  lines.push(
    "",
    "----------------------------------------------------",
    "PURCHASED ITEMS",
    "----------------------------------------------------"
  );

  order.items.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item.productName}`);
    lines.push(`   Size: ${item.size} | Color: ${item.color}`);
    lines.push(
      `   Qty: ${item.quantity} x ${currencySymbol}${item.price.toLocaleString()} = ${currencySymbol}${(
        item.price * item.quantity
      ).toLocaleString()}`
    );
  });

  lines.push(
    "",
    "----------------------------------------------------",
    "BILL BREAKDOWN",
    "----------------------------------------------------",
    `Subtotal:           ${currencySymbol}${subtotal.toLocaleString()}`,
    `Delivery Charges:   ${deliveryFee > 0 ? `${currencySymbol}${deliveryFee}` : "Free"}`,
    `GST (5% Included):  ${currencySymbol}${gstIncluded.toLocaleString()}`,
    `${isCod ? "Total COD Due:" : "Grand Total Paid:"}   ${currencySymbol}${order.totalAmount.toLocaleString()}`,
    "",
    "====================================================",
    `Thank you for shopping at ${brandName}!`,
    "===================================================="
  );

  return lines.join("\n");
}

function buildConfirmationEmailHtml(
  order: DispatchOrderPayload,
  currencySymbol: string,
  brandName: string,
  pdfUrl?: string
): string {
  const itemRows = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #e4e4e7;">
          <strong>${escapeHtml(item.productName)}</strong><br/>
          <span style="font-size:12px;color:#71717a;">Size: ${escapeHtml(item.size)} | Color: ${escapeHtml(item.color)}</span>
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #e4e4e7;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e4e4e7;text-align:right;font-weight:700;">
          ${escapeHtml(currencySymbol)}${(item.price * item.quantity).toLocaleString()}
        </td>
      </tr>`
    )
    .join("");

  const isCod = order.paymentChannel === "cod" || order.paymentStatus === "unpaid";
  const billNo = order.billNumber || `BILL-${order.id}`;

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden;">
      <div style="background:#09090b;color:#ffffff;padding:24px;text-align:center;">
        <div style="font-size:11px;letter-spacing:2px;color:#34d399;text-transform:uppercase;font-weight:700;">${
          isCod ? "COD Order Confirmed" : "Razorpay Gateway Verified"
        }</div>
        <h1 style="margin:8px 0 4px;font-size:22px;letter-spacing:1px;">${escapeHtml(brandName)}</h1>
        <p style="margin:0;font-size:12px;color:#a1a1aa;">Order #${escapeHtml(order.id)} • PDF Invoice #${escapeHtml(billNo)}</p>
      </div>
      <div style="padding:24px;color:#18181b;font-size:14px;line-height:1.6;">
        <p style="margin-top:0;">Hi <strong>${escapeHtml(order.customerName)}</strong>,</p>
        <p>${
          isCod
            ? `Your Cash on Delivery order of <strong>${escapeHtml(currencySymbol)}${order.totalAmount.toLocaleString()}</strong> is confirmed! Your official PDF invoice is attached.`
            : `Your Razorpay payment of <strong>${escapeHtml(currencySymbol)}${order.totalAmount.toLocaleString()}</strong> has been confirmed by the Razorpay gateway! Your official PDF tax invoice is attached.`
        }</p>
        <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;padding:14px;font-size:12px;margin:16px 0;">
          <div><strong>Order ID:</strong> ${escapeHtml(order.id)}</div>
          <div><strong>Invoice No:</strong> ${escapeHtml(billNo)}</div>
          <div><strong>Payment Method:</strong> ${escapeHtml(order.paymentMethod || (isCod ? "Cash on Delivery (COD)" : "Razorpay"))}</div>
          ${order.razorpayPaymentId ? `<div><strong>Razorpay Payment ID:</strong> ${escapeHtml(order.razorpayPaymentId)}</div>` : ""}
          ${order.razorpayOrderId ? `<div><strong>Razorpay Order ID:</strong> ${escapeHtml(order.razorpayOrderId)}</div>` : ""}
          ${order.razorpayMeUrl ? `<div><strong>Razorpay Gateway:</strong> ${escapeHtml(order.razorpayMeUrl)}</div>` : ""}
          <div><strong>Registered Mobile:</strong> ${escapeHtml(order.customerPhone)}</div>
          <div><strong>Fulfillment:</strong> ${order.deliveryMethod === "delivery" ? `Hand Delivery — ${escapeHtml(order.customerAddress || "")}` : "Local Studio Pickup"}</div>
        </div>
        ${
          pdfUrl
            ? `<div style="text-align:center;margin:18px 0;">
                 <a href="${escapeHtml(pdfUrl)}" style="display:inline-block;padding:10px 20px;background:#10b981;color:#09090b;font-weight:700;text-decoration:none;border-radius:10px;font-size:13px;">Download PDF Invoice (${escapeHtml(billNo)}.pdf)</a>
               </div>`
            : ""
        }
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
          <thead>
            <tr style="color:#71717a;font-size:11px;text-transform:uppercase;">
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e4e4e7;">Item</th>
              <th style="text-align:center;padding:8px;border-bottom:1px solid #e4e4e7;">Qty</th>
              <th style="text-align:right;padding:8px;border-bottom:1px solid #e4e4e7;">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function buildPaymentBillEmailHtml(
  order: DispatchOrderPayload,
  currencySymbol: string,
  brandName: string,
  pdfUrl?: string
): string {
  const deliveryFee = order.deliveryMethod === "delivery" ? 100 : 0;
  const subtotal = Math.max(0, order.totalAmount - deliveryFee);
  const gstIncluded = Math.round(order.totalAmount * 0.0476);
  const isCod = order.paymentChannel === "cod" || order.paymentStatus === "unpaid";
  const billNo = order.billNumber || `BILL-${order.id}`;

  const itemRows = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 6px;border-bottom:1px solid #f4f4f5;">
          <strong>${escapeHtml(item.productName)}</strong><br/>
          <span style="font-size:11px;color:#71717a;">Size: ${escapeHtml(item.size)} | Color: ${escapeHtml(item.color)}</span>
        </td>
        <td style="padding:10px 6px;border-bottom:1px solid #f4f4f5;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 6px;border-bottom:1px solid #f4f4f5;text-align:right;">${escapeHtml(currencySymbol)}${item.price.toLocaleString()}</td>
        <td style="padding:10px 6px;border-bottom:1px solid #f4f4f5;text-align:right;font-weight:700;">
          ${escapeHtml(currencySymbol)}${(item.price * item.quantity).toLocaleString()}
        </td>
      </tr>`
    )
    .join("");

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;padding:24px;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;padding:28px;">
      <div style="text-align:center;border-bottom:2px solid #f4f4f5;padding-bottom:18px;margin-bottom:18px;">
        <h1 style="margin:0;font-size:20px;letter-spacing:1.5px;text-transform:uppercase;color:#18181b;">${escapeHtml(brandName)}</h1>
        <p style="margin:4px 0 8px;font-size:12px;color:#71717a;">Official Tax Invoice &amp; PDF Payment Receipt</p>
        <span style="display:inline-block;padding:4px 12px;background:${isCod ? "#fef3c7" : "#ecfdf5"};border:1px solid ${isCod ? "#fcd34d" : "#a7f3d0"};color:${isCod ? "#b45309" : "#047857"};border-radius:9999px;font-size:11px;font-weight:700;">
          ${isCod ? "CASH ON DELIVERY — PAY AT DELIVERY" : "CONFIRMED BY RAZORPAY GATEWAY"}
        </span>
      </div>

      <table style="width:100%;background:#fafafa;border-radius:12px;padding:14px;font-size:12px;margin-bottom:18px;">
        <tr>
          <td style="padding:4px 8px;">
            <span style="color:#71717a;">INVOICE / BILL NO</span><br/>
            <strong>${escapeHtml(billNo)} (${escapeHtml(order.id)})</strong>
          </td>
          <td style="padding:4px 8px;text-align:right;">
            <span style="color:#71717a;">BILL DATE</span><br/>
            <strong>${escapeHtml(order.createdAt)}</strong>
          </td>
        </tr>
        <tr>
          <td style="padding:4px 8px;">
            <span style="color:#71717a;">${order.razorpayPaymentId ? "RAZORPAY PAYMENT ID" : "TRANSACTION REF"}</span><br/>
            <strong>${escapeHtml(order.razorpayPaymentId || order.transactionId || (isCod ? "COD-ON-DELIVERY" : "N/A"))}</strong>
            ${order.razorpayMeUrl ? `<br/><span style="font-size:10px;color:#047857;">Via ${escapeHtml(order.razorpayMeUrl)}</span>` : ""}
          </td>
          <td style="padding:4px 8px;text-align:right;">
            <span style="color:#71717a;">PAYMENT METHOD</span><br/>
            <strong>${escapeHtml(order.paymentMethod || (isCod ? "Cash on Delivery (COD)" : "Razorpay"))}</strong>
          </td>
        </tr>
      </table>

      <div style="font-size:12px;color:#3f3f46;margin-bottom:18px;line-height:1.6;">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#18181b;border-bottom:1px solid #e4e4e7;padding-bottom:4px;margin-bottom:8px;">Billed To</div>
        <div><strong>Customer:</strong> ${escapeHtml(order.customerName)}</div>
        <div><strong>Email:</strong> ${escapeHtml(order.customerEmail || "N/A")}</div>
        <div><strong>Registered Mobile:</strong> ${escapeHtml(order.customerPhone)}</div>
        <div><strong>Delivery:</strong> ${order.deliveryMethod === "delivery" ? escapeHtml(order.customerAddress || "Hand Delivery") : "In-Person Studio Pickup"}</div>
      </div>

      ${
        pdfUrl
          ? `<div style="text-align:center;margin:14px 0 18px;">
               <a href="${escapeHtml(pdfUrl)}" style="display:inline-block;padding:10px 18px;background:#09090b;color:#ffffff;font-weight:700;text-decoration:none;border-radius:10px;font-size:12px;">Open / Download Official PDF Invoice</a>
             </div>`
          : ""
      }

      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="color:#71717a;border-bottom:1px solid #e4e4e7;">
            <th style="text-align:left;padding:8px 6px;">Item</th>
            <th style="text-align:center;padding:8px 6px;">Qty</th>
            <th style="text-align:right;padding:8px 6px;">Rate</th>
            <th style="text-align:right;padding:8px 6px;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div style="margin-top:18px;border-top:1px solid #e4e4e7;padding-top:12px;font-size:12px;color:#3f3f46;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span>Subtotal:</span>
          <span>${escapeHtml(currencySymbol)}${subtotal.toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span>Delivery Charges:</span>
          <span>${deliveryFee > 0 ? `${escapeHtml(currencySymbol)}${deliveryFee}` : "Free"}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#71717a;font-size:11px;">
          <span>GST (5% Included):</span>
          <span>${escapeHtml(currencySymbol)}${gstIncluded.toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;color:#18181b;border-top:2px dashed #e4e4e7;padding-top:10px;">
          <span>${isCod ? "TOTAL PAYABLE ON DELIVERY:" : "TOTAL PAID:"}</span>
          <span>${escapeHtml(currencySymbol)}${order.totalAmount.toLocaleString()}</span>
        </div>
      </div>

      <p style="margin-top:24px;padding-top:14px;border-top:1px solid #f4f4f5;font-size:11px;color:#a1a1aa;text-align:center;">
        Your PDF invoice is attached to this email and shared via WhatsApp to ${escapeHtml(order.customerPhone)}.
      </p>
    </div>
  </div>`;
}

async function sendEmailViaProvider(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
  brandName: string;
  attachment?: { filename: string; content: Buffer; contentType: string };
}): Promise<{ delivered: boolean; provider: string; messageId?: string; reason?: string }> {
  const { to, subject, text, html, brandName, attachment } = params;

  if (!to || !to.includes("@")) {
    return {
      delivered: false,
      provider: hasSmtpConfig() ? "SMTP" : hasResendConfig() ? "Resend" : "Mail Fallback",
      reason: "Customer email address is missing or invalid.",
    };
  }

  // Option 1: Nodemailer SMTP with real PDF attachment
  if (hasSmtpConfig()) {
    try {
      const port = Number(process.env.SMTP_PORT || 465);
      const secure =
        process.env.SMTP_SECURE !== undefined
          ? process.env.SMTP_SECURE === "true"
          : port === 465;

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const fromAddress =
        process.env.SMTP_FROM || `"${brandName}" <${process.env.SMTP_USER}>`;

      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        text,
        html,
        ...(attachment
          ? {
              attachments: [
                {
                  filename: attachment.filename,
                  content: attachment.content,
                  contentType: attachment.contentType,
                },
              ],
            }
          : {}),
      });

      return {
        delivered: true,
        provider: "SMTP (Nodemailer PDF)",
        messageId: info.messageId,
      };
    } catch (err: any) {
      return {
        delivered: false,
        provider: "SMTP (Nodemailer PDF)",
        reason: err?.message || "SMTP delivery failed",
      };
    }
  }

  // Option 2: Resend API with base64 PDF attachment
  if (hasResendConfig()) {
    try {
      const fromAddress =
        process.env.RESEND_FROM || `${brandName} <onboarding@resend.dev>`;

      const bodyPayload: Record<string, any> = {
        from: fromAddress,
        to: [to],
        subject,
        text,
        html,
      };

      if (attachment) {
        bodyPayload.attachments = [
          {
            filename: attachment.filename,
            content: attachment.content.toString("base64"),
          },
        ];
      }

      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return {
          delivered: false,
          provider: "Resend API (PDF)",
          reason: data?.message || `Resend error (${resp.status})`,
        };
      }

      return {
        delivered: true,
        provider: "Resend API (PDF)",
        messageId: data?.id,
      };
    } catch (err: any) {
      return {
        delivered: false,
        provider: "Resend API (PDF)",
        reason: err?.message || "Resend request failed",
      };
    }
  }

  return {
    delivered: false,
    provider: "Not Configured",
    reason:
      "Configure SMTP_HOST/SMTP_USER/SMTP_PASS or RESEND_API_KEY in Settings > Secrets for automatic PDF email delivery.",
  };
}

async function sendWhatsAppViaProvider(params: {
  recipientPhone: string;
  messageText: string;
  pdfFilename?: string;
  pdfBuffer?: Buffer;
  pdfUrl?: string;
}): Promise<{ delivered: boolean; provider: string; messageId?: string; reason?: string }> {
  const { recipientPhone, messageText, pdfFilename, pdfBuffer, pdfUrl } = params;
  const digits = normalizePhoneDigits(recipientPhone);
  const e164 = toE164(recipientPhone);

  if (!digits) {
    return {
      delivered: false,
      provider: "WhatsApp",
      reason: "Registered customer mobile number is missing.",
    };
  }

  // Option 1: Meta WhatsApp Cloud API (sends WhatsApp text + uploaded PDF document)
  if (process.env.WHATSAPP_CLOUD_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    const token = process.env.WHATSAPP_CLOUD_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    try {
      const textResp = await fetch(
        `https://graph.facebook.com/v20.0/${phoneId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: digits,
            type: "text",
            text: { preview_url: Boolean(pdfUrl), body: messageText },
          }),
        }
      );

      const textData = await textResp.json().catch(() => ({}));
      if (!textResp.ok) {
        return {
          delivered: false,
          provider: "Meta WhatsApp Cloud API",
          reason: textData?.error?.message || `Meta API error (${textResp.status})`,
        };
      }

      // Upload and attach PDF document if buffer available
      if (pdfBuffer && pdfFilename) {
        try {
          const formData = new FormData();
          formData.append("messaging_product", "whatsapp");
          formData.append(
            "file",
            new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }),
            pdfFilename
          );

          const uploadResp = await fetch(
            `https://graph.facebook.com/v20.0/${phoneId}/media`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
              },
              body: formData,
            }
          );

          const uploadData = await uploadResp.json().catch(() => ({}));
          if (uploadResp.ok && uploadData?.id) {
            await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: digits,
                type: "document",
                document: {
                  id: uploadData.id,
                  filename: pdfFilename,
                  caption: `Official PDF Tax Invoice (${pdfFilename})`,
                },
              }),
            });
          }
        } catch {
          // Keep primary text + PDF link delivery intact even if media attachment fails
        }
      }

      return {
        delivered: true,
        provider: "Meta WhatsApp Cloud API (Text + PDF)",
        messageId: textData?.messages?.[0]?.id,
      };
    } catch (err: any) {
      return {
        delivered: false,
        provider: "Meta WhatsApp Cloud API",
        reason: err?.message || "WhatsApp Cloud API call failed",
      };
    }
  }

  // Option 2: Twilio WhatsApp API (sends text + MediaUrl PDF link when public https URL)
  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  ) {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const fromWa = process.env.TWILIO_WHATSAPP_FROM.startsWith("whatsapp:")
        ? process.env.TWILIO_WHATSAPP_FROM
        : `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;

      const form = new URLSearchParams({
        From: fromWa,
        To: `whatsapp:${e164}`,
        Body: messageText,
      });

      if (pdfUrl && pdfUrl.startsWith("https://")) {
        form.append("MediaUrl", pdfUrl);
      }

      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
        }
      );

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return {
          delivered: false,
          provider: "Twilio WhatsApp",
          reason: data?.message || `Twilio error (${resp.status})`,
        };
      }

      return {
        delivered: true,
        provider: "Twilio WhatsApp (Text + PDF)",
        messageId: data?.sid,
      };
    } catch (err: any) {
      return {
        delivered: false,
        provider: "Twilio WhatsApp",
        reason: err?.message || "Twilio WhatsApp call failed",
      };
    }
  }

  return {
    delivered: false,
    provider: "Not Configured",
    reason:
      "Configure WHATSAPP_CLOUD_TOKEN + WHATSAPP_PHONE_NUMBER_ID or TWILIO_WHATSAPP_FROM in Secrets for automated server WhatsApp dispatch.",
  };
}

async function sendSmsViaProvider(
  recipientPhone: string,
  smsText: string
): Promise<{ delivered: boolean; provider: string; messageId?: string; reason?: string }> {
  const digits = normalizePhoneDigits(recipientPhone);
  const e164 = toE164(recipientPhone);

  if (!digits) {
    return {
      delivered: false,
      provider: "SMS",
      reason: "Customer phone number is missing.",
    };
  }

  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_SMS_FROM
  ) {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;

      const form = new URLSearchParams({
        From: process.env.TWILIO_SMS_FROM,
        To: e164,
        Body: smsText,
      });

      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
        }
      );

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return {
          delivered: false,
          provider: "Twilio SMS",
          reason: data?.message || `Twilio SMS error (${resp.status})`,
        };
      }

      return {
        delivered: true,
        provider: "Twilio SMS",
        messageId: data?.sid,
      };
    } catch (err: any) {
      return {
        delivered: false,
        provider: "Twilio SMS",
        reason: err?.message || "Twilio SMS call failed",
      };
    }
  }

  if (process.env.FAST2SMS_API_KEY) {
    try {
      const localTen = digits.slice(-10);
      const resp = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route: "q",
          message: smsText,
          language: "english",
          flash: 0,
          numbers: localTen,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.return === false) {
        return {
          delivered: false,
          provider: "Fast2SMS",
          reason: data?.message?.toString() || `Fast2SMS error (${resp.status})`,
        };
      }

      return {
        delivered: true,
        provider: "Fast2SMS",
        messageId: data?.request_id,
      };
    } catch (err: any) {
      return {
        delivered: false,
        provider: "Fast2SMS",
        reason: err?.message || "Fast2SMS request failed",
      };
    }
  }

  return {
    delivered: false,
    provider: "Not Configured",
    reason:
      "Configure TWILIO_SMS_FROM (with Twilio SID/Token) or FAST2SMS_API_KEY in Secrets for automated SMS delivery.",
  };
}

/**
 * Reusable core function: Generate PDF invoice + dispatch WhatsApp text (+PDF) to registered mobile + Email (+PDF attachment)
 */
export async function dispatchOrderNotificationsToUser(params: {
  order: DispatchOrderPayload;
  currencySymbol?: string;
  brandName?: string;
  baseUrl?: string;
}): Promise<OrderDispatchResponse & { generatedBillText: string }> {
  const {
    order,
    currencySymbol = "₹",
    brandName = "THREAD DEN",
    baseUrl = getPublicBaseUrl(),
  } = params;

  const now = new Date().toISOString();
  const billNo = order.billNumber || `BILL-${order.id}`;
  const isCod = order.paymentChannel === "cod" || order.paymentStatus === "unpaid";

  // 1. Generate and store real PDF invoice
  const generatedPdf = await generateAndStorePdfBill({
    order: { ...order, billNumber: billNo },
    currencySymbol,
    brandName,
    baseUrl,
  });

  const customerDigits = normalizePhoneDigits(order.customerPhone);
  const whatsappText = buildWhatsAppBillText(
    order,
    currencySymbol,
    brandName,
    generatedPdf.pdfUrl
  );
  const smsText = buildSmsText(order, currencySymbol, brandName);
  const billText = buildPlainTextBill(
    order,
    currencySymbol,
    brandName,
    generatedPdf.pdfUrl
  );

  const waFallbackUrl = customerDigits
    ? `https://wa.me/${customerDigits}?text=${encodeURIComponent(whatsappText)}`
    : undefined;
  const smsFallbackUrl = customerDigits
    ? `sms:+${customerDigits}?body=${encodeURIComponent(smsText)}`
    : undefined;

  const confirmSubject = `${brandName} — ${
    isCod ? "COD Order Confirmed" : "Razorpay Payment Confirmed"
  } (#${order.id})`;
  const billSubject = `${brandName} — Official PDF Tax Invoice ${billNo} (#${order.id})`;

  const confirmMailtoUrl = order.customerEmail
    ? `mailto:${encodeURIComponent(order.customerEmail)}?subject=${encodeURIComponent(
        confirmSubject
      )}&body=${encodeURIComponent(whatsappText)}`
    : undefined;
  const billMailtoUrl = order.customerEmail
    ? `mailto:${encodeURIComponent(order.customerEmail)}?subject=${encodeURIComponent(
        billSubject
      )}&body=${encodeURIComponent(billText)}`
    : undefined;

  // 2. Dispatch WhatsApp (text + PDF link/doc), SMS, Confirmation Email (PDF attached), and Bill Email (PDF attached)
  const [waResult, smsResult, emailResult, billResult] = await Promise.all([
    sendWhatsAppViaProvider({
      recipientPhone: order.customerPhone,
      messageText: whatsappText,
      pdfFilename: generatedPdf.filename,
      pdfBuffer: generatedPdf.buffer,
      pdfUrl: generatedPdf.pdfUrl,
    }),
    sendSmsViaProvider(order.customerPhone, smsText),
    sendEmailViaProvider({
      to: order.customerEmail || "",
      subject: confirmSubject,
      text: billText,
      html: buildConfirmationEmailHtml(
        order,
        currencySymbol,
        brandName,
        generatedPdf.pdfUrl
      ),
      brandName,
      attachment: {
        filename: generatedPdf.filename,
        content: generatedPdf.buffer,
        contentType: "application/pdf",
      },
    }),
    sendEmailViaProvider({
      to: order.customerEmail || "",
      subject: billSubject,
      text: billText,
      html: buildPaymentBillEmailHtml(
        order,
        currencySymbol,
        brandName,
        generatedPdf.pdfUrl
      ),
      brandName,
      attachment: {
        filename: generatedPdf.filename,
        content: generatedPdf.buffer,
        contentType: "application/pdf",
      },
    }),
  ]);

  return {
    dispatchedAt: now,
    generatedBillText: billText,
    pdfGenerated: true,
    pdfFilename: generatedPdf.filename,
    pdfPath: generatedPdf.pdfPath,
    pdfUrl: generatedPdf.pdfUrl,
    whatsappText,
    whatsapp: {
      channel: "whatsapp",
      delivered: waResult.delivered,
      mode: waResult.delivered ? "api" : "fallback_link",
      provider: waResult.provider,
      recipient: order.customerPhone || "N/A",
      reason: waResult.reason,
      messageId: waResult.messageId,
      fallbackUrl: waFallbackUrl,
      timestamp: now,
    },
    sms: {
      channel: "sms",
      delivered: smsResult.delivered,
      mode: smsResult.delivered ? "api" : "fallback_link",
      provider: smsResult.provider,
      recipient: order.customerPhone || "N/A",
      reason: smsResult.reason,
      messageId: smsResult.messageId,
      fallbackUrl: smsFallbackUrl,
      timestamp: now,
    },
    email: {
      channel: "email",
      delivered: emailResult.delivered,
      mode: emailResult.delivered ? "api" : "fallback_link",
      provider: emailResult.provider,
      recipient: order.customerEmail || "Not provided",
      reason: emailResult.reason,
      messageId: emailResult.messageId,
      fallbackUrl: confirmMailtoUrl,
      timestamp: now,
    },
    billEmail: {
      channel: "bill_email",
      delivered: billResult.delivered,
      mode: billResult.delivered ? "api" : "fallback_link",
      provider: billResult.provider,
      recipient: order.customerEmail || "Not provided",
      reason: billResult.reason,
      messageId: billResult.messageId,
      fallbackUrl: billMailtoUrl,
      timestamp: now,
    },
  };
}

export function registerNotificationRoutes(app: express.Application) {
  /**
   * Non-secret status check for Merchant Hub settings panel
   */
  app.get("/api/integrations/status", (_req, res) => {
    const emailConfigured = hasSmtpConfig() || hasResendConfig();
    const whatsappConfigured = hasWhatsAppConfig();
    const smsConfigured = hasSmsConfig();

    res.json({
      email: {
        configured: emailConfigured,
        provider: hasSmtpConfig()
          ? "SMTP (Nodemailer PDF)"
          : hasResendConfig()
          ? "Resend API (PDF)"
          : "Fallback mailto link",
      },
      whatsapp: {
        configured: whatsappConfigured,
        provider:
          process.env.WHATSAPP_CLOUD_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
            ? "Meta WhatsApp Cloud API (Text + PDF)"
            : process.env.TWILIO_WHATSAPP_FROM
            ? "Twilio WhatsApp (Text + PDF)"
            : "Fallback wa.me link (Text + PDF URL)",
      },
      sms: {
        configured: smsConfigured,
        provider: process.env.TWILIO_SMS_FROM
          ? "Twilio SMS"
          : process.env.FAST2SMS_API_KEY
          ? "Fast2SMS"
          : "Fallback sms: link",
      },
    });
  });

  /**
   * Generate PDF Invoice + Dispatch WhatsApp (to registered mobile), SMS, and Email (with PDF attachment)
   */
  app.post("/api/notifications/order-dispatch", async (req, res) => {
    try {
      const {
        order,
        currencySymbol = "₹",
        brandName = "THREAD DEN",
      } = req.body as {
        order?: DispatchOrderPayload;
        currencySymbol?: string;
        brandName?: string;
      };

      if (!order || !order.id || !order.customerName) {
        return res.status(400).json({ error: "Invalid order payload for dispatch." });
      }

      const response = await dispatchOrderNotificationsToUser({
        order,
        currencySymbol,
        brandName,
        baseUrl: getPublicBaseUrl(req),
      });

      return res.json(response);
    } catch (err: any) {
      console.error("Order dispatch error:", err);
      return res
        .status(500)
        .json({ error: err?.message || "Failed to dispatch notifications" });
    }
  });

  /**
   * Dedicated endpoint to generate and mail/resend the official PDF Tax Invoice to customer's email ID
   */
  app.post("/api/notifications/send-bill", async (req, res) => {
    try {
      const {
        order,
        currencySymbol = "₹",
        brandName = "THREAD DEN",
      } = req.body as {
        order?: DispatchOrderPayload;
        currencySymbol?: string;
        brandName?: string;
      };

      if (!order || !order.id) {
        return res.status(400).json({ error: "Missing order payload." });
      }

      const now = new Date().toISOString();
      const billNo = order.billNumber || `BILL-${order.id}`;
      const baseUrl = getPublicBaseUrl(req);
      const generatedPdf = await generateAndStorePdfBill({
        order: { ...order, billNumber: billNo },
        currencySymbol,
        brandName,
        baseUrl,
      });

      const billText = buildPlainTextBill(
        order,
        currencySymbol,
        brandName,
        generatedPdf.pdfUrl
      );
      const billSubject = `${brandName} — Official PDF Tax Invoice ${billNo} (#${order.id})`;
      const billMailtoUrl = order.customerEmail
        ? `mailto:${encodeURIComponent(order.customerEmail)}?subject=${encodeURIComponent(
            billSubject
          )}&body=${encodeURIComponent(billText)}`
        : undefined;

      const billResult = await sendEmailViaProvider({
        to: order.customerEmail || "",
        subject: billSubject,
        text: billText,
        html: buildPaymentBillEmailHtml(
          order,
          currencySymbol,
          brandName,
          generatedPdf.pdfUrl
        ),
        brandName,
        attachment: {
          filename: generatedPdf.filename,
          content: generatedPdf.buffer,
          contentType: "application/pdf",
        },
      });

      const result: ChannelDispatchResult = {
        channel: "bill_email",
        delivered: billResult.delivered,
        mode: billResult.delivered ? "api" : "fallback_link",
        provider: billResult.provider,
        recipient: order.customerEmail || "Not provided",
        reason: billResult.reason,
        messageId: billResult.messageId,
        fallbackUrl: billMailtoUrl,
        timestamp: now,
      };

      return res.json(result);
    } catch (err: any) {
      console.error("Send bill email error:", err);
      return res
        .status(500)
        .json({ error: err?.message || "Failed to send payment bill PDF email" });
    }
  });
}
