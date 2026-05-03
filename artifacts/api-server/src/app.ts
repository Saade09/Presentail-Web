import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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

app.use("/api", router);

export default app;
