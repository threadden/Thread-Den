# THREAD DEN — Apparel Storefront & Reseller Platform

Full-stack streetwear and apparel e-commerce storefront with separated **Men's** and **Women's** collections, an interactive **AI Miniature Stylist** (virtual try-on + fit verdict), **Razorpay** billing (UPI, Cards, and Cash on Delivery), automated **PDF tax invoice** generation and WhatsApp/Email dispatch, and a locked **Merchant Admin Hub** backed by **Firebase Firestore**.

---

## Features

- **Brand Intro & Storefront Experience**:
  - 5-second animated black-screen logo reveal (`IntroSplash`) on initial page load.
  - Separated **Men's** and **Women's** collections across catalog sections, category filters, product cards, detail modals, and Merchant Hub management.
  - Real-time price-range filtering, search, wishlist/saved items, price-drop alerts, dark/light theme toggle, and customer reviews linked with profiles.
- **Customer & Admin Authentication**:
  - Dedicated **Login** and **Sign Up** flows in `AuthModal`.
  - Customers authenticate strictly via **Phone Number + Password** or **Email ID + Password** (no customer username).
  - Separate **Merchant Admin Hub** login (`admins/admin`) protecting catalog, stock, order management, analytics, reseller calculator, and manual review publishing.
- **Checkout, Razorpay Gateway & PDF Invoicing**:
  - Collects verified customer details before proceeding to **COD**, **UPI Payments**, or **Cards**.
  - Supports Razorpay Orders & Checkout (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`), exact-amount UPI QR/Intent (`MERCHANT_UPI_VPA`), and `razorpay.me` fallback (`RAZORPAY_ME_URL`), plus webhook/gateway polling verification.
  - Automatically generates official PDF tax invoices (client-side `jspdf` / `jspdf-autotable` and server-side `pdfkit`) with HMAC-signed download URLs (`/api/bills/:billNumber.pdf?token=...`) and dispatches confirmations via **WhatsApp** (Meta Cloud API / Twilio), **SMS** (Twilio / Fast2SMS), and **Email** (pooled Nodemailer SMTP / Resend).
- **AI Stylist & Virtual Try-On (`DEN AI`)**:
  - Multi-turn styling, sizing, and reseller advisor (`/api/chat` via `@google/genai`).
  - Customer collectible miniature avatar generation, garment virtual try-on (front & back print views), and fit scoring (`/api/stylist/*`, supporting Cloudflare Workers AI FLUX.2 Klein and Google Gemini image models).
- **Security & Memory Hardening**:
  - Strict production `Content-Security-Policy` (no `'unsafe-inline'` or `'unsafe-eval'`), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` in `apiApp.ts`, `public/_headers`, and `netlify.toml`.
  - Bounded in-memory caches and TTL pruning for PDF bills and Razorpay sessions, pooled SMTP transport, scoped JSON body size limits (`1MB` default, `10MB` for image/PDF upload routes), `15s`–`90s` external/AI request timeouts, and clean client resource cleanup (`AudioContext`, camera `MediaStream`, intervals).

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS 4, Motion, Lucide Icons, Recharts / D3
- **Backend**: Node.js, Express 4 (`apiApp.ts` & `server.ts`, Netlify Functions entrypoint at `netlify/server/index.ts`)
- **Database**: Firebase Firestore (`firebase-blueprint.json`, `firestore.rules`, `src/firebase.ts`)
- **Payments & Documents**: Razorpay API, `jspdf`, `jspdf-autotable`, `pdfkit`, `qrcode`
- **AI & Media**: `@google/genai`, `jimp`, Cloudflare Workers AI (optional image engine)
- **Messaging**: `nodemailer` (SMTP), Resend API, Meta WhatsApp Cloud API, Twilio, Fast2SMS

---

## Project Structure

```text
├── apiApp.ts                 # Shared Express app (security headers, scoped limits, API routes, error handler)
├── server.ts                 # Dev/prod HTTP server mounting Vite middleware or static dist/
├── netlify/server/index.ts   # Netlify Functions wrapper exporting apiApp for /api/*
├── razorpayRoutes.ts         # Razorpay order creation, hosted links, webhooks, gateway polling & verification
├── pdfInvoice.ts             # PDFKit invoice generator, bounded memory/disk store & token-protected route
├── notificationRoutes.ts     # Order dispatch & bill delivery (Email/SMTP/Resend, WhatsApp, SMS)
├── stylistRoutes.ts          # AI miniature creation, garment try-on & fit analysis endpoints
├── firebase-blueprint.json   # Firestore entity schemas (User, Product, Order, Admin, Review)
├── firestore.rules           # Firestore security rules
├── netlify.toml              # Netlify build, headers, caching & SPA redirect config
├── public/_headers           # Static security & cache headers
└── src/
    ├── App.tsx               # Storefront state, real-time Firestore sync & collection views
    ├── firebase.ts           # Firestore SDK helpers, queries & migrations
    ├── data.ts               # Default catalog (Men's & Women's), categories & defaults
    ├── types.ts              # Shared TypeScript interfaces
    ├── utils/                # Client PDF invoice generator (jspdf)
    └── components/           # UI modals, cart/checkout, AI Stylist, Merchant Portal & charts
```

---

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` (or set values in **Settings > Secrets**) and configure only the integrations you need:

| Variable | Purpose |
| :--- | :--- |
| `GEMINI_API_KEY` | Gemini API key for `DEN AI` chat & fit analysis |
| `APP_URL` | Public base URL used in callback and PDF invoice links |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Optional free-tier Cloudflare Workers AI image generation (`stylistRoutes.ts`) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay Orders, Hosted Payment Links & signature/API verification |
| `MERCHANT_UPI_VPA`, `RAZORPAY_ME_URL` | Exact-amount UPI QR/Intent and `razorpay.me` fallback link |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Automated SMTP email & PDF attachment delivery |
| `RESEND_API_KEY`, `RESEND_FROM` | Alternative Resend email API with PDF attachments |
| `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Cloud API (order text + PDF document) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM` | Twilio WhatsApp & SMS order notifications |
| `FAST2SMS_API_KEY` | Alternative Fast2SMS order confirmation delivery |

> Never commit `.env` or `.env.local` files or expose server secrets to client-side `VITE_*` variables.

### 3. Run Locally

```bash
npm run dev
```

Starts the Express + Vite server at `http://localhost:3000`.

### 4. Type-Check, Build & Production Run

```bash
npm run lint     # Run TypeScript check (tsc --noEmit)
npm run build    # Build client bundle into dist/
npm start        # Run server in production mode via tsx server.ts
```

---

## API Endpoints Overview

- `GET /api/health` — Server health check
- `POST /api/chat` — Multi-turn styling, sizing & reseller assistant
- `POST /api/stylist/create-miniature` — Generate customer chibi miniature
- `POST /api/stylist/try-on` — Virtual garment try-on on customer miniature
- `POST /api/stylist/analyze-fit` — Fit score & styling recommendations
- `GET /api/stylist/status` — Active AI Stylist engine & model diagnostics
- `GET /api/payments/razorpay/config` — Public Razorpay checkout capability status
- `POST /api/payments/razorpay/create-order` — Initiate Razorpay order / payment link / UPI session
- `GET /api/payments/razorpay/gateway-status/:orderId` — Poll gateway confirmation status
- `POST /api/payments/razorpay/verify` — Verify Razorpay signature / payment ID & trigger bill dispatch
- `POST /api/payments/razorpay/webhook` — Official Razorpay webhook receiver
- `POST /api/bills/pdf` — Generate and stream/download PDF invoice
- `GET /api/bills/:billNumber.pdf?token=...` — Serve stored PDF invoice with HMAC token verification
- `GET /api/integrations/status` — Configured status of Email, WhatsApp & SMS providers
- `POST /api/notifications/order-dispatch` — Dispatch WhatsApp, SMS & Email with PDF invoice
- `POST /api/notifications/send-bill` — Send or resend official PDF tax invoice email
