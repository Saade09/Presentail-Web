/**
 * Tracking-parameter stripping helpers for server-issued HTTP redirects.
 *
 * Server-side 301/302 Location headers must never carry tracking query
 * parameters (utm_*, srsltid, fbclid, …) because:
 *   - It makes tracking IDs appear in indexed canonical URLs.
 *   - Analytics tools double-count sessions when an ID survives a redirect.
 *   - It can expose ad-platform click IDs to third-party destination servers.
 *
 * These helpers are used by serve.mjs for every redirect it issues so that
 * the Location header always contains a clean, tracking-free URL.
 */

/**
 * Query-parameter name prefixes whose members are always tracking params.
 * Checked with String.prototype.startsWith().
 */
export const TRACKING_PREFIXES = ["utm_", "hsa_"];

/**
 * Exact query-parameter names that are known tracking params.
 *   srsltid    — Google Shopping / Merchant Center click id
 *   fbclid     — Facebook / Meta click id
 *   gclid      — Google Ads click id
 *   gad_source — Google Ads source tag
 *   ttclid     — TikTok click id
 *   msclkid    — Microsoft / Bing Ads click id
 *   twclid     — Twitter / X click id
 *   igshid     — Instagram share id
 *   mc_cid     — Mailchimp campaign id
 *   mc_eid     — Mailchimp email id
 *   dclid      — Google Display & Video 360 click id
 *   wbraid     — Google Ads web-to-app cross-channel measurement
 *   gbraid     — Google Ads app-to-web cross-channel measurement
 *   campaignid — Google Ads campaign id (alternative param name)
 *   adgroupid  — Google Ads ad group id
 *   adid       — Google Ads ad id
 */
export const TRACKING_EXACT = new Set([
  "srsltid",
  "fbclid",
  "gclid",
  "gad_source",
  "ttclid",
  "msclkid",
  "twclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "dclid",
  "wbraid",
  "gbraid",
  "campaignid",
  "adgroupid",
  "adid",
]);

/**
 * Returns true when the given query-parameter key is a known tracking param.
 *
 * @param {string} key  Raw (un-decoded) query-parameter name.
 * @returns {boolean}
 */
export function isTrackingParam(key) {
  if (TRACKING_EXACT.has(key)) return true;
  for (const prefix of TRACKING_PREFIXES) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Strip all known tracking params from a URL search (query) string.
 *
 * Accepts the search portion with or without a leading "?".
 * Returns "" when no non-tracking params remain.
 * Returns "?key=val&…" (with a leading "?") when at least one param survives.
 *
 * @param {string} search  e.g. "?utm_source=google&page=2" or "srsltid=abc"
 * @returns {string}       e.g. "?page=2" or ""
 */
export function stripTrackingParams(search) {
  if (!search) return "";
  const qs = search.startsWith("?") ? search.slice(1) : search;
  if (!qs) return "";
  const params = new URLSearchParams(qs);
  for (const key of [...params.keys()]) {
    if (isTrackingParam(key)) params.delete(key);
  }
  const result = params.toString();
  return result ? `?${result}` : "";
}

/**
 * Strip tracking params from the query string portion of a Node.js req.url
 * value (a path-relative URL, i.e. path + optional search, no host).
 *
 * The path portion is returned unchanged; only the search part is cleaned.
 * A bare path without a "?" is returned as-is.
 *
 * Examples:
 *   "/en-lb/beirut/?utm_source=google"        → "/en-lb/beirut/"
 *   "/shop?category=roses&utm_medium=cpc"     → "/shop?category=roses"
 *   "/about?srsltid=abc123&ref=home"          → "/about?ref=home"
 *   "/about"                                   → "/about"
 *   "/contact?utm_source=x&utm_campaign=y"    → "/contact"
 *
 * @param {string | null | undefined} reqUrl  Node's req.url value.
 * @returns {string}  Cleaned path+search, or "/" for null/undefined input.
 */
export function stripTrackingParamsFromReqUrl(reqUrl) {
  if (!reqUrl) return "/";
  const qIdx = reqUrl.indexOf("?");
  if (qIdx === -1) return reqUrl;
  const pathPart = reqUrl.slice(0, qIdx);
  const searchPart = reqUrl.slice(qIdx);
  return pathPart + stripTrackingParams(searchPart);
}
