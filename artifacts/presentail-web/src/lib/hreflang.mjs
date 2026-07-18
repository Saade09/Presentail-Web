// Shared hreflang utility — plain ESM so it can be imported by both
// seo-inject.mjs (Node, no TypeScript) and the TypeScript SeoHead.tsx
// component (via the hreflang.ts facade).
//
// Single source of truth for the 9-locale + x-default hreflang set emitted
// on every indexable locale-prefixed page of the Presentail storefront.

/** @type {Record<"lb" | "ae" | "cy", string>} */
export const CANONICAL_CITY = {
  lb: "beirut",
  ae: "dubai",
  cy: "limassol",
};

/** @type {Array<"lb" | "ae" | "cy">} */
export const ALL_COUNTRIES = ["lb", "ae", "cy"];

/** @type {Array<"en" | "ar" | "fr">} */
const SUPPORTED_LANGS_ORDERED = ["en", "ar", "fr"];

/**
 * Build the complete set of hreflang <link rel="alternate"> descriptors for a
 * given entity path, scoped to the countries where the entity is available.
 *
 * @param {string} entityPath
 *   The locale-agnostic entity path fragment, e.g. "product/red-roses-bouquet",
 *   "shop", "" (home). Must NOT start with a leading slash. Must NOT carry
 *   query parameters or a trailing slash. Leading slashes, query strings, and
 *   fragments are stripped automatically (with a console.warn in dev).
 *
 * @param {Array<"lb" | "ae" | "cy">} availableCountries
 *   Countries where the entity page returns 200 and has real content. For
 *   generic routes (home, shop, etc.) pass ALL_COUNTRIES. For entity-specific
 *   pages (product, brand, category, occasion) pass only confirmed countries.
 *   Passing an empty array produces an empty output (hreflang is suppressed).
 *
 * @param {string} origin
 *   The canonical site origin, e.g. "https://presentail.com".
 *   Must not have a trailing slash.
 *
 * @returns {Array<{ hreflang: string; href: string }>}
 *   Array of hreflang descriptor objects, including x-default.
 *   Returns an empty array when availableCountries is empty or origin is empty.
 */
export function buildHreflangSet(entityPath, availableCountries, origin) {
  if (!origin) {
    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
      console.warn("buildHreflangSet: origin is empty — no hreflang emitted");
    }
    return [];
  }

  if (!availableCountries || availableCountries.length === 0) {
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

  /** @type {Array<{ hreflang: string; href: string }>} */
  const output = [];

  // Emit in lb → ae → cy order, always, regardless of input order.
  const orderedCountries = ALL_COUNTRIES.filter((c) => availableCountries.includes(c));

  for (const country of orderedCountries) {
    const city = CANONICAL_CITY[country];
    for (const lang of SUPPORTED_LANGS_ORDERED) {
      const href = path
        ? `${canonicalOrigin}/${lang}-${country}/${city}/${path}`
        : `${canonicalOrigin}/${lang}-${country}/${city}`;
      output.push({ hreflang: `${lang}-${country.toUpperCase()}`, href });
    }
  }

  // x-default always points to en-LB/Beirut regardless of requesting country.
  const xDefaultHref = path
    ? `${canonicalOrigin}/en-lb/${CANONICAL_CITY.lb}/${path}`
    : `${canonicalOrigin}/en-lb/${CANONICAL_CITY.lb}`;
  output.push({ hreflang: "x-default", href: xDefaultHref });

  return output;
}
