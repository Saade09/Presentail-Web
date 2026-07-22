/**
 * Unit tests for the product SEO lifecycle helpers exported from seo-inject.mjs.
 *
 * Covers:
 *   - getProductAvailabilityState — maps OS product shape to lifecycle state
 *   - buildProductHead — title suffix, schema.org availability, returnPolicy
 */

import { describe, it, expect } from "vitest";

// seo-inject.mjs is a pure ESM module in the presentail-web artifact.
// Vitest's node environment resolves .mjs imports from the workspace root.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const {
  getProductAvailabilityState,
  PRODUCT_AVAILABILITY_STATE,
  buildProductHead,
// @ts-expect-error — plain .mjs module without type declarations
} = await import("../../artifacts/presentail-web/seo-inject.mjs") as Record<string, any>;

// ── helpers ─────────────────────────────────────────────────────────────────

/** Extract all @graph schema items from an HTML headSnippet string. */
function extractGraphItems(headSnippet: string): Record<string, unknown>[] {
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  const items: Record<string, unknown>[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(headSnippet)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed["@graph"] && Array.isArray(parsed["@graph"])) {
        items.push(...parsed["@graph"]);
      } else {
        items.push(parsed);
      }
    } catch {
      // skip malformed
    }
  }
  return items;
}

function findSchema(headSnippet: string, type: string): Record<string, unknown> | undefined {
  return extractGraphItems(headSnippet).find((s) => s["@type"] === type) as
    | Record<string, unknown>
    | undefined;
}

/** Minimal product stub for buildProductHead. */
function makeProduct(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Red Rose Bouquet",
    description: "A beautiful arrangement of fresh red roses.",
    priceValue: 89,
    inStock: true,
    status: "publish",
    tags: [],
    osNumericId: 42,
    image: { uri: "https://example.com/rose.jpg" },
    ...overrides,
  };
}

const BASE_HEAD_OPTS = {
  lang: "en" as const,
  basePath: "/",
  origin: "https://presentail.com",
  pathname: "/en-lb/beirut/product/red-rose-bouquet",
  cityLabel: "Beirut",
  countryLabel: "Lebanon",
  countryCode: "LB",
  country: "lb",
};

// ── getProductAvailabilityState ──────────────────────────────────────────────

describe("getProductAvailabilityState", () => {
  it("returns ACTIVE for a normal in-stock product", () => {
    expect(
      getProductAvailabilityState(makeProduct()),
    ).toBe(PRODUCT_AVAILABILITY_STATE.ACTIVE);
  });

  it("returns DISCONTINUED when status === 'discontinued'", () => {
    expect(
      getProductAvailabilityState(makeProduct({ status: "discontinued", inStock: true })),
    ).toBe(PRODUCT_AVAILABILITY_STATE.DISCONTINUED);
  });

  it("DISCONTINUED takes priority over inStock=false", () => {
    expect(
      getProductAvailabilityState(makeProduct({ status: "discontinued", inStock: false })),
    ).toBe(PRODUCT_AVAILABILITY_STATE.DISCONTINUED);
  });

  it("returns SEASONAL_UNAVAILABLE for out-of-stock + seasonal tag", () => {
    expect(
      getProductAvailabilityState(makeProduct({ inStock: false, tags: ["seasonal"] })),
    ).toBe(PRODUCT_AVAILABILITY_STATE.SEASONAL_UNAVAILABLE);
  });

  it("returns SOLD_OUT_TEMPORARILY for out-of-stock without seasonal tag", () => {
    expect(
      getProductAvailabilityState(makeProduct({ inStock: false, tags: [] })),
    ).toBe(PRODUCT_AVAILABILITY_STATE.SOLD_OUT_TEMPORARILY);
  });

  it("returns SOLD_OUT_TEMPORARILY for out-of-stock with non-seasonal tags", () => {
    expect(
      getProductAvailabilityState(makeProduct({ inStock: false, tags: ["featured", "sale"] })),
    ).toBe(PRODUCT_AVAILABILITY_STATE.SOLD_OUT_TEMPORARILY);
  });

  it("returns ACTIVE for null/undefined product", () => {
    expect(getProductAvailabilityState(null)).toBe(PRODUCT_AVAILABILITY_STATE.ACTIVE);
    expect(getProductAvailabilityState(undefined)).toBe(PRODUCT_AVAILABILITY_STATE.ACTIVE);
  });
});

// ── buildProductHead — schema.org availability ───────────────────────────────

describe("buildProductHead — schema.org availability", () => {
  it("emits InStock for an ACTIVE product", () => {
    const result = buildProductHead({ product: makeProduct(), ...BASE_HEAD_OPTS });
    const productSchema = findSchema(result.headSnippet, "Product");
    const offer = (productSchema?.offers as Record<string, unknown> | undefined);
    expect(offer?.availability).toBe("https://schema.org/InStock");
  });

  it("emits OutOfStock for a SOLD_OUT_TEMPORARILY product", () => {
    const product = makeProduct({ inStock: false, tags: [] });
    const result = buildProductHead({ product, ...BASE_HEAD_OPTS });
    const productSchema = findSchema(result.headSnippet, "Product");
    const offer = (productSchema?.offers as Record<string, unknown> | undefined);
    expect(offer?.availability).toBe("https://schema.org/OutOfStock");
  });

  it("emits OutOfStock for a SEASONAL_UNAVAILABLE product", () => {
    const product = makeProduct({ inStock: false, tags: ["seasonal"] });
    const result = buildProductHead({ product, ...BASE_HEAD_OPTS });
    const productSchema = findSchema(result.headSnippet, "Product");
    const offer = (productSchema?.offers as Record<string, unknown> | undefined);
    expect(offer?.availability).toBe("https://schema.org/OutOfStock");
  });
});

// ── buildProductHead — returnPolicy ─────────────────────────────────────────

describe("buildProductHead — returnPolicy", () => {
  it("includes returnPolicy URL on the Product schema", () => {
    const result = buildProductHead({ product: makeProduct(), ...BASE_HEAD_OPTS });
    const productSchema = findSchema(result.headSnippet, "Product");
    expect(productSchema?.returnPolicy).toBe(
      "https://presentail.com/en-lb/beirut/return-policy",
    );
  });

  it("includes returnPolicy for sold-out products too", () => {
    const product = makeProduct({ inStock: false, tags: [] });
    const result = buildProductHead({ product, ...BASE_HEAD_OPTS });
    const productSchema = findSchema(result.headSnippet, "Product");
    expect(productSchema?.returnPolicy).toBe(
      "https://presentail.com/en-lb/beirut/return-policy",
    );
  });
});

// ── buildProductHead — title suffix ─────────────────────────────────────────

describe("buildProductHead — title suffix", () => {
  it("does NOT append a suffix for an ACTIVE product", () => {
    const result = buildProductHead({ product: makeProduct(), ...BASE_HEAD_OPTS });
    expect(result.title).not.toContain("Coming Soon");
    expect(result.title).not.toContain("قريباً");
    expect(result.title).not.toContain("Bientôt");
  });

  it("appends the EN 'Coming Soon' suffix for SOLD_OUT_TEMPORARILY (en)", () => {
    const product = makeProduct({ inStock: false, tags: [] });
    const result = buildProductHead({ product, ...BASE_HEAD_OPTS });
    expect(result.title).toMatch(/–\s*Coming Soon$/);
  });

  it("appends the AR suffix for SOLD_OUT_TEMPORARILY (ar)", () => {
    const product = makeProduct({ inStock: false, tags: [] });
    const result = buildProductHead({ product, ...BASE_HEAD_OPTS, lang: "ar" });
    expect(result.title).toContain("قريباً");
  });

  it("appends the FR suffix for SEASONAL_UNAVAILABLE (fr)", () => {
    const product = makeProduct({ inStock: false, tags: ["seasonal"] });
    const result = buildProductHead({ product, ...BASE_HEAD_OPTS, lang: "fr" });
    expect(result.title).toContain("Bientôt disponible");
  });

  it("appends EN suffix for SEASONAL_UNAVAILABLE (en)", () => {
    const product = makeProduct({ inStock: false, tags: ["seasonal"] });
    const result = buildProductHead({ product, ...BASE_HEAD_OPTS, lang: "en" });
    expect(result.title).toMatch(/–\s*Coming Soon$/);
  });

  it("does NOT append a suffix for DISCONTINUED (DISCONTINUED pages get 301/410)", () => {
    const product = makeProduct({ status: "discontinued" });
    const result = buildProductHead({
      product,
      availabilityState: PRODUCT_AVAILABILITY_STATE.DISCONTINUED,
      ...BASE_HEAD_OPTS,
    });
    expect(result.title).not.toContain("Coming Soon");
  });
});

// ── buildProductHead — explicit availabilityState override ───────────────────

describe("buildProductHead — availabilityState override", () => {
  it("accepts explicit ACTIVE state and emits InStock even for product.inStock=false", () => {
    const product = makeProduct({ inStock: false, tags: [] });
    const result = buildProductHead({
      product,
      availabilityState: PRODUCT_AVAILABILITY_STATE.ACTIVE,
      ...BASE_HEAD_OPTS,
    });
    const productSchema = findSchema(result.headSnippet, "Product");
    const offer = (productSchema?.offers as Record<string, unknown> | undefined);
    expect(offer?.availability).toBe("https://schema.org/InStock");
    expect(result.title).not.toContain("Coming Soon");
  });

  it("accepts explicit SOLD_OUT_TEMPORARILY and emits OutOfStock + suffix", () => {
    const product = makeProduct({ inStock: true });
    const result = buildProductHead({
      product,
      availabilityState: PRODUCT_AVAILABILITY_STATE.SOLD_OUT_TEMPORARILY,
      ...BASE_HEAD_OPTS,
      lang: "en",
    });
    const productSchema = findSchema(result.headSnippet, "Product");
    const offer = (productSchema?.offers as Record<string, unknown> | undefined);
    expect(offer?.availability).toBe("https://schema.org/OutOfStock");
    expect(result.title).toMatch(/–\s*Coming Soon$/);
  });
});

// ── buildProductHead — itemCondition ────────────────────────────────────────

describe("buildProductHead — itemCondition", () => {
  it("sets NewCondition on the Product schema itself", () => {
    const result = buildProductHead({ product: makeProduct(), ...BASE_HEAD_OPTS });
    const productSchema = findSchema(result.headSnippet, "Product");
    expect(productSchema?.itemCondition).toBe("https://schema.org/NewCondition");
  });

  it("sets NewCondition on the Offer nested inside Product", () => {
    const result = buildProductHead({ product: makeProduct(), ...BASE_HEAD_OPTS });
    const productSchema = findSchema(result.headSnippet, "Product");
    const offer = (productSchema?.offers as Record<string, unknown> | undefined);
    expect(offer?.itemCondition).toBe("https://schema.org/NewCondition");
  });
});

// ── buildProductHead — shippingDetails ──────────────────────────────────────

describe("buildProductHead — shippingDetails per country", () => {
  it("LB product Offer has shippingDestination.addressCountry === 'LB'", () => {
    const result = buildProductHead({ product: makeProduct(), ...BASE_HEAD_OPTS, countryCode: "LB" });
    const productSchema = findSchema(result.headSnippet, "Product");
    const offer = (productSchema?.offers as Record<string, unknown> | undefined);
    const shipping = (offer?.shippingDetails as Record<string, unknown> | undefined);
    const dest = (shipping?.shippingDestination as Record<string, unknown> | undefined);
    expect(dest?.addressCountry).toBe("LB");
  });

  it("AE product Offer has shippingDestination.addressCountry === 'AE'", () => {
    const result = buildProductHead({
      product: makeProduct(),
      ...BASE_HEAD_OPTS,
      countryCode: "AE",
      pathname: "/en-ae/dubai/product/red-rose-bouquet",
    });
    const productSchema = findSchema(result.headSnippet, "Product");
    const offer = (productSchema?.offers as Record<string, unknown> | undefined);
    const shipping = (offer?.shippingDetails as Record<string, unknown> | undefined);
    const dest = (shipping?.shippingDestination as Record<string, unknown> | undefined);
    expect(dest?.addressCountry).toBe("AE");
  });

  it("CY product Offer has shippingDestination.addressCountry === 'CY'", () => {
    const result = buildProductHead({
      product: makeProduct(),
      ...BASE_HEAD_OPTS,
      countryCode: "CY",
      pathname: "/en-cy/nicosia/product/red-rose-bouquet",
    });
    const productSchema = findSchema(result.headSnippet, "Product");
    const offer = (productSchema?.offers as Record<string, unknown> | undefined);
    const shipping = (offer?.shippingDetails as Record<string, unknown> | undefined);
    const dest = (shipping?.shippingDestination as Record<string, unknown> | undefined);
    expect(dest?.addressCountry).toBe("CY");
  });
});
