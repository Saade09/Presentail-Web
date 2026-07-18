// TypeScript facade for hreflang.mjs — provides types for the client bundle
// and re-exports the shared buildHreflangSet implementation.
//
// Both seo-inject.mjs (Node, plain ESM) and SeoHead.tsx (TypeScript/browser)
// consume the same underlying logic from hreflang.mjs so server and client
// hreflang sets can never drift.

export type CountrySlugHreflang = "lb" | "ae" | "cy";

export interface HreflangEntry {
  /** BCP 47 hreflang value, e.g. "en-LB", "ar-AE", "x-default". */
  hreflang: string;
  /** Absolute URL, e.g. "https://presentail.com/en-lb/beirut/product/roses". */
  href: string;
}

export {
  buildHreflangSet,
  CANONICAL_CITY,
  ALL_COUNTRIES,
} from "./hreflang.mjs";
