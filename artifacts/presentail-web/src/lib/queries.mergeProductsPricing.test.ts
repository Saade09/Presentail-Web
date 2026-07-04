/**
 * Unit tests for mergeProductsPricing (exported as __mergeProductsPricingForTest).
 *
 * mergeProductsPricing takes a list of already-mapped Product objects and a
 * ProductsPricingMap keyed by osNumericId (string), then returns a new list
 * where products that appear in the map have their priceValue /
 * discountPriceValue / discountPriceAed overridden.
 *
 * Scenarios covered:
 *   - Correct override of priceValue, discountPriceValue, discountPriceAed
 *     when the modern regular_price / sale_price scheme is active
 *     (regularPriceUsd non-null → becomes priceValue).
 *   - Legacy scheme (regularPriceUsd null) → priceValue unchanged.
 *   - osNumericId key matching — only the product with the matching key is
 *     updated; others pass through untouched.
 *   - Passthrough when the map has no entry for a product.
 *   - Passthrough for the whole list when the pricing map is empty.
 *   - Products with no osNumericId (undefined / null) are never matched.
 *   - discountPriceAed override when the AED-only discount is present.
 */

import { describe, it, expect, vi } from "vitest";

// Mock all heavy dependencies that queries.ts imports at the module level so
// we can import the test export without a browser / React environment.
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("./api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("./osClient", () => ({
  fetchOsProducts: vi.fn(),
  fetchOsProductPricing: vi.fn(),
}));

vi.mock("./osProductMapper", () => ({
  mapOsProduct: vi.fn(),
  isVisibleOsProduct: vi.fn(),
  isDeliverableOsProduct: vi.fn(),
}));

vi.mock("./attribution", () => ({
  readAttribution: vi.fn().mockReturnValue(null),
}));

// Import the test exports after mocks are in place.
import { __mergeProductsPricingForTest as merge, __fetchProductsPricingForTest as fetchPricing } from "@/lib/queries";
import type { Product } from "@/lib/queries";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<Product> & { id: string }): Product {
  return {
    wcId: 0,
    name: overrides.id,
    price: "$50",
    priceValue: 50,
    image: null,
    category: "flowers",
    categories: [],
    inStock: true,
    occasions: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("mergeProductsPricing — modern regular_price / sale_price scheme", () => {
  it("overrides priceValue with regularPriceUsd when regularPriceUsd is non-null", () => {
    const products = [makeProduct({ id: "rose", osNumericId: 101, priceValue: 50 })];
    const pricing = {
      "101": { discountPriceUsd: 60, discountPriceAed: null, regularPriceUsd: 80 },
    };

    const result = merge(products, pricing);

    expect(result[0].priceValue).toBe(80);
    expect(result[0].discountPriceValue).toBe(60);
    expect(result[0].discountPriceAed).toBeNull();
  });

  it("also sets discountPriceAed when both USD and AED discounts are present", () => {
    const products = [makeProduct({ id: "orchid", osNumericId: 102, priceValue: 70 })];
    const pricing = {
      "102": { discountPriceUsd: 55, discountPriceAed: 200, regularPriceUsd: 90 },
    };

    const result = merge(products, pricing);

    expect(result[0].priceValue).toBe(90);
    expect(result[0].discountPriceValue).toBe(55);
    expect(result[0].discountPriceAed).toBe(200);
  });
});

describe("mergeProductsPricing — legacy discount_price_usd scheme (regularPriceUsd null)", () => {
  it("does not override priceValue when regularPriceUsd is null", () => {
    const products = [makeProduct({ id: "tulip", osNumericId: 201, priceValue: 45 })];
    const pricing = {
      "201": { discountPriceUsd: 35, discountPriceAed: null, regularPriceUsd: null },
    };

    const result = merge(products, pricing);

    // priceValue must stay at the original value since there is no regularPriceUsd.
    expect(result[0].priceValue).toBe(45);
    expect(result[0].discountPriceValue).toBe(35);
  });
});

describe("mergeProductsPricing — AED-only discount", () => {
  it("sets discountPriceAed and leaves discountPriceValue as null for AED-only entry", () => {
    const products = [makeProduct({ id: "daisy", osNumericId: 301, priceValue: 30 })];
    const pricing = {
      "301": { discountPriceUsd: null, discountPriceAed: 110, regularPriceUsd: null },
    };

    const result = merge(products, pricing);

    expect(result[0].discountPriceAed).toBe(110);
    expect(result[0].discountPriceValue).toBeNull();
    expect(result[0].priceValue).toBe(30);
  });
});

describe("mergeProductsPricing — osNumericId key matching", () => {
  it("only updates the product whose osNumericId matches the map key", () => {
    const products = [
      makeProduct({ id: "match", osNumericId: 401, priceValue: 50 }),
      makeProduct({ id: "no-match", osNumericId: 402, priceValue: 60 }),
    ];
    const pricing = {
      "401": { discountPriceUsd: 40, discountPriceAed: null, regularPriceUsd: 55 },
    };

    const result = merge(products, pricing);

    expect(result[0].priceValue).toBe(55);
    expect(result[0].discountPriceValue).toBe(40);

    // Product 402 must be untouched.
    expect(result[1].priceValue).toBe(60);
    expect(result[1].discountPriceValue).toBeUndefined();
  });

  it("matches using String(osNumericId) so numeric and string keys both work", () => {
    // osNumericId stored as a number on the product.
    const products = [makeProduct({ id: "num-id", osNumericId: 501, priceValue: 40 })];
    // Pricing map key is the string "501".
    const pricing = {
      "501": { discountPriceUsd: 30, discountPriceAed: null, regularPriceUsd: 50 },
    };

    const result = merge(products, pricing);

    expect(result[0].priceValue).toBe(50);
    expect(result[0].discountPriceValue).toBe(30);
  });
});

describe("mergeProductsPricing — passthrough cases", () => {
  it("returns the original product list unchanged when pricing map is empty", () => {
    const products = [
      makeProduct({ id: "prod-a", osNumericId: 601, priceValue: 70 }),
      makeProduct({ id: "prod-b", osNumericId: 602, priceValue: 80 }),
    ];

    const result = merge(products, {});

    // Same array reference — early return when map is empty.
    expect(result).toBe(products);
  });

  it("returns product unchanged when its osNumericId has no entry in the pricing map", () => {
    const products = [makeProduct({ id: "no-entry", osNumericId: 701, priceValue: 55 })];
    const pricing = {
      "999": { discountPriceUsd: 40, discountPriceAed: null, regularPriceUsd: 60 },
    };

    const result = merge(products, pricing);

    expect(result[0].priceValue).toBe(55);
    expect(result[0].discountPriceValue).toBeUndefined();
  });

  it("skips products with no osNumericId (undefined)", () => {
    const products = [makeProduct({ id: "no-id", priceValue: 65 })];
    // osNumericId is undefined by default in makeProduct.
    const pricing = {
      "undefined": { discountPriceUsd: 50, discountPriceAed: null, regularPriceUsd: 70 },
    };

    const result = merge(products, pricing);

    // Must not match the "undefined" string key — osNumericId is nullish so
    // the product is returned as-is.
    expect(result[0].priceValue).toBe(65);
    expect(result[0].discountPriceValue).toBeUndefined();
  });

  it("preserves unrelated product fields on the merged product object", () => {
    const products = [
      makeProduct({
        id: "full-product",
        osNumericId: 801,
        priceValue: 50,
        name: "Full Rose Bouquet",
        category: "bouquets",
        inStock: true,
        occasions: ["birthday"],
      }),
    ];
    const pricing = {
      "801": { discountPriceUsd: 40, discountPriceAed: null, regularPriceUsd: 55 },
    };

    const result = merge(products, pricing);

    expect(result[0].name).toBe("Full Rose Bouquet");
    expect(result[0].category).toBe("bouquets");
    expect(result[0].inStock).toBe(true);
    expect(result[0].occasions).toEqual(["birthday"]);
  });
});

// ── fetchProductsPricing ──────────────────────────────────────────────────────
//
// The fetch helper calls /api/catalog/products-pricing and returns a
// ProductsPricingMap keyed by osNumericId string.  Tests use vi.stubGlobal to
// replace global fetch so they never hit the network.

describe("fetchProductsPricing — returns a non-empty map from a successful response", () => {
  it("returns the pricing map when the server responds with ok:true and a populated pricing object", async () => {
    const pricingPayload = {
      "101": { discountPriceUsd: 45, discountPriceAed: 165, regularPriceUsd: 60 },
      "202": { discountPriceUsd: null, discountPriceAed: 110, regularPriceUsd: null },
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, pricing: pricingPayload }),
    }));

    const result = await fetchPricing();

    expect(Object.keys(result).length).toBeGreaterThan(0);
    expect(result["101"]).toEqual({ discountPriceUsd: 45, discountPriceAed: 165, regularPriceUsd: 60 });
    expect(result["202"]).toEqual({ discountPriceUsd: null, discountPriceAed: 110, regularPriceUsd: null });

    vi.unstubAllGlobals();
  });

  it("returns an empty map when the server response has ok:false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false }),
    }));

    const result = await fetchPricing();

    expect(result).toEqual({});

    vi.unstubAllGlobals();
  });

  it("returns an empty map when the server response has no pricing field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }));

    const result = await fetchPricing();

    expect(result).toEqual({});

    vi.unstubAllGlobals();
  });

  it("returns an empty map when the HTTP response is not ok (e.g. 503)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }));

    const result = await fetchPricing();

    expect(result).toEqual({});

    vi.unstubAllGlobals();
  });

  it("returns an empty map when fetch throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const result = await fetchPricing();

    expect(result).toEqual({});

    vi.unstubAllGlobals();
  });
});
