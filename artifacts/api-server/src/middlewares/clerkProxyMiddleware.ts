/**
 * Clerk Frontend API same-origin proxy.
 *
 * Mounted at `/api/__clerk` so the web app can talk to Clerk via its own
 * domain (avoids third-party-cookie restrictions in production). Disabled
 * automatically outside production or when CLERK_SECRET_KEY is unset.
 * Must be mounted BEFORE express.json() because the proxy streams raw bytes.
 */

import { createProxyMiddleware } from "http-proxy-middleware";
import type { RequestHandler } from "express";
import type { IncomingHttpHeaders } from "http";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

export function getClerkProxyHost(req: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstHop = raw?.split(",")[0]?.trim();
  return firstHop || req.headers.host?.trim() || undefined;
}

export function clerkProxyMiddleware(): RequestHandler {
  if (process.env.NODE_ENV !== "production") {
    return (_req, _res, next) => next();
  }
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return (_req, _res, next) => next();
  }
  return createProxyMiddleware({
    target: CLERK_FAPI,
    changeOrigin: true,
    pathRewrite: (p: string) =>
      p.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq: (proxyReq, req) => {
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = getClerkProxyHost(req) || "";
        proxyReq.setHeader(
          "Clerk-Proxy-Url",
          `${protocol}://${host}${CLERK_PROXY_PATH}`,
        );
        proxyReq.setHeader("Clerk-Secret-Key", secretKey);
        const xff = req.headers["x-forwarded-for"];
        const clientIp =
          (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
          req.socket?.remoteAddress ||
          "";
        if (clientIp) proxyReq.setHeader("X-Forwarded-For", clientIp);
      },
    },
  }) as RequestHandler;
}
