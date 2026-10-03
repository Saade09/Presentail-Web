/**
 * Host-scoped exemption from the universal `X-Robots-Tag: noindex, nofollow`
 * header set in app.ts.
 *
 * The api-server serves both the ops.presentail.com admin deployment and the
 * public storefront's /api routes. The blanket noindex keeps the admin
 * deployment out of Google's index, but it also de-indexed the storefront's
 * public product images — which the apex robots.txt explicitly Allows and
 * which Product JSON-LD / og:image point at. Only those image endpoints, and
 * only on the canonical public host, are exempt. Every other host (ops,
 * Replit previews, unknown/missing Host) and every other path fails closed to
 * noindex.
 */

import type { NextFunction, Request, Response } from "express";

export const PUBLIC_IMAGE_HOSTS: ReadonlySet<string> = new Set([
  "presentail.com",
  "www.presentail.com",
]);

const EXEMPT_IMAGE_PATH_PREFIXES = [
  "/api/catalog/product-image/",
  "/api/og-image/product/",
] as const;

const EXEMPT_IMAGE_EXACT_PATHS = new Set(["/api/img/proxy"]);

function normalizeHost(host: string | null | undefined): string | null {
  if (typeof host !== "string") return null;
  let value = host.trim().toLowerCase();
  if (!value) return null;
  // Strip a port suffix ("presentail.com:443"). Bracketed IPv6 literals are
  // never public image hosts, so they simply fail the set lookup below.
  const colon = value.lastIndexOf(":");
  if (colon > 0 && !value.includes("]")) value = value.slice(0, colon);
  if (value.endsWith(".")) value = value.slice(0, -1);
  return value || null;
}

/**
 * True when the response for `pathname` on `host` should NOT receive the
 * universal noindex header. `pathname` must exclude the query string
 * (pass `req.path`, never `req.originalUrl`).
 */
export function shouldExemptFromNoindex(
  host: string | null | undefined,
  pathname: string | null | undefined,
): boolean {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost || !PUBLIC_IMAGE_HOSTS.has(normalizedHost)) return false;
  if (typeof pathname !== "string" || !pathname) return false;
  if (EXEMPT_IMAGE_EXACT_PATHS.has(pathname)) return true;
  return EXEMPT_IMAGE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Express middleware: sets `X-Robots-Tag: noindex, nofollow` on every
 * response except the host-scoped public image exemption above.
 * `req.hostname` honours the validated forwarded host because app.ts sets
 * `trust proxy`; an undefined hostname fails closed to noindex.
 */
export function universalNoindexMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!shouldExemptFromNoindex(req.hostname, req.path)) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  }
  next();
}
