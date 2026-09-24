/**
 * serve-robots.mjs — Pure X-Robots-Tag / private-path helpers.
 *
 * Extracted from serve.mjs so they can be unit-tested in isolation without
 * spawning a full HTTP server.  serve.mjs imports everything from here;
 * the logic is unchanged — only the module boundary is new.
 */

// ---------------------------------------------------------------------------
// Private-path deny-list
// ---------------------------------------------------------------------------

/**
 * Deny-list of route tokens that must carry noindex regardless of host.
 * Must mirror NONINDEX_ROUTE_KEYS in src/lib/seo.mjs:
 *   cart, checkout, orderConfirmed, auth, account, favorites,
 *   privacy, terms, careers, partner.
 * Also covers auth-adjacent routes not in NONINDEX_ROUTE_KEYS directly:
 *   sign-in, sign-up, reset-password (mapped to key "auth" by detectRouteKey).
 * Keep in sync with public/robots.txt Disallow entries.
 *
 * Blog articles remain indexable, while the canonical language-only blog
 * indexes are handled separately in resolveXRobotsTag().
 */
export const PRIVATE_ROUTE_RE =
  /(?:^|\/)(?:cart|checkout|order-confirmed|auth|sign-in|sign-up|reset-password|account|personal-information|favorites|privacy|terms|careers|partner)(?:\/|$)/;

/**
 * Returns true when the pathname resolves to a private page that must carry a
 * noindex directive. Matches both bare paths (/cart) and locale-prefixed
 * variants (/en-lb/beirut/cart).
 *
 * Implemented as a deny-list (not an allow-list) so new public pages are
 * automatically indexable without a code change.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isPrivatePath(pathname) {
  return PRIVATE_ROUTE_RE.test(pathname);
}

// ---------------------------------------------------------------------------
// UTM / click-ID noindex guard
// ---------------------------------------------------------------------------

/**
 * Exact query-parameter names that are known ad/tracking params and must never
 * produce indexable pages.  Mirrors the Disallow: rules in public/robots.txt
 * and the TRACKING_PARAMS set in seo-inject.mjs / TRACKING_EXACT in
 * serve-tracking.mjs.
 */
export const UTM_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_id", "utm_term", "utm_content",
  "gclid", "gbraid", "wbraid",
  // Microsoft HSA (HubSpot Ads / Hotel Search Ads) params — checked as an
  // exact set here; hasUtmParams also checks the "hsa_" prefix below.
  "hsa_cam", "hsa_grp", "hsa_ad", "hsa_mt", "hsa_net",
  "hsa_src", "hsa_tgt", "hsa_ver", "hsa_kw",
  // Google Ads campaign/adgroup/ad ID params (alternate naming convention)
  "campaignid", "adgroupid", "adid",
]);

/**
 * Query-parameter name prefixes that are always tracking params.
 * Mirrors TRACKING_PREFIXES in serve-tracking.mjs.
 */
const TRACKING_PARAM_PREFIXES = ["utm_", "hsa_"];

/**
 * Returns true when the query string contains at least one ad-network tracking
 * parameter (utm_*, hsa_*, gclid, gbraid, wbraid, campaignid, adgroupid, adid).
 *
 * @param {string} search  URL query string (e.g. "?utm_source=email").
 * @returns {boolean}
 */
export function hasUtmParams(search) {
  if (!search || search === "?") return false;
  try {
    const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    for (const key of sp.keys()) {
      if (UTM_PARAMS.has(key)) return true;
      for (const prefix of TRACKING_PARAM_PREFIXES) {
        if (key.startsWith(prefix)) return true;
      }
    }
  } catch {
    // malformed query string — treat as no UTM params
  }
  return false;
}

// ---------------------------------------------------------------------------
// Faceted-navigation / filter-param noindex guard
//
// Filter and utility parameters (sort, currency, delivery, availability,
// price_min, price_max, page, ref, from, scroll) never produce a distinct
// landing page. Any URL that carries one of these parameters and is not a
// curated filter page receives `x-robots-tag: noindex, follow` so crawlers
// that ignore the robots.txt Disallow rules still don't index duplicates.
//
// Must stay in sync with:
//   - seo-inject.mjs FILTER_PARAMS_CANONICAL
//   - robots.txt Disallow: /*?<param>= rules
//   - scripts/src/canonicalNorm.ts FILTER_PARAMS
// ---------------------------------------------------------------------------

export const FILTER_NOINDEX_PARAMS = new Set([
  "sort",
  "currency",
  "wmc-currency",
  "delivery",
  "availability",
  "price_min",
  "price_max",
  "page",
  "ref",
  "from",
  "scroll",
]);

/**
 * Returns true when the query string contains at least one filter/utility
 * parameter that never produces a distinct landing page.
 *
 * @param {string} search  URL query string (e.g. "?sort=price-asc").
 * @returns {boolean}
 */
export function hasFilterParams(search) {
  if (!search || search === "?") return false;
  try {
    const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    for (const key of sp.keys()) {
      if (FILTER_NOINDEX_PARAMS.has(key)) return true;
    }
  } catch {
    // malformed query string — treat as no filter params
  }
  return false;
}

/**
 * Returns true when the pathname + search match a curated filter landing page
 * entry.  Curated pages are intentional filter-param URLs that should be
 * indexed; they are exempt from the faceted-navigation noindex guard.
 *
 * @param {string} pathname            URL pathname.
 * @param {string} search              URL query string (e.g. "?delivery=today").
 * @param {Array<{path:string,params?:Record<string,string|number>}>} curatedFilterPages
 * @returns {boolean}
 */
export function isCuratedFilterPage(pathname, search, curatedFilterPages) {
  if (!curatedFilterPages || !curatedFilterPages.length) return false;
  try {
    const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    for (const entry of curatedFilterPages) {
      if (entry.path !== pathname) continue;
      const matchesAll = Object.entries(entry.params ?? {}).every(
        ([k, v]) => sp.get(k) === String(v),
      );
      if (matchesAll) return true;
    }
  } catch { /* ignore */ }
  return false;
}

// ---------------------------------------------------------------------------
// X-Robots-Tag resolution
// ---------------------------------------------------------------------------

export const CANONICAL_PRODUCTION_HOST = "presentail.com"; // i18n-ignore — canonical domain

/**
 * Returns the value for the X-Robots-Tag response header for an HTML response.
 *
 * Rules (applied in order):
 *  1. Private/transactional paths → "noindex" (regardless of host).
 *  2. UTM / click-ID marketing params → "noindex" (duplicate-content guard;
 *     mirrors the Disallow: /*?utm_* rules in robots.txt).
 *  3. Filter/utility params (sort, currency, delivery, etc.) → "noindex, follow"
 *     UNLESS the path+params match a curated filter landing page entry.
 *     (faceted-navigation crawl-budget guard; follow allows discovery of linked
 *     canonical pages even when this variant is not indexed).
 *  4. Canonical production host ("presentail.com") and public path → "index, follow".
 *  5. All other hosts (Replit preview URLs, staging, etc.) → omit the header
 *     entirely (return null) so the platform's default noindex applies.
 *
 * @param {string} host                Normalised hostname (no port, lowercase).
 * @param {string} pathname            URL pathname (after BASE_PATH stripping).
 * @param {string|undefined} [search]  URL query string (e.g. "?utm_source=foo").
 * @param {Array<{path:string,params?:Record<string,string|number>}>} [curatedFilterPages=[]]
 *   List of curated filter landing pages that are exempt from the filter-param
 *   noindex guard.  serve.mjs passes CURATED_FILTER_PAGES from seo-inject.mjs;
 *   unit tests pass an empty array or a synthetic fixture.
 * @returns {string|null}  Header value, or null to omit the header.
 */
// Cyprus canonical policy pages are always indexable, even though the generic
// `terms` token would otherwise match PRIVATE_ROUTE_RE. Check before the
// private-path guard so only these exact canonical URLs escape the noindex.
const CYPRUS_CANONICAL_POLICY_RE = /^\/cyprus\/(?:terms|shipping-policy|refund-policy)(?:\/)?$/;
const CANONICAL_BLOG_INDEX_RE = /^\/(?:en|ar|fr)\/blog\/?$/;

export function resolveXRobotsTag(host, pathname, search, curatedFilterPages = []) {
  if (CYPRUS_CANONICAL_POLICY_RE.test(pathname)) return host === CANONICAL_PRODUCTION_HOST ? "index, follow" : null;
  if (CANONICAL_BLOG_INDEX_RE.test(pathname)) return "noindex, follow";
  if (isPrivatePath(pathname)) return "noindex";
  if (hasUtmParams(search)) return "noindex";
  if (hasFilterParams(search) && !isCuratedFilterPage(pathname, search || "", curatedFilterPages)) return "noindex, follow";
  if (host === CANONICAL_PRODUCTION_HOST) return "index, follow";
  return null; // non-canonical host — omit; let platform default apply
}
