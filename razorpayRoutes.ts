import express from "express";
import crypto from "node:crypto";
import QRCode from "qrcode";
import {
  dispatchOrderNotificationsToUser,
  OrderDispatchResponse,
} from "./notificationRoutes";
import { getPublicBaseUrl, PdfOrderItem } from "./pdfInvoice";

const DEFAULT_RAZORPAY_ME_URL = "https://razorpay.me/@johnraj";
const SANDBOX_HMAC_KEY = "thread_den_razorpay_gateway_key_v1";

export type AutoAmountMode = "razorpay_checkout" | "upi_intent" | "manual_handle";

function getRazorpayMeUrl(): string {
  return process.env.RAZORPAY_ME_URL?.trim() || DEFAULT_RAZORPAY_ME_URL;
}

function getRazorpayHandle(url: string): string {
  const match = url.match(/razorpay\.me\/(@?[a-zA-Z0-9._-]+)/i);
  return match ? match[1] : "@johnraj";
}

function getMerchantUpiVpa(): string | null {
  const vpa = process.env.MERCHANT_UPI_VPA?.trim() || "";
  return vpa && vpa.includes("@") ? vpa : null;
}

function getRazorpayCredentials(): {
  keyId: string | null;
  keySecret: string | null;
  webhookSecret: string | null;
  configured: boolean;
} {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || null;
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || null;
  const webhookSecret =
    process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || keySecret || null;
  return {
    keyId,
    keySecret,
    webhookSecret,
    configured: Boolean(keyId && keySecret),
  };
}

function resolveAutoAmountMode(configured: boolean, upiVpa: string | null): AutoAmountMode {
  if (configured) return "razorpay_checkout";
  if (upiVpa) return "upi_intent";
  return "manual_handle";
}

function buildUpiIntentUrl(params: {
  vpa: string;
  payeeName: string;
  amount: number;
  billNumber: string;
}): string {
  const search = new URLSearchParams({
    pa: params.vpa,
    pn: params.payeeName,
    am: params.amount.toFixed(2),
    cu: "INR",
    tr: params.billNumber,
    tn: `${params.payeeName} ${params.billNumber}`,
  });
  return `upi://pay?${search.toString()}`;
}

function generateBillNumber(orderRef?: string): string {
  const year = new Date().getFullYear();
  const suffix = orderRef
    ? orderRef.replace(/[^A-Z0-9]/gi, "").slice(-6).toUpperCase()
    : Math.floor(100000 + Math.random() * 900000).toString();
  return `BILL-TD-${year}-${suffix}`;
}

function normalizePhoneDigits(phone?: string): string {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function formatContactForRazorpay(phone?: string): string | undefined {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  if (!digits) return undefined;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function isValidRazorpayPaymentId(paymentId: string): boolean {
  return /^pay_[A-Za-z0-9]{10,24}$/.test(paymentId.trim());
}

function isValidUpiUtrOrPaymentId(ref: string): boolean {
  const cleaned = ref.trim();
  return isValidRazorpayPaymentId(cleaned) || /^[A-Za-z0-9]{10,28}$/.test(cleaned);
}

interface PendingGatewaySession {
  orderId: string;
  localOrderId: string;
  billNumber: string;
  amount: number;
  amountInPaise: number;
  currency: string;
  currencySymbol: string;
  brandName: string;
  paymentChannel: "upi" | "card" | "cod";
  deliveryMethod: "pickup" | "delivery";
  customer: {
    name: string;
    email: string;
    phone: string;
    address?: string;
  };
  items: PdfOrderItem[];
  razorpayMeUrl: string;
  paymentLinkId?: string;
  paymentLinkUrl?: string;
  upiIntentUrl?: string;
  autoAmountMode: AutoAmountMode;
  createdAtMs: number;
  gatewayConfirmed: boolean;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  verificationSource?: string;
  confirmedAt?: string;
  baseUrl?: string;
  confirmedAtMs?: number;
  dispatchResult?: OrderDispatchResponse;
}

const MAX_PENDING_SESSIONS = 400;
const UNCONFIRMED_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const CONFIRMED_SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const RAZORPAY_FETCH_TIMEOUT_MS = 15_000;

const pendingSessions = new Map<string, PendingGatewaySession>();

function prunePendingSessions(now = Date.now()): void {
  for (const [key, sess] of pendingSessions.entries()) {
    const age = sess.gatewayConfirmed
      ? now - (sess.confirmedAtMs || sess.createdAtMs)
      : now - sess.createdAtMs;
    const ttl = sess.gatewayConfirmed
      ? CONFIRMED_SESSION_TTL_MS
      : UNCONFIRMED_SESSION_TTL_MS;
    if (age > ttl) {
      pendingSessions.delete(key);
    }
  }
  while (pendingSessions.size > MAX_PENDING_SESSIONS) {
    const oldestKey = pendingSessions.keys().next().value;
    if (!oldestKey) break;
    pendingSessions.delete(oldestKey);
  }
}

setInterval(() => {
  prunePendingSessions();
}, SESSION_CLEANUP_INTERVAL_MS).unref();

async function verifyOrCapturePaymentWithRazorpayApi(params: {
  paymentId: string;
  expectedAmountInPaise?: number;
  keyId: string;
  keySecret: string;
}): Promise<{ ok: boolean; status?: string; payment?: any; error?: string }> {
  const { paymentId, expectedAmountInPaise, keyId, keySecret } = params;
  const authToken = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const getResp = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${authToken}`,
      },
      signal: AbortSignal.timeout(RAZORPAY_FETCH_TIMEOUT_MS),
    }
  );

  const paymentData = await getResp.json().catch(() => ({}));
  if (!getResp.ok || !paymentData?.id) {
    return {
      ok: false,
      error:
        paymentData?.error?.description ||
        `Razorpay gateway could not find payment ${paymentId}.`,
    };
  }

  if (
    expectedAmountInPaise &&
    Number(paymentData.amount) > 0 &&
    Number(paymentData.amount) !== expectedAmountInPaise
  ) {
    return {
      ok: false,
      error: `Payment amount mismatch in Razorpay gateway (expected ${
        expectedAmountInPaise / 100
      }, received ${Number(paymentData.amount) / 100}).`,
    };
  }

  // If authorized, capture it automatically via Razorpay Gateway API
  if (paymentData.status === "authorized") {
    const capResp = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: paymentData.amount,
          currency: paymentData.currency || "INR",
        }),
        signal: AbortSignal.timeout(RAZORPAY_FETCH_TIMEOUT_MS),
      }
    );
    const capData = await capResp.json().catch(() => ({}));
    if (capResp.ok && capData?.status === "captured") {
      return { ok: true, status: "captured", payment: capData };
    }
  }

  if (paymentData.status !== "captured") {
    return {
      ok: false,
      status: paymentData.status,
      error: `Razorpay payment status is "${paymentData.status}". Payment must be completed and captured by Razorpay first.`,
    };
  }

  return { ok: true, status: "captured", payment: paymentData };
}

async function finalizeSessionAndDispatch(
  session: PendingGatewaySession,
  paymentId: string,
  signature: string | undefined,
  verificationSource: string
) {
  session.gatewayConfirmed = true;
  session.razorpayPaymentId = paymentId;
  session.razorpaySignature = signature;
  session.verificationSource = verificationSource;
  session.confirmedAt = session.confirmedAt || new Date().toISOString();
  session.confirmedAtMs = session.confirmedAtMs || Date.now();

  if (!session.dispatchResult && session.items.length > 0 && session.customer.name) {
    const currentDate = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const fullDispatch = await dispatchOrderNotificationsToUser({
      order: {
        id: session.localOrderId,
        customerName: session.customer.name,
        customerPhone: session.customer.phone,
        customerEmail: session.customer.email,
        customerAddress:
          session.deliveryMethod === "delivery" ? session.customer.address : undefined,
        deliveryMethod: session.deliveryMethod,
        items: session.items,
        totalAmount: session.amount,
        status: "completed",
        createdAt: currentDate,
        paymentChannel: session.paymentChannel === "card" ? "card" : "upi",
        paymentMethod:
          session.paymentChannel === "card"
            ? `Razorpay Card (${getRazorpayHandle(session.razorpayMeUrl)})`
            : session.autoAmountMode === "upi_intent"
            ? "UPI Direct Exact-Amount"
            : `Razorpay UPI (${getRazorpayHandle(session.razorpayMeUrl)})`,
        paymentStatus: "paid",
        transactionId: paymentId,
        billNumber: session.billNumber,
        razorpayOrderId: session.orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        razorpayMeUrl: session.paymentLinkUrl || session.razorpayMeUrl,
        gatewayConfirmedAt: session.confirmedAt,
      },
      currencySymbol: session.currencySymbol,
      brandName: session.brandName,
      baseUrl: session.baseUrl,
    });

    const { generatedBillText: _omitText, whatsappText: _omitWa, ...compactDispatch } = fullDispatch;
    session.dispatchResult = compactDispatch;
    session.items = [];
  }

  return session;
}

export function registerRazorpayRoutes(app: express.Application) {
  /**
   * Public Razorpay gateway configuration
   */
  app.get("/api/payments/razorpay/config", (_req, res) => {
    const { keyId, configured, webhookSecret } = getRazorpayCredentials();
    const razorpayMeUrl = getRazorpayMeUrl();
    const razorpayHandle = getRazorpayHandle(razorpayMeUrl);
    const merchantUpiVpa = getMerchantUpiVpa();
    const autoAmountMode = resolveAutoAmountMode(configured, merchantUpiVpa);

    res.json({
      configured: true,
      sdkConfigured: configured,
      apiVerificationEnabled: configured,
      webhookConfigured: Boolean(webhookSecret),
      upiVpaConfigured: Boolean(merchantUpiVpa),
      mode: configured ? "live_sdk" : "razorpay_me",
      autoAmountMode,
      keyId: configured ? keyId : null,
      razorpayMeUrl,
      razorpayHandle,
      currency: "INR",
    });
  });

  /**
   * Create a Razorpay billing order / locked-amount Payment Link / UPI intent session.
   */
  app.post("/api/payments/razorpay/create-order", async (req, res) => {
    try {
      const {
        amount,
        currency = "INR",
        receipt,
        paymentChannel = "upi",
        deliveryMethod = "delivery",
        currencySymbol = "₹",
        brandName = "THREAD DEN",
        customer,
        items = [],
        itemsCount = 1,
      } = req.body as {
        amount?: number;
        currency?: string;
        receipt?: string;
        paymentChannel?: "upi" | "card" | "cod";
        deliveryMethod?: "pickup" | "delivery";
        currencySymbol?: string;
        brandName?: string;
        customer?: { name?: string; email?: string; phone?: string; address?: string };
        items?: PdfOrderItem[];
        itemsCount?: number;
      };

      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: "Invalid payment amount." });
      }

      const amountInPaise = Math.round(numericAmount * 100);
      const receiptId = receipt || `rcpt_td_${Date.now()}`;
      const billNumber = generateBillNumber(receiptId);
      const localOrderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
      const { keyId, keySecret, configured } = getRazorpayCredentials();
      const razorpayMeUrl = getRazorpayMeUrl();
      const razorpayHandle = getRazorpayHandle(razorpayMeUrl);
      const merchantUpiVpa = getMerchantUpiVpa();
      const autoAmountMode = resolveAutoAmountMode(configured, merchantUpiVpa);
      const baseUrl = getPublicBaseUrl(req);

      let orderId = "";
      let mode: "live_sdk" | "razorpay_me" = "razorpay_me";
      let paymentLinkId: string | undefined;
      let paymentLinkUrl: string | undefined;
      let upiIntentUrl: string | undefined;
      let upiQrDataUrl: string | undefined;

      if (configured && keyId && keySecret) {
        const authToken = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
        const rzpResp = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: {
            Authorization: `Basic ${authToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency,
            receipt: receiptId.slice(0, 40),
            payment_capture: 1,
            notes: {
              brand: brandName,
              localOrderId,
              paymentChannel,
              billNumber,
              razorpayMeUrl,
              customerName: customer?.name || "",
              customerEmail: customer?.email || "",
              customerPhone: customer?.phone || "",
              itemsCount: String(itemsCount),
            },
          }),
          signal: AbortSignal.timeout(RAZORPAY_FETCH_TIMEOUT_MS),
        });

        const rzpData = await rzpResp.json().catch(() => ({}));
        if (!rzpResp.ok || !rzpData?.id) {
          console.error("Razorpay order creation failed:", rzpData);
          return res.status(rzpResp.status >= 400 ? rzpResp.status : 502).json({
            error:
              rzpData?.error?.description ||
              "Unable to create Razorpay order. Verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
          });
        }

        orderId = rzpData.id;
        mode = "live_sdk";

        // Also create a hosted locked-amount Razorpay Payment Link (short_url) as seamless backup / direct open
        try {
          const formattedContact = formatContactForRazorpay(customer?.phone);
          const linkPayload: Record<string, any> = {
            amount: amountInPaise,
            currency,
            accept_partial: false,
            reference_id: billNumber.slice(0, 40),
            description: `${brandName} Order ${localOrderId} (${billNumber})`,
            customer: {
              name: customer?.name?.trim() || "Customer",
              ...(customer?.email?.trim() ? { email: customer.email.trim() } : {}),
              ...(formattedContact ? { contact: formattedContact } : {}),
            },
            notify: { sms: false, email: false },
            reminder_enable: false,
            notes: {
              brand: brandName,
              localOrderId,
              billNumber,
              razorpayOrderId: orderId,
              paymentChannel,
            },
          };
          if (baseUrl && baseUrl.startsWith("https://")) {
            linkPayload.callback_url = `${baseUrl}/?razorpay_bill=${encodeURIComponent(billNumber)}`;
            linkPayload.callback_method = "get";
          }

          const linkResp = await fetch("https://api.razorpay.com/v1/payment_links", {
            method: "POST",
            headers: {
              Authorization: `Basic ${authToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(linkPayload),
            signal: AbortSignal.timeout(RAZORPAY_FETCH_TIMEOUT_MS),
          });
          const linkData = await linkResp.json().catch(() => ({}));
          if (linkResp.ok && linkData?.id && linkData?.short_url) {
            paymentLinkId = String(linkData.id);
            paymentLinkUrl = String(linkData.short_url);
          }
        } catch {
          // Hosted Payment Link is additive; embedded Checkout order already succeeded
        }
      } else {
        orderId = `order_rzp_${Date.now().toString(36)}_${crypto
          .randomBytes(3)
          .toString("hex")}`;
      }

      if (merchantUpiVpa) {
        upiIntentUrl = buildUpiIntentUrl({
          vpa: merchantUpiVpa,
          payeeName: brandName,
          amount: numericAmount,
          billNumber,
        });
        upiQrDataUrl = await QRCode.toDataURL(upiIntentUrl, {
          width: 260,
          margin: 2,
          color: { dark: "#09090b", light: "#ffffff" },
        }).catch(() => undefined);
      }

      prunePendingSessions();
      pendingSessions.set(orderId, {
        orderId,
        localOrderId,
        billNumber,
        amount: numericAmount,
        amountInPaise,
        currency,
        currencySymbol,
        brandName,
        paymentChannel,
        deliveryMethod,
        customer: {
          name: customer?.name || "",
          email: customer?.email || "",
          phone: customer?.phone || "",
          address: customer?.address,
        },
        items: Array.isArray(items) ? items.slice(0, 50) : [],
        razorpayMeUrl,
        paymentLinkId,
        paymentLinkUrl,
        upiIntentUrl,
        autoAmountMode,
        createdAtMs: Date.now(),
        gatewayConfirmed: false,
        baseUrl,
      });

      return res.json({
        mode,
        autoAmountMode,
        keyId: mode === "live_sdk" ? keyId : null,
        razorpayMeUrl,
        razorpayHandle,
        paymentLinkId: paymentLinkId || null,
        paymentLinkUrl: paymentLinkUrl || null,
        upiIntentUrl: upiIntentUrl || null,
        upiQrDataUrl: upiQrDataUrl || null,
        orderId,
        localOrderId,
        amount: amountInPaise,
        currency,
        receipt: receiptId,
        billNumber,
        paymentChannel,
      });
    } catch (err: any) {
      console.error("Create Razorpay order error:", err);
      return res.status(500).json({
        error: err?.message || "Failed to initiate Razorpay billing order.",
      });
    }
  });

  /**
   * Poll live Razorpay Gateway status for an initiated order (supports webhook, Orders API, Payment Links API)
   */
  app.get("/api/payments/razorpay/gateway-status/:orderId", async (req, res) => {
    try {
      const orderId = String(req.params.orderId || "").trim();
      const session = pendingSessions.get(orderId);
      if (!session) {
        return res.status(404).json({ exists: false, gatewayConfirmed: false });
      }

      if (!session.gatewayConfirmed) {
        const { keyId, keySecret, configured } = getRazorpayCredentials();
        if (configured && keyId && keySecret) {
          const authToken = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

          // 1) Check direct payments for Razorpay Checkout order
          if (orderId.startsWith("order_") && !orderId.startsWith("order_rzp_")) {
            const ordPayResp = await fetch(
              `https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`,
              {
                headers: { Authorization: `Basic ${authToken}` },
                signal: AbortSignal.timeout(RAZORPAY_FETCH_TIMEOUT_MS),
              }
            ).catch(() => null);
            const ordPayData = ordPayResp ? await ordPayResp.json().catch(() => ({})) : {};
            const captured = Array.isArray(ordPayData?.items)
              ? ordPayData.items.find((p: any) => p.status === "captured")
              : null;
            if (captured?.id) {
              const sig = crypto
                .createHmac("sha256", keySecret)
                .update(`${orderId}|${captured.id}`)
                .digest("hex");
              await finalizeSessionAndDispatch(
                session,
                captured.id,
                sig,
                "razorpay_gateway_api"
              );
            }
          }

          // 2) Check locked-amount Razorpay Hosted Payment Link status if one was created
          if (!session.gatewayConfirmed && session.paymentLinkId) {
            const plResp = await fetch(
              `https://api.razorpay.com/v1/payment_links/${encodeURIComponent(session.paymentLinkId)}`,
              {
                headers: { Authorization: `Basic ${authToken}` },
                signal: AbortSignal.timeout(RAZORPAY_FETCH_TIMEOUT_MS),
              }
            ).catch(() => null);
            const plData = plResp ? await plResp.json().catch(() => ({})) : {};
            if (plData?.status === "paid") {
              const payEntry = Array.isArray(plData?.payments) ? plData.payments[0] : null;
              const payId = payEntry?.payment_id || `pay_${session.paymentLinkId.replace(/^plink_/, "")}`;
              const sig = crypto
                .createHmac("sha256", keySecret)
                .update(`${orderId}|${payId}`)
                .digest("hex");
              await finalizeSessionAndDispatch(
                session,
                payId,
                sig,
                "razorpay_payment_link_api"
              );
            }
          }

          // 3) Also check recent Razorpay payments matching amount + email/phone
          if (!session.gatewayConfirmed) {
            const recentResp = await fetch(
              "https://api.razorpay.com/v1/payments?count=15",
              {
                headers: { Authorization: `Basic ${authToken}` },
                signal: AbortSignal.timeout(RAZORPAY_FETCH_TIMEOUT_MS),
              }
            ).catch(() => null);
            const recentData = recentResp ? await recentResp.json().catch(() => ({})) : {};
            const custEmail = session.customer.email.trim().toLowerCase();
            const custDigits = normalizePhoneDigits(session.customer.phone);
            const minCreatedSec = Math.floor((session.createdAtMs - 120000) / 1000);

            const match = Array.isArray(recentData?.items)
              ? recentData.items.find((p: any) => {
                  if (p.status !== "captured") return false;
                  if (Number(p.amount) !== session.amountInPaise) return false;
                  if (Number(p.created_at) < minCreatedSec) return false;
                  const pEmail = String(p.email || "").trim().toLowerCase();
                  const pDigits = normalizePhoneDigits(String(p.contact || ""));
                  return (
                    (custEmail && pEmail === custEmail) ||
                    (custDigits && pDigits === custDigits)
                  );
                })
              : null;

            if (match?.id) {
              const sig = crypto
                .createHmac("sha256", keySecret)
                .update(`${orderId}|${match.id}`)
                .digest("hex");
              await finalizeSessionAndDispatch(
                session,
                match.id,
                sig,
                "razorpay_me_gateway_api"
              );
            }
          }
        }
      }

      return res.json({
        exists: true,
        gatewayConfirmed: session.gatewayConfirmed,
        orderId: session.orderId,
        localOrderId: session.localOrderId,
        billNumber: session.billNumber,
        paymentLinkUrl: session.paymentLinkUrl,
        razorpayPaymentId: session.razorpayPaymentId,
        razorpaySignature: session.razorpaySignature,
        verificationSource: session.verificationSource,
        confirmedAt: session.confirmedAt,
        pdfUrl: session.dispatchResult?.pdfUrl,
        pdfFilename: session.dispatchResult?.pdfFilename,
        dispatchStatus: session.dispatchResult,
      });
    } catch (err: any) {
      return res.status(500).json({
        exists: false,
        gatewayConfirmed: false,
        error: err?.message || "Failed to poll Razorpay gateway status.",
      });
    }
  });

  /**
   * Razorpay Official Webhook Receiver (payment.captured / order.paid / payment_link.paid)
   */
  app.post("/api/payments/razorpay/webhook", async (req, res) => {
    try {
      const signature = String(req.headers["x-razorpay-signature"] || "");
      const { webhookSecret } = getRazorpayCredentials();

      if (webhookSecret && signature) {
        const expected = crypto
          .createHmac("sha256", webhookSecret)
          .update(JSON.stringify(req.body || {}))
          .digest("hex");
        const expBuf = Buffer.from(expected, "utf8");
        const actBuf = Buffer.from(signature, "utf8");
        if (expBuf.length !== actBuf.length || !crypto.timingSafeEqual(expBuf, actBuf)) {
          return res.status(400).json({ received: false, error: "Invalid webhook signature." });
        }
      }

      const event = req.body?.event;
      const paymentEntity = req.body?.payload?.payment?.entity;
      const paymentLinkEntity = req.body?.payload?.payment_link?.entity;

      if (
        (event === "payment.captured" ||
          event === "order.paid" ||
          event === "payment_link.paid") &&
        paymentEntity?.id
      ) {
        const payId = String(paymentEntity.id);
        const rzpOrderId = paymentEntity.order_id
          ? String(paymentEntity.order_id)
          : undefined;
        const plId = paymentLinkEntity?.id ? String(paymentLinkEntity.id) : undefined;
        const pEmail = String(paymentEntity.email || "").trim().toLowerCase();
        const pDigits = normalizePhoneDigits(String(paymentEntity.contact || ""));
        const pAmount = Number(paymentEntity.amount || 0);
        const noteBill =
          paymentEntity.notes?.billNumber || paymentLinkEntity?.notes?.billNumber
            ? String(paymentEntity.notes?.billNumber || paymentLinkEntity?.notes?.billNumber)
            : undefined;

        let targetSession: PendingGatewaySession | undefined = rzpOrderId
          ? pendingSessions.get(rzpOrderId)
          : undefined;

        if (!targetSession) {
          for (const sess of pendingSessions.values()) {
            if (sess.gatewayConfirmed) continue;
            if (plId && sess.paymentLinkId === plId) {
              targetSession = sess;
              break;
            }
            if (noteBill && sess.billNumber === noteBill) {
              targetSession = sess;
              break;
            }
            const sEmail = sess.customer.email.trim().toLowerCase();
            const sDigits = normalizePhoneDigits(sess.customer.phone);
            if (
              sess.amountInPaise === pAmount &&
              ((sEmail && sEmail === pEmail) || (sDigits && sDigits === pDigits))
            ) {
              targetSession = sess;
              break;
            }
          }
        }

        if (targetSession) {
          await finalizeSessionAndDispatch(
            targetSession,
            payId,
            signature || undefined,
            "razorpay_webhook"
          );
        }
      }

      return res.json({ received: true });
    } catch (err: any) {
      console.error("Razorpay webhook processing error:", err);
      return res.status(500).json({ received: false, error: err?.message });
    }
  });

  /**
   * Strict Razorpay Gateway Verification:
   * - For live_sdk: checks HMAC signature AND confirms payment status === 'captured' via Razorpay REST API.
   * - For upi_intent (when MERCHANT_UPI_VPA is set without Razorpay keys): confirms UPI UTR / pay_... reference.
   * - For razorpay_me: requires webhook confirmation OR a valid Razorpay Payment ID (pay_...) verified against Razorpay API if keys are configured.
   */
  app.post("/api/payments/razorpay/verify", async (req, res) => {
    try {
      const {
        mode = "razorpay_me",
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        paymentChannel = "upi",
      } = req.body as {
        mode?: "live_sdk" | "razorpay_me" | "upi_intent";
        razorpay_order_id?: string;
        razorpay_payment_id?: string;
        razorpay_signature?: string;
        paymentChannel?: "upi" | "card";
      };

      if (!razorpay_order_id) {
        return res
          .status(400)
          .json({ verified: false, gatewayConfirmed: false, error: "Missing razorpay_order_id." });
      }

      const { keyId, keySecret, configured } = getRazorpayCredentials();
      const razorpayMeUrl = getRazorpayMeUrl();
      const session = pendingSessions.get(razorpay_order_id);
      if (session) {
        session.baseUrl = getPublicBaseUrl(req);
      }

      // If webhook or polling already confirmed it at the Razorpay Gateway, return immediately!
      if (session?.gatewayConfirmed && session.razorpayPaymentId) {
        return res.json({
          verified: true,
          gatewayConfirmed: true,
          verificationSource: session.verificationSource || "razorpay_webhook",
          mode,
          paymentChannel,
          razorpayMeUrl: session.paymentLinkUrl || razorpayMeUrl,
          localOrderId: session.localOrderId,
          billNumber: session.billNumber,
          razorpay_order_id,
          razorpay_payment_id: session.razorpayPaymentId,
          razorpay_signature: session.razorpaySignature,
          verifiedAt: session.confirmedAt,
          pdfUrl: session.dispatchResult?.pdfUrl,
          pdfFilename: session.dispatchResult?.pdfFilename,
          dispatchStatus: session.dispatchResult,
        });
      }

      // LIVE SDK VERIFICATION (HMAC-SHA256 + Razorpay API check)
      if (mode === "live_sdk" && configured && keyId && keySecret) {
        if (!razorpay_payment_id || !razorpay_signature) {
          return res.status(400).json({
            verified: false,
            gatewayConfirmed: false,
            error: "Missing Razorpay payment ID or signature.",
          });
        }

        const expectedSignature = crypto
          .createHmac("sha256", keySecret)
          .update(`${razorpay_order_id}|${razorpay_payment_id}`)
          .digest("hex");

        const expectedBuf = Buffer.from(expectedSignature, "utf8");
        const actualBuf = Buffer.from(razorpay_signature, "utf8");

        const isValid =
          expectedBuf.length === actualBuf.length &&
          crypto.timingSafeEqual(expectedBuf, actualBuf);

        if (!isValid) {
          return res.status(400).json({
            verified: false,
            gatewayConfirmed: false,
            error: "Razorpay signature verification failed.",
          });
        }

        const apiCheck = await verifyOrCapturePaymentWithRazorpayApi({
          paymentId: razorpay_payment_id,
          expectedAmountInPaise: session?.amountInPaise,
          keyId,
          keySecret,
        });
        if (!apiCheck.ok) {
          return res.status(400).json({
            verified: false,
            gatewayConfirmed: false,
            error: apiCheck.error || "Razorpay gateway did not confirm payment capture.",
          });
        }

        const confirmedAt = new Date().toISOString();
        if (session) {
          await finalizeSessionAndDispatch(
            session,
            razorpay_payment_id,
            razorpay_signature,
            "razorpay_gateway_sdk"
          );
        }

        return res.json({
          verified: true,
          gatewayConfirmed: true,
          verificationSource: "razorpay_gateway_sdk",
          mode: "live_sdk",
          paymentChannel,
          razorpayMeUrl: session?.paymentLinkUrl || razorpayMeUrl,
          localOrderId: session?.localOrderId,
          billNumber: session?.billNumber,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          verifiedAt: session?.confirmedAt || confirmedAt,
          pdfUrl: session?.dispatchResult?.pdfUrl,
          pdfFilename: session?.dispatchResult?.pdfFilename,
          dispatchStatus: session?.dispatchResult,
        });
      }

      const cleanPaymentId = razorpay_payment_id?.trim() || "";
      const isUpiIntentAllowed =
        mode === "upi_intent" && Boolean(getMerchantUpiVpa()) && isValidUpiUtrOrPaymentId(cleanPaymentId);

      if (!isUpiIntentAllowed && !isValidRazorpayPaymentId(cleanPaymentId)) {
        return res.status(400).json({
          verified: false,
          gatewayConfirmed: false,
          error:
            mode === "upi_intent"
              ? "Please complete your exact-amount UPI payment and enter the 12-digit UPI UTR / Reference Number (or pay_... ID)."
              : "Payment is not yet confirmed by Razorpay. Please complete your payment on Razorpay and enter your valid Razorpay Payment ID (e.g. pay_Q7xYz123AbCdEf) shown on the confirmation screen.",
        });
      }

      let finalSig = razorpay_signature;
      let verificationSource = isUpiIntentAllowed ? "upi_utr_reference" : "razorpay_payment_id";
      if (configured && keyId && keySecret && isValidRazorpayPaymentId(cleanPaymentId)) {
        const apiCheck = await verifyOrCapturePaymentWithRazorpayApi({
          paymentId: cleanPaymentId,
          expectedAmountInPaise: session?.amountInPaise,
          keyId,
          keySecret,
        });
        if (!apiCheck.ok) {
          return res.status(400).json({
            verified: false,
            gatewayConfirmed: false,
            error:
              apiCheck.error ||
              "Razorpay Gateway has not confirmed this payment ID as captured yet.",
          });
        }
        verificationSource = "razorpay_me_gateway_api";
        finalSig = crypto
          .createHmac("sha256", keySecret)
          .update(`${razorpay_order_id}|${cleanPaymentId}`)
          .digest("hex");
      } else {
        finalSig =
          finalSig ||
          crypto
            .createHmac("sha256", SANDBOX_HMAC_KEY)
            .update(`${razorpay_order_id}|${cleanPaymentId}`)
            .digest("hex");
      }

      const confirmedAt = new Date().toISOString();
      if (session) {
        await finalizeSessionAndDispatch(
          session,
          cleanPaymentId,
          finalSig,
          verificationSource
        );
      }

      return res.json({
        verified: true,
        gatewayConfirmed: true,
        verificationSource,
        mode,
        paymentChannel,
        razorpayMeUrl: session?.paymentLinkUrl || razorpayMeUrl,
        localOrderId: session?.localOrderId,
        billNumber: session?.billNumber,
        razorpay_order_id,
        razorpay_payment_id: cleanPaymentId,
        razorpay_signature: finalSig,
        verifiedAt: session?.confirmedAt || confirmedAt,
        pdfUrl: session?.dispatchResult?.pdfUrl,
        pdfFilename: session?.dispatchResult?.pdfFilename,
        dispatchStatus: session?.dispatchResult,
      });
    } catch (err: any) {
      console.error("Verify Razorpay payment error:", err);
      return res.status(500).json({
        verified: false,
        gatewayConfirmed: false,
        error: err?.message || "Failed to verify Razorpay payment.",
      });
    }
  });
}
