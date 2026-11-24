import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { registerStylistRoutes } from "./stylistRoutes";
import { registerNotificationRoutes } from "./notificationRoutes";
import { registerRazorpayRoutes } from "./razorpayRoutes";
import { registerBillPdfRoutes } from "./pdfInvoice";

dotenv.config({ path: [".env.local", ".env"] });

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);

const app = express();

app.disable("x-powered-by");

// Security headers (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)
app.use((req, res, next) => {
  const referer = String(req.headers.referer || "");
  const isAiStudioFrame =
    referer.includes("aistudio.google.com") || referer.includes("makersuite.google.com");

  const frameAncestors = isAiStudioFrame
    ? "frame-ancestors 'self' https://aistudio.google.com https://*.google.com;"
    : "frame-ancestors 'self';";

  const isProd = process.env.NODE_ENV === "production";
  const scriptSrc = isProd
    ? "script-src 'self' https://checkout.razorpay.com https://apis.google.com https://www.googletagmanager.com;"
    : "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://apis.google.com https://www.googletagmanager.com;";
  const styleSrc = isProd
    ? "style-src 'self' https://fonts.googleapis.com;"
    : "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;";

  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self';",
      scriptSrc,
      "script-src-attr 'none';",
      styleSrc,
      "font-src 'self' data: https://fonts.gstatic.com;",
      "img-src 'self' data: blob: https:;",
      "connect-src 'self' ws: wss: https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com wss://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.razorpay.com https://lumberjack.razorpay.com https://checkout.razorpay.com https://fonts.googleapis.com https://fonts.gstatic.com;",
      "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.firebaseapp.com;",
      "media-src 'self' blob: data:;",
      "object-src 'none';",
      "base-uri 'self';",
      "form-action 'self' https://api.razorpay.com https://razorpay.me;",
      frameAncestors,
      ...(isProd ? ["upgrade-insecure-requests;"] : []),
    ].join(" ")
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!isAiStudioFrame) {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
  }
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    'camera=(self), microphone=(), geolocation=(), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com"), usb=()'
  );
  next();
});

// Scoped JSON body limits: 10mb only for image/PDF upload routes, 1mb everywhere else
const defaultJsonParser = express.json({ limit: "1mb" });
const largeJsonParser = express.json({ limit: "10mb" });
app.use((req, res, next) => {
  const needsLargeBody =
    req.path.startsWith("/api/stylist") || req.path.startsWith("/api/notifications");
  return (needsLargeBody ? largeJsonParser : defaultJsonParser)(req, res, next);
});
app.use(express.urlencoded({ limit: "1mb", extended: true }));

// Singleton @google/genai client keyed by GEMINI_API_KEY
let cachedGeminiKey: string | undefined;
let cachedGeminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const activeKey = process.env.GEMINI_API_KEY?.trim() || "";
  if (!activeKey) {
    cachedGeminiKey = "";
    cachedGeminiClient = null;
    return null;
  }
  if (cachedGeminiClient && cachedGeminiKey === activeKey) {
    return cachedGeminiClient;
  }
  cachedGeminiKey = activeKey;
  cachedGeminiClient = new GoogleGenAI({
    apiKey: activeKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
  return cachedGeminiClient;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * System Instructions for different chatbot roles
 */
const SYSTEM_INSTRUCTIONS: Record<string, string> = {
  stylist: `You are "DEN AI" - the Lead Streetwear Stylist and Cut Consultant for THREAD DEN.
Your role:
- Provide expert styling recommendations, urban streetwear outfit ideas, and color pairing guides.
- Explain aesthetic combinations for heavyweights (240+ GSM), graphic cuts, acid wash, and minimalist blanks.
- Recommend pants, sneakers, and layering pieces (hoodies, flannels, cargo pants) that complement oversized tees.
- Maintain an authentic streetwear tone: cool, knowledgeable, concise, and helpful.`,

  sizing: `You are "DEN AI" - the Fit & Sizing Specialist for THREAD DEN.
Your role:
- Help shoppers choose the exact right size (S, M, L, XL, XXL) based on their height, weight, build, and desired fit (true-to-size boxy, relaxed oversized, or standard fit).
- Explain drop-shoulder anatomy, chest measurements, and preshrunk cotton behavior.
- Give concrete garment care rules: cold water machine wash, inside out, line dry to keep collars and ribbing crisp.
- Be precise with numerical measurements in inches or centimeters when asked.`,

  reseller: `You are "DEN AI" - the Reseller & Merchant Business Advisor for THREAD DEN.
Your role:
- Assist streetwear brand owners, merch creators, and resellers with margin optimization, bulk batch planning, and retail markup.
- Explain why 240+ GSM heavyweight blanks have higher perceived value and justify 2.5x - 3.5x retail margins.
- Provide tips on screen printing, direct-to-garment (DTG), puff print, and embroidery on heavy cotton.
- Give actionable business insights in a sharp, entrepreneurial manner.`,
};

/**
 * Multi-Turn Chat API Endpoint
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, model = "gemini-4-hydrogen", role = "stylist", customInstruction } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Missing or invalid 'messages' array in request body." });
    }

    const client = getGeminiClient();
    if (!client) {
      return res.status(503).json({
        error: "Gemini API key is not configured on the server. Please add a key in Settings > Secrets.",
        code: "no_key",
      });
    }

    const systemInstruction = customInstruction || SYSTEM_INSTRUCTIONS[role] || SYSTEM_INSTRUCTIONS.stylist;

    const validModels = ["gemini-4-hydrogen", "gemini-3.1-flash-lite", "gemini-4-argon"];
    const normalizedModel = model === "gemini-3.8-flash" ? "gemini-4-hydrogen" : model;
    const targetModel = validModels.includes(normalizedModel) ? normalizedModel : "gemini-4-hydrogen";

    const formattedContents = messages.slice(-24).map((m: { role: string; text?: string; content?: string }) => ({
      role: m.role === "assistant" || m.role === "model" ? "model" : "user",
      parts: [{ text: String(m.text || m.content || "").slice(0, 4000) }],
    }));

    const response = await withTimeout(
      client.models.generateContent({
        model: targetModel,
        contents: formattedContents,
        config: {
          systemInstruction,
        },
      }),
      45_000,
      "Gemini Chat"
    );

    const reply = response.text || "I'm here to help you style and select the best streetwear cuts.";
    return res.json({ reply });
  } catch (error: any) {
    let errMsg = error?.message || "Failed to generate AI response from Gemini.";
    try {
      if (typeof errMsg === "string" && (errMsg.startsWith("{") || errMsg.includes('"error"'))) {
        const parsed = JSON.parse(errMsg);
        if (parsed?.error?.message) {
          errMsg = parsed.error.message;
        }
      }
    } catch {
      // keep original
    }

    const isBilling = /free tier is not available|billing|paid tier|quota|RESOURCE_EXHAUSTED/i.test(errMsg);
    const isAuth = /API_KEY_INVALID|PERMISSION_DENIED|403/i.test(errMsg);
    const status = isBilling ? 402 : isAuth ? 403 : 502;
    const friendlyError = isBilling
      ? "Gemini API requires a billing-enabled API key for this project. Select or update your key in Settings > Secrets."
      : isAuth
      ? "Gemini API rejected the key. Please check your GEMINI_API_KEY in Settings > Secrets."
      : errMsg;

    return res.status(status).json({
      error: friendlyError,
      code: isBilling ? "billing_required" : isAuth ? "invalid_key" : "api_error",
    });
  }
});

/**
 * AI Stylist: customer miniature generation, virtual try-on and fit verdict
 */
registerStylistRoutes(app, getGeminiClient, moduleDirname);
registerNotificationRoutes(app);
registerRazorpayRoutes(app);
registerBillPdfRoutes(app);

/**
 * Health check endpoint
 */
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Centralized API Error Handler (catches 413 Payload Too Large & malformed JSON cleanly)
 */
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (res.headersSent) return next(err);
    if (err?.type === "entity.too.large" || err?.status === 413) {
      return res.status(413).json({
        error: "Request payload too large. Please keep uploads under the allowed limit.",
      });
    }
    if (err instanceof SyntaxError && (err as { status?: number })?.status === 400) {
      return res.status(400).json({ error: "Malformed JSON request body." });
    }
    console.error("Unhandled Express error:", err);
    return res.status(err?.status || 500).json({
      error: "Internal server error.",
    });
  }
);

export default app;
