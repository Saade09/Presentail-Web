import { describe, expect, it } from "vitest";
import { resolveProductPricing } from "./homepage";

describe("homepage product pricing contract", () => {
  it("preserves native AED regular, sale, and exact values from enrichment", () => {
    const result = resolveProductPricing(
      {
        osNumericId: 313,
        price: 82,
        discount_price_aed: null,
      },
      new Map([
        [
          "313",
          {
            regularPriceUsd: 82,
            discountPriceUsd: 57,
            discountPriceAed: 210,
            priceAed: 300,
            priceAedExact: "300.000",
            discountPriceAedExact: "210.000",
          },
        ],
      ]),
    );

    expect(result).toEqual({
      displayPrice: 82,
      discountPriceValue: 57,
      discountPriceAed: 210,
      priceAed: 300,
      priceAedExact: "300.000",
      discountPriceAedExact: "210.000",
    });
  });

  it("keeps native AED values on the raw-product fallback path", () => {
    const result = resolveProductPricing(
      {
        osNumericId: 314,
        price: 68,
        priceAed: "250.000",
        discount_price_aed: "240.500",
      },
      new Map(),
    );

    expect(result.priceAed).toBe(250);
    expect(result.priceAedExact).toBe("250.000");
    expect(result.discountPriceAed).toBe(240.5);
    expect(result.discountPriceAedExact).toBe("240.500");
  });

  it("does not synthesize an AED comparison value from USD-only pricing", () => {
    const result = resolveProductPricing(
      {
        osNumericId: 315,
        price: 50,
        discount_price_usd: "40",
      },
      new Map(),
    );

    expect(result.priceAed).toBeNull();
    expect(result.priceAedExact).toBeNull();
    expect(result.discountPriceAedExact).toBeNull();
  });
});