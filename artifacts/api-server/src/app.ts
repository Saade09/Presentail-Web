import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
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
    // Add the resolved WooCommerce store routing context to every
    // auto-emitted request completion log line. `country` reflects the
    // regional WooCommerce instance the resolver actually picked (after
    // applying fallback rules), and `city` is the recognized routing city
    // id when one was supplied. Using `customProps` ensures the field
    // lands on the line pino-http itself emits (independent of whether
    // handlers ever touch `req.log`), so QA/support can confirm which
    // regional store served any request without re-deriving it from
    // headers. Only routing context is added — no PII, secrets, or
    // credentials.
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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
