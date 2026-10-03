/**
 * URL-building helpers for server-issued redirect Location headers and
 * request-derived origins in serve.mjs.
 *
 * Kept in a standalone module so the logic can be unit-tested without booting
 * the HTTP server.
 */

/**
 * Strip a default port (:443 or :80) from a Host header value.
 *
 * Behind the Google Frontend / Replit Autoscale proxy the Host or
 * X-Forwarded-Host header can arrive as "presentail.com:443". Echoing that
 * into an absolute Location / canonical URL yields "https://presentail.com:443/…",
 * which is a distinct URL string from the canonical one. Non-default ports
 * (e.g. "localhost:24188" in dev) are kept so local redirects still work.
 *
 * @param {string} host  e.g. "www.presentail.com:443"
 * @returns {string}     e.g. "www.presentail.com"
 */
export function stripDefaultPort(host) {
  return String(host ?? "").trim().replace(/:(?:443|80)$/, "");
}

/**
 * Build `${proto}://${host}` with any default port removed from the host.
 *
 * @param {string} proto  "https" or "http"
 * @param {string} host   Host header value, possibly with a port.
 * @returns {string}      e.g. "https://presentail.com"
 */
export function buildRequestOrigin(proto, host) {
  return `${proto}://${stripDefaultPort(host)}`;
}

/**
 * Remove a default port from an absolute origin such as
 * "https://presentail.com:443". Unparseable input is returned trimmed.
 *
 * @param {string} origin
 * @returns {string}
 */
export function normalizeOrigin(origin) {
  const trimmed = String(origin ?? "").trim();
  try {
    // URL#origin drops the scheme's default port (443 for https, 80 for http).
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

/**
 * Query parameters that legacy WordPress / WooCommerce redirects deliberately
 * forward to the new canonical URL. Intentionally empty: no legacy query
 * parameter has a meaning on the current storefront, and forwarding unknown
 * params (nsl_bypass_cache, orderby, min_price, add-to-cart, …) creates
 * duplicate crawlable variants of canonical pages. Add a name here only when
 * the destination route genuinely consumes it.
 */
export const LEGACY_REDIRECT_ALLOWED_PARAMS = new Set();

/**
 * Filter a search string down to LEGACY_REDIRECT_ALLOWED_PARAMS.
 *
 * @param {string} search  e.g. "?nsl_bypass_cache=1"
 * @param {ReadonlySet<string>} [allowed]
 * @returns {string}       "" when nothing survives, else "?key=val&…"
 */
export function filterLegacyRedirectSearch(
  search,
  allowed = LEGACY_REDIRECT_ALLOWED_PARAMS,
) {
  if (!search || allowed.size === 0) return "";
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of [...params.keys()]) {
    if (!allowed.has(key)) params.delete(key);
  }
  const result = params.toString();
  return result ? `?${result}` : "";
}
