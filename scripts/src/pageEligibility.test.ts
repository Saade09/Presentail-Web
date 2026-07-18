import { describe, it, expect } from "vitest";
import {
  isPageEligible,
  eligibilityReason,
  MIN_PRODUCTS_BY_TYPE,
  UNIQUENESS_RATIO_MIN,
} from "../../artifacts/presentail-web/scripts/pageEligibility.mjs";

describe("isPageEligible", () => {
  it("city page with 5 products → eligible", () => {
    const result = isPageEligible({
      pageType: "city",
      city: "beirut",
      productCount: 5,
      parentProductCount: 0,
    });
    expect(result.eligible).toBe(true);
  });

  it("city page with 4 products → ineligible (below threshold of 5)", () => {
    const result = isPageEligible({
      pageType: "city",
      city: "beirut",
      productCount: 4,
      parentProductCount: 0,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/minimum/i);
  });

  it("city-category with 4 products, parent 20 → eligible (ratio 0.20 ≥ 0.15)", () => {
    const result = isPageEligible({
      pageType: "city-category",
      city: "beirut",
      categorySlug: "flowers",
      productCount: 4,
      parentProductCount: 20,
    });
    expect(result.eligible).toBe(true);
  });

  it("city-category with 4 products, parent 40 → ineligible (ratio 0.10 < 0.15)", () => {
    const result = isPageEligible({
      pageType: "city-category",
      city: "beirut",
      categorySlug: "flowers",
      productCount: 4,
      parentProductCount: 40,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/ratio/i);
  });

  it("city-category with 20 products = parent 20 → ineligible (identical inventory)", () => {
    const result = isPageEligible({
      pageType: "city-category",
      city: "beirut",
      categorySlug: "flowers",
      productCount: 20,
      parentProductCount: 20,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/identical/i);
  });

  it("identical inventory skipped when parentEligible=false — parent ineligible so no value-add check needed", () => {
    // When the parent collection is itself ineligible (too few products for its
    // own threshold), the city page is already excluded by the min-count rule.
    // The identical-inventory check should not fire redundantly.
    const result = isPageEligible({
      pageType: "city-category",
      city: "beirut",
      categorySlug: "flowers",
      productCount: 20,
      parentProductCount: 20,
      parentEligible: false,
    });
    // productCount (20) passes min-count (4); parentEligible=false means
    // identical-inventory is skipped → eligible.
    expect(result.eligible).toBe(true);
  });

  it("identical inventory still flagged when parentEligible=true", () => {
    const result = isPageEligible({
      pageType: "city-category",
      city: "beirut",
      categorySlug: "flowers",
      productCount: 20,
      parentProductCount: 20,
      parentEligible: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/identical/i);
  });

  it("identical inventory still flagged when parentEligible=null (conservative default)", () => {
    const result = isPageEligible({
      pageType: "city-category",
      city: "beirut",
      categorySlug: "flowers",
      productCount: 20,
      parentProductCount: 20,
      parentEligible: null,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/identical/i);
  });

  it("city-brand with null productCount → ineligible (fail closed)", () => {
    const result = isPageEligible({
      pageType: "city-brand",
      city: "beirut",
      brandSlug: "roses",
      productCount: null,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/failing closed/i);
  });

  it("ghost city (slug not in CITY_SLUGS_BY_COUNTRY) → ineligible regardless of count", () => {
    const result = isPageEligible({
      pageType: "city-category",
      city: "atlantis",
      categorySlug: "flowers",
      productCount: 100,
      parentProductCount: 0,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/CITY_SLUGS_BY_COUNTRY/);
  });

  it("eligibilityReason returns a non-empty string for eligible case", () => {
    const reason = eligibilityReason({
      pageType: "city-brand",
      city: "dubai",
      brandSlug: "fleurop",
      productCount: 5,
      parentProductCount: 0,
    });
    expect(typeof reason).toBe("string");
    expect(reason.length).toBeGreaterThan(0);
  });

  it("eligibilityReason returns a non-empty string for ineligible case", () => {
    const reason = eligibilityReason({
      pageType: "city-brand",
      city: "dubai",
      brandSlug: "tiny",
      productCount: 0,
      parentProductCount: 0,
    });
    expect(typeof reason).toBe("string");
    expect(reason.length).toBeGreaterThan(0);
  });
});

describe("MIN_PRODUCTS_BY_TYPE", () => {
  it("exports the correct thresholds", () => {
    expect(MIN_PRODUCTS_BY_TYPE["city"]).toBe(5);
    expect(MIN_PRODUCTS_BY_TYPE["city-category"]).toBe(4);
    expect(MIN_PRODUCTS_BY_TYPE["city-occasion"]).toBe(4);
    expect(MIN_PRODUCTS_BY_TYPE["city-brand"]).toBe(3);
    expect(MIN_PRODUCTS_BY_TYPE["city-recipient"]).toBe(4);
  });
});

describe("UNIQUENESS_RATIO_MIN", () => {
  it("is 0.15", () => {
    expect(UNIQUENESS_RATIO_MIN).toBe(0.15);
  });
});
