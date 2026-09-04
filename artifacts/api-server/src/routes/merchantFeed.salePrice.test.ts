/**
 * Tests for the sale-price resolution logic inside buildFeedData (merchantFeed.ts).
 *
 * The key invariants being guarded:
 *  - OS-native sale_price / regular_price pair takes priority over legacy fields.
 *  - When the pair is configured but sale_price is invalid, legacy discount fields
 *    are still used as a fallback (mirrors mapOsProductToWcShape behaviour).
 *  - AED-native discount_price_aed path is only triggered for AED feeds.
 *  - Legacy discount_price_usd path is the final fallback.
 */

import { describe, it, expect, vi } from "vitest";
import type { OSProduct } from "@workspace/presentail-os";
import { buildFeedData } from "./merchantFeed";

vi.mock("../lib/osProductsCache", () => ({
  getOsProducts: vi.fn(),
}));

function resolveFeedSalePrice(
  product: Pick<
    OSProduct,
    | "price"
    | "regular_price"
    | "sale_price"
    | "discount_price_usd"
    | "discount_price_aed"
  >,
  currency: string,
): string | null {
  const item = buildFeedData(
    currency.toLowerCase(),
    currency === "AED" ? "AE" : "LB",
    currency === "AED" ? "en-ae" : "en-lb",
    currency === "AED" ? "dubai" : "beirut",
    [{
      id: "test",
      name: "Test",
      price: product.price,
      priceAed: currency === "AED" ? "100" : undefined,
      regular_price: product.regular_price,
      sale_price: product.sale_price,
      discount_price_usd: product.discount_price_usd,
      discount_price_aed: product.discount_price_aed,
      images: [{ url: "https://example.com/image.jpg" }],
      inStock: true,
      categories: [],
      occasions: [],
      brands: [],
    }],
    currency,
  ).items[0];
  return item?.salePrice ?? null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("merchantFeed — sale price resolution", () => {
  it("OS sale_price + regular_price yields sale price in USD feed", () => {
    const result = resolveFeedSalePrice(
      { price: 15, regular_price: "25", sale_price: "15" },
      "USD",
    );
    expect(result).toBe("15.00 USD");
  });

  it("UAE does not synthesize a sale from USD fields", () => {
    const result = resolveFeedSalePrice(
      { price: 15, regular_price: "25", sale_price: "15" },
      "AED",
    );
    expect(result).toBeNull();
  });

  it("sale_price '0' (invalid) → falls through to legacy discount_price_usd", () => {
    const result = resolveFeedSalePrice(
      {
        price: 25,
        regular_price: "25",
        sale_price: "0",
        discount_price_usd: "18",
      },
      "USD",
    );
    expect(result).toBe("18.00 USD");
  });

  it("sale_price >= regular_price (invalid) → falls through to legacy discount_price_usd", () => {
    const result = resolveFeedSalePrice(
      {
        price: 30,
        regular_price: "25",
        sale_price: "30",
        discount_price_usd: "20",
      },
      "USD",
    );
    expect(result).toBe("20.00 USD");
  });

  it("sale_price absent, p.price < regular_price → p.price used as sale price (legacy discount ignored)", () => {
    // When regular_price is set, p.price is authoritative; discount_price_usd is not used
    const result = resolveFeedSalePrice(
      { price: 25, regular_price: "30", discount_price_usd: "20" },
      "USD",
    );
    expect(result).toBe("25.00 USD");
  });

  it("no OS pair, no legacy fields → null", () => {
    const result = resolveFeedSalePrice({ price: 25 }, "USD");
    expect(result).toBeNull();
  });

  it("no OS pair, legacy discount_price_usd → USD sale price", () => {
    const result = resolveFeedSalePrice(
      { price: 25, discount_price_usd: "18" },
      "USD",
    );
    expect(result).toBe("18.00 USD");
  });

  it("OS pair takes priority over legacy discount_price_usd when both are set", () => {
    const result = resolveFeedSalePrice(
      {
        price: 15,
        regular_price: "25",
        sale_price: "15",
        discount_price_usd: "10",
      },
      "USD",
    );
    expect(result).toBe("15.00 USD");
  });

  it("sale_price present but regular_price absent → falls through to legacy", () => {
    const result = resolveFeedSalePrice(
      { price: 25, sale_price: "15", discount_price_usd: "18" },
      "USD",
    );
    expect(result).toBe("18.00 USD");
  });

  it("p.price < regular_price (no sale_price field) → p.price used as sale price", () => {
    const result = resolveFeedSalePrice(
      { price: 90, regular_price: "130" },
      "USD",
    );
    expect(result).toBe("90.00 USD");
  });

  it("p.price === regular_price → null (no active sale)", () => {
    const result = resolveFeedSalePrice(
      { price: 130, regular_price: "130" },
      "USD",
    );
    expect(result).toBeNull();
  });

  it("explicit sale_price takes priority over p.price when both indicate a discount", () => {
    const result = resolveFeedSalePrice(
      { price: 85, regular_price: "130", sale_price: "100" },
      "USD",
    );
    expect(result).toBe("100.00 USD");
  });

  it("uses native UAE regular and sale amounts verbatim, without FX rounding", () => {
    const product: OSProduct = {
      id: "uae-native",
      name: "UAE Native",
      price: 25,
      priceAed: "100.125",
      discount_price_aed: "73.505",
      images: [{ url: "https://example.com/image.jpg" }],
      inStock: true,
      categories: [],
      occasions: [],
      brands: [],
    };
    const result = buildFeedData("ae", "AE", "en-ae", "dubai", [product], "AED");
    expect(result.items[0]).toMatchObject({
      price: "100.125 AED",
      salePrice: "73.505 AED",
    });
  });

  it("excludes UAE products that lack a valid native AED regular price", () => {
    const product: OSProduct = {
      id: "no-native-aed",
      name: "No Native AED",
      price: 25,
      images: [{ url: "https://example.com/image.jpg" }],
      inStock: true,
      categories: [],
      occasions: [],
      brands: [],
    };
    const result = buildFeedData("ae", "AE", "en-ae", "dubai", [product], "AED");
    expect(result.items).toEqual([]);
    expect(result.exclusions).toEqual([{ slug: "no-native-aed", reason: "missing or invalid AED price" }]);
  });

  it("preserves trailing zeros and suppresses malformed or non-active native sales", () => {
    const base: OSProduct = {
      id: "strict-aed",
      name: "Strict AED",
      price: 25,
      priceAed: "100.1250",
      discount_price_aed: "100.1250",
      images: [{ url: "https://example.com/image.jpg" }],
      inStock: true,
      categories: [],
      occasions: [],
      brands: [],
    };
    expect(buildFeedData("ae", "AE", "en-ae", "dubai", [base], "AED").items[0]).toMatchObject({
      price: "100.1250 AED",
      salePrice: null,
    });
    expect(buildFeedData("ae", "AE", "en-ae", "dubai", [{
      ...base,
      priceAed: " 100.1250",
      discount_price_aed: "99.000",
    }], "AED").items).toEqual([]);
  });
});
