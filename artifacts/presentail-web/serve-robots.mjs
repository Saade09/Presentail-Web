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
 *   privacy, terms, careers, partner, blog.
 * Also covers auth-adjacent routes not in NONINDEX_ROUTE_KEYS directly:
 *   sign-in, sign-up, reset-password (mapped to key "auth" by detectRouteKey).
 * Keep in sync with public/robots.txt Disallow entries.
 *
 * "blog" is deliberately excluded from this regex: the listing page /blog IS
 * noindex (route key "blog"), but individual posts /blog/{slug} ARE indexed
 * (route key "blogPost"). A separate blog-listing check handles this case.
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
 * IMPORTANT: `blog` (the listing) is noindex but individual blog posts
 * (/blog/<slug>) are fully indexable. The two clauses below keep them
 * distinct — do not collapse them into a single pattern that matches both.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isPrivatePath(pathname) {
  if (PRIVATE_ROUTE_RE.test(pathname)) return true;
  // Blog listing page (/blog or /{lang-country}/{city}/blog) is noindex;
  // individual blog posts (/blog/{slug}) are public. Match listing only by
  // requiring "blog" at the end of the path (with optional trailing slash).
  return /(?:^|\/)blog\/?$/.test(pathname);
}

// ---------------------------------------------------------------------------
// UTM / click-ID noindex guard
// ---------------------------------------------------------------------------

/**
 * UTM and Google click-ID query-string parameters that must never produce
 * indexable pages.  Mirrors the Disallow: rules in public/robots.txt.
 */
export const UTM_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_id", "utm_term", "utm_content",
  "gclid", "gbraid", "wbraid",
]);

/**
 * Returns true when the query string contains at least one UTM tracking
 * parameter or Google click-ID parameter (gclid / gbraid / wbraid).
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
export function resolveXRobotsTag(host, pathname, search, curatedFilterPages = []) {
  if (isPrivatePath(pathname)) return "noindex";
  if (hasUtmParams(search)) return "noindex";
  if (hasFilterParams(search) && !isCuratedFilterPage(pathname, search || "", curatedFilterPages)) return "noindex, follow";
  if (host === CANONICAL_PRODUCTION_HOST) return "index, follow";
  return null; // non-canonical host — omit; let platform default apply
}
