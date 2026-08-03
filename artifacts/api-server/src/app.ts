import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { feedsRouter } from "./routes/merchantFeed";
import clerkWebhookRouter from "./routes/clerkWebhook";
import wooWebhookRouter from "./routes/wooWebhook";
import stripeWebhookRouter from "./routes/stripeWebhook";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import { logger } from "./lib/logger";
import { resolveStoreLogContext } from "./lib/wooStore";

const app: Express = express();

// Trust the single reverse-proxy hop in front of this service (Replit's
// shared proxy). This ensures req.ip reflects the real client IP taken from
// the validated x-forwarded-for chain, which the rate limiters key on.
// Without this, req.ip would be the proxy address and all clients would share
// one rate-limit bucket; with it, clients cannot spoof the header to bypass
// per-IP limits (only the proxy-appended rightmost hop is trusted).
app.set("trust proxy", 1);

// Universal noindex protection — the first middleware mounted so it applies to
// every HTTP response without exception, including the Clerk proxy, webhook
// handlers, static assets, and all API routes. This keeps the ops.presentail.com
// admin deployment out of Google's index. The header is also harmless on pure
// JSON API responses (Googlebot does not index raw API payloads).
app.use((_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});

// robots.txt — served at the root so that ops.presentail.com/robots.txt
// instructs all compliant crawlers (including Googlebot) to disallow the entire
// site. Mounted immediately after the noindex middleware so the response also
// carries the X-Robots-Tag header set above.
app.get("/robots.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.end("User-agent: *\nDisallow: /\n");
});

app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({
      store: resolveStoreLogContext(req),
    }),
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk Frontend API proxy. No-op outside production / when CLERK_SECRET_KEY
// is unset. Must run BEFORE any body parser because the proxy streams raw
// bytes to Clerk.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Clerk webhook: Svix verifies the signature against the exact raw bytes,
// so we mount this BEFORE `express.json()`. The handler reads the raw
// Buffer from `req.body`.
app.use(
  "/api/clerk/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  clerkWebhookRouter,
);

// WooCommerce order webhook: HMAC-SHA256 is computed over the raw request
// bytes, so this must also be mounted BEFORE `express.json()`.
app.use(
  "/api/woo/webhook/order",
  express.raw({ type: "application/json", limit: "1mb" }),
  wooWebhookRouter,
);

// Presentail OS webhook: HMAC-SHA256 is computed over the raw request bytes.
// Install raw body parsing specifically for this path BEFORE express.json()
// so the route handler receives a Buffer in req.body. body-parser sets
// req._body = true after parsing, which causes express.json() to skip it.
app.use("/api/os/webhook", express.raw({ type: "application/json", limit: "1mb" }));

// Stripe webhook: signature verification requires the raw request bytes.
// Must be mounted BEFORE express.json() for the same reason as above.
// The handler supports both the main (LB/CY) and gulf (AE) Stripe accounts —
// it tries STRIPE_WEBHOOK_SECRET first, then STRIPE_WEBHOOK_SECRET_GULF.
app.use(
  "/api/stripe/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  stripeWebhookRouter,
);

// Compress all JSON/text API responses. Skips responses < 1 kB (threshold)
// and content types that are already binary-compressed (images, audio, video,
// zip archives) to avoid wasting CPU on incompressible data.
app.use(
  compression({
    threshold: 1024,
    filter(req, res) {
      const contentType = res.getHeader("Content-Type");
      if (typeof contentType === "string") {
        if (/^image\/|^audio\/|^video\/|application\/(zip|gzip|x-brotli|octet-stream|pdf)/.test(contentType)) {
          return false;
        }
      }
      return compression.filter(req, res);
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach `req.auth` for every downstream handler. Uses the publishable +
// secret keys from the environment. When CLERK_SECRET_KEY is missing or
// obviously invalid, mounting `clerkMiddleware()` directly would throw
// "Missing Clerk Secret Key" on EVERY request and 500 even fully public
// endpoints (e.g. /api/woo/products, /api/homepage/categories). Install a
// no-op shim instead so legacy WP/social JWT flows keep working and the
// `getAuth(req)` call sites — which already null-check / try-catch — see a
// signed-out auth object.
const clerkSecret = process.env.CLERK_SECRET_KEY;
if (clerkSecret && /^sk_(test|live)_/.test(clerkSecret)) {
  app.use(clerkMiddleware());
} else {
  if (process.env.NODE_ENV !== "test") {
    logger.warn(
      "CLERK_SECRET_KEY is not set (or not an sk_test_/sk_live_ key); " +
        "Clerk middleware disabled. Authenticated routes will behave as " +
        "signed-out for Clerk sessions.",
    );
  }
  app.use((req, _res, next) => {
    // Shape mirrors @clerk/express's signed-out AuthObject for the fields
    // we read (`userId`, `sessionClaims`).
    (req as unknown as { auth: () => unknown }).auth = () => ({
      userId: null,
      sessionClaims: null,
    });
    next();
  });
}

// Static assets used by the homepage rails (e.g. fallback category
// images). Resolved relative to the bundled server's __dirname so the
// `dist/public/` directory copied by build.mjs is found in production,
// and the development build path resolves the same way.
app.use(
  "/api/assets",
  express.static(path.join(__dirname, "public"), {
    maxAge: "7d",
    immutable: false,
    fallthrough: false,
  }),
);

// Product feed endpoints — served at /feeds (not under /api)
// so GMC can access https://presentail.com/feeds/google-merchant/lb.xml directly.
app.use("/feeds", feedsRouter);

app.use("/api", router);

// Any request reaching this middleware hit /api but matched NO route above —
// the 404 originates from OUR backend, not an upstream provider. Logging it
// at WARN makes it easy to distinguish from upstream-provider 404s in logs.
app.use("/api", (req, res) => {
  // Optional chaining: req.log is always present in production (pino-http is
  // mounted above), but bare express() test harnesses may not attach it.
  req.log?.warn(
    { method: req.method, frontendRequestUrl: req.originalUrl, backendRouteMatched: false },
    "API route not matched — backend-origin 404",
  );
  res.status(404).json({ ok: false, code: "route_not_found", message: "API route not found" }); // i18n-ignore
});

export default app;
