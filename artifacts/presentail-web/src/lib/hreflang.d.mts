// Type declarations for the plain-ESM hreflang utility module (`hreflang.mjs`).
// Imported through the typed facade `hreflang.ts`.

export type CountrySlugHreflang = "lb" | "ae" | "cy";

export interface HreflangEntry {
  /** BCP 47 hreflang value, e.g. "en-LB", "ar-AE", "x-default". */
  hreflang: string;
  /** Absolute URL, e.g. "https://presentail.com/en-lb/beirut/product/roses". */
  href: string;
}

/** Hub city slug per country — canonical target for entity-page consolidation. */
export const HUB_CITY: Record<CountrySlugHreflang, string>;

/** All three supported countries in the canonical lb → ae → cy order. */
export const ALL_COUNTRIES: Array<CountrySlugHreflang>;

/**
 * Replace the city segment of a locale-prefixed pathname with the hub city
 * for its country. Non-locale paths and hub-city paths pass through unchanged.
 */
export function remapPathnameToHubCity(pathname: string): string;

/**
 * Build the intra-city hreflang cluster for a page: en/ar/fr variants of the
 * SAME city plus x-default pointing at the en variant of that city.
 *
 * @param entityPath - Locale-agnostic entity path fragment, e.g. "product/red-roses".
 *   Leading slashes, query strings, and fragments are stripped automatically.
 * @param locale - Country (lb|ae|cy) and city slug of the page. For entity
 *   pages whose canonical is remapped to the hub city, pass the hub city.
 * @param origin - Canonical site origin, e.g. "https://presentail.com".
 * @returns Array of hreflang descriptor objects including x-default, or []
 *   when origin/country/city is missing or invalid.
 */
export function buildHreflangSet(
  entityPath: string,
  locale: { country: string | null | undefined; city: string | null | undefined },
  origin: string,
): HreflangEntry[];
