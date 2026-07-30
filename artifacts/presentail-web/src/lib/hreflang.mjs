// Shared hreflang utility — plain ESM so it can be imported by both
// seo-inject.mjs (Node, no TypeScript) and the TypeScript SeoHead.tsx
// component (via the hreflang.ts facade).
//
// Single source of truth for the intra-city hreflang cluster emitted on every
// indexable locale-prefixed page of the Presentail storefront, and for the
// hub-city map used to consolidate duplicate entity URLs.
//
// Design (canonical + hreflang consolidation):
//  - hreflang clusters are INTRA-CITY only: en/ar/fr variants of the SAME
//    city in the SAME country, plus x-default pointing at the en variant of
//    that city. No cross-country links — Tripoli's "English version" must
//    never be listed as Beirut, or Google merges the two.
//  - Entity pages (product/brand/category/occasion) at non-hub cities point
//    their canonical at the hub city for that country (see HUB_CITY and
//    remapPathnameToHubCity), consolidating ranking signals instead of
//    fragmenting them across ~36k near-duplicate city URLs.

/**
 * Hub city per country — the single city whose entity URLs receive canonical
 * signals from every other city in that country. Must stay in sync with
 * SITEMAP_CANONICAL_CITIES in sitemap.mjs (which re-exports this map).
 * @type {Record<"lb" | "ae" | "cy", string>}
 */
export const HUB_CITY = {
  lb: "beirut",
  ae: "dubai",
  cy: "nicosia",
};

/** @type {Array<"lb" | "ae" | "cy">} */
export const ALL_COUNTRIES = ["lb", "ae", "cy"];

/** @type {Array<"en" | "ar" | "fr">} */
const SUPPORTED_LANGS_ORDERED = ["en", "ar", "fr"];

/**
 * Replace the city segment of a locale-prefixed pathname with the hub city
 * for its country. Non-locale paths, unknown countries, and paths already at
 * the hub city are returned unchanged.
 *
 * @param {string} pathname e.g. "/en-lb/tripoli/product/roses"
 * @returns {string} e.g. "/en-lb/beirut/product/roses"
 */
export function remapPathnameToHubCity(pathname) {
  const m = String(pathname ?? "").match(
    /^\/([a-z]{2})-(lb|ae|cy)\/([^/]+)(\/.*)?$/,
  );
  if (!m) return pathname;
  const hub = HUB_CITY[m[2]];
  if (!hub || m[3] === hub) return pathname;
  return `/${m[1]}-${m[2]}/${hub}${m[4] ?? ""}`;
}

/**
 * Build the intra-city hreflang <link rel="alternate"> cluster for a page:
 * the en/ar/fr variants of the SAME city plus x-default pointing at the en
 * variant of that city. The cluster always contains the page itself and never
 * contains cross-country links.
 *
 * @param {string} entityPath
 *   The locale-agnostic entity path fragment, e.g. "product/red-roses-bouquet",
 *   "shop", "" (home). Must NOT start with a leading slash. Leading slashes,
 *   query strings, fragments, and trailing slashes are stripped automatically
 *   (with a console.warn in dev for the leading slash).
 *
 * @param {{ country: string | null | undefined, city: string | null | undefined }} locale
 *   The country (lb | ae | cy) and city slug of the page whose cluster is
 *   being built. For entity pages whose canonical is remapped to the hub
 *   city, pass the HUB city so the hreflang cluster matches the canonical.
 *   Missing/unknown country or missing city suppresses hreflang entirely.
 *
 * @param {string} origin
 *   The canonical site origin, e.g. "https://presentail.com".
 *   Must not have a trailing slash.
 *
 * @returns {Array<{ hreflang: string; href: string }>}
 *   Array of hreflang descriptor objects (en, ar, fr + x-default), or an
 *   empty array when origin/country/city is missing or invalid.
 */
export function buildHreflangSet(entityPath, locale, origin) {
  if (!origin) {
    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
      console.warn("buildHreflangSet: origin is empty — no hreflang emitted");
    }
    return [];
  }

  const country = locale?.country;
  const city = locale?.city;
  if (!country || !ALL_COUNTRIES.includes(country) || !city) {
    return [];
  }

  // Normalise entityPath: strip leading slash, query string, fragment, trailing slash.
  let path = String(entityPath ?? "");
  if (path.startsWith("/")) {
    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
      console.warn(`buildHreflangSet: entityPath "${path}" starts with a slash — stripping it`);
    }
    path = path.replace(/^\/+/, "");
  }
  // Strip query string and fragment
  path = path.replace(/[?#].*$/, "");
  // Strip trailing slash
  path = path.replace(/\/$/, "");

  const canonicalOrigin = origin.replace(/\/$/, "");
  const hrefFor = (lang) =>
    path
      ? `${canonicalOrigin}/${lang}-${country}/${city}/${path}`
      : `${canonicalOrigin}/${lang}-${country}/${city}`;

  /** @type {Array<{ hreflang: string; href: string }>} */
  const output = SUPPORTED_LANGS_ORDERED.map((lang) => ({
    hreflang: `${lang}-${country.toUpperCase()}`,
    href: hrefFor(lang),
  }));

  // x-default points at the en variant of the SAME city — never cross-country.
  output.push({ hreflang: "x-default", href: hrefFor("en") });

  return output;
}
