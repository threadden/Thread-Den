import React, { useState, useEffect } from "react";
import {
  X,
  Trash2,
  ShoppingBag,
  Send,
  PhoneCall,
  Copy,
  Check,
  MapPin,
  Sparkles,
  CreditCard,
  Smartphone,
  Banknote,
  ArrowLeft,
  Loader2,
  Printer,
  Download,
  CheckCircle2,
  Receipt,
  Lock,
  UserCheck,
  User,
  ArrowRight,
  QrCode,
  ShieldCheck,
  Mail,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import {
  CartItem,
  Order,
  OrderDispatchStatus,
  NotificationChannelStatus,
  UserProfile,
} from "../types";
import {
  generateOrderPDF,
  GeneratedOrderPdfResult,
} from "../utils/generateOrderPDF";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export interface RecordedCustomerDetails {
  name: string;
  phone: string;
  email: string;
  deliveryMethod: "pickup" | "delivery";
  address?: string;
}

interface CartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveItem: (id: string) => void;
  currencySymbol: string;
  brandName?: string;
  merchantWhatsApp: string;
  onSubmitOrder: (
    order: Omit<Order, "id" | "createdAt" | "status"> & {
      id?: string;
      createdAt?: string;
      status?: Order["status"];
      paymentMethod?: string;
      paymentChannel?: "cod" | "upi" | "card";
      paymentStatus?: "unpaid" | "paid";
      transactionId?: string;
      billNumber?: string;
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
      razorpaySignature?: string;
      razorpayMeUrl?: string;
      userId?: string;
    }
  ) => void;
  onUpdateOrderDispatch?: (orderId: string, dispatchStatus: OrderDispatchStatus) => void;
  onRecordCustomerDetails?: (details: RecordedCustomerDetails) => void;
  theme: "dark" | "light";
  currentUser?: UserProfile | null;
  onOpenAccountModal?: () => void;
  onOpenAuthModal?: (mode: "signin" | "signup") => void;
}

interface RazorpayConfigState {
  configured: boolean;
  sdkConfigured?: boolean;
  apiVerificationEnabled?: boolean;
  webhookConfigured?: boolean;
  upiVpaConfigured?: boolean;
  mode: "live_sdk" | "razorpay_me";
  autoAmountMode?: "razorpay_checkout" | "upi_intent" | "manual_handle";
  keyId: string | null;
  razorpayMeUrl: string;
  razorpayHandle: string;
  currency: string;
}

interface PendingGatewayOrderState {
  orderId: string;
  localOrderId: string;
  billNumber: string;
  mode: "live_sdk" | "razorpay_me";
  autoAmountMode?: "razorpay_checkout" | "upi_intent" | "manual_handle";
  keyId: string | null;
  amount: number;
  razorpayMeUrl: string;
  razorpayHandle: string;
  paymentLinkUrl?: string | null;
  upiIntentUrl?: string | null;
  upiQrDataUrl?: string | null;
}

const DEFAULT_RAZORPAY_ME_URL = "https://razorpay.me/@johnraj";

function loadRazorpayCheckoutScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (typeof window.Razorpay === "function") return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="checkout.razorpay.com/v1/checkout.js"]'
    );
    let settled = false;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };

    const timer = window.setTimeout(() => {
      finish(typeof window.Razorpay === "function");
    }, 5500);

    const handleReady = () => {
      window.clearTimeout(timer);
      finish(typeof window.Razorpay === "function");
    };

    if (existing) {
      existing.addEventListener("load", handleReady, { once: true });
      existing.addEventListener("error", () => {
        window.clearTimeout(timer);
        finish(false);
      }, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = handleReady;
    script.onerror = () => {
      window.clearTimeout(timer);
      finish(false);
    };
    document.head.appendChild(script);
  });
}

export default function CartSidebar({
  isOpen,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  currencySymbol,
  brandName = "THREAD DEN",
  merchantWhatsApp,
  onSubmitOrder,
  onUpdateOrderDispatch,
  onRecordCustomerDetails,
  theme,
  currentUser,
  onOpenAccountModal,
  onOpenAuthModal,
}: CartSidebarProps) {
  // Step 1: Customer Details Form
  const [customerName, setCustomerName] = useState(currentUser?.name || "");
  const [customerPhone, setCustomerPhone] = useState(currentUser?.phone || "");
  const [customerEmail, setCustomerEmail] = useState(currentUser?.email || "");
  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "delivery">("delivery");
  const [customerAddress, setCustomerAddress] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [detailsRecordedAt, setDetailsRecordedAt] = useState<string | null>(null);

  // Step 2: 3 Payment Options (COD, UPI Payments, Cards) + Razorpay.me Gateway
  const [isAtPaymentPortal, setIsAtPaymentPortal] = useState(false);
  const [paymentChannel, setPaymentChannel] = useState<"cod" | "upi" | "card">("upi");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [razorpayConfig, setRazorpayConfig] = useState<RazorpayConfigState>({
    configured: true,
    sdkConfigured: false,
    upiVpaConfigured: false,
    mode: "razorpay_me",
    autoAmountMode: "manual_handle",
    keyId: null,
    razorpayMeUrl: DEFAULT_RAZORPAY_ME_URL,
    razorpayHandle: "@johnraj",
    currency: "INR",
  });
  const [razorpayRefInput, setRazorpayRefInput] = useState("");
  const [hasOpenedRazorpayLink, setHasOpenedRazorpayLink] = useState(false);
  const [pendingGatewayOrder, setPendingGatewayOrder] = useState<PendingGatewayOrderState | null>(
    null
  );
  const [isCheckingGateway, setIsCheckingGateway] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  // Payment Progress & Post-Order State
  const [isPaying, setIsPaying] = useState(false);
  const [payProgress, setPayProgress] = useState(0);
  const [payStatusText, setPayStatusText] = useState("");
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Dispatch Notifications & Sample Bill State
  const [dispatchStatus, setDispatchStatus] = useState<OrderDispatchStatus | null>(null);
  const [generatedOrderPdf, setGeneratedOrderPdf] = useState<GeneratedOrderPdfResult | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isResendingBill, setIsResendingBill] = useState(false);

  // Auto-fill from signed-in user profile
  useEffect(() => {
    if (currentUser) {
      if (!customerName) setCustomerName(currentUser.name);
      if (!customerPhone) setCustomerPhone(currentUser.phone);
      if (!customerEmail && currentUser.email) setCustomerEmail(currentUser.email);
      if (currentUser.savedAddresses && currentUser.savedAddresses.length > 0) {
        const defaultAddr =
          currentUser.savedAddresses.find((a) => a.isDefault) || currentUser.savedAddresses[0];
        if (defaultAddr && !customerAddress) {
          setCustomerAddress(
            `${defaultAddr.streetAddress}, ${defaultAddr.city}, ${defaultAddr.state} - ${defaultAddr.postalCode}`
          );
        }
      }
    }
  }, [currentUser, customerName, customerPhone, customerEmail, customerAddress]);

  // Fetch Razorpay gateway availability when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/payments/razorpay/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: RazorpayConfigState | null) => {
        if (cfg) setRazorpayConfig(cfg);
      })
      .catch(() => {
        // Keep sandbox fallback silently
      });
  }, [isOpen]);

  const isDark = theme === "dark";
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const deliveryFee = deliveryMethod === "delivery" ? 100 : 0;
  const totalAmount = subtotal + deliveryFee;

  const handleCopyPayableAmount = () => {
    navigator.clipboard.writeText(String(totalAmount));
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 1800);
  };

  const playPaymentTone = (freq: number, duration: number, type: OscillatorType = "sine") => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      }
    } catch {
      // Ignore audio errors
    }
  };

  // STEP 1 -> STEP 2: Buy Now click validates & records all customer details first
  const handleBuyNowClick = (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);
    setPaymentError(null);

    if (!currentUser) {
      if (onOpenAuthModal) {
        onOpenAuthModal("signup");
      } else if (onOpenAccountModal) {
        onOpenAccountModal();
      }
      return;
    }

    if (!customerName.trim() || !customerPhone.trim()) {
      setCheckoutError("Please enter your full name and phone/WhatsApp number.");
      return;
    }
    if (!customerEmail.trim() || !customerEmail.includes("@")) {
      setCheckoutError("Please enter a valid email ID so we can send your generated sample bill.");
      return;
    }
    if (deliveryMethod === "delivery" && !customerAddress.trim()) {
      setCheckoutError("Please enter your delivery address.");
      return;
    }

    const recordedDetails: RecordedCustomerDetails = {
      name: customerName.trim(),
      phone: customerPhone.trim(),
      email: customerEmail.trim(),
      deliveryMethod,
      address: deliveryMethod === "delivery" ? customerAddress.trim() : undefined,
    };

    if (onRecordCustomerDetails) {
      onRecordCustomerDetails(recordedDetails);
    }

    setDetailsRecordedAt(
      new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    );
    setIsAtPaymentPortal(true);
  };

  // Generate PDF via jsPDF & send confirmation to user email / registered WhatsApp mobile / SMS
  const dispatchOrderNotifications = async (
    completedOrder: Order,
    preGeneratedPdf?: GeneratedOrderPdfResult
  ) => {
    setIsDispatching(true);
    try {
      let pdfArtifact = preGeneratedPdf || generatedOrderPdf;
      if (!pdfArtifact || pdfArtifact.orderId !== completedOrder.id) {
        pdfArtifact = generateOrderPDF(completedOrder, {
          brandName,
          currencySymbol,
        });
        setGeneratedOrderPdf(pdfArtifact);
      }

      const resp = await fetch("/api/notifications/order-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: completedOrder,
          currencySymbol,
          brandName,
          clientPdfBase64: pdfArtifact.base64,
          clientPdfFilename: pdfArtifact.filename,
        }),
      });
      if (resp.ok) {
        const result: OrderDispatchStatus = await resp.json();
        setDispatchStatus(result);
        setCreatedOrder((prev) =>
          prev && prev.id === completedOrder.id
            ? {
                ...prev,
                pdfUrl: result.pdfUrl || prev.pdfUrl,
                pdfFilename: result.pdfFilename || pdfArtifact?.filename || prev.pdfFilename,
                dispatchStatus: result,
              }
            : prev
        );
        if (onUpdateOrderDispatch) {
          onUpdateOrderDispatch(completedOrder.id, result);
        }
      }
    } catch (err) {
      console.error("Failed to dispatch PDF invoice & notifications:", err);
    } finally {
      setIsDispatching(false);
    }
  };

  const handleResendBillEmail = async () => {
    if (!createdOrder) return;
    setIsResendingBill(true);
    try {
      let pdfArtifact = generatedOrderPdf;
      if (!pdfArtifact || pdfArtifact.orderId !== createdOrder.id) {
        pdfArtifact = generateOrderPDF(createdOrder, {
          brandName,
          currencySymbol,
        });
        setGeneratedOrderPdf(pdfArtifact);
      }

      const resp = await fetch("/api/notifications/send-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: createdOrder,
          currencySymbol,
          brandName,
          clientPdfBase64: pdfArtifact.base64,
          clientPdfFilename: pdfArtifact.filename,
        }),
      });
      if (resp.ok) {
        const billResult: NotificationChannelStatus = await resp.json();
        setDispatchStatus((prev) => {
          const next: OrderDispatchStatus = prev
            ? { ...prev, billEmail: billResult }
            : {
                dispatchedAt: new Date().toISOString(),
                whatsapp: {
                  channel: "whatsapp",
                  delivered: false,
                  mode: "fallback_link",
                  provider: "Pending",
                  recipient: createdOrder.customerPhone,
                  timestamp: new Date().toISOString(),
                },
                sms: {
                  channel: "sms",
                  delivered: false,
                  mode: "fallback_link",
                  provider: "Pending",
                  recipient: createdOrder.customerPhone,
                  timestamp: new Date().toISOString(),
                },
                email: {
                  channel: "email",
                  delivered: false,
                  mode: "fallback_link",
                  provider: "Pending",
                  recipient: createdOrder.customerEmail || "N/A",
                  timestamp: new Date().toISOString(),
                },
                billEmail: billResult,
              };
          if (onUpdateOrderDispatch) {
            onUpdateOrderDispatch(createdOrder.id, next);
          }
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to resend sample bill email:", err);
    } finally {
      setIsResendingBill(false);
    }
  };

  // Finalize Order & Trigger PDF Generation + WhatsApp/Email Dispatch (or apply already-dispatched result from Razorpay Gateway verification)
  const finalizeCompletedOrder = (params: {
    orderIdOverride?: string;
    paymentChannel: "cod" | "upi" | "card";
    paymentMethodLabel: string;
    paymentStatus: "paid" | "unpaid";
    orderStatus: Order["status"];
    transactionId: string;
    billNumber: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
    razorpayMeUrl?: string;
    gatewayConfirmedAt?: string;
    preDispatchedStatus?: OrderDispatchStatus;
  }) => {
    playPaymentTone(659.25, 0.14);
    setTimeout(() => playPaymentTone(880.0, 0.3), 100);

    const orderItems = cart.map((item) => ({
      productId: item.product.id,
      productName: item.product.name,
      size: item.selectedSize,
      color: item.selectedColor.name,
      price: item.product.price,
      quantity: item.quantity,
    }));

    const orderId =
      params.orderIdOverride || `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const currentDate = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const completedOrder: Order = {
      id: orderId,
      userId: currentUser?.id,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim(),
      customerAddress: deliveryMethod === "delivery" ? customerAddress.trim() : undefined,
      deliveryMethod,
      items: orderItems,
      totalAmount,
      status: params.orderStatus,
      createdAt: currentDate,
      paymentChannel: params.paymentChannel,
      paymentMethod: params.paymentMethodLabel,
      paymentStatus: params.paymentStatus,
      transactionId: params.transactionId,
      billNumber: params.billNumber,
      razorpayOrderId: params.razorpayOrderId,
      razorpayPaymentId: params.razorpayPaymentId,
      razorpaySignature: params.razorpaySignature,
      razorpayMeUrl: params.razorpayMeUrl,
      gatewayConfirmedAt: params.gatewayConfirmedAt,
      pdfUrl: params.preDispatchedStatus?.pdfUrl,
      pdfFilename: params.preDispatchedStatus?.pdfFilename,
      dispatchStatus: params.preDispatchedStatus,
    };

    // Generate professional invoice PDF via jsPDF immediately on order submission
    // so the payload is ready for download & WhatsApp/Email dispatch
    const generatedPdf = generateOrderPDF(completedOrder, {
      brandName,
      currencySymbol,
    });
    completedOrder.pdfFilename = completedOrder.pdfFilename || generatedPdf.filename;
    setGeneratedOrderPdf(generatedPdf);

    onSubmitOrder(completedOrder);
    setCreatedOrder(completedOrder);
    setPendingGatewayOrder(null);
    setIsPaying(false);
    setIsAtPaymentPortal(false);

    if (params.preDispatchedStatus) {
      setDispatchStatus(params.preDispatchedStatus);
      setIsDispatching(false);
      if (onUpdateOrderDispatch) {
        onUpdateOrderDispatch(completedOrder.id, params.preDispatchedStatus);
      }
    } else {
      dispatchOrderNotifications(completedOrder, generatedPdf);
    }
  };

  // Ensure a backend Razorpay Gateway session exists for UPI / Cards so webhooks/polling can confirm it
  const ensureGatewaySessionCreated = async (): Promise<PendingGatewayOrderState | null> => {
    if (pendingGatewayOrder && pendingGatewayOrder.amount === Math.round(totalAmount * 100)) {
      return pendingGatewayOrder;
    }
    try {
      const orderItems = cart.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        size: item.selectedSize,
        color: item.selectedColor.name,
        price: item.product.price,
        quantity: item.quantity,
      }));
      const createResp = await fetch("/api/payments/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: totalAmount,
          currency: "INR",
          receipt: `td_${Date.now()}`,
          paymentChannel,
          deliveryMethod,
          currencySymbol,
          brandName,
          customer: {
            name: customerName.trim(),
            email: customerEmail.trim(),
            phone: customerPhone.trim(),
            address: deliveryMethod === "delivery" ? customerAddress.trim() : undefined,
          },
          items: orderItems,
          itemsCount: cart.reduce((sum, i) => sum + i.quantity, 0),
        }),
      });
      const orderData = await createResp.json();
      if (!createResp.ok || !orderData?.orderId) {
        throw new Error(orderData?.error || "Failed to initialize Razorpay gateway order.");
      }
      const nextSession: PendingGatewayOrderState = {
        orderId: orderData.orderId,
        localOrderId: orderData.localOrderId || `ORD-${Math.floor(100000 + Math.random() * 900000)}`,
        billNumber: orderData.billNumber,
        mode: orderData.mode,
        autoAmountMode: orderData.autoAmountMode,
        keyId: orderData.keyId,
        amount: orderData.amount,
        razorpayMeUrl: orderData.razorpayMeUrl || razorpayConfig.razorpayMeUrl,
        razorpayHandle: orderData.razorpayHandle || razorpayConfig.razorpayHandle,
        paymentLinkUrl: orderData.paymentLinkUrl || null,
        upiIntentUrl: orderData.upiIntentUrl || null,
        upiQrDataUrl: orderData.upiQrDataUrl || null,
      };
      setPendingGatewayOrder(nextSession);
      return nextSession;
    } catch (err: any) {
      setPaymentError(err?.message || "Could not initialize Razorpay gateway session.");
      return null;
    }
  };

  // Poll Razorpay Gateway status when user has opened razorpay.me/@johnraj
  useEffect(() => {
    if (
      !isOpen ||
      !isAtPaymentPortal ||
      createdOrder ||
      paymentChannel === "cod" ||
      !hasOpenedRazorpayLink ||
      !pendingGatewayOrder
    ) {
      return;
    }

    let cancelled = false;
    const pollStatus = async () => {
      try {
        const resp = await fetch(
          `/api/payments/razorpay/gateway-status/${encodeURIComponent(pendingGatewayOrder.orderId)}`
        );
        if (!resp.ok || cancelled) return;
        const data = await resp.json();
        if (data?.gatewayConfirmed && data?.razorpayPaymentId && !cancelled) {
          const methodLabel =
            paymentChannel === "card"
              ? `Razorpay Card (${pendingGatewayOrder.razorpayHandle})`
              : `Razorpay UPI (${pendingGatewayOrder.razorpayHandle})`;
          finalizeCompletedOrder({
            orderIdOverride: data.localOrderId || pendingGatewayOrder.localOrderId,
            paymentChannel,
            paymentMethodLabel: methodLabel,
            paymentStatus: "paid",
            orderStatus: "completed",
            transactionId: data.razorpayPaymentId,
            billNumber: data.billNumber || pendingGatewayOrder.billNumber,
            razorpayOrderId: pendingGatewayOrder.orderId,
            razorpayPaymentId: data.razorpayPaymentId,
            razorpaySignature: data.razorpaySignature,
            razorpayMeUrl: pendingGatewayOrder.razorpayMeUrl,
            gatewayConfirmedAt: data.confirmedAt,
            preDispatchedStatus: data.dispatchStatus,
          });
        }
      } catch {
        // Silent polling retry
      }
    };

    const interval = setInterval(pollStatus, 3500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    isOpen,
    isAtPaymentPortal,
    createdOrder,
    paymentChannel,
    hasOpenedRazorpayLink,
    pendingGatewayOrder,
  ]);

  // Auto-generate exact-amount UPI QR & intent when entering Step 2 with MERCHANT_UPI_VPA configured
  useEffect(() => {
    if (
      !isOpen ||
      !isAtPaymentPortal ||
      createdOrder ||
      paymentChannel !== "upi" ||
      razorpayConfig.autoAmountMode !== "upi_intent"
    ) {
      return;
    }
    const targetPaise = Math.round(totalAmount * 100);
    if (!pendingGatewayOrder || pendingGatewayOrder.amount !== targetPaise) {
      void ensureGatewaySessionCreated();
    }
  }, [
    isOpen,
    isAtPaymentPortal,
    createdOrder,
    paymentChannel,
    razorpayConfig.autoAmountMode,
    totalAmount,
    pendingGatewayOrder,
  ]);

  if (!isOpen) return null;

  const handleManualGatewayStatusCheck = async () => {
    if (!pendingGatewayOrder) return;
    setIsCheckingGateway(true);
    setPaymentError(null);
    try {
      const resp = await fetch(
        `/api/payments/razorpay/gateway-status/${encodeURIComponent(pendingGatewayOrder.orderId)}`
      );
      const data = await resp.json();
      if (resp.ok && data?.gatewayConfirmed && data?.razorpayPaymentId) {
        const methodLabel =
          paymentChannel === "card"
            ? `Razorpay Card (${pendingGatewayOrder.razorpayHandle})`
            : `Razorpay UPI (${pendingGatewayOrder.razorpayHandle})`;
        finalizeCompletedOrder({
          orderIdOverride: data.localOrderId || pendingGatewayOrder.localOrderId,
          paymentChannel,
          paymentMethodLabel: methodLabel,
          paymentStatus: "paid",
          orderStatus: "completed",
          transactionId: data.razorpayPaymentId,
          billNumber: data.billNumber || pendingGatewayOrder.billNumber,
          razorpayOrderId: pendingGatewayOrder.orderId,
          razorpayPaymentId: data.razorpayPaymentId,
          razorpaySignature: data.razorpaySignature,
          razorpayMeUrl: pendingGatewayOrder.razorpayMeUrl,
          gatewayConfirmedAt: data.confirmedAt,
          preDispatchedStatus: data.dispatchStatus,
        });
      } else {
        setPaymentError(
          "Payment not yet confirmed by Razorpay Gateway. Finish paying on Razorpay or enter the Payment ID (pay_...) shown on your confirmation screen."
        );
      }
    } catch {
      setPaymentError("Unable to reach Razorpay Gateway status check right now.");
    } finally {
      setIsCheckingGateway(false);
    }
  };

  // STEP 2 SUBMIT: Handle COD OR Razorpay Gateway Confirmation + Automatic PDF & WhatsApp/Email Dispatch
  const handleExecutePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);

    const year = new Date().getFullYear();
    const defaultBillNumber = `BILL-TD-${year}-${Math.floor(100000 + Math.random() * 900000)}`;

    // OPTION 1: CASH ON DELIVERY (COD)
    if (paymentChannel === "cod") {
      setIsPaying(true);
      setPayProgress(45);
      setPayStatusText("Recording COD booking & generating PDF invoice...");
      playPaymentTone(523.25, 0.12);

      setTimeout(() => {
        setPayProgress(100);
        setPayStatusText("COD confirmed! Sending PDF invoice to WhatsApp & Email...");
        finalizeCompletedOrder({
          paymentChannel: "cod",
          paymentMethodLabel: "Cash on Delivery (COD)",
          paymentStatus: "unpaid",
          orderStatus: "confirmed",
          transactionId: `COD-${Math.floor(10000000 + Math.random() * 90000000)}`,
          billNumber: defaultBillNumber,
        });
      }, 650);
      return;
    }

    // OPTION 2 & 3: RAZORPAY GATEWAY (UPI OR CARDS)
    const isLiveSdkConfigured = razorpayConfig.mode === "live_sdk";
    const isUpiIntentMode =
      !isLiveSdkConfigured &&
      razorpayConfig.autoAmountMode === "upi_intent" &&
      paymentChannel === "upi";

    if (!isLiveSdkConfigured && !razorpayRefInput.trim()) {
      setPaymentError(
        isUpiIntentMode
          ? "Complete the exact-amount UPI payment using the QR code or UPI App button, then enter your 12-digit UPI Reference / UTR Number."
          : `Complete your payment on Razorpay first, then enter the Razorpay Payment ID (e.g. pay_Q7xYz123AbCdEf) shown on Razorpay's confirmation screen.`
      );
      return;
    }

    try {
      setIsPaying(true);
      setPayProgress(25);
      setPayStatusText("Connecting to Razorpay Gateway...");
      playPaymentTone(523.25, 0.12);

      const session = await ensureGatewaySessionCreated();
      if (!session) {
        setIsPaying(false);
        setPayProgress(0);
        return;
      }

      const generatedBillNo = session.billNumber || defaultBillNumber;

      // LIVE RAZORPAY CHECKOUT SDK FLOW (Auto-populates & locks exact bill amount!)
      if (session.mode === "live_sdk") {
        setPayProgress(42);
        setPayStatusText("Loading Razorpay Exact-Amount Checkout...");
        const sdkLoaded = await loadRazorpayCheckoutScript();

        if (!sdkLoaded || typeof window.Razorpay !== "function") {
          setIsPaying(false);
          setPayProgress(0);
          setPayStatusText("");
          if (session.paymentLinkUrl) {
            setHasOpenedRazorpayLink(true);
            setPaymentError(
              "Embedded Razorpay popup was blocked by browser settings. Click 'Open Locked-Amount Razorpay Link' below — the exact bill amount is already locked there!"
            );
          } else {
            setPaymentError(
              "Could not load Razorpay Checkout script. Please allow checkout.razorpay.com and retry."
            );
          }
          return;
        }

        setPayProgress(55);
        setPayStatusText(
          `Opening Razorpay Checkout with locked ${currencySymbol}${totalAmount.toLocaleString()}...`
        );

        const rzpOptions: Record<string, any> = {
          key: session.keyId,
          amount: session.amount,
          currency: "INR",
          name: brandName,
          description: `Order Payment • ${cart.length} item(s)`,
          order_id: session.orderId,
          prefill: {
            name: customerName.trim(),
            email: customerEmail.trim(),
            contact: customerPhone.trim(),
            method: paymentChannel === "upi" ? "upi" : "card",
          },
          notes: {
            billNumber: generatedBillNo,
            deliveryMethod,
          },
          theme: {
            color: "#10b981",
          },
          modal: {
            ondismiss: () => {
              setIsPaying(false);
              setPayProgress(0);
              setPayStatusText("");
              setPaymentError("Razorpay checkout was closed before payment completed.");
            },
          },
          handler: async (rzpResult: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            try {
              setPayProgress(85);
              setPayStatusText(
                "Razorpay payment confirmed! Generating PDF & sending to WhatsApp + Email..."
              );
              const verifyResp = await fetch("/api/payments/razorpay/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  mode: "live_sdk",
                  paymentChannel,
                  razorpay_order_id: rzpResult.razorpay_order_id,
                  razorpay_payment_id: rzpResult.razorpay_payment_id,
                  razorpay_signature: rzpResult.razorpay_signature,
                }),
              });
              const verifyData = await verifyResp.json();
              if (!verifyResp.ok || !verifyData.verified || !verifyData.gatewayConfirmed) {
                throw new Error(
                  verifyData?.error || "Razorpay gateway confirmation failed."
                );
              }

              setPayProgress(100);
              finalizeCompletedOrder({
                orderIdOverride: verifyData.localOrderId || session.localOrderId,
                paymentChannel,
                paymentMethodLabel:
                  paymentChannel === "upi" ? "Razorpay UPI" : "Razorpay Card",
                paymentStatus: "paid",
                orderStatus: "completed",
                transactionId: rzpResult.razorpay_payment_id,
                billNumber: verifyData.billNumber || generatedBillNo,
                razorpayOrderId: rzpResult.razorpay_order_id,
                razorpayPaymentId: rzpResult.razorpay_payment_id,
                razorpaySignature: rzpResult.razorpay_signature,
                razorpayMeUrl: session.paymentLinkUrl || session.razorpayMeUrl,
                gatewayConfirmedAt: verifyData.verifiedAt,
                preDispatchedStatus: verifyData.dispatchStatus,
              });
            } catch (verifyErr: any) {
              setIsPaying(false);
              setPayProgress(0);
              setPaymentError(verifyErr?.message || "Razorpay verification failed.");
            }
          },
        };

        const rzp = new window.Razorpay(rzpOptions);
        rzp.on("payment.failed", (failEvt: any) => {
          setIsPaying(false);
          setPayProgress(0);
          setPaymentError(
            failEvt?.error?.description || "Razorpay payment failed. Please retry."
          );
        });
        rzp.open();
        return;
      }

      // UPI INTENT / RAZORPAY.ME VERIFICATION
      setPayProgress(65);
      setPayStatusText("Verifying payment confirmation & generating PDF invoice...");
      playPaymentTone(587.33, 0.1);

      const verifyResp = await fetch("/api/payments/razorpay/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: isUpiIntentMode ? "upi_intent" : "razorpay_me",
          paymentChannel,
          razorpay_order_id: session.orderId,
          razorpay_payment_id: razorpayRefInput.trim(),
        }),
      });
      const verifyData = await verifyResp.json();
      if (!verifyResp.ok || !verifyData.verified || !verifyData.gatewayConfirmed) {
        throw new Error(
          verifyData?.error ||
            "Razorpay Gateway has not confirmed this payment yet. Please verify your Payment ID."
        );
      }

      setPayProgress(100);
      setPayStatusText("Gateway confirmed! Sending PDF invoice to WhatsApp & Email...");

      const methodLabel =
        paymentChannel === "card"
          ? `Razorpay Card (${session.razorpayHandle})`
          : isUpiIntentMode
          ? "UPI Direct Exact-Amount"
          : `Razorpay UPI (${session.razorpayHandle})`;

      finalizeCompletedOrder({
        orderIdOverride: verifyData.localOrderId || session.localOrderId,
        paymentChannel,
        paymentMethodLabel: methodLabel,
        paymentStatus: "paid",
        orderStatus: "completed",
        transactionId: verifyData.razorpay_payment_id,
        billNumber: verifyData.billNumber || generatedBillNo,
        razorpayOrderId: verifyData.razorpay_order_id,
        razorpayPaymentId: verifyData.razorpay_payment_id,
        razorpaySignature: verifyData.razorpay_signature,
        razorpayMeUrl: verifyData.razorpayMeUrl || session.razorpayMeUrl,
        gatewayConfirmedAt: verifyData.verifiedAt,
        preDispatchedStatus: verifyData.dispatchStatus,
      });
    } catch (err: any) {
      console.error("Payment execution error:", err);
      setIsPaying(false);
      setPayProgress(0);
      setPayStatusText("");
      setPaymentError(err?.message || "Payment verification failed. Please retry.");
    }
  };

  // Printable Sample Bill generator (no window.alert fallback)
  const handlePrintReceipt = () => {
    if (!createdOrder) return;
    const isCod = createdOrder.paymentChannel === "cod" || createdOrder.paymentStatus === "unpaid";
    const billNo = createdOrder.billNumber || `BILL-${createdOrder.id}`;

    const htmlContent = `
      <html>
        <head>
          <title>Sample_Bill_${billNo}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 36px; color: #18181b; background: #fff; }
            .receipt-container { max-width: 620px; margin: 0 auto; border: 1px solid #e4e4e7; padding: 30px; border-radius: 16px; }
            .header { text-align: center; margin-bottom: 22px; border-bottom: 2px solid #f4f4f5; padding-bottom: 18px; }
            .title { font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin: 0; }
            .subtitle { font-size: 11px; color: #71717a; margin-top: 4px; font-weight: 600; }
            .badge { display: inline-block; padding: 5px 12px; background: ${isCod ? "#fef3c7" : "#ecfdf5"}; border: 1px solid ${isCod ? "#fcd34d" : "#a7f3d0"}; color: ${isCod ? "#b45309" : "#047857"}; font-size: 10px; font-weight: 700; border-radius: 9999px; text-transform: uppercase; margin-top: 10px; }
            .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 14px; font-size: 12px; margin-bottom: 20px; padding: 14px; background: #fafafa; border-radius: 12px; }
            .meta-label { color: #71717a; font-size: 10px; font-weight: 600; text-transform: uppercase; }
            .meta-val { font-weight: 700; }
            .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #27272a; letter-spacing: 1px; border-bottom: 1px solid #e4e4e7; padding-bottom: 6px; margin: 20px 0 10px; }
            .info-block { font-size: 12px; line-height: 1.65; color: #3f3f46; }
            .item-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
            .item-table th { text-align: left; color: #71717a; padding: 10px 4px; border-bottom: 1px solid #e4e4e7; font-weight: 700; }
            .item-table td { padding: 11px 4px; border-bottom: 1px solid #f4f4f5; }
            .total-block { margin-top: 20px; font-size: 12px; border-top: 1px solid #e4e4e7; padding-top: 14px; }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 8px; color: #3f3f46; }
            .grand-total { font-size: 16px; font-weight: 800; color: #18181b; border-top: 2px dashed #e4e4e7; padding-top: 12px; margin-top: 10px; }
            .footer-note { text-align: center; font-size: 10px; color: #a1a1aa; margin-top: 28px; border-top: 1px solid #f4f4f5; padding-top: 14px; }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              <div class="title">${brandName}</div>
              <div class="subtitle">Sample Bill &amp; Official Tax Invoice</div>
              <div class="badge">${isCod ? "Cash on Delivery — Pay at Delivery" : "Paid via Razorpay — Verified"}</div>
            </div>
            <div class="meta-grid">
              <div><span class="meta-label">Sample Bill No</span><br/><span class="meta-val">${billNo}</span></div>
              <div style="text-align:right;"><span class="meta-label">Order ID</span><br/><span class="meta-val">${createdOrder.id}</span></div>
              <div><span class="meta-label">Bill Date</span><br/><span class="meta-val">${createdOrder.createdAt}</span></div>
              <div style="text-align:right;"><span class="meta-label">Payment Mode</span><br/><span class="meta-val">${createdOrder.paymentMethod}</span></div>
              ${createdOrder.razorpayOrderId ? `<div><span class="meta-label">Razorpay Order ID</span><br/><span class="meta-val">${createdOrder.razorpayOrderId}</span></div>` : ""}
              ${createdOrder.razorpayPaymentId ? `<div style="text-align:right;"><span class="meta-label">Razorpay Payment ID</span><br/><span class="meta-val">${createdOrder.razorpayPaymentId}</span></div>` : ""}
              ${createdOrder.razorpayMeUrl ? `<div style="grid-column:span 2;"><span class="meta-label">Razorpay Gateway</span><br/><span class="meta-val">${createdOrder.razorpayMeUrl}</span></div>` : ""}
            </div>
            <div class="section-title">Recorded Customer Details</div>
            <div class="info-block">
              <strong>Billed To:</strong> ${createdOrder.customerName}<br/>
              <strong>Email ID:</strong> ${createdOrder.customerEmail || "N/A"}<br/>
              <strong>Phone:</strong> ${createdOrder.customerPhone}<br/>
              <strong>Logistics:</strong> ${createdOrder.deliveryMethod === "delivery" ? "Hand Delivery" : "Studio Pick-up"}<br/>
              ${createdOrder.customerAddress ? `<strong>Address:</strong> ${createdOrder.customerAddress}` : ""}
            </div>
            <div class="section-title">Itemized Particulars</div>
            <table class="item-table">
              <thead><tr><th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Total</th></tr></thead>
              <tbody>
                ${createdOrder.items
                  .map(
                    (item) => `
                  <tr>
                    <td><strong>${item.productName}</strong><br/><span style="font-size:10px;color:#71717a;">Size: ${item.size} | Color: ${item.color}</span></td>
                    <td style="text-align:center;">${item.quantity}</td>
                    <td style="text-align:right;">${currencySymbol}${item.price.toLocaleString()}</td>
                    <td style="text-align:right;font-weight:700;">${currencySymbol}${(item.price * item.quantity).toLocaleString()}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="total-block">
              <div class="total-row"><span>Subtotal</span><span>${currencySymbol}${(createdOrder.totalAmount - (createdOrder.deliveryMethod === "delivery" ? 100 : 0)).toLocaleString()}</span></div>
              <div class="total-row"><span>Delivery Charges</span><span>${createdOrder.deliveryMethod === "delivery" ? `${currencySymbol}100` : "Free"}</span></div>
              <div class="total-row"><span>GST (5% Included)</span><span>${currencySymbol}${Math.round(createdOrder.totalAmount * 0.0476).toLocaleString()}</span></div>
              <div class="total-row grand-total"><span>${isCod ? "TOTAL PAYABLE (COD)" : "TOTAL AMOUNT PAID"}</span><span>${currencySymbol}${createdOrder.totalAmount.toLocaleString()}</span></div>
            </div>
            <div class="footer-note">Thank you for shopping at ${brandName}! Sample bill sent to ${createdOrder.customerEmail || createdOrder.customerPhone}.</div>
          </div>
        </body>
      </html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const frameDoc = iframe.contentWindow?.document;
    if (frameDoc) {
      frameDoc.open();
      frameDoc.write(htmlContent);
      frameDoc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 250);
    }
  };

  // Download professional PDF Invoice generated via jsPDF (with server fallback)
  const handleDownloadReceipt = async () => {
    if (!createdOrder) return;
    setIsDownloading(true);
    try {
      let pdfArtifact = generatedOrderPdf;
      if (!pdfArtifact || pdfArtifact.orderId !== createdOrder.id) {
        pdfArtifact = generateOrderPDF(createdOrder, {
          brandName,
          currencySymbol,
        });
        setGeneratedOrderPdf(pdfArtifact);
      }
      pdfArtifact.download();
    } catch (clientPdfErr) {
      console.warn("jsPDF download fallback triggered:", clientPdfErr);
      try {
        const billNo = createdOrder.billNumber || `BILL-${createdOrder.id}`;
        const targetFilename = `${brandName.replace(/[^a-zA-Z0-9]+/g, "_")}_Invoice_${billNo}.pdf`;
        const resp = await fetch("/api/bills/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order: createdOrder,
            currencySymbol,
            brandName,
            download: true,
          }),
        });
        if (!resp.ok) throw new Error("Failed to generate PDF bill.");
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const element = document.createElement("a");
        element.href = url;
        element.download = targetFilename;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      } catch (err) {
        console.error("PDF download failed:", err);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const getOwnerMessageText = (order: Order) => {
    const isCod = order.paymentChannel === "cod" || order.paymentStatus === "unpaid";
    let text = `*NEW ORDER ALERT (${brandName})*\n`;
    text += `Order ID: ${order.id} | Bill: ${order.billNumber || `BILL-${order.id}`}\n`;
    text += `Customer: ${order.customerName} (${order.customerPhone})\n`;
    text += order.customerAddress
      ? `Delivery: ${order.customerAddress}\n`
      : `Logistics: Local Pick-up\n`;
    text += `\nItems:\n`;
    order.items.forEach((item, idx) => {
      text += `${idx + 1}. ${item.productName} (${item.size} / ${item.color}) x${item.quantity} = ${currencySymbol}${item.price * item.quantity}\n`;
    });
    text += `\nTotal: ${currencySymbol}${order.totalAmount}\n`;
    text += `Payment: ${order.paymentMethod} (${isCod ? "COD" : "PAID"})\n`;
    if (order.razorpayPaymentId) text += `Razorpay ID: ${order.razorpayPaymentId}\n`;
    return text;
  };

  const getOwnerWhatsAppURL = (order: Order) => {
    const sanitizedPhone = merchantWhatsApp.replace(/[^0-9]/g, "");
    return `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(getOwnerMessageText(order))}`;
  };

  const getOwnerSMSURL = (order: Order) => {
    const sanitizedPhone = merchantWhatsApp.replace(/[^0-9]/g, "");
    return `sms:${sanitizedPhone}?body=${encodeURIComponent(getOwnerMessageText(order))}`;
  };

  const getWhatsAppReceiptURL = (order: Order) => {
    if (dispatchStatus?.whatsapp?.fallbackUrl) {
      return dispatchStatus.whatsapp.fallbackUrl;
    }
    const isCod = order.paymentChannel === "cod" || order.paymentStatus === "unpaid";
    const pdfLink = order.pdfUrl || dispatchStatus?.pdfUrl;
    let text = `*${brandName} — OFFICIAL TAX INVOICE*\n`;
    text += `Bill No: ${order.billNumber || `BILL-${order.id}`}\n`;
    text += `Order ID: ${order.id}\n`;
    text += `Payment: ${order.paymentMethod} (${isCod ? "COD" : "CONFIRMED VIA RAZORPAY"})\n`;
    if (order.razorpayPaymentId) text += `Razorpay Pay ID: ${order.razorpayPaymentId}\n`;
    text += `Customer: ${order.customerName} (${order.customerPhone})\n\n`;
    order.items.forEach((item, idx) => {
      text += `${idx + 1}. ${item.productName} (${item.size}/${item.color}) x${item.quantity} = ${currencySymbol}${item.price * item.quantity}\n`;
    });
    text += `\nTotal: ${currencySymbol}${order.totalAmount}`;
    if (pdfLink) {
      text += `\n\nDownload PDF Invoice:\n${pdfLink}`;
    }
    const digits = order.customerPhone.replace(/[^0-9]/g, "");
    const customerIntl = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${customerIntl}?text=${encodeURIComponent(text)}`;
  };

  const handleCopyReceiptText = (order: Order) => {
    const isCod = order.paymentChannel === "cod" || order.paymentStatus === "unpaid";
    const pdfLink = order.pdfUrl || dispatchStatus?.pdfUrl;
    let text = `${brandName} OFFICIAL INVOICE [${order.billNumber || order.id}]\n`;
    text += `Order ID: ${order.id}\n`;
    text += `Payment: ${order.paymentMethod} (${isCod ? "COD" : "PAID"})\n`;
    if (order.razorpayPaymentId) text += `Razorpay Payment ID: ${order.razorpayPaymentId}\n`;
    if (order.razorpayMeUrl) text += `Razorpay Gateway: ${order.razorpayMeUrl}\n`;
    text += `Customer: ${order.customerName} (${order.customerPhone})\n`;
    text += `Logistics: ${order.deliveryMethod === "delivery" ? `Delivery to ${order.customerAddress}` : "Local Studio Pickup"}\n\n`;
    order.items.forEach((item) => {
      text += `- ${item.productName} (Size: ${item.size}, Color: ${item.color}) x ${item.quantity} = ${currencySymbol}${item.price * item.quantity}\n`;
    });
    text += `\n${isCod ? "Total COD Payable" : "Total Paid"}: ${currencySymbol}${order.totalAmount}`;
    if (pdfLink) text += `\nPDF Invoice: ${pdfLink}`;

    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleResetAndClose = () => {
    setCreatedOrder(null);
    setDispatchStatus(null);
    setGeneratedOrderPdf(null);
    setIsDispatching(false);
    setIsAtPaymentPortal(false);
    setCheckoutError(null);
    setPaymentError(null);
    setDetailsRecordedAt(null);
    setRazorpayRefInput("");
    setHasOpenedRazorpayLink(false);
    setPendingGatewayOrder(null);
    onClose();
  };

  const isCodOrder =
    createdOrder?.paymentChannel === "cod" || createdOrder?.paymentStatus === "unpaid";

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-200"
      id="cart-drawer-panel"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 backdrop-blur-xs transition-opacity ${
          isDark ? "bg-zinc-950/70" : "bg-zinc-950/40"
        }`}
        onClick={handleResetAndClose}
      />

      <div
        className={`relative w-full max-w-md h-full shadow-2xl flex flex-col justify-between border-l transition-all duration-300 ${
          isDark
            ? "bg-zinc-900 border-zinc-800 text-zinc-100"
            : "bg-white border-zinc-200 text-zinc-900"
        }`}
      >
        {/* Drawer Header */}
        <div
          className={`p-4 sm:p-5 border-b flex items-center justify-between shrink-0 ${
            isDark ? "border-zinc-800 bg-zinc-900/50" : "border-zinc-100 bg-white"
          }`}
        >
          <div className="flex items-center gap-2">
            {createdOrder ? (
              <Receipt
                className={`w-5 h-5 ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
              />
            ) : (
              <ShoppingBag className={`w-5 h-5 ${isDark ? "text-white" : "text-zinc-950"}`} />
            )}
            <h2
              className={`font-display font-bold text-lg ${
                isDark ? "text-white" : "text-zinc-900"
              }`}
            >
              {createdOrder
                ? "PDF Invoice & Confirmation"
                : isAtPaymentPortal
                ? "Choose Payment Method"
                : "Your Bag & Buy Now"}
            </h2>
          </div>
          <button
            onClick={handleResetAndClose}
            className={`p-1.5 rounded-full transition-colors border cursor-pointer ${
              isDark
                ? "hover:bg-zinc-800 text-zinc-400 hover:text-white border-zinc-800"
                : "hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 border-zinc-200"
            }`}
            id="close-cart-button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-grow overflow-y-auto p-4 sm:p-5 space-y-6">
          {createdOrder ? (
            /* ================= STEP 3: GENERATED PDF INVOICE SENT TO WHATSAPP & EMAIL ================= */
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="text-center space-y-2">
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2 ${
                    isCodOrder
                      ? isDark
                        ? "bg-amber-950/60 border border-amber-700/40 text-amber-400"
                        : "bg-amber-50 border border-amber-200 text-amber-600"
                      : isDark
                      ? "bg-emerald-950/60 border border-emerald-900/40 text-emerald-400"
                      : "bg-emerald-50 border border-emerald-100 text-emerald-600"
                  }`}
                >
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <span
                  className={`text-[10px] uppercase font-mono tracking-widest font-bold px-3 py-1 rounded-full ${
                    isCodOrder
                      ? isDark
                        ? "text-amber-300 bg-amber-950/60 border border-amber-800/40"
                        : "text-amber-800 bg-amber-50 border border-amber-200"
                      : isDark
                      ? "text-emerald-400 bg-emerald-950/60 border border-emerald-900/30"
                      : "text-emerald-700 bg-emerald-50 border border-emerald-100"
                  }`}
                >
                  {isCodOrder
                    ? "COD Confirmed • Pay on Delivery"
                    : "Confirmed by Razorpay Gateway"}
                </span>
                <h3
                  className={`font-display font-bold text-xl mt-2 ${
                    isDark ? "text-white" : "text-zinc-950"
                  }`}
                >
                  PDF Invoice Generated for {createdOrder.customerName}
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Official PDF <strong className="font-mono">{createdOrder.billNumber}.pdf</strong>{" "}
                  dispatched to{" "}
                  <strong className={isDark ? "text-zinc-200" : "text-zinc-800"}>
                    {createdOrder.customerPhone}
                  </strong>{" "}
                  (WhatsApp) &amp;{" "}
                  <strong className={isDark ? "text-zinc-200" : "text-zinc-800"}>
                    {createdOrder.customerEmail}
                  </strong>
                  .
                </p>
              </div>

              {/* SAMPLE BILL & CONFIRMATION DISPATCH CARD */}
              <div
                className={`p-4 rounded-2xl border space-y-3 ${
                  isDark
                    ? "bg-zinc-950 border-zinc-800 text-zinc-200"
                    : "bg-zinc-50 border-zinc-200 text-zinc-900"
                }`}
                id="customer-confirmations-dispatch-card"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isDispatching ? (
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
                    ) : (
                      <Send className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    <span className="font-display font-bold text-xs uppercase tracking-wider">
                      PDF Invoice &amp; Dispatch Status
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {isDispatching ? "Generating PDF..." : "PDF Ready"}
                  </span>
                </div>

                {(dispatchStatus?.pdfUrl || createdOrder.pdfUrl) && (
                  <div
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                      isDark
                        ? "bg-emerald-950/25 border-emerald-500/30"
                        : "bg-emerald-50 border-emerald-200"
                    }`}
                    id="generated-pdf-ready-banner"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono uppercase text-emerald-400 font-bold">
                        Generated PDF Tax Invoice
                      </div>
                      <div className="text-[11px] font-mono truncate">
                        {dispatchStatus?.pdfFilename ||
                          createdOrder.pdfFilename ||
                          `${createdOrder.billNumber}.pdf`}
                      </div>
                    </div>
                    <a
                      href={dispatchStatus?.pdfUrl || createdOrder.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-display font-bold text-[10px] flex items-center gap-1 shrink-0"
                      id="open-generated-pdf-btn"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open PDF
                    </a>
                  </div>
                )}

                {isDispatching && !dispatchStatus ? (
                  <div className="text-[11px] font-mono text-zinc-400 py-2">
                    Generating official PDF &amp; sending to WhatsApp ({createdOrder.customerPhone}) and{" "}
                    <strong className="text-zinc-200">{createdOrder.customerEmail}</strong>...
                  </div>
                ) : dispatchStatus ? (
                  <div className="space-y-2 text-[11px]">
                    {[
                      {
                        key: "whatsapp",
                        label: "WhatsApp Text + PDF Link (Mobile)",
                        icon: <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />,
                        status: dispatchStatus.whatsapp,
                        actionLabel: "Send WhatsApp PDF",
                      },
                      {
                        key: "bill_email",
                        label: "PDF Tax Invoice Sent to Email",
                        icon: <Receipt className="w-3.5 h-3.5 text-amber-400" />,
                        status: dispatchStatus.billEmail,
                        actionLabel: "Send PDF Email",
                      },
                      {
                        key: "email",
                        label: "Order Confirmation Email",
                        icon: <Mail className="w-3.5 h-3.5 text-indigo-400" />,
                        status: dispatchStatus.email,
                        actionLabel: "Compose Email",
                      },
                      {
                        key: "sms",
                        label: "SMS Receipt Alert",
                        icon: <MessageSquare className="w-3.5 h-3.5 text-sky-400" />,
                        status: dispatchStatus.sms,
                        actionLabel: "Open SMS",
                      },
                    ].map((row) => (
                      <div
                        key={row.key}
                        className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${
                          isDark ? "bg-zinc-900/70 border-zinc-800" : "bg-white border-zinc-200"
                        }`}
                        id={`dispatch-row-${row.key}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {row.icon}
                            <span className="font-semibold truncate">{row.label}</span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase shrink-0 ${
                              row.status.delivered
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {row.status.delivered
                              ? `Sent (${row.status.provider})`
                              : "Tap to Send"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-zinc-400">
                          <span className="truncate">To: {row.status.recipient}</span>
                          {!row.status.delivered && row.status.fallbackUrl && (
                            <a
                              href={row.status.fallbackUrl}
                              target={row.status.fallbackUrl.startsWith("http") ? "_blank" : undefined}
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-400 hover:underline font-bold shrink-0"
                            >
                              <span>{row.actionLabel}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleResendBillEmail}
                        disabled={isResendingBill}
                        className={`flex-1 py-2 px-3 rounded-xl text-[11px] font-display font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          isDark
                            ? "bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-amber-400"
                            : "bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-900"
                        }`}
                        id="resend-bill-email-btn"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isResendingBill ? "animate-spin" : ""}`} />
                        <span>{isResendingBill ? "Sending PDF..." : "Resend PDF Email"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => dispatchOrderNotifications(createdOrder)}
                        disabled={isDispatching}
                        className={`py-2 px-3 rounded-xl text-[11px] font-display font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          isDark
                            ? "bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300"
                            : "bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700"
                        }`}
                        id="retry-all-confirmations-btn"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Retry All</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* GENERATED SAMPLE BILL / TAX INVOICE CARD */}
              <div
                id="print-invoice-receipt"
                className={`border rounded-2xl p-4 sm:p-5 relative overflow-hidden text-xs font-mono space-y-4 shadow-sm ${
                  isDark ? "bg-zinc-950 border-zinc-800" : "bg-zinc-50 border-zinc-200"
                }`}
              >
                {/* Status Stamp */}
                <div className="absolute right-4 top-2 pointer-events-none select-none opacity-20 transform rotate-12">
                  <div
                    className={`border-4 font-bold px-3 py-1.5 rounded text-sm tracking-widest uppercase ${
                      isCodOrder
                        ? "border-amber-500 text-amber-500"
                        : "border-emerald-500 text-emerald-500"
                    }`}
                  >
                    {isCodOrder ? "COD BILL" : "RAZORPAY PAID"}
                  </div>
                </div>

                <div
                  className={`flex justify-between font-bold border-b pb-2.5 ${
                    isDark ? "border-zinc-800 text-white" : "border-zinc-200 text-zinc-900"
                  }`}
                >
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase font-mono">
                      Sample Bill No
                    </div>
                    <div className="text-sm tracking-tight">
                      {createdOrder.billNumber || `BILL-${createdOrder.id}`}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Order: {createdOrder.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-zinc-400 uppercase font-mono">Bill Date</div>
                    <div className="text-xs">{createdOrder.createdAt.split(",")[0]}</div>
                  </div>
                </div>

                {/* Payment & Razorpay Metadata */}
                <div className="grid grid-cols-2 gap-3 text-[11px] py-1">
                  <div>
                    <span className="text-zinc-400 block uppercase font-mono text-[9px] mb-0.5">
                      {createdOrder.razorpayPaymentId ? "Razorpay Pay ID" : "Transaction Ref"}
                    </span>
                    <span className={`font-semibold break-all ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                      {createdOrder.razorpayPaymentId || createdOrder.transactionId}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-zinc-400 block uppercase font-mono text-[9px] mb-0.5">
                      Payment Mode
                    </span>
                    <span className={`font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                      {createdOrder.paymentMethod}
                    </span>
                  </div>
                  {createdOrder.razorpayOrderId && (
                    <div className="col-span-2 pt-1 border-t border-zinc-800/40">
                      <span className="text-zinc-400 uppercase font-mono text-[9px] mr-2">
                        Razorpay Order ID:
                      </span>
                      <span className={isDark ? "text-zinc-300" : "text-zinc-700"}>
                        {createdOrder.razorpayOrderId}
                      </span>
                    </div>
                  )}
                  {createdOrder.razorpayMeUrl && (
                    <div className="col-span-2">
                      <span className="text-zinc-400 uppercase font-mono text-[9px] mr-2">
                        Gateway:
                      </span>
                      <span className="text-emerald-400 font-semibold">
                        {createdOrder.razorpayMeUrl}
                      </span>
                    </div>
                  )}
                </div>

                <div className={`border-t pt-2 text-[11px] ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
                  <span className="text-zinc-400 block uppercase font-mono text-[9px] mb-1">
                    Recorded Customer Details
                  </span>
                  <div className={`space-y-0.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    <div>
                      <strong>Name:</strong> {createdOrder.customerName}
                    </div>
                    {createdOrder.customerEmail && (
                      <div>
                        <strong>Email:</strong> {createdOrder.customerEmail}
                      </div>
                    )}
                    <div>
                      <strong>Phone:</strong> {createdOrder.customerPhone}
                    </div>
                    <div>
                      <strong>Logistics:</strong>{" "}
                      {createdOrder.deliveryMethod === "delivery"
                        ? "Hand Delivery"
                        : "Studio Pickup"}
                    </div>
                    {createdOrder.customerAddress && (
                      <div className="break-words">
                        <strong>Address:</strong> {createdOrder.customerAddress}
                      </div>
                    )}
                  </div>
                </div>

                {/* Items List */}
                <div
                  className={`border-t pt-3 space-y-2 ${
                    isDark ? "border-zinc-800" : "border-zinc-200"
                  }`}
                >
                  <span className="text-zinc-400 block uppercase font-mono text-[9px]">
                    Billed Items
                  </span>
                  <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                    {createdOrder.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start gap-4 text-[11px]">
                        <div className="min-w-0">
                          <span className={`font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                            {item.productName}
                          </span>
                          <span className="text-zinc-500 block text-[10px] mt-0.5">
                            Size: {item.size} | Color: {item.color}
                          </span>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <span className="text-zinc-400">Qty {item.quantity}</span>
                          <span
                            className={`block font-semibold ${
                              isDark ? "text-zinc-100" : "text-zinc-900"
                            }`}
                          >
                            {currencySymbol}
                            {(item.price * item.quantity).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subtotals breakdown */}
                <div
                  className={`border-t pt-2.5 space-y-1.5 text-[11px] tabular-nums ${
                    isDark ? "border-zinc-800" : "border-zinc-200"
                  }`}
                >
                  <div className="flex justify-between text-zinc-400">
                    <span>Subtotal</span>
                    <span>
                      {currencySymbol}
                      {(
                        createdOrder.totalAmount -
                        (createdOrder.deliveryMethod === "delivery" ? 100 : 0)
                      ).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Delivery Charges</span>
                    <span>
                      {createdOrder.deliveryMethod === "delivery"
                        ? `${currencySymbol}100`
                        : "Free"}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-500 text-[10px]">
                    <span>GST (5% Included)</span>
                    <span>
                      {currencySymbol}
                      {Math.round(createdOrder.totalAmount * 0.0476).toLocaleString()}
                    </span>
                  </div>
                  <div
                    className={`flex justify-between text-sm font-bold pt-2 border-t border-dashed ${
                      isDark ? "border-zinc-800 text-white" : "border-zinc-200 text-zinc-950"
                    }`}
                  >
                    <span>{isCodOrder ? "PAYABLE ON DELIVERY" : "TOTAL PAID"}</span>
                    <span
                      className={`font-mono ${
                        isCodOrder ? "text-amber-400" : "text-emerald-500"
                      }`}
                    >
                      {currencySymbol}
                      {createdOrder.totalAmount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Store Owner Alert Card */}
              <div
                className={`p-3.5 rounded-2xl border ${
                  isDark
                    ? "bg-emerald-950/30 border-emerald-900/50 text-emerald-200"
                    : "bg-emerald-50 border-emerald-200 text-emerald-900"
                } space-y-2.5`}
                id="owner-notification-message-card"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-display font-bold uppercase tracking-wider">
                    Notify Store Owner ({merchantWhatsApp})
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={getOwnerWhatsAppURL(createdOrder)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-display font-bold text-[11px] flex items-center justify-center gap-1.5"
                    id="owner-whatsapp-direct-btn"
                  >
                    <PhoneCall className="w-3.5 h-3.5" /> WhatsApp Owner
                  </a>
                  <a
                    href={getOwnerSMSURL(createdOrder)}
                    className="py-2 px-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-display font-bold text-[11px] flex items-center justify-center gap-1.5 border border-zinc-700"
                    id="owner-sms-direct-btn"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-sky-400" /> SMS Owner
                  </a>
                </div>
              </div>

              {/* PDF & Invoice Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className={`py-3 px-4 border rounded-xl font-display font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isDark
                      ? "border-zinc-800 hover:bg-zinc-800 text-white"
                      : "border-zinc-200 hover:bg-zinc-50 text-zinc-800"
                  }`}
                  id="print-receipt-btn"
                >
                  <Printer className="w-4 h-4" />
                  Print Invoice
                </button>

                <button
                  type="button"
                  onClick={handleDownloadReceipt}
                  disabled={isDownloading}
                  className={`py-3 px-4 border rounded-xl font-display font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isDark
                      ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400"
                      : "border-emerald-500 bg-emerald-50 hover:bg-emerald-100 text-emerald-800"
                  }`}
                  id="download-receipt-btn"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download PDF
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-2">
                <a
                  href={getWhatsAppReceiptURL(createdOrder)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-display font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all"
                  id="whatsapp-paid-redirect-btn"
                >
                  <PhoneCall className="w-4 h-4 shrink-0" />
                  Send WhatsApp Text + PDF to {createdOrder.customerPhone}
                </a>

                <button
                  type="button"
                  onClick={() => handleCopyReceiptText(createdOrder)}
                  className={`w-full py-2.5 border text-xs flex items-center justify-center gap-2 transition-all rounded-xl font-display font-semibold cursor-pointer ${
                    isDark
                      ? "border-zinc-800 hover:bg-zinc-800 text-zinc-300"
                      : "border-zinc-200 hover:bg-zinc-50 text-zinc-700"
                  }`}
                >
                  {copiedText ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      Sample Bill Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Sample Bill
                    </>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={handleResetAndClose}
                className={`text-xs font-semibold underline block mx-auto pt-2 cursor-pointer ${
                  isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                }`}
                id="continue-shopping-btn"
              >
                Close &amp; Continue Shopping
              </button>
            </div>
          ) : isAtPaymentPortal ? (
            /* ================= STEP 2: 3 PAYMENT OPTIONS (COD, UPI, CARDS) + RAZORPAY ================= */
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/30">
                <button
                  type="button"
                  onClick={() => {
                    setIsAtPaymentPortal(false);
                    setPaymentError(null);
                  }}
                  className={`flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Edit Recorded Details
                </button>
                <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono font-semibold uppercase">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  {razorpayConfig.mode === "live_sdk"
                    ? "Razorpay Live Checkout"
                    : `Razorpay • ${razorpayConfig.razorpayHandle}`}
                </div>
              </div>

              {/* Recorded Customer Summary Strip */}
              <div
                className={`p-3.5 rounded-2xl border text-[11px] space-y-1 ${
                  isDark
                    ? "bg-zinc-950/80 border-zinc-800 text-zinc-300"
                    : "bg-zinc-50 border-zinc-200 text-zinc-700"
                }`}
                id="recorded-customer-summary"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Details Recorded {detailsRecordedAt ? `at ${detailsRecordedAt}` : ""}
                  </span>
                  <span className="font-mono font-bold text-sm tabular-nums text-white">
                    {currencySymbol}
                    {totalAmount.toLocaleString()}
                  </span>
                </div>
                <div className="truncate">
                  <strong>{customerName}</strong> • {customerPhone}
                </div>
                <div className="truncate text-zinc-400">
                  Bill Email: {customerEmail} •{" "}
                  {deliveryMethod === "delivery" ? customerAddress : "Studio Pickup"}
                </div>
              </div>

              {/* 3 PAYMENT OPTIONS SELECTOR: COD, UPI PAYMENTS, CARDS */}
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider font-bold text-zinc-400 block">
                  Select 1 of 3 Payment Options
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentChannel("cod");
                      setPaymentError(null);
                    }}
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      paymentChannel === "cod"
                        ? isDark
                          ? "bg-amber-500/15 border-amber-400 text-white shadow-sm"
                          : "bg-amber-50 border-amber-500 text-zinc-950 shadow-sm"
                        : isDark
                        ? "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                        : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300"
                    }`}
                    id="pay-option-cod"
                  >
                    <Banknote
                      className={`w-5 h-5 ${
                        paymentChannel === "cod" ? "text-amber-400" : "text-zinc-500"
                      }`}
                    />
                    <span className="text-xs font-display font-bold">COD</span>
                    <span className="text-[9px] font-mono text-zinc-500">Cash on Delivery</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentChannel("upi");
                      setPaymentError(null);
                    }}
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      paymentChannel === "upi"
                        ? isDark
                          ? "bg-emerald-500/15 border-emerald-400 text-white shadow-sm"
                          : "bg-emerald-50 border-emerald-500 text-zinc-950 shadow-sm"
                        : isDark
                        ? "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                        : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300"
                    }`}
                    id="pay-option-upi"
                  >
                    <QrCode
                      className={`w-5 h-5 ${
                        paymentChannel === "upi" ? "text-emerald-400" : "text-zinc-500"
                      }`}
                    />
                    <span className="text-xs font-display font-bold">UPI</span>
                    <span className="text-[9px] font-mono text-zinc-500">Via Razorpay</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentChannel("card");
                      setPaymentError(null);
                    }}
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      paymentChannel === "card"
                        ? isDark
                          ? "bg-indigo-500/15 border-indigo-400 text-white shadow-sm"
                          : "bg-indigo-50 border-indigo-500 text-zinc-950 shadow-sm"
                        : isDark
                        ? "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                        : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300"
                    }`}
                    id="pay-option-card"
                  >
                    <CreditCard
                      className={`w-5 h-5 ${
                        paymentChannel === "card" ? "text-indigo-400" : "text-zinc-500"
                      }`}
                    />
                    <span className="text-xs font-display font-bold">Cards</span>
                    <span className="text-[9px] font-mono text-zinc-500">Via Razorpay</span>
                  </button>
                </div>
              </div>

              {paymentError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* PAYMENT OPTION PANEL */}
              <form onSubmit={handleExecutePayment} className="space-y-4">
                {paymentChannel === "cod" && (
                  <div
                    className={`p-4 rounded-2xl border space-y-3 ${
                      isDark ? "bg-zinc-950 border-zinc-800" : "bg-amber-50/40 border-amber-200"
                    }`}
                    id="cod-panel"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                        <Banknote className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-display font-bold text-sm">Cash on Delivery (COD)</h4>
                        <p className="text-[11px] text-zinc-400">
                          Pay {currencySymbol}
                          {totalAmount.toLocaleString()} by cash or UPI at your doorstep.
                        </p>
                      </div>
                    </div>
                    <div className="text-[11px] text-zinc-400 leading-relaxed pt-1 border-t border-zinc-800/50">
                      Your order will be confirmed immediately and a generated{" "}
                      <strong className={isDark ? "text-zinc-200" : "text-zinc-800"}>
                        Sample Bill (COD Payable)
                      </strong>{" "}
                      will be sent to <strong>{customerEmail}</strong>.
                    </div>
                  </div>
                )}

                {(paymentChannel === "upi" || paymentChannel === "card") && (
                  <div
                    className="space-y-3.5 animate-in fade-in duration-150"
                    id={paymentChannel === "upi" ? "upi-panel" : "card-panel"}
                  >
                    {razorpayConfig.mode === "live_sdk" ? (
                      <div className="p-4 rounded-2xl bg-zinc-950 border border-emerald-500/30 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-display font-bold text-xs text-white uppercase tracking-wider">
                            {paymentChannel === "upi"
                              ? "Razorpay UPI Checkout"
                              : "Razorpay Card Checkout"}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                            AUTO AMOUNT LOCKED
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          {paymentChannel === "upi"
                            ? `Automatically opens Razorpay UPI with ${currencySymbol}${totalAmount.toLocaleString()} pre-filled & locked (GPay, PhonePe, Paytm, BHIM QR & UPI IDs). No manual typing.`
                            : `Automatically opens Razorpay Card Checkout with ${currencySymbol}${totalAmount.toLocaleString()} pre-filled & locked (Visa, Mastercard, RuPay, Amex with 3D Secure).`}
                        </p>

                        {pendingGatewayOrder?.paymentLinkUrl && (
                          <div className="space-y-2 pt-2 border-t border-zinc-800/70">
                            <a
                              href={pendingGatewayOrder.paymentLinkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setHasOpenedRazorpayLink(true)}
                              className="w-full py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-zinc-950 font-display font-bold text-xs flex items-center justify-center gap-2 transition-all"
                              id="open-locked-razorpay-link-btn"
                            >
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                Open Locked-Amount Razorpay Link ({currencySymbol}
                                {totalAmount.toLocaleString()})
                              </span>
                            </a>
                            {hasOpenedRazorpayLink && (
                              <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-between gap-2 text-[10px] font-mono">
                                <span className="flex items-center gap-1.5 text-sky-300">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                  Checking Razorpay Gateway...
                                </span>
                                <button
                                  type="button"
                                  onClick={handleManualGatewayStatusCheck}
                                  disabled={isCheckingGateway}
                                  className="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 font-bold cursor-pointer shrink-0"
                                >
                                  {isCheckingGateway ? "Checking..." : "Check Now"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : razorpayConfig.autoAmountMode === "upi_intent" &&
                      paymentChannel === "upi" ? (
                      /* EXACT-AMOUNT UPI INTENT + QR CODE PANEL (No manual amount typing!) */
                      <div
                        className={`p-4 rounded-2xl border space-y-3.5 ${
                          isDark
                            ? "bg-zinc-950 border-emerald-500/30"
                            : "bg-zinc-50 border-emerald-300"
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2.5">
                          <div>
                            <span className="font-display font-bold text-xs block">
                              Instant Exact-Amount UPI Pay
                            </span>
                            <span className="text-[10px] font-mono text-emerald-400">
                              Amount {currencySymbol}
                              {totalAmount.toLocaleString()} pre-filled automatically
                            </span>
                          </div>
                          <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            AUTO-LOCKED
                          </span>
                        </div>

                        {pendingGatewayOrder?.upiQrDataUrl ? (
                          <div className="flex flex-col items-center gap-2 py-1">
                            <div className="p-2.5 bg-white rounded-2xl shadow-sm border border-zinc-200">
                              <img
                                src={pendingGatewayOrder.upiQrDataUrl}
                                alt={`UPI QR for ${currencySymbol}${totalAmount}`}
                                className="w-40 h-40 object-contain"
                              />
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400 text-center">
                              Scan with GPay, PhonePe, Paytm, or BHIM —{" "}
                              <strong className="text-emerald-400">
                                {currencySymbol}
                                {totalAmount.toLocaleString()}
                              </strong>{" "}
                              loads automatically
                            </span>
                          </div>
                        ) : (
                          <div className="py-4 text-center text-xs font-mono text-zinc-400 flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating exact-amount UPI QR...
                          </div>
                        )}

                        {pendingGatewayOrder?.upiIntentUrl && (
                          <a
                            href={pendingGatewayOrder.upiIntentUrl}
                            className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-display font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                            id="open-upi-intent-btn"
                          >
                            <Smartphone className="w-4 h-4 shrink-0" />
                            <span>
                              Open UPI App • Exact {currencySymbol}
                              {totalAmount.toLocaleString()}
                            </span>
                          </a>
                        )}

                        <div className="space-y-2 pt-1 border-t border-zinc-800/50">
                          <label className="block text-[10px] font-mono uppercase font-semibold text-zinc-400">
                            Enter 12-Digit UPI UTR / Reference No. *
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 429812345678 or pay_..."
                            value={razorpayRefInput}
                            onChange={(e) => {
                              setRazorpayRefInput(e.target.value);
                              setPaymentError(null);
                            }}
                            className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-mono ${
                              isDark
                                ? "bg-zinc-900 text-zinc-100 border-zinc-800 focus:border-emerald-400"
                                : "bg-white text-zinc-900 border-zinc-300 focus:border-zinc-950"
                            }`}
                            id="razorpay-ref-input"
                          />
                        </div>
                      </div>
                    ) : (
                      /* RAZORPAY.ME HANDLE PANEL + AUTO-AMOUNT ACTIVATION NOTICE */
                      <div
                        className={`p-4 rounded-2xl border space-y-3.5 ${
                          isDark
                            ? "bg-zinc-950 border-amber-500/30"
                            : "bg-zinc-50 border-amber-300"
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center font-mono font-black text-xs border border-sky-500/20">
                              RZP
                            </div>
                            <div>
                              <span className="font-display font-bold text-xs block">
                                {paymentChannel === "upi"
                                  ? "Razorpay UPI Gateway"
                                  : "Razorpay Card Gateway"}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-400">
                                {razorpayConfig.razorpayMeUrl}
                              </span>
                            </div>
                          </div>
                          <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            API Keys Needed
                          </span>
                        </div>

                        {/* Honest Explanation Banner: Why razorpay.me asks for manual entry */}
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] leading-relaxed space-y-1.5">
                          <div className="font-display font-bold text-amber-400 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            Auto-Amount Checkout Requires Razorpay API Keys
                          </div>
                          <p className={isDark ? "text-zinc-300" : "text-zinc-700"}>
                            Razorpay blocks automatic amount pre-filling on static{" "}
                            <span className="font-mono">razorpay.me/@johnraj</span> URLs.
                            To make the{" "}
                            <strong>
                              exact {currencySymbol}
                              {totalAmount.toLocaleString()}
                            </strong>{" "}
                            appear automatically with zero typing, add{" "}
                            <span className="font-mono text-amber-300">
                              RAZORPAY_KEY_ID
                            </span>{" "}
                            and{" "}
                            <span className="font-mono text-amber-300">
                              RAZORPAY_KEY_SECRET
                            </span>{" "}
                            (from Razorpay Dashboard → Account &amp; Settings → API Keys) in{" "}
                            <strong>Settings → Secrets</strong>.
                          </p>
                        </div>

                        {/* Exact Amount Box + Copy */}
                        <div
                          className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                            isDark
                              ? "bg-zinc-900 border-zinc-800"
                              : "bg-white border-zinc-200"
                          }`}
                        >
                          <div>
                            <span className="text-[10px] font-mono uppercase text-zinc-400 block">
                              Exact Payable Amount
                            </span>
                            <span className="text-lg font-mono font-black tabular-nums">
                              {currencySymbol}
                              {totalAmount.toLocaleString()}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyPayableAmount}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold border flex items-center gap-1 cursor-pointer ${
                              isDark
                                ? "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200"
                                : "bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-800"
                            }`}
                          >
                            {copiedAmount ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                Copy Amount
                              </>
                            )}
                          </button>
                        </div>

                        {/* Supported methods strip */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                          {paymentChannel === "upi" ? (
                            <>
                              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                                GPay
                              </span>
                              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                                PhonePe
                              </span>
                              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                                Paytm
                              </span>
                              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                                BHIM UPI
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                                Visa
                              </span>
                              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                                Mastercard
                              </span>
                              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                                RuPay
                              </span>
                              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                                Debit / Credit
                              </span>
                            </>
                          )}
                        </div>

                        {/* Fallback Manual Razorpay.me Link */}
                        <a
                          href={razorpayConfig.razorpayMeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            setHasOpenedRazorpayLink(true);
                            setPaymentError(null);
                            void ensureGatewaySessionCreated();
                          }}
                          className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 font-display font-bold text-xs flex items-center justify-center gap-2 transition-all"
                          id="open-razorpay-me-link-btn"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Fallback: Pay {currencySymbol}
                            {totalAmount.toLocaleString()} via razorpay.me/
                            {razorpayConfig.razorpayHandle.replace(/^@?/, "@")}
                          </span>
                        </a>

                        {/* Live Gateway Confirmation Polling Banner */}
                        {hasOpenedRazorpayLink && (
                          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-between gap-2 text-[10px] font-mono">
                            <span className="flex items-center gap-1.5 text-sky-300">
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              Awaiting Razorpay Gateway confirmation...
                            </span>
                            <button
                              type="button"
                              onClick={handleManualGatewayStatusCheck}
                              disabled={isCheckingGateway}
                              className="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 font-bold cursor-pointer shrink-0"
                            >
                              {isCheckingGateway ? "Checking..." : "Check Gateway"}
                            </button>
                          </div>
                        )}

                        {/* Step B: Strict Razorpay Payment ID Verification */}
                        <div className="space-y-2 pt-1 border-t border-zinc-800/50">
                          <label className="block text-[10px] font-mono uppercase font-semibold text-zinc-400">
                            Razorpay Payment ID (Confirmed by Gateway) *
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. pay_Q7xYz123AbCdEf"
                            value={razorpayRefInput}
                            onChange={(e) => {
                              setRazorpayRefInput(e.target.value);
                              setPaymentError(null);
                            }}
                            className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-mono ${
                              isDark
                                ? "bg-zinc-900 text-zinc-100 border-zinc-800 focus:border-emerald-400"
                                : "bg-white text-zinc-900 border-zinc-300 focus:border-zinc-950"
                            }`}
                            id="razorpay-ref-input"
                          />
                          <p className="text-[10px] text-zinc-400 leading-snug">
                            Once payment succeeds on Razorpay, paste the{" "}
                            <strong className="font-mono text-zinc-200">pay_...</strong> Payment ID
                            from your Razorpay receipt. Only after Razorpay confirms payment will
                            your PDF invoice be generated and sent to{" "}
                            <strong className="text-zinc-200">{customerPhone}</strong> &amp;{" "}
                            <strong className="text-zinc-200">{customerEmail}</strong>.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isPaying ? (
                  <div
                    className={`p-4 rounded-2xl border text-center space-y-2.5 ${
                      isDark ? "bg-zinc-950 border-zinc-800" : "bg-zinc-50 border-zinc-200"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 font-mono">
                      <span>{payStatusText}</span>
                      <span>{payProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${payProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="submit"
                    className={`w-full py-4 font-display font-bold text-sm rounded-2xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-98 cursor-pointer ${
                      paymentChannel === "cod"
                        ? "bg-amber-500 hover:bg-amber-400 text-zinc-950"
                        : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950"
                    }`}
                    id="complete-payment-btn"
                  >
                    <Lock className="w-4 h-4 shrink-0" />
                    <span>
                      {paymentChannel === "cod"
                        ? `Confirm COD & Send PDF (${currencySymbol}${totalAmount.toLocaleString()})`
                        : razorpayConfig.mode === "live_sdk"
                        ? `Pay ${currencySymbol}${totalAmount.toLocaleString()} via Razorpay (Auto-Amount)`
                        : `Verify Payment & Send PDF (${currencySymbol}${totalAmount.toLocaleString()})`}
                    </span>
                  </button>
                )}
              </form>
            </div>
          ) : cart.length === 0 ? (
            /* ================= STATE 0: EMPTY CART ================= */
            <div className="text-center py-12 space-y-4 animate-in fade-in duration-200">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto border ${
                  isDark
                    ? "bg-zinc-950 border-zinc-800 text-zinc-500"
                    : "bg-zinc-50 border-zinc-200 text-zinc-400"
                }`}
              >
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <p
                  className={`font-display font-bold text-sm ${
                    isDark ? "text-zinc-200" : "text-zinc-800"
                  }`}
                >
                  Your order bag is empty
                </p>
                <p className="text-xs text-zinc-500 mt-1 max-w-[240px] mx-auto leading-relaxed">
                  Add everything you want from the catalog, then click Buy Now to record your
                  details and pay via COD, UPI, or Cards.
                </p>
              </div>
            </div>
          ) : (
            /* ================= STEP 1: SELECTED ITEMS & RECORD CUSTOMER DETAILS ================= */
            <>
              <div className="space-y-3">
                <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-zinc-400">
                  Selected Articles ({cart.reduce((s, i) => s + i.quantity, 0)})
                </h3>
                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-2xl border ${
                        isDark ? "bg-zinc-950 border-zinc-800" : "bg-zinc-50 border-zinc-200/60"
                      }`}
                      id={`cart-item-${item.id}`}
                    >
                      <div
                        className={`w-14 h-14 rounded-lg overflow-hidden shrink-0 border ${
                          isDark ? "bg-zinc-900 border-zinc-800" : "bg-zinc-200 border-zinc-200"
                        }`}
                      >
                        <img
                          src={item.product.images[0]}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex-grow min-w-0">
                        <h4
                          className={`text-xs font-bold truncate leading-snug ${
                            isDark ? "text-zinc-100" : "text-zinc-900"
                          }`}
                        >
                          {item.product.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold ${
                              isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-200 text-zinc-700"
                            }`}
                          >
                            {item.selectedSize}
                          </span>
                          <span
                            className={`flex items-center gap-1 text-[10px] ${
                              isDark ? "text-zinc-400" : "text-zinc-500"
                            }`}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full border block shrink-0 border-zinc-700"
                              style={{ backgroundColor: item.selectedColor.hex }}
                            />
                            {item.selectedColor.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`font-mono font-bold text-xs tabular-nums ${
                            isDark ? "text-white" : "text-zinc-950"
                          }`}
                        >
                          {currencySymbol}
                          {(item.product.price * item.quantity).toLocaleString()}
                        </span>
                        <div
                          className={`flex items-center border rounded-lg overflow-hidden ${
                            isDark
                              ? "border-zinc-800 bg-zinc-900"
                              : "border-zinc-200/80 bg-white"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(item.id, -1)}
                            className="px-2 py-0.5 font-bold text-xs text-zinc-400 hover:text-white cursor-pointer"
                          >
                            -
                          </button>
                          <span className="px-1.5 text-xs font-mono font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(item.id, 1)}
                            className="px-2 py-0.5 font-bold text-xs text-zinc-400 hover:text-white cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        className="p-1 text-zinc-400 hover:text-red-500 transition-colors shrink-0 cursor-pointer"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer Details Form */}
              <form
                onSubmit={handleBuyNowClick}
                className={`space-y-4 pt-4 border-t ${
                  isDark ? "border-zinc-800" : "border-zinc-100"
                }`}
              >
                {!currentUser && (
                  <div
                    className={`p-4 rounded-2xl border ${
                      isDark
                        ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-200"
                        : "bg-emerald-50/80 border-emerald-300 text-emerald-950"
                    } space-y-2.5`}
                    id="checkout-auth-gate-card"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="font-display font-bold text-xs uppercase tracking-wider text-emerald-400">
                          Sign In or Sign Up to Buy Now
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      Sign in so we can record your delivery details, process COD / Razorpay UPI /
                      Card billing, and send your sample bill.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenAuthModal) onOpenAuthModal("signup");
                          else if (onOpenAccountModal) onOpenAccountModal();
                        }}
                        className="py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        id="cart-signup-btn"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Sign Up</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenAuthModal) onOpenAuthModal("signin");
                          else if (onOpenAccountModal) onOpenAccountModal();
                        }}
                        className={`py-2 px-3 rounded-xl font-display font-bold text-xs flex items-center justify-center gap-1.5 border cursor-pointer ${
                          isDark
                            ? "bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700"
                            : "bg-white hover:bg-zinc-50 text-zinc-900 border-zinc-300"
                        }`}
                        id="cart-signin-btn"
                      >
                        <User className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Sign In</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-zinc-400">
                    Customer Details (Recorded on Buy Now)
                  </h3>
                  {currentUser && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                      <UserCheck className="w-3 h-3 text-emerald-400" />
                      <span>{currentUser.name}</span>
                    </span>
                  )}
                </div>

                {/* Delivery Method Toggle */}
                <div
                  className={`grid grid-cols-2 gap-2 p-1 rounded-xl border ${
                    isDark ? "bg-zinc-950 border-zinc-800" : "bg-zinc-50 border-zinc-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("delivery")}
                    className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      deliveryMethod === "delivery"
                        ? isDark
                          ? "bg-zinc-900 text-white shadow-sm border border-zinc-800"
                          : "bg-white text-zinc-950 shadow-sm border border-zinc-200"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    Home Delivery
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("pickup")}
                    className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      deliveryMethod === "pickup"
                        ? isDark
                          ? "bg-zinc-900 text-white shadow-sm border border-zinc-800"
                          : "bg-white text-zinc-950 shadow-sm border border-zinc-200"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Studio Pick-up (Free)
                  </button>
                </div>

                {checkoutError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono">
                    {checkoutError}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label
                      className={`block text-[10px] font-mono uppercase font-semibold mb-1 ${
                        isDark ? "text-zinc-500" : "text-zinc-400"
                      }`}
                    >
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Aarav Sharma"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className={`w-full px-3 py-2.5 text-xs rounded-xl border outline-none transition-all font-medium ${
                        isDark
                          ? "bg-zinc-950 text-zinc-100 border-zinc-800 focus:border-white"
                          : "bg-zinc-50 text-zinc-900 border-zinc-200 focus:border-zinc-950"
                      }`}
                    />
                  </div>

                  <div>
                    <label
                      className={`block text-[10px] font-mono uppercase font-semibold mb-1 ${
                        isDark ? "text-zinc-500" : "text-zinc-400"
                      }`}
                    >
                      Email ID (Sample Bill will be sent here) *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. customer@example.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className={`w-full px-3 py-2.5 text-xs rounded-xl border outline-none transition-all font-mono ${
                        isDark
                          ? "bg-zinc-950 text-zinc-100 border-zinc-800 focus:border-white"
                          : "bg-zinc-50 text-zinc-900 border-zinc-200 focus:border-zinc-950"
                      }`}
                      id="checkout-customer-email-input"
                    />
                  </div>

                  <div>
                    <label
                      className={`block text-[10px] font-mono uppercase font-semibold mb-1 ${
                        isDark ? "text-zinc-500" : "text-zinc-400"
                      }`}
                    >
                      Mobile / WhatsApp Number *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. +91 98765 43210"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className={`w-full px-3 py-2.5 text-xs rounded-xl border outline-none transition-all font-mono ${
                        isDark
                          ? "bg-zinc-950 text-zinc-100 border-zinc-800 focus:border-white"
                          : "bg-zinc-50 text-zinc-900 border-zinc-200 focus:border-zinc-950"
                      }`}
                    />
                  </div>

                  {deliveryMethod === "delivery" && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-150">
                      <label
                        className={`block text-[10px] font-mono uppercase font-semibold ${
                          isDark ? "text-zinc-500" : "text-zinc-400"
                        }`}
                      >
                        Delivery Address *
                      </label>
                      {currentUser?.savedAddresses && currentUser.savedAddresses.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {currentUser.savedAddresses.map((addr) => {
                            const addrStr = `${addr.streetAddress}, ${addr.city}, ${addr.state} - ${addr.postalCode}`;
                            const isSelected = customerAddress === addrStr;
                            return (
                              <button
                                key={addr.id}
                                type="button"
                                onClick={() => setCustomerAddress(addrStr)}
                                className={`text-[10px] px-2.5 py-1 rounded-lg border font-medium cursor-pointer ${
                                  isSelected
                                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-500 font-bold"
                                    : isDark
                                    ? "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white"
                                    : "bg-zinc-100 border-zinc-200 text-zinc-700"
                                }`}
                              >
                                {addr.label} {addr.isDefault && "(Default)"}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <textarea
                        required
                        rows={2}
                        placeholder="House/Flat No, Street, City, PIN Code..."
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-xl border outline-none transition-all font-medium ${
                          isDark
                            ? "bg-zinc-950 text-zinc-100 border-zinc-800 focus:border-white"
                            : "bg-zinc-50 text-zinc-900 border-zinc-200 focus:border-zinc-950"
                        }`}
                      />
                    </div>
                  )}
                </div>

                <button type="submit" id="hidden-submit-btn" className="hidden" />
              </form>
            </>
          )}
        </div>

        {/* Drawer Footer for Step 1 */}
        {!createdOrder && !isAtPaymentPortal && cart.length > 0 && (
          <div
            className={`p-4 sm:p-5 border-t space-y-4 shrink-0 ${
              isDark ? "border-zinc-800 bg-zinc-950/60" : "border-zinc-100 bg-zinc-50/60"
            }`}
          >
            <div className="space-y-1.5 text-xs font-medium tabular-nums">
              <div className="flex justify-between text-zinc-500">
                <span>Order Subtotal</span>
                <span className={`font-mono ${isDark ? "text-zinc-300" : "text-zinc-800"}`}>
                  {currencySymbol}
                  {subtotal.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Delivery Charges</span>
                <span className={`font-mono ${isDark ? "text-zinc-300" : "text-zinc-800"}`}>
                  {deliveryMethod === "delivery" ? `${currencySymbol}${deliveryFee}` : "Free"}
                </span>
              </div>
              <div
                className={`flex justify-between text-sm pt-2 border-t font-bold ${
                  isDark ? "border-zinc-800 text-white" : "border-zinc-200 text-zinc-900"
                }`}
              >
                <span>Grand Total</span>
                <span className="font-mono text-base">
                  {currencySymbol}
                  {totalAmount.toLocaleString()}
                </span>
              </div>
            </div>

            {!currentUser ? (
              <button
                type="button"
                onClick={() => {
                  if (onOpenAuthModal) onOpenAuthModal("signup");
                  else if (onOpenAccountModal) onOpenAccountModal();
                }}
                className={`w-full py-4 font-display font-bold text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
                  isDark
                    ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                }`}
                id="submit-order-button"
              >
                <Lock className="w-4 h-4 shrink-0" />
                <span>Login / Sign Up to Buy Now</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const btn = document.getElementById("hidden-submit-btn");
                  if (btn) btn.click();
                }}
                className={`w-full py-4 font-display font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-98 cursor-pointer ${
                  isDark
                    ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950"
                    : "bg-zinc-950 hover:bg-zinc-800 text-white"
                }`}
                id="submit-order-button"
              >
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span>Buy Now • Choose Payment (COD / UPI / Cards)</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
