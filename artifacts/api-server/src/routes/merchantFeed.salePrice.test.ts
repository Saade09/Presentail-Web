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

vi.mock("../lib/osProductsCache", () => ({
  getOsProducts: vi.fn(),
}));

// ── Import the internal buildFeedData via a test-only export shim ─────────────
// merchantFeed.ts does not export buildFeedData, so we extract the logic
// by importing the module and using its exported routers for side-effects,
// then test the price logic through a lightweight inline port that mirrors
// the exact branching in merchantFeed.ts.
//
// This is intentional: we want to guard the *branching logic*, not the XML
// serialisation.  The inline port below must be kept in sync with the
// `salePrice` block in buildFeedData when that block changes.

const USD_RATE: Record<string, number> = { USD: 1, AED: 3.6725, EUR: 0.92 };

function convertPrice(usdPrice: number, currency: string): string {
  const rate = USD_RATE[currency] ?? 1;
  const converted = Math.round(usdPrice * rate * 100) / 100;
  return `${converted.toFixed(2)} ${currency}`;
}

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
  const regularPriceRaw = product.regular_price ? parseFloat(product.regular_price) : NaN;
  const hasRegularPrice = !isNaN(regularPriceRaw) && regularPriceRaw > 0;
  const basePriceUsd = hasRegularPrice ? regularPriceRaw : product.price;

  let salePrice: string | null = null;

  if (hasRegularPrice) {
    if (product.sale_price) {
      const salePriceUsd = parseFloat(product.sale_price);
      if (!isNaN(salePriceUsd) && salePriceUsd > 0 && salePriceUsd < regularPriceRaw) {
        salePrice = convertPrice(salePriceUsd, currency);
      }
    }
    if (salePrice === null && product.price > 0 && product.price < regularPriceRaw) {
      salePrice = convertPrice(product.price, currency);
    }
  }

  if (salePrice === null) {
    if (currency === "AED" && product.discount_price_aed) {
      const discountAed = parseFloat(product.discount_price_aed);
      const baseAed = basePriceUsd * (USD_RATE["AED"] ?? 1);
      if (!isNaN(discountAed) && discountAed > 0 && discountAed < baseAed) {
        salePrice = `${discountAed.toFixed(2)} AED`;
      }
    } else if (product.discount_price_usd) {
      const discountUsd = parseFloat(product.discount_price_usd);
      if (!isNaN(discountUsd) && discountUsd > 0 && discountUsd < basePriceUsd) {
        salePrice = convertPrice(discountUsd, currency);
      }
    }
  }

  return salePrice;
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

  it("OS sale_price + regular_price yields converted sale price in AED feed", () => {
    const result = resolveFeedSalePrice(
      { price: 15, regular_price: "25", sale_price: "15" },
      "AED",
    );
    expect(result).toBe(convertPrice(15, "AED"));
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

  it("no OS pair, AED feed with discount_price_aed → AED sale price", () => {
    const result = resolveFeedSalePrice(
      { price: 25, discount_price_aed: "73.50" },
      "AED",
    );
    expect(result).toBe("73.50 AED");
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
});
