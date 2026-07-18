// Type declarations for the plain-ESM hreflang utility module (`hreflang.mjs`).
// Imported through the typed facade `hreflang.ts`.

export type CountrySlugHreflang = "lb" | "ae" | "cy";

export interface HreflangEntry {
  /** BCP 47 hreflang value, e.g. "en-LB", "ar-AE", "x-default". */
  hreflang: string;
  /** Absolute URL, e.g. "https://presentail.com/en-lb/beirut/product/roses". */
  href: string;
}

/** Fixed canonical city slug for each supported country. */
export const CANONICAL_CITY: Record<CountrySlugHreflang, string>;

/** All three supported countries in the canonical lb → ae → cy order. */
export const ALL_COUNTRIES: Array<CountrySlugHreflang>;

/**
 * Build the complete set of hreflang <link rel="alternate"> descriptors for a
 * given entity path, scoped to the countries where the entity is available.
 *
 * @param entityPath - Locale-agnostic entity path fragment, e.g. "product/red-roses".
 *   Leading slashes, query strings, and fragments are stripped automatically.
 * @param availableCountries - Countries where the entity has real content.
 *   Pass ALL_COUNTRIES for generic routes; omit unavailable countries for entity pages.
 *   An empty array returns [].
 * @param origin - Canonical site origin, e.g. "https://presentail.com" (no trailing slash).
 * @returns Array of hreflang descriptor objects including x-default, or [] when
 *   availableCountries is empty or origin is empty.
 */
export function buildHreflangSet(
  entityPath: string,
  availableCountries: Array<CountrySlugHreflang>,
  origin: string,
): HreflangEntry[];
