import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import clerkWebhookRouter from "./routes/clerkWebhook";
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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach `req.auth` for every downstream handler. Uses the publishable +
// secret keys from the environment. With no key configured `getAuth(req)`
// simply returns `{ userId: null }` so legacy WP/social JWT flows keep
// working unchanged during the migration.
app.use(clerkMiddleware());

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

app.use("/api", router);

export default app;
