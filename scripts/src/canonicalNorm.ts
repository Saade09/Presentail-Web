/**
 * Canonical URL normalization for faceted-navigation crawl-budget controls.
 *
 * Mirrors the logic exported from artifacts/presentail-web/seo-inject.mjs so
 * it can be unit-tested from the scripts package (which cannot import .mjs
 * files across rootDir boundaries via tsc).  Keep the two implementations in
 * sync: any change here must be reflected in seo-inject.mjs and vice versa.
 */

/**
 * Filter / utility parameters that never produce a distinct landing page and
 * must be stripped from canonical URLs and blocked in robots.txt.
 */
export const FILTER_PARAMS = new Set([
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
 * Navigation parameters that have dedicated path equivalents.  They are always
 * stripped from canonical URLs because the canonical form uses a path segment
 * (/occasion/birthday) rather than a query param (?occasion=birthday).
 */
export const NAV_PARAMS = new Set(["occasion", "category", "recipient"]);

/**
 * Tracking / analytics parameters that are stripped from canonical URLs.
 * Mirrors the TRACKING_PARAMS set in seo-inject.mjs (subset of keys
 * relevant to canonicalization; fbclid and msclkid are added here as per the
 * faceted-nav spec).
 */
export const TRACKING_PARAMS_CANONICAL = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "srsltid",
  "gad_source",
  "gad_campaignid",
  "ttclid",
  "twclid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
]);

/** All params that are stripped before computing a canonical href. */
const ALL_STRIPPED_PARAMS = new Set([
  ...FILTER_PARAMS,
  ...NAV_PARAMS,
  ...TRACKING_PARAMS_CANONICAL,
]);

export interface CuratedFilterPage {
  path: string;
  params: Record<string, string>;
  title?: Record<string, string>;
  description?: Record<string, string>;
}

/**
 * Curated filter landing pages whose canonical URL deliberately preserves the
 * filter params.  Empty by default — populated when the product team defines
 * curated filter collections (e.g. "same-day delivery in Beirut").
 */
export const CURATED_FILTER_PAGES: CuratedFilterPage[] = [];

/**
 * Build a canonical URL by stripping utility, filter, and tracking parameters.
 * Curated filter-page combinations listed in CURATED_FILTER_PAGES are exempt
 * from stripping: their canonical URL preserves only the curated params.
 *
 * @param reqUrl  Full request URL or path+query string.
 *                Examples: "/en-lb/beirut/shop?sort=price-asc", "https://presentail.com/…"
 * @param opts    Optional origin (default "https://presentail.com") and basePath prefix.
 * @returns       Absolute canonical URL with stripped params.
 */
export function buildCanonicalUrl(
  reqUrl: string,
  opts: { origin?: string; basePath?: string } = {},
): string {
  const origin = opts.origin ?? "https://presentail.com";
  const basePath = opts.basePath ?? "";
  const cleanBase = basePath.replace(/\/$/, "");

  let pathname: string;
  let search: string;
  try {
    const base = origin || "https://presentail.com";
    const parsed = new URL(reqUrl, base);
    pathname = parsed.pathname;
    search = parsed.search;
  } catch {
    return origin + cleanBase + (reqUrl || "/");
  }

  // Strip basePath prefix so path matching works on the locale-relative path.
  let cleanPathname = pathname;
  if (cleanBase && cleanPathname.startsWith(cleanBase)) {
    cleanPathname = cleanPathname.slice(cleanBase.length) || "/";
  }

  // Check curated filter pages — exempt from param stripping.
  for (const curated of CURATED_FILTER_PAGES) {
    if (cleanPathname === curated.path) {
      const sp = new URLSearchParams(
        search.startsWith("?") ? search.slice(1) : search,
      );
      let matches = true;
      for (const [k, v] of Object.entries(curated.params ?? {})) {
        if (sp.get(k) !== v) {
          matches = false;
          break;
        }
      }
      if (matches) {
        const curatedParams = new URLSearchParams();
        for (const [k, v] of Object.entries(curated.params ?? {})) {
          curatedParams.set(k, v);
        }
        const curatedSearch = curatedParams.toString()
          ? `?${curatedParams.toString()}`
          : "";
        return origin + cleanBase + cleanPathname + curatedSearch;
      }
    }
  }

  // Strip all unwanted params.
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  for (const key of ALL_STRIPPED_PARAMS) {
    params.delete(key);
  }
  const cleanSearch = params.toString() ? `?${params.toString()}` : "";
  const cleanPath = cleanPathname.replace(/\/$/, "") || "/";

  return origin + cleanBase + cleanPath + cleanSearch;
}
