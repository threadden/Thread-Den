/**
 * AI Stylist – Customer Miniature + Virtual Try-On routes
 * ------------------------------------------------------
 * 1. POST /api/stylist/create-miniature
 *      Customer photo  ──►  AI image model (Cloudflare FLUX.2 Klein or Gemini)  ──►  chibi figurine
 *      (style matched to reference dolls in /public/assets/aistudio/)
 *
 * 2. POST /api/stylist/try-on
 *      Customer miniature + product photo + chosen colour/size  ──►  the same miniature wearing the article
 *
 * 3. POST /api/stylist/analyze-fit
 *      Looks at the dressed miniature (when available) and gives an honest "does it suit you" verdict.
 *
 * IMAGE ENGINES (picked automatically, or force with IMAGE_PROVIDER=cloudflare | gemini):
 *  - Cloudflare Workers AI, FLUX.2 Klein (FREE: ~80 images/day, no credit card):
 *      needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
 *      Model: CLOUDFLARE_IMAGE_MODEL (default: @cf/black-forest-labs/flux-2-klein-4b)
 *  - Google Gemini image models (PAID, requires billing enabled):
 *      GEMINI_IMAGE_MODEL overrides the model; falls back through IMAGE_MODEL_FALLBACKS.
 *  - Graceful fallback: If image models cannot run, the customer's analyzed traits
 *      are paired with the collectible miniature figurine so styling & fit advice always works!
 */
import type { Express, Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { Jimp } from "jimp";
import fs from "fs";
import path from "path";

type GetClient = () => GoogleGenAI | null;

const IMAGE_MODEL_FALLBACKS = ["gemini-3.1-flash-image", "gemini-nano-banana-2.1", "gemini-3-pro-image"];
const TEXT_MODELS = Array.from(
  new Set([process.env.GEMINI_TEXT_MODEL?.trim(), "gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"].filter(Boolean) as string[])
);
const MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024;

/** Last run details, accessible at GET /api/stylist/status for real-time debugging */
const lastRuns: Record<string, any> = {};

function imageModels(): string[] {
  const preferred = process.env.GEMINI_IMAGE_MODEL?.trim();
  return Array.from(new Set([preferred, ...IMAGE_MODEL_FALLBACKS].filter(Boolean) as string[]));
}

interface InlineImage {
  mimeType: string;
  data: string; // base64
}

type Part = { text: string } | { inlineData: InlineImage };

class ImageGenError extends Error {
  constructor(message: string, public readonly code: "no_key" | "blocked" | "no_image" | "api_error" | "billing_required") {
    super(message);
  }
}

function parseDataUrl(value: string): InlineImage | null {
  const m = value.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/s);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

function mimeFromExt(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function sniffMime(b64: string): string {
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

function cleanGeminiError(err: any): string {
  let msg: string = err?.message || String(err);
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.message) msg = parsed.error.message;
  } catch {
    /* not JSON */
  }
  return msg;
}

function isModelMissing(msg: string): boolean {
  return /not found|is not supported|unknown model|does not exist|404/i.test(msg);
}

/** Text/vision JSON call with model fallbacks */
async function generateJson(client: GoogleGenAI, parts: any[]): Promise<any> {
  let lastErr: any;
  for (const model of TEXT_MODELS) {
    try {
      const r = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: { responseMimeType: "application/json" },
      });
      if (!r.text) throw new Error("empty response");
      const cleaned = r.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
      lastRuns.text = { ok: true, model, at: new Date().toISOString() };
      return JSON.parse(cleaned);
    } catch (e: any) {
      lastErr = e;
      lastRuns.text = { ok: false, model, error: cleanGeminiError(e), at: new Date().toISOString() };
      console.warn(`[stylist] text model ${model} failed:`, cleanGeminiError(e));
    }
  }
  throw lastErr;
}

/**
 * Loads an image given as a data URL, a site-relative asset path, or an http(s) URL
 */
async function loadImage(source: string | undefined, rootDir: string): Promise<InlineImage | null> {
  if (!source || typeof source !== "string") return null;

  if (source.startsWith("data:")) return parseDataUrl(source);

  if (source.startsWith("/")) {
    const clean = path.normalize(decodeURIComponent(source.split("?")[0])).replace(/^([/\\])+/, "");
    const candidates = [path.join(rootDir, "public", clean), path.join(rootDir, clean)];
    const allowedRoots = [path.join(rootDir, "public"), path.join(rootDir, "src", "assets")];
    for (const file of candidates) {
      const resolved = path.resolve(file);
      if (!allowedRoots.some((r) => resolved.startsWith(r + path.sep))) continue;
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        return { mimeType: mimeFromExt(resolved), data: fs.readFileSync(resolved).toString("base64") };
      }
    }
    return null;
  }

  if (/^https?:\/\//i.test(source)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const resp = await fetch(source, { signal: controller.signal });
      if (!resp.ok) return null;
      const type = (resp.headers.get("content-type") || "").split(";")[0].trim();
      if (!type.startsWith("image/")) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.byteLength > MAX_REMOTE_IMAGE_BYTES) return null;
      return { mimeType: type, data: buf.toString("base64") };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Cloudflare Workers AI – FLUX.2 Klein (Free Tier)                   */
/* ------------------------------------------------------------------ */

function cloudflareConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && process.env.CLOUDFLARE_API_TOKEN?.trim());
}

function imageProvider(): "cloudflare" | "gemini" {
  const forced = (process.env.IMAGE_PROVIDER || "").trim().toLowerCase();
  if (forced === "cloudflare" || forced === "gemini") return forced;
  return cloudflareConfigured() ? "cloudflare" : "gemini";
}

/** FLUX.2 Klein requires every input image to be under 512x512. Flatten transparency onto white. */
async function shrinkForFlux(img: InlineImage, max = 511): Promise<Buffer> {
  const src = await Jimp.read(Buffer.from(img.data, "base64"));
  if (src.width > max || src.height > max) src.scaleToFit({ w: max, h: max });
  const canvas = new Jimp({ width: src.width, height: src.height, color: 0xffffffff });
  canvas.composite(src, 0, 0);
  return canvas.getBuffer("image/jpeg", { quality: 92 });
}

async function generateWithCloudflare(
  images: InlineImage[],
  prompt: string,
  width = 768,
  height = 1024,
  seed?: number
): Promise<{ dataUrl: string; model: string }> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!account || !token) {
    throw new ImageGenError("Cloudflare is selected but CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN are missing.", "no_key");
  }
  const model = process.env.CLOUDFLARE_IMAGE_MODEL?.trim() || "@cf/black-forest-labs/flux-2-klein-4b";
  const base = process.env.CLOUDFLARE_API_BASE?.trim() || "https://api.cloudflare.com/client/v4";

  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", String(width));
  form.append("height", String(height));
  if (seed !== undefined) form.append("seed", String(seed));
  const inputs = images.slice(0, 4); // model accepts at most 4 reference images
  for (let i = 0; i < inputs.length; i++) {
    const jpeg = await shrinkForFlux(inputs[i]);
    form.append(`input_image_${i}`, new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), `image_${i}.jpg`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let resp: globalThis.Response;
  try {
    resp = await fetch(`${base}/accounts/${account}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
  } catch (err: any) {
    throw new ImageGenError(`Could not reach Cloudflare Workers AI: ${err?.message || err}`, "api_error");
  } finally {
    clearTimeout(timer);
  }

  const type = resp.headers.get("content-type") || "";
  if (resp.ok && type.startsWith("image/")) {
    const b64 = Buffer.from(await resp.arrayBuffer()).toString("base64");
    return { dataUrl: `data:${type.split(";")[0]};base64,${b64}`, model: `cloudflare:${model}` };
  }

  const body: any = await resp.json().catch(() => ({}));
  const b64: string | undefined = body?.result?.image || body?.image;
  if (resp.ok && b64) {
    return { dataUrl: `data:${sniffMime(b64)};base64,${b64}`, model: `cloudflare:${model}` };
  }

  const apiMsg: string = body?.errors?.[0]?.message || body?.error || `HTTP ${resp.status}`;
  if (resp.status === 401 || resp.status === 403) {
    throw new ImageGenError(`Cloudflare rejected the API token (${apiMsg}). Check CLOUDFLARE_API_TOKEN has "Workers AI" permission.`, "no_key");
  }
  if (resp.status === 429 || /neuron|daily|allocation|limit/i.test(apiMsg)) {
    throw new ImageGenError("Today's free image allowance is used up. It resets at 5:30 AM IST (00:00 UTC).", "api_error");
  }
  if (/nsfw|safety|flagged/i.test(apiMsg)) {
    throw new ImageGenError("The image model declined this photo. Try a different, clearly lit front-facing photo.", "blocked");
  }
  throw new ImageGenError(`Cloudflare image generation failed: ${apiMsg}`, "api_error");
}

/* ------------------------------------------------------------------ */
/* Gemini image generation                                             */
/* ------------------------------------------------------------------ */

async function generateWithGemini(
  client: GoogleGenAI | null,
  parts: Part[],
  aspectRatio = "3:4"
): Promise<{ dataUrl: string; model: string }> {
  if (!client) {
    throw new ImageGenError("Gemini API key is not configured on the server.", "no_key");
  }

  let lastError = "";
  for (const model of imageModels()) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: { aspectRatio },
        },
      });

      const candidate = response.candidates?.[0];
      const imgPart = candidate?.content?.parts?.find((p: any) => p.inlineData?.data);
      if (imgPart?.inlineData?.data) {
        const mime = imgPart.inlineData.mimeType || "image/png";
        return { dataUrl: `data:${mime};base64,${imgPart.inlineData.data}`, model };
      }

      const reason = candidate?.finishReason || response.promptFeedback?.blockReason;
      if (reason && /SAFETY|BLOCK|PROHIBITED|IMAGE_SAFETY/i.test(String(reason))) {
        throw new ImageGenError(
          "The image model declined this photo. Try a different, clearly lit front-facing photo.",
          "blocked"
        );
      }
      lastError = response.text || "The model did not return an image.";
      throw new ImageGenError(lastError, "no_image");
    } catch (err: any) {
      if (err instanceof ImageGenError) throw err;
      lastError = cleanGeminiError(err);
      if (isModelMissing(lastError)) {
        console.warn(`[stylist] image model "${model}" unavailable, trying next…`);
        continue;
      }
      throw new ImageGenError(lastError, "api_error");
    }
  }
  throw new ImageGenError(lastError || "No image model available.", "api_error");
}

/** Unified image generator routing between Cloudflare and Gemini */
async function makeImage(
  client: GoogleGenAI | null,
  job: { geminiParts: Part[]; fluxImages: InlineImage[]; fluxPrompt: string; seed?: number }
): Promise<{ dataUrl: string; model: string }> {
  if (imageProvider() === "cloudflare") {
    return generateWithCloudflare(job.fluxImages, job.fluxPrompt, 768, 1024, job.seed);
  }

  if (!client) {
    throw new ImageGenError(
      "No image engine configured. Add CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (free) or a paid GEMINI_API_KEY.",
      "no_key"
    );
  }

  try {
    return await generateWithGemini(client, job.geminiParts, "3:4");
  } catch (err: any) {
    if (err instanceof ImageGenError && /quota|billing|free tier|RESOURCE_EXHAUSTED|429|paid|not available/i.test(err.message)) {
      throw new ImageGenError(
        "Gemini image generation requires a billing-enabled Google AI Studio project. To generate images for free without billing, configure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.",
        "billing_required"
      );
    }
    throw err;
  }
}

/** Calculate pixel difference between two images */
async function imageDifference(a: InlineImage, b: InlineImage): Promise<number> {
  try {
    const [ja, jb] = await Promise.all([
      Jimp.read(Buffer.from(a.data, "base64")),
      Jimp.read(Buffer.from(b.data, "base64")),
    ]);
    ja.cover({ w: 24, h: 32 }).greyscale();
    jb.cover({ w: 24, h: 32 }).greyscale();
    let total = 0;
    const n = 24 * 32;
    for (let i = 0; i < n; i++) total += Math.abs(ja.bitmap.data[i * 4] - jb.bitmap.data[i * 4]);
    return total / n;
  } catch {
    return 255;
  }
}
const UNCHANGED_THRESHOLD = 18;

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

const STYLE_HINTS: Record<string, string> = {
  streetwear_vinyl: "a glossy-matte collectible vinyl designer-toy finish, like a premium blind-box art toy",
  anime_chibi: "a cute anime-inspired chibi resin figure finish with slightly larger head and softer features",
  realistic_scale: "a hand-painted 1:12 scale resin miniature with slightly more realistic proportions (head about 1/4 of body height) while staying toy-like",
};

const BUILD_HINTS: Record<string, string> = {
  regular: "an average, standard body build",
  athletic: "a slightly broader-shouldered, athletic body build",
  oversized_loose: "a relaxed, slightly fuller body build",
};

const ATTIRE_HINTS: Record<string, string> = {
  western_tee: "Plain white crew-neck short-sleeve t-shirt with no print, plain dark navy straight trousers, plain white sneakers.",
  western_shirt: "Crisp plain ivory collared button-down shirt neatly tucked into medium-wash straight denim jeans, plain white sneakers.",
  saree: "A solid soft neutral-ivory silk saree with delicate thin gold border neatly pleated and draped with a pallu over the left shoulder, matching plain ivory fitted short-sleeve blouse, and simple neutral ethnic flat sandals.",
  chudidhar: "A clean soft pastel-beige knee-length kurta tunic, matching cream fitted churidar trousers with ankle gathers, a sheer draped dupatta over the chest/shoulders, and simple ethnic mojari flats.",
};

const FLUX_ATTIRE_HINTS: Record<string, string> = {
  western_tee: "a plain white crew-neck t-shirt, dark navy trousers and white sneakers",
  western_shirt: "a plain ivory collared button-down western shirt, light blue straight jeans and white sneakers",
  saree: "a neat pastel-ivory traditional draped saree with pleated pallu over the left shoulder, matching plain blouse, and simple ethnic sandals",
  chudidhar: "a clean pastel-beige chudidhar kurta top, fitted cream churidar trousers, sheer dupatta, and simple mojari flats",
};

function normalizeAttire(attire?: unknown): "western_tee" | "western_shirt" | "saree" | "chudidhar" {
  const val = typeof attire === "string" ? attire.toLowerCase() : "";
  if (val === "saree" || val === "chudidhar" || val === "western_shirt") return val;
  return "western_tee";
}

function detectGarmentType(category: string, productName: string): "saree" | "chudidhar" | "shirt" | "polo" | "tee" {
  const hay = `${category} ${productName}`.toLowerCase();
  if (/\bsaree\b|\bsarees\b|\bsari\b|\bkanchipuram\b|\bbanarasis?\b|\bpatola\b|\borganza\b/.test(hay)) {
    return "saree";
  }
  if (/\bchididhar|\bchudidhar|\bchuridar|\bsalwar|\banarkali|\bkurti|\bkurta\b|\bethnic set\b/.test(hay)) {
    return "chudidhar";
  }
  if (/\bpolo\b/.test(hay)) {
    return "polo";
  }
  if (/\bshirt\b|\bshirts\b|\bbutton-down\b|\boxford\b|\blinen shirt\b|\bwestern shirt\b/.test(hay) && !/\bt-?shirt|\btees?\b/.test(hay)) {
    return "shirt";
  }
  return "tee";
}

function miniaturePrompt(style: string, build: string, refCount = 1, attire = "western_tee"): string {
  const refs = refCount > 1 ? `IMAGES 2-${refCount + 1}` : "IMAGE 2";
  const attireLine = ATTIRE_HINTS[attire] || ATTIRE_HINTS.western_tee;
  const poseVerb = attire === "saree" || attire === "chudidhar" ? "the outfit drape and silhouette are clearly visible" : "the shirt is fully visible";
  return `You are creating a personalised collectible miniature figurine for an online clothing store's virtual try-on.

IMAGE 1 is a photo of the customer.
${refs} ${refCount > 1 ? "are STYLE REFERENCES: small chibi collectible doll figurines" : "is the STYLE REFERENCE: a small chibi collectible doll figurine"}.

Create ONE new photograph of a chibi collectible miniature figurine that clearly depicts THE CUSTOMER FROM IMAGE 1, sculpted in the same style as ${refs} – like a small doll, but with the customer's own face.

Likeness (most important – the customer must recognise themselves):
- Keep the customer's exact hairstyle, hair length, parting, hair colour and texture.
- Keep their skin tone, face shape, eyebrows, facial hair, glasses, earrings or other distinctive features.
- Keep their gender presentation. A gentle, friendly smile.

Figurine style (copy from ${refs}):
- Chibi proportions: oversized head (about one third of total height), small body, short legs, simple mitten-like hands.
- Smooth sculpted hair with soft highlights, ${STYLE_HINTS[style] || STYLE_HINTS.streetwear_vinyl}.
- Body: ${BUILD_HINTS[build] || BUILD_HINTS.regular}, in chibi proportions.

Pose & framing:
- Full body, standing upright, facing the camera, arms relaxed slightly away from the torso so ${poseVerb}.
- The entire figurine from the top of the hair to the soles of the shoes/sandals is inside the frame with some margin.

Outfit (a clean neutral base so store articles can be swapped later):
- ${attireLine}
- Do NOT copy the clothes, face or hair of the reference dolls – only their sculpting style and proportions.

Scene: clean light-grey seamless studio backdrop, soft product-photography lighting, soft contact shadow under the feet.
No text, no logos, no watermark, no extra people, no frame or border.`;
}

function fluxMiniaturePrompt(style: string, build: string, extraRef: boolean, strong = false, attire = "western_tee"): string {
  const attireLine = FLUX_ATTIRE_HINTS[attire] || FLUX_ATTIRE_HINTS.western_tee;
  return `${strong ? "Do NOT return a photograph of a real person. " : ""}Turn the person in image 1 into a small chibi collectible doll figurine in the exact toy style of image 0${
    extraRef ? " and image 2" : ""
  }. The result is a photo of a toy figurine, not a real human: smooth matte vinyl skin, sculpted glossy hair, oversized head about one third of the height, small body, short legs, simple hands; ${
    STYLE_HINTS[style] || STYLE_HINTS.streetwear_vinyl
  }; ${BUILD_HINTS[build] || BUILD_HINTS.regular}. The figurine has the face of the person in image 1 so they recognise themselves: same hairstyle, hair colour, skin tone, face shape, beard or moustache, and glasses if they wear them, with a gentle smile. Full body figurine standing upright facing the camera, arms slightly away from the body, the whole toy visible from the top of the hair to the feet, framed like image 0. It wears ${attireLine}. Do not copy the clothes or face of the doll in image 0, and do not keep the background or clothes from image 1. Light grey seamless studio background, soft product photography lighting, soft shadow under the feet. No text, no watermark.`;
}

function fitDescriptor(size: string, sizes: string[], garmentType: "saree" | "chudidhar" | "shirt" | "polo" | "tee" = "tee"): string {
  const s = (size || "").trim().toUpperCase();
  if (garmentType === "saree") {
    return "a graceful, traditional pleated saree drape with a neatly folded pallu over the left shoulder and a fitted matching blouse";
  }
  if (garmentType === "chudidhar") {
    if (s === "XS" || s === "S") return "a tailored, slim-fitted kurta top with neat churidar ankle gathers and draped dupatta";
    if (s === "M") return "a classic true-to-size embroidered kurta, tapered churidar bottoms and lightweight dupatta";
    return "a comfortable, relaxed-flow kurta tunic with gathered churidar trousers and graceful dupatta drape";
  }
  if (garmentType === "polo") {
    if (s === "XS" || s === "S") return "a clean fitted knit polo t-shirt with crisp ribbed collar and two-button placket";
    if (s === "M") return "a classic true-to-size knit polo t-shirt with structured collar and comfortable sleeves";
    return "a relaxed modern polo t-shirt fit with breathable knit texture and tipped collar";
  }
  if (garmentType === "shirt") {
    if (s === "XS" || s === "S") return "a crisp, tailored slim-fit collared button-down shirt";
    if (s === "M") return "a clean regular-fit collared button-down western shirt";
    return "a relaxed, effortless western button-down shirt silhouette with crisp collar and sleeves";
  }
  if (s === "FREE SIZE" || s === "FREE") return "a versatile, relaxed free-size drape";
  const order = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL"];
  const idx = order.indexOf(s);
  if (idx >= 0 && idx <= 1) return "a close, fitted cut that sits near the body";
  if (idx === 2) return "a true-to-size relaxed fit";
  if (idx === 3) return "a boxy, drop-shoulder relaxed fit with sleeves reaching just past the shoulder line";
  if (idx === 4) return "an oversized fit with dropped shoulders, wider body and sleeves reaching toward the elbow";
  if (idx >= 5) return "a very oversized, baggy fit with long hem and elbow-length sleeves";
  return sizes?.length ? "a relaxed fit" : "a regular fit";
}

function tryOnPrompt(opts: {
  productName: string;
  category: string;
  description?: string;
  colorName: string;
  colorHex: string;
  size: string;
  sizes: string[];
  hasProductImage: boolean;
  garmentView?: "front" | "back";
}): string {
  const garmentType = detectGarmentType(opts.category, opts.productName);
  const isBackView = opts.garmentView === "back";
  const garmentSource = opts.hasProductImage
    ? isBackView
      ? `IMAGE 2 shows the BACK PRINT design of the article "${opts.productName}" (${opts.category}).
Take ONLY the garment and its back graphic print from IMAGE 2 – ignore any model, mannequin, hanger or background.
Reproduce the exact back print artwork, scale, placement, collar ribbing and sleeve drop.`
      : `IMAGE 2 is the store's product photo of the article "${opts.productName}" (${opts.category}).
Take ONLY the garment from IMAGE 2 – ignore any model, mannequin, hanger, background or other clothing in it.
Reproduce its cut, neckline, sleeve length, hem, fabric texture, border, embroidery, print or pattern with accurate placement.`
    : `The article is "${opts.productName}" (${opts.category}). ${opts.description || ""}`.trim();

  let replacementInstruction = isBackView
    ? "Show the SAME miniature figurine turned slightly in a three-quarter or rear-shoulder studio pose so the FULL BACK PRINT graphic from IMAGE 2 is clearly visible across the back of the garment, while preserving natural chibi vinyl proportions and trousers/shoes."
    : "The garment replaces only the figurine's current top. Fabric should drape and fold naturally with soft toy-photography shading.";
  let preserveLine = isBackView
    ? "Keep the figurine's exact hair colour, skin tone, collectible vinyl proportions, trousers, shoes, clean studio background and lighting identical to IMAGE 1."
    : "Keep EVERYTHING else exactly the same as IMAGE 1: face, expression, hair, skin tone, body proportions, pose, trousers, shoes, background, lighting and camera angle.";

  if (garmentType === "saree" && !isBackView) {
    replacementInstruction =
      "Replace the figurine's current outfit completely with this full draped saree: fitted short-sleeve matching blouse, neat waist pleats falling gracefully to the ankles, decorated border/zari detailing, and the pleated pallu draped elegantly over the left shoulder, paired with understated ethnic flat sandals.";
    preserveLine =
      "Keep the figurine's exact face, expression, hair, skin tone, body proportions, standing pose, clean studio background, lighting and camera angle identical to IMAGE 1.";
  } else if (garmentType === "chudidhar" && !isBackView) {
    replacementInstruction =
      "Replace the figurine's outfit with this complete chudidhar set: the kurta/chididhar tunic (matching neckline, sleeve length, embroidery/print), tapered cream or matching churidar trousers with subtle ankle gathers, a sheer draped dupatta across the chest/shoulders, and simple ethnic mojari flats.";
    preserveLine =
      "Keep the figurine's exact face, expression, hair, skin tone, body proportions, standing pose, clean studio background, lighting and camera angle identical to IMAGE 1.";
  } else if (garmentType === "polo" && !isBackView) {
    replacementInstruction =
      "The garment replaces the figurine's current top as a crisp collared knit polo t-shirt (reproducing its ribbed collar, button placket, sleeve cuffs, and knit texture). Keep lower trousers/jeans and sneakers natural.";
  } else if (garmentType === "shirt" && !isBackView) {
    replacementInstruction =
      "The garment replaces the figurine's current top as a crisp collared button-down western shirt (reproducing its collar, button placket, pockets, and sleeve length cleanly). Keep lower trousers/jeans and shoes natural.";
  }

  return `IMAGE 1 is a customer's collectible chibi miniature figurine.
${garmentSource}

Edit IMAGE 1 so the SAME figurine is now wearing this article${isBackView ? " (showcasing the back print)" : ""}:
- Colour: ${opts.colorName} (approx. hex ${opts.colorHex}). If the product photo shows a different colour, recolour the garment to ${opts.colorName} while keeping its weave, border, embroidery, or print.
- Size ${opts.size}: show it as ${fitDescriptor(opts.size, opts.sizes, garmentType)}, scaled to the figurine's chibi proportions.
- ${replacementInstruction}

${preserveLine} Keep the vinyl figurine art style – do not turn it into a real human.
No text overlays, no watermark, no extra figures.`;
}

function fluxTryOnPrompt(opts: {
  productName: string;
  category: string;
  description?: string;
  colorName: string;
  colorHex: string;
  size: string;
  sizes: string[];
  hasProductImage: boolean;
  garmentView?: "front" | "back";
}): string {
  const garmentType = detectGarmentType(opts.category, opts.productName);
  const isBackView = opts.garmentView === "back";
  const garment = opts.hasProductImage
    ? isBackView
      ? `the back print of ${opts.category.toLowerCase()} shown in image 1 ("${opts.productName}"), copying the exact back graphic print, collar and fabric texture; ignore any mannequin or background in image 1`
      : `the ${opts.category.toLowerCase()} shown in image 1 ("${opts.productName}"), copying its cut, neckline, sleeves, border, embroidery, fabric texture and any print or motif with the same placement; ignore any person, mannequin or background in image 1`
    : `${/^[aeiou]/i.test(opts.category) ? "an" : "a"} ${opts.category.toLowerCase()} called "${opts.productName}"${opts.description ? ` (${opts.description.slice(0, 200)})` : ""}`;

  const extraKeep = isBackView
    ? "turn the figurine to showcase the full back graphic print clearly while keeping hair, skin tone, proportions, trousers, shoes, background and lighting identical to image 0"
    : garmentType === "saree"
    ? "wearing the full draped saree with matching blouse, pleated pallu over the left shoulder and ethnic sandals; keep face, hair, skin tone, proportions, pose, background, lighting and camera angle identical to image 0"
    : garmentType === "chudidhar"
    ? "wearing the full chudidhar kurta, fitted churidar trousers, sheer dupatta and mojari flats; keep face, hair, skin tone, proportions, pose, background, lighting and camera angle identical to image 0"
    : "keep the figurine's face, hair, skin tone, body, pose, trousers, shoes, background, lighting and camera angle identical to image 0";

  return `The exact same chibi doll figurine from image 0, now ${
    garmentType === "saree" || garmentType === "chudidhar" ? "dressed in" : "wearing"
  } ${garment}. The garment colour is ${opts.colorName}${opts.colorHex ? ` (${opts.colorHex})` : ""}. Size ${opts.size}: ${fitDescriptor(
    opts.size,
    opts.sizes,
    garmentType
  )}, scaled to the figurine's chibi proportions, with natural folds. ${extraKeep}. Vinyl collectible toy style. No text, no watermark.`;
}

/* ------------------------------------------------------------------ */
/* Routes registration                                                */
/* ------------------------------------------------------------------ */

export function registerStylistRoutes(app: Express, getClient: GetClient, rootDir: string) {
  const referenceDolls: InlineImage[] = [];
  for (const file of ["image_aa6d36c7.png", "reference_doll_2.png"]) {
    const p = path.join(rootDir, "public", "assets", "aistudio", file);
    try {
      if (fs.existsSync(p)) {
        referenceDolls.push({ mimeType: mimeFromExt(p), data: fs.readFileSync(p).toString("base64") });
      }
    } catch {
      console.warn("[stylist] Reference doll image not found at", p);
    }
  }

  /**
   * ENDPOINT 1: POST /api/stylist/create-miniature
   * Body: { photoData, style, build, name, attire }
   */
  app.post("/api/stylist/create-miniature", async (req: Request, res: Response) => {
    const { photoData, style = "streetwear_vinyl", build = "regular", name = "Customer", attire } = req.body || {};
    const outfitAttire = normalizeAttire(attire);
    const client = getClient();

    const isCustomerPhoto = typeof photoData === "string" && photoData.startsWith("data:image");
    if (!photoData || typeof photoData !== "string") {
      return res.status(400).json({ error: "A photo is required to create a miniature." });
    }

    let features = {
      skinTone: "warm medium",
      hairStyle: "natural styled hair",
      hairColor: "dark brown",
      facialVibe: "friendly smile",
      recommendedArchetype:
        outfitAttire === "saree"
          ? "chibi_saree"
          : outfitAttire === "chudidhar"
          ? "chibi_chudidhar"
          : outfitAttire === "western_shirt"
          ? "chibi_women_western"
          : "chibi_male",
      stylingNotes:
        outfitAttire === "saree"
          ? "Balanced poise that showcases bordered pleats and graceful pallu drapes. Jewel tones and metallic zari accents flatter this silhouette."
          : outfitAttire === "chudidhar"
          ? "Clean vertical proportions ideal for embroidered kurtas and sheer dupattas. Soft pastels and rich terracotta shades highlight your complexion."
          : outfitAttire === "western_shirt"
          ? "Structured shoulder line suited to crisp button-down shirts and relaxed western silhouettes. Clean neutrals and muted earth tones wear effortlessly."
          : "Balanced proportions that carry both relaxed and boxy cuts well. Try a drop-shoulder tee or crisp shirt tailored to your preferred drape.",
    };

    // Parallel Task A: Text model feature extraction
    const featuresTask = (async () => {
      if (!client || !isCustomerPhoto) return;
      const img = parseDataUrl(photoData);
      if (!img) return;
      try {
        const parsed = await generateJson(client, [
          { inlineData: img },
          {
            text: `Describe this shopper for a clothing stylist (shop carries Men's & Women's Western Tees, Shirts, Sarees, and Chudidhars). Return ONLY JSON with keys:
"skinTone" (e.g. "fair", "warm ivory", "golden tan", "deep brown"),
"hairStyle" (short phrase), "hairColor" (short phrase),
"facialVibe" (short phrase about expression),
"recommendedArchetype" (one of "chibi_male","chibi_fem","chibi_urban","chibi_saree","chibi_chudidhar","chibi_women_western"),
"stylingNotes" (2 short sentences: which silhouettes—western tees/shirts or ethnic sarees/chudidhars—and colours would flatter them and why).
Do not guess age, ethnicity, religion or any sensitive attribute.`,
          },
        ]);
        features = { ...features, ...parsed };
      } catch (e) {
        console.warn("[stylist] feature extraction fallback:", cleanGeminiError(e));
      }
    })();

    // Parallel Task B: Image generation
    const imageTask = (async () => {
      if (!isCustomerPhoto) return { dataUrl: photoData, model: "preset", generated: false as const };
      const photo = parseDataUrl(photoData)!;
      const started = Date.now();
      const [mainRef, secondRef] = referenceDolls;
      const fluxImages = mainRef ? [mainRef, photo, ...(secondRef ? [secondRef] : [])] : [photo];
      const attempts: any[] = [];

      for (let attempt = 0; attempt < 2; attempt++) {
        const strong = attempt > 0;
        const parts: Part[] = [{ inlineData: photo }];
        for (const ref of referenceDolls) parts.push({ inlineData: ref });
        parts.push({
          text:
            (strong ? "IMPORTANT: the previous result was just the original photo. The output MUST be a toy figurine, not a photo of a person.\n\n" : "") +
            miniaturePrompt(style, build, referenceDolls.length, outfitAttire),
        });

        const out = await makeImage(client, {
          geminiParts: parts,
          fluxImages,
          fluxPrompt: mainRef
            ? fluxMiniaturePrompt(style, build, Boolean(secondRef), strong, outfitAttire)
            : fluxMiniaturePrompt(style, build, false, strong, outfitAttire).replace(/image 0/g, "a collectible chibi vinyl toy"),
          seed: Math.floor(Math.random() * 2_000_000_000),
        });

        const generated = parseDataUrl(out.dataUrl);
        const diff = generated ? await imageDifference(generated, photo) : 255;
        attempts.push({ model: out.model, differenceFromPhoto: Math.round(diff) });
        console.log(`[stylist] miniature attempt ${attempt + 1} via ${out.model}: difference = ${diff.toFixed(1)}`);

        if (diff >= UNCHANGED_THRESHOLD) {
          lastRuns.miniature = { ok: true, attempts, ms: Date.now() - started, at: new Date().toISOString() };
          return { ...out, generated: true as const };
        }
      }

      lastRuns.miniature = { ok: false, attempts, ms: Date.now() - started, at: new Date().toISOString() };
      throw new ImageGenError(
        "The AI returned your photo unchanged instead of a miniature figurine. Try a clear front-facing portrait with a plain background.",
        "no_image"
      );
    })();

    const [, imageResult] = await Promise.allSettled([featuresTask, imageTask]);

    let miniatureImageUrl = "";
    let isAiGenerated = false;
    let imageModel: string | undefined;
    let imageError: string | undefined;
    let imageErrorCode: string | undefined;

    if (imageResult.status === "fulfilled") {
      miniatureImageUrl = imageResult.value.dataUrl;
      isAiGenerated = imageResult.value.generated;
      imageModel = imageResult.value.model;
    } else {
      const err = imageResult.reason;
      imageError = err?.message || "Could not generate the miniature image.";
      imageErrorCode = err instanceof ImageGenError ? err.code : "api_error";
      console.warn("[stylist] miniature generation failed:", imageError);
      lastRuns.miniature = { ...(lastRuns.miniature || {}), ok: false, error: imageError, at: new Date().toISOString() };

      if (/billing|free tier|not available for this project/i.test(imageError)) {
        imageError = "Gemini image generation requires a billing-enabled Google AI Studio project. To generate images for free without billing, configure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in your environment. We have assigned your collectible reference miniature figurine so you can explore outfits and get instant fit verdicts!";
        imageErrorCode = "billing_required";
      }

      // Fallback to category-appropriate preset collectible figurine so user is never blocked
      miniatureImageUrl =
        outfitAttire === "saree"
          ? "/src/assets/images/chibi_mini_saree_1794637741280.jpg"
          : outfitAttire === "chudidhar"
          ? "/src/assets/images/chibi_mini_chudidhar_1794637742242.jpg"
          : outfitAttire === "western_shirt"
          ? "/src/assets/images/chibi_mini_women_western_1794637743041.jpg"
          : "/assets/aistudio/image_aa6d36c7.png";
    }

    return res.status(200).json({
      success: true,
      imageError,
      imageErrorCode,
      miniature: {
        id: `mini_${Date.now().toString(36)}`,
        name: name || "Customer",
        userPhotoUrl: photoData,
        miniatureImageUrl,
        isAiGenerated,
        imageModel,
        style,
        build,
        outfitAttire,
        ...features,
        createdAt: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      },
    });
  });

  /**
   * ENDPOINT 2: POST /api/stylist/try-on
   * Body: { miniatureImage, productImage, product, color, size }
   */
  app.post("/api/stylist/try-on", async (req: Request, res: Response) => {
    const { miniatureImage, productImage, product, color, size = "M", garmentView = "front" } = req.body || {};
    if (!miniatureImage || !product?.name) {
      return res.status(400).json({ error: "miniatureImage and product are required." });
    }

    const [mini, garment] = await Promise.all([
      loadImage(miniatureImage, rootDir),
      loadImage(productImage, rootDir),
    ]);

    if (!mini) {
      return res.status(400).json({ error: "Could not read the miniature image." });
    }

    const promptOpts = {
      productName: String(product.name),
      category: String(product.category || "T-shirt"),
      description: product.description ? String(product.description).slice(0, 400) : undefined,
      colorName: color?.name || "the shown colour",
      colorHex: color?.hex || "",
      size: size || "M",
      sizes: Array.isArray(product.sizes) ? product.sizes : [],
      hasProductImage: Boolean(garment),
      garmentView: garmentView === "back" ? ("back" as const) : ("front" as const),
    };

    const parts: Part[] = [{ inlineData: mini }];
    if (garment) parts.push({ inlineData: garment });
    parts.push({ text: tryOnPrompt(promptOpts) });

    try {
      const out = await makeImage(getClient(), {
        geminiParts: parts,
        fluxImages: garment ? [mini, garment] : [mini],
        fluxPrompt: fluxTryOnPrompt(promptOpts),
      });
      lastRuns.tryOn = { ok: true, model: out.model, usedProductPhoto: Boolean(garment), at: new Date().toISOString() };
      return res.json({ imageUrl: out.dataUrl, model: out.model, usedProductPhoto: Boolean(garment) });
    } catch (err: any) {
      lastRuns.tryOn = { ok: false, error: err?.message, usedProductPhoto: Boolean(garment), at: new Date().toISOString() };
      const code = err instanceof ImageGenError ? err.code : "api_error";
      let errMsg = err?.message || "Virtual try-on preview could not be generated.";
      if (/billing|free tier|not available for this project/i.test(errMsg)) {
        errMsg = "Live AI garment generation requires a billing-enabled Gemini API project or free Cloudflare Workers AI credentials. Sizing and styling recommendations remain active!";
      }
      return res.status(code === "no_key" ? 503 : 200).json({
        imageUrl: null,
        error: errMsg,
        code: /billing/i.test(errMsg) ? "billing_required" : code,
        isFallback: true,
      });
    }
  });

  /**
   * Health and Status Endpoint
   * GET /api/stylist/status
   */
  app.get("/api/stylist/status", (_req: Request, res: Response) => {
    res.json({
      imageEngine: imageProvider(),
      cloudflareConfigured: cloudflareConfigured(),
      cloudflareModel: process.env.CLOUDFLARE_IMAGE_MODEL?.trim() || "@cf/black-forest-labs/flux-2-klein-4b",
      geminiKeyPresent: Boolean(getClient()),
      referenceDollsLoaded: referenceDolls.length,
      textModels: TEXT_MODELS,
      lastRuns,
    });
  });

  /**
   * ENDPOINT 3: POST /api/stylist/analyze-fit
   * Body: { product, selectedColor, selectedSize, miniature, tryOnImage }
   */
  app.post("/api/stylist/analyze-fit", async (req: Request, res: Response) => {
    const { product, selectedColor, selectedSize, miniature, tryOnImage } = req.body || {};
    if (!product) return res.status(400).json({ error: "Product is required." });

    const colorName = selectedColor || "this colour";
    const size = selectedSize || "L";
    const garmentType = detectGarmentType(String(product.category || ""), String(product.name || ""));

    let verdict =
      garmentType === "saree"
        ? {
            fitScore: 86,
            matchLevel: "Graceful Heritage Drape",
            silhouetteDrape: `The ${size} saree fall and structured pleats frame the miniature gracefully with an effortless pallu drape.`,
            colorSynergy: `${colorName} brings luminous warmth and crisp contrast against your skin tone and hair.`,
            stylistAdvice: `Pair "${product.name}" in ${colorName} with a tailored boat-neck or elbow-sleeve blouse to anchor the border work.`,
            recommendedPairings: {
              bottoms: "Matching satin or cotton-silk petticoat underskirt for clean pleats.",
              footwear: "Kitten-heel ethnic sandals or embroidered kolhapuris.",
              accessories: "Gold jhumkas, stacked bangles, and a structured potli clutch.",
            },
            isEstimate: true,
            basedOnPreview: false,
          }
        : garmentType === "chudidhar"
        ? {
            fitScore: 85,
            matchLevel: "Refined Chudidhar Silhouette",
            silhouetteDrape: `Size ${size} gives a clean, comfortable kurta line paired with tapered churidar gathers and an airy dupatta.`,
            colorSynergy: `${colorName} harmonizes naturally with your complexion and keeps the embroidery crisp.`,
            stylistAdvice: `"${product.name}" flatters your proportions cleanly—drape the dupatta over one shoulder or pleated down the front for balance.`,
            recommendedPairings: {
              bottoms: "Fitted churidar trousers with subtle ankle churis (included silhouette).",
              footwear: "Embroidered leather mojaris or metallic strap flats.",
              accessories: "Oxidized silver chandbalis and a minimal sling or potli bag.",
            },
            isEstimate: true,
            basedOnPreview: false,
          }
        : garmentType === "shirt"
        ? {
            fitScore: 84,
            matchLevel: "Sharp Western Shirt Fit",
            silhouetteDrape: `Size ${size} delivers a structured collar and clean shoulder seam that works tucked in or worn open.`,
            colorSynergy: `${colorName} gives a crisp, versatile contrast against your hair and skin tone.`,
            stylistAdvice: `Wear "${product.name}" half-tucked or with rolled cuffs for an effortless modern western silhouette.`,
            recommendedPairings: {
              bottoms: "Straight-cut indigo denim, tailored chinos, or pleated trousers.",
              footwear: "Clean leather sneakers, loafers, or ankle boots.",
              accessories: "Slim leather belt, analog wristwatch, and minimal ring.",
            },
            isEstimate: true,
            basedOnPreview: false,
          }
        : {
            fitScore: 82,
            matchLevel: "Great Western Tee Drape",
            silhouetteDrape: `The combed cotton knit delivers a structured, breathable drape in size ${size}.`,
            colorSynergy: `${colorName} provides a versatile, natural balance with your skin tone and hair.`,
            stylistAdvice: `Size ${size} on "${product.name}" gives your miniature a clean posture. Pair with relaxed bottoms for balanced proportions.`,
            recommendedPairings: {
              bottoms: "Wide-leg washed denim, straight jeans, or relaxed cargo trousers.",
              footwear: "Retro runners or clean low-top classics.",
              accessories: "Minimalist chain, layered watch, or compact crossbody bag.",
            },
            isEstimate: true,
            basedOnPreview: false,
          };

    const client = getClient();
    if (!client) {
      return res.json({ verdict });
    }

    try {
      const look = tryOnImage ? parseDataUrl(tryOnImage) : null;
      const prompt = `You are "DEN AI", an honest expert fashion stylist for THREAD DEN (specializing in Men's & Women's Western Tees, Western Shirts, Sarees, and Chudidhars). ${
        look
          ? "Look at the attached image: it shows the customer's personal miniature figurine WEARING the article. Judge what you actually see."
          : "No try-on preview image is available; evaluate based on product specs and customer profile."
      }
Article: "${product.name}" (${product.category || "Apparel"}), colour "${colorName}", size "${size}".
Customer profile: skin tone ${miniature?.skinTone || "natural"}, hair ${miniature?.hairColor || "dark"} ${miniature?.hairStyle || ""}, build ${miniature?.build || "regular"}.

Tailor your advice to the garment type (for Sarees mention blouse/pleats/pallu & jewellery; for Chudidhars mention kurta/churidar/dupatta & mojaris; for Shirts mention collar/tuck/trousers; for Western Tees mention shoulder drape/proportion). Be honest and genuinely useful. If the colour washes them out or the size looks awkward, say so clearly and suggest a better colour or size from the product's options:
Colours: ${(product.colors || []).map((c: any) => c.name).join(", ") || colorName}
Sizes: ${(product.sizes || []).join(", ") || size}

Return ONLY valid JSON with keys:
{
  "fitScore": integer between 0 and 100 (honest assessment; only 85+ for truly exceptional matches),
  "matchLevel": short phrase (e.g. "Graceful Festive Drape", "Sharp Western Tailoring", "Outstanding Boxy Drape"),
  "silhouetteDrape": 1 sentence describing how the cut, drape, and size sit on the frame,
  "colorSynergy": 1 sentence on the garment colour vs the customer's skin and hair,
  "stylistAdvice": 2 sentences of actionable advice (suggest better colour/size or styling tweak if needed),
  "recommendedPairings": {
    "bottoms": "recommended petticoat/churidar/pants/jeans depending on garment",
    "footwear": "recommended sandals/mojaris/heels/sneakers depending on garment",
    "accessories": "recommended jewellery/belt/bag/watch"
  }
}`;

      const parts: Part[] = look ? [{ inlineData: look }, { text: prompt }] : [{ text: prompt }];
      const parsed = await generateJson(client, parts);

      if (parsed) {
        verdict = {
          ...verdict,
          ...parsed,
          isEstimate: false,
          basedOnPreview: Boolean(look),
        };
        verdict.fitScore = Math.max(0, Math.min(100, Math.round(Number(verdict.fitScore) || 80)));
      }
    } catch (e) {
      console.warn("[stylist] analyze-fit AI evaluation fallback:", cleanGeminiError(e));
    }

    return res.json({ verdict });
  });
}
