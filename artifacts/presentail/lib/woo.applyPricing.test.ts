/**
 * Unit tests for applyPricingToProducts() in lib/woo.ts.
 *
 * applyPricingToProducts merges discount prices from the /api/catalog/products-pricing
 * response (a ProductPricingMap keyed by osNumericId string) into a product array.
 *
 * Scenarios covered:
 *   - Products with a matching osNumericId get discountPriceValue and discountPriceAed
 *     overwritten from the map.
 *   - Products without an osNumericId are returned unchanged.
 *   - Products whose osNumericId has no entry in the map are returned unchanged.
 *   - An empty map returns the products array unchanged (fast-path guard).
 *   - Null / string / numeric osNumericId variants all key correctly.
 *   - Map entry with discountPriceUsd=null keeps the product's existing discountPriceValue.
 *   - Map entry with discountPriceAed=null keeps the product's existing discountPriceAed.
 *   - Products with both USD and AED discount prices get both fields updated.
 */

import { describe, expect, it } from "vitest";
import { applyPricingToProducts } from "./woo";
import type { ProductPricingMap, WooProduct } from "./woo";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeProduct(
  overrides: Partial<WooProduct> & { osNumericId?: number | string | null },
): Pick<WooProduct, "osNumericId" | "discountPriceValue" | "discountPriceAed" | "priceValue"> {
  return {
    priceValue: 100,
    discountPriceValue: undefined,
    discountPriceAed: undefined,
    osNumericId: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("applyPricingToProducts — empty map fast-path", () => {
  it("returns the original products array unchanged when the map is empty", () => {
    const products = [
      makeProduct({ osNumericId: 101, discountPriceValue: 80 }),
      makeProduct({ osNumericId: 202 }),
    ];
    const result = applyPricingToProducts(products, {});
    expect(result).toBe(products);
  });
});

describe("applyPricingToProducts — products with matching osNumericId", () => {
  it("overwrites discountPriceValue and discountPriceAed for a product with a matching key", () => {
    const products = [makeProduct({ osNumericId: 101 })];
    const pricingMap: ProductPricingMap = {
      "101": { discountPriceUsd: 65, discountPriceAed: 239, regularPriceUsd: 90 },
    };

    const [result] = applyPricingToProducts(products, pricingMap);

    expect(result.discountPriceValue).toBe(65);
    expect(result.discountPriceAed).toBe(239);
  });

  it("overwrites discountPriceValue from the map even when the product had a prior value", () => {
    const products = [makeProduct({ osNumericId: 202, discountPriceValue: 50, discountPriceAed: 185 })];
    const pricingMap: ProductPricingMap = {
      "202": { discountPriceUsd: 45, discountPriceAed: 165, regularPriceUsd: 70 },
    };

    const [result] = applyPricingToProducts(products, pricingMap);

    expect(result.discountPriceValue).toBe(45);
    expect(result.discountPriceAed).toBe(165);
  });

  it("handles a numeric string osNumericId — map key is derived via String()", () => {
    const products = [makeProduct({ osNumericId: "303" })];
    const pricingMap: ProductPricingMap = {
      "303": { discountPriceUsd: 30, discountPriceAed: null, regularPriceUsd: 50 },
    };

    const [result] = applyPricingToProducts(products, pricingMap);

    expect(result.discountPriceValue).toBe(30);
  });

  it("applies matching entries to multiple products in a single pass", () => {
    const products = [
      makeProduct({ osNumericId: 10 }),
      makeProduct({ osNumericId: 20 }),
      makeProduct({ osNumericId: 30 }),
    ];
    const pricingMap: ProductPricingMap = {
      "10": { discountPriceUsd: 11, discountPriceAed: 40, regularPriceUsd: 20 },
      "20": { discountPriceUsd: 22, discountPriceAed: 80, regularPriceUsd: 35 },
      "30": { discountPriceUsd: 33, discountPriceAed: 121, regularPriceUsd: 55 },
    };

    const results = applyPricingToProducts(products, pricingMap);

    expect(results[0].discountPriceValue).toBe(11);
    expect(results[1].discountPriceValue).toBe(22);
    expect(results[2].discountPriceValue).toBe(33);
    expect(results[0].discountPriceAed).toBe(40);
    expect(results[1].discountPriceAed).toBe(80);
    expect(results[2].discountPriceAed).toBe(121);
  });
});

describe("applyPricingToProducts — products without osNumericId", () => {
  it("returns a product with osNumericId=null unchanged", () => {
    const product = makeProduct({ osNumericId: null, discountPriceValue: 70 });
    const pricingMap: ProductPricingMap = {
      "null": { discountPriceUsd: 99, discountPriceAed: 363, regularPriceUsd: 110 },
    };

    const [result] = applyPricingToProducts([product], pricingMap);

    expect(result).toBe(product);
    expect(result.discountPriceValue).toBe(70);
  });

  it("returns a product with osNumericId=undefined unchanged", () => {
    const product = makeProduct({ osNumericId: undefined });
    const pricingMap: ProductPricingMap = {
      "undefined": { discountPriceUsd: 99, discountPriceAed: null, regularPriceUsd: 110 },
    };

    const [result] = applyPricingToProducts([product], pricingMap);

    expect(result).toBe(product);
  });
});

describe("applyPricingToProducts — products with no map entry", () => {
  it("returns a product unchanged when its osNumericId is not in the map", () => {
    const product = makeProduct({ osNumericId: 999, discountPriceValue: 55 });
    const pricingMap: ProductPricingMap = {
      "111": { discountPriceUsd: 40, discountPriceAed: null, regularPriceUsd: 60 },
    };

    const [result] = applyPricingToProducts([product], pricingMap);

    expect(result).toBe(product);
    expect(result.discountPriceValue).toBe(55);
  });

  it("only enriches the matching product in a mixed array", () => {
    const matched = makeProduct({ osNumericId: 401 });
    const unmatched = makeProduct({ osNumericId: 402, discountPriceValue: 80 });
    const noId = makeProduct({ osNumericId: null });
    const pricingMap: ProductPricingMap = {
      "401": { discountPriceUsd: 50, discountPriceAed: 184, regularPriceUsd: 70 },
    };

    const results = applyPricingToProducts([matched, unmatched, noId], pricingMap);

    expect(results[0].discountPriceValue).toBe(50);
    expect(results[1]).toBe(unmatched);
    expect(results[1].discountPriceValue).toBe(80);
    expect(results[2]).toBe(noId);
  });
});

describe("applyPricingToProducts — null values in the map entry", () => {
  it("falls back to the product's existing discountPriceValue when discountPriceUsd is null", () => {
    const product = makeProduct({ osNumericId: 501, discountPriceValue: 45, discountPriceAed: null });
    const pricingMap: ProductPricingMap = {
      "501": { discountPriceUsd: null, discountPriceAed: 165, regularPriceUsd: null },
    };

    const [result] = applyPricingToProducts([product], pricingMap);

    expect(result.discountPriceValue).toBe(45);
    expect(result.discountPriceAed).toBe(165);
  });

  it("falls back to the product's existing discountPriceAed when discountPriceAed is null", () => {
    const product = makeProduct({ osNumericId: 502, discountPriceValue: null, discountPriceAed: 220 });
    const pricingMap: ProductPricingMap = {
      "502": { discountPriceUsd: 60, discountPriceAed: null, regularPriceUsd: 80 },
    };

    const [result] = applyPricingToProducts([product], pricingMap);

    expect(result.discountPriceValue).toBe(60);
    expect(result.discountPriceAed).toBe(220);
  });

  it("sets discountPriceValue and discountPriceAed to null when both are null and product has no prior values", () => {
    const product = makeProduct({ osNumericId: 503 });
    const pricingMap: ProductPricingMap = {
      "503": { discountPriceUsd: null, discountPriceAed: null, regularPriceUsd: 70 },
    };

    const [result] = applyPricingToProducts([product], pricingMap);

    expect(result.discountPriceValue).toBeNull();
    expect(result.discountPriceAed).toBeNull();
  });
});

describe("applyPricingToProducts — AED-only discount (no USD discount)", () => {
  it("sets discountPriceAed and leaves discountPriceValue null when only AED discount is present", () => {
    const product = makeProduct({ osNumericId: 601, discountPriceValue: undefined });
    const pricingMap: ProductPricingMap = {
      "601": { discountPriceUsd: null, discountPriceAed: 275, regularPriceUsd: null },
    };

    const [result] = applyPricingToProducts([product], pricingMap);

    expect(result.discountPriceAed).toBe(275);
    // discountPriceUsd is null and product had no prior value → resolves to null
    expect(result.discountPriceValue).toBeNull();
  });
});

describe("applyPricingToProducts — does not mutate input products", () => {
  it("returns new product objects instead of mutating the originals", () => {
    const product = makeProduct({ osNumericId: 701, discountPriceValue: 90 });
    const pricingMap: ProductPricingMap = {
      "701": { discountPriceUsd: 60, discountPriceAed: 220, regularPriceUsd: 90 },
    };

    const [result] = applyPricingToProducts([product], pricingMap);

    expect(result).not.toBe(product);
    expect(product.discountPriceValue).toBe(90);
  });
});
