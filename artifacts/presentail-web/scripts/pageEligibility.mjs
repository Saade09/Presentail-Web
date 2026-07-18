/**
 * Indexable-page eligibility engine for programmatic city × collection
 * combinations (city-category, city-occasion, city-brand, city-recipient, city).
 *
 * A pure, synchronous module imported by sitemap.mjs, seo-inject.mjs, and the
 * scripts test suite without booting any server or fetching any API data.
 *
 * Exported API:
 *   isPageEligible(params) → { eligible: boolean, reason: string }
 *   eligibilityReason(params) → string
 *   MIN_PRODUCTS_BY_TYPE  — const object (exported for tests)
 *   UNIQUENESS_RATIO_MIN  — const number (exported for tests)
 *   CITY_SLUGS_BY_COUNTRY — re-exported from city-slugs.json (single source of truth)
 */

import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);

/**
 * City slugs — single source of truth is `src/lib/city-slugs.json`.
 * locale-route.ts also imports from the same JSON file to guarantee they stay
 * in sync. Add/remove cities there; this file picks up the change automatically.
 */
export const CITY_SLUGS_BY_COUNTRY = _require("../src/lib/city-slugs.json");

// All known city slugs as a flat Set for O(1) lookup.
const ALL_CITY_SLUGS = new Set(
  Object.values(CITY_SLUGS_BY_COUNTRY).flat(),
);

/**
 * Minimum product count required before a page type is eligible for indexing.
 * Exported so unit tests can reference the exact thresholds.
 */
export const MIN_PRODUCTS_BY_TYPE = {
  city: 5,
  "city-category": 4,
  "city-occasion": 4,
  "city-brand": 3,
  "city-recipient": 4,
};

/**
 * A child page must have at least this fraction of its parent collection's
 * products to be considered non-duplicate. Exported for tests.
 */
export const UNIQUENESS_RATIO_MIN = 0.15;

/**
 * Decide whether a programmatic page qualifies for indexing.
 *
 * Rules (all must pass):
 *  1. pageType must be a known type.
 *  2. city must be in CITY_SLUGS_BY_COUNTRY (no ghost cities).
 *  3. productCount >= MIN_PRODUCTS_BY_TYPE[pageType]
 *     — skipped when productCount is null/undefined (data not available).
 *  4. productCount / parentProductCount >= UNIQUENESS_RATIO_MIN
 *     — skipped when parentProductCount is 0 or null/undefined.
 *  5. Not identical to parent: if productCount === parentProductCount and
 *     parentProductCount > 0, the page adds no unique value.
 *
 * @param {object} params
 * @param {string} params.pageType          - one of the MIN_PRODUCTS_BY_TYPE keys
 * @param {string} [params.country]         - two-letter country slug ("lb", "ae", "cy")
 * @param {string} [params.city]            - city slug
 * @param {string} [params.categorySlug]
 * @param {string} [params.occasionSlug]
 * @param {string} [params.recipientSlug]
 * @param {string} [params.brandSlug]
 * @param {number|null} [params.productCount]       - products on this page
 * @param {number|null} [params.parentProductCount] - products on the parent collection
 * @returns {{ eligible: boolean, reason: string }}
 */
export function isPageEligible({
  pageType,
  country,
  city,
  categorySlug,
  occasionSlug,
  recipientSlug,
  brandSlug,
  productCount = null,
  parentProductCount = null,
  /**
   * Whether the parent page (e.g. the brand/category/occasion page without a
   * city filter) is itself eligible for indexing. Used to guard the
   * identical-inventory check: if the parent is known to be ineligible (e.g.
   * it has fewer products than its own minimum threshold), a city page that
   * mirrors it is already excluded by the min-count rule, so the identical-
   * inventory rule adds no incremental signal and is skipped.
   *
   * null  = unknown / not provided → apply the check conservatively (default).
   * true  = parent is indexable → apply the identical-inventory check.
   * false = parent is ineligible → skip the identical-inventory check.
   */
  parentEligible = null,
} = {}) {
  // Rule 1 — known page type.
  if (!MIN_PRODUCTS_BY_TYPE[pageType]) {
    return {
      eligible: false,
      reason: `unknown pageType "${pageType}"`,
    };
  }

  // Rule 2 — city must be a recognised slug for the given country.
  // When `country` is provided, validate against that country's list so a
  // valid city in the wrong country (e.g. "beirut" under "ae") is rejected.
  // When `country` is absent, fall back to the global set so the function
  // remains usable without a country context.
  if (city) {
    if (country) {
      const citiesForCountry = CITY_SLUGS_BY_COUNTRY[country];
      if (!citiesForCountry || !citiesForCountry.includes(city)) {
        return {
          eligible: false,
          reason: `city "${city}" is not in CITY_SLUGS_BY_COUNTRY["${country}"]`,
        };
      }
    } else if (!ALL_CITY_SLUGS.has(city)) {
      return {
        eligible: false,
        reason: `city "${city}" is not in CITY_SLUGS_BY_COUNTRY`,
      };
    }
  }

  // Rule 3 — minimum product count. Fails closed when productCount is
  // unknown (null/undefined): an unknowable count is treated as a missing
  // data signal and the page is excluded from the index rather than
  // optimistically included. Callers must fetch the real count before
  // calling this function if they want to avoid the closed-failure path.
  const minRequired = MIN_PRODUCTS_BY_TYPE[pageType];
  if (productCount === null || productCount === undefined) {
    return {
      eligible: false,
      reason: `productCount unknown — failing closed; fetch a real count before making indexability decisions`,
    };
  }
  if (productCount < minRequired) {
    return {
      eligible: false,
      reason: `productCount ${productCount} < minimum ${minRequired} for pageType "${pageType}"`,
    };
  }

  // Rule 4 — uniqueness ratio (only when parent count is known and > 0).
  if (parentProductCount !== null && parentProductCount !== undefined && parentProductCount > 0) {
    const ratio = productCount / parentProductCount;
    if (ratio < UNIQUENESS_RATIO_MIN) {
      return {
        eligible: false,
        reason: `uniqueness ratio ${ratio.toFixed(3)} < ${UNIQUENESS_RATIO_MIN} (${productCount}/${parentProductCount} products)`,
      };
    }

    // Rule 5 — identical inventory to parent adds no value.
    // Skipped when parentEligible is explicitly false: if the parent page
    // is itself ineligible, the city page is already excluded by Rule 3
    // (min-count), so flagging identical inventory is redundant.
    if (productCount === parentProductCount && parentEligible !== false) {
      return {
        eligible: false,
        reason: `productCount (${productCount}) equals parentProductCount — identical inventory, no value add`,
      };
    }
  }

  // All checks passed.
  const slug =
    brandSlug ?? categorySlug ?? occasionSlug ?? recipientSlug ?? null;
  const slugPart = slug ? ` slug="${slug}"` : "";
  const cityPart = city ? ` city="${city}"` : "";
  return {
    eligible: true,
    reason: `pageType="${pageType}"${cityPart}${slugPart} passes all eligibility rules (productCount=${productCount ?? "unknown"})`,
  };
}

/**
 * Convenience wrapper — returns only the reason string.
 *
 * @param {Parameters<typeof isPageEligible>[0]} params
 * @returns {string}
 */
export function eligibilityReason(params) {
  return isPageEligible(params).reason;
}

// ---------------------------------------------------------------------------
// CLI: node scripts/pageEligibility.mjs --eligibility-report
// ---------------------------------------------------------------------------
// When run directly with --eligibility-report, prints a JSON summary of
// sample eligibility checks (one per page type, covering both eligible and
// ineligible cases) and exits 0. Used by CI to verify the module loads and
// the logic executes without errors.

import { fileURLToPath } from "node:url";

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes("--eligibility-report")) {
    const samples = [
      { pageType: "city",           city: "beirut",    productCount: 10, parentProductCount: 0 },
      { pageType: "city",           city: "akkar",     productCount: 2,  parentProductCount: 0 },
      { pageType: "city-category",  city: "beirut",    categorySlug: "flowers",    productCount: 8, parentProductCount: 40 },
      { pageType: "city-category",  city: "beirut",    categorySlug: "hampers",    productCount: 2, parentProductCount: 40 },
      { pageType: "city-category",  city: "beirut",    categorySlug: "chocolates", productCount: 20, parentProductCount: 20 },
      { pageType: "city-occasion",  city: "dubai",     occasionSlug: "birthday",   productCount: 5, parentProductCount: 30 },
      { pageType: "city-occasion",  city: "dubai",     occasionSlug: "graduation", productCount: 1, parentProductCount: 30 },
      { pageType: "city-brand",     city: "nicosia",   brandSlug: "fleurop",       productCount: 4, parentProductCount: 0 },
      { pageType: "city-brand",     city: "nicosia",   brandSlug: "tiny",          productCount: 0, parentProductCount: 0 },
      { pageType: "city-recipient", city: "tripoli",   recipientSlug: "mom",       productCount: 6, parentProductCount: 0 },
      { pageType: "city",           city: "ghost-city",productCount: 10, parentProductCount: 0 },
    ];

    const report = {};
    for (const sample of samples) {
      const { pageType } = sample;
      if (!report[pageType]) report[pageType] = { eligible: 0, ineligible: 0 };
      const { eligible } = isPageEligible(sample);
      if (eligible) report[pageType].eligible++;
      else report[pageType].ineligible++;
    }

    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    process.exit(0);
  } else {
    process.stderr.write("Usage: node pageEligibility.mjs --eligibility-report\n");
    process.exit(1);
  }
}
