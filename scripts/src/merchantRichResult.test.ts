import { describe, it, expect } from "vitest";
import {
  buildProductSchema,
  buildOfferShipping,
  RETURN_WINDOW_DAYS,
  LB_STANDARD_SHIPPING_USD,
// @ts-expect-error — plain .mjs module without type declarations
} from "../../artifacts/presentail-web/scripts/merchantProductSchema.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_PRODUCT = {
  name: "Velvet Rose Bouquet",
  description: "A dozen long-stem roses.",
  image: { uri: "https://cdn.test/rose.jpg" },
  priceValue: 89.5,
  osNumericId: 42,
  inStock: true,
};

const CANONICAL_URL = "https://presentail.com/en-lb/beirut/product/velvet-rose-bouquet";

// ---------------------------------------------------------------------------
// Price and currency
// ---------------------------------------------------------------------------

describe("buildProductSchema — price and currency", () => {
  it("LB product: priceCurrency is USD", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.offers?.priceCurrency).toBe("USD");
  });

  it("AE product: priceCurrency is AED", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "AE",
      canonicalUrl: "https://presentail.com/en-ae/dubai/product/velvet-rose-bouquet",
    });
    expect(schema.offers?.priceCurrency).toBe("AED");
  });

  it("CY product: priceCurrency is EUR", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "CY",
      canonicalUrl: "https://presentail.com/en-cy/nicosia/product/velvet-rose-bouquet",
    });
    expect(schema.offers?.priceCurrency).toBe("EUR");
  });

  it("AE price is converted from USD to AED and rounded to nearest 5", () => {
    const schema = buildProductSchema({
      product: { ...BASE_PRODUCT, priceValue: 100 },
      countryCode: "AE",
      canonicalUrl: CANONICAL_URL,
    });
    // 100 × 3.6725 = 367.25 → roundToNearestFive(AED) → 365
    expect(parseFloat(schema.offers?.price)).toBe(365);
  });

  it("LB price stays in USD (no FX conversion)", () => {
    const schema = buildProductSchema({
      product: { ...BASE_PRODUCT, priceValue: 50 },
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(parseFloat(schema.offers?.price)).toBeCloseTo(50, 2);
  });

  it("never emits a price of 0 or below", () => {
    const schema = buildProductSchema({
      product: { ...BASE_PRODUCT, priceValue: 0 },
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.offers).toBeUndefined();
  });

  it("never emits offers when priceValue is negative", () => {
    const schema = buildProductSchema({
      product: { ...BASE_PRODUCT, priceValue: -5 },
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.offers).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// priceValidUntil
// ---------------------------------------------------------------------------

describe("buildProductSchema — priceValidUntil", () => {
  it("priceValidUntil is an ISO date string 30 days in the future", () => {
    const now = new Date("2026-07-18T10:00:00Z");
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
      now,
    });
    expect(schema.offers?.priceValidUntil).toBe("2026-08-17");
  });

  it("priceValidUntil matches the YYYY-MM-DD pattern", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.offers?.priceValidUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("priceValidUntil is at least 29 days in the future from now", () => {
    const now = new Date();
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
      now,
    });
    const validUntil = new Date(schema.offers!.priceValidUntil);
    const diffDays = (validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(29);
  });
});

// ---------------------------------------------------------------------------
// Seller
// ---------------------------------------------------------------------------

describe("buildProductSchema — seller", () => {
  it("Product schema contains a seller node with name Presentail", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.seller?.["@type"]).toBe("Organization");
    expect(schema.seller?.name).toBe("Presentail");
    expect(schema.seller?.url).toBe("https://presentail.com");
  });

  it("Offer also contains a seller node with name Presentail", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.offers?.seller?.name).toBe("Presentail");
  });
});

// ---------------------------------------------------------------------------
// hasMerchantReturnPolicy
// ---------------------------------------------------------------------------

describe("buildProductSchema — hasMerchantReturnPolicy (on Product node)", () => {
  it("LB product has hasMerchantReturnPolicy on the Product node with applicableCountry LB", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    // Policy is on the Product node, NOT inside offers
    const policy = schema.hasMerchantReturnPolicy;
    expect(schema.offers?.hasMerchantReturnPolicy).toBeUndefined();
    expect(policy?.["@type"]).toBe("MerchantReturnPolicy");
    expect(policy?.applicableCountry).toBe("LB");
    expect(policy?.returnPolicyCategory).toBe(
      "https://schema.org/MerchantReturnFiniteReturnWindow",
    );
    expect(policy?.merchantReturnDays).toBe(RETURN_WINDOW_DAYS);
    expect(policy?.merchantReturnDays).toBe(7);
    expect(policy?.returnFees).toBe("https://schema.org/FreeReturn");
  });

  it("AE product has hasMerchantReturnPolicy on the Product node with applicableCountry AE", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "AE",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.hasMerchantReturnPolicy?.applicableCountry).toBe("AE");
    expect(schema.offers?.hasMerchantReturnPolicy).toBeUndefined();
  });

  it("CY product has hasMerchantReturnPolicy on the Product node with applicableCountry CY", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "CY",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.hasMerchantReturnPolicy?.applicableCountry).toBe("CY");
    expect(schema.offers?.hasMerchantReturnPolicy).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// shippingDetails
// ---------------------------------------------------------------------------

describe("buildProductSchema — shippingDetails", () => {
  it("LB product shippingDestination.addressCountry is LB", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(
      schema.offers?.shippingDetails?.shippingDestination?.addressCountry,
    ).toBe("LB");
  });

  it("AE product shippingDestination.addressCountry is AE", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "AE",
      canonicalUrl: CANONICAL_URL,
    });
    expect(
      schema.offers?.shippingDetails?.shippingDestination?.addressCountry,
    ).toBe("AE");
  });

  it("AE shippingRate currency is AED", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "AE",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.offers?.shippingDetails?.shippingRate?.currency).toBe("AED");
  });

  it("CY shippingRate currency is EUR", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "CY",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.offers?.shippingDetails?.shippingRate?.currency).toBe("EUR");
  });

  it("LB shippingRate currency is USD", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.offers?.shippingDetails?.shippingRate?.currency).toBe("USD");
  });

  it("AE shippingRate value is 0 (always free)", () => {
    const schema = buildProductSchema({
      product: { ...BASE_PRODUCT, priceValue: 10 },
      countryCode: "AE",
      canonicalUrl: CANONICAL_URL,
    });
    expect(parseFloat(schema.offers?.shippingDetails?.shippingRate?.value)).toBe(0);
  });

  it("LB product above free-delivery threshold has shippingRate value 0", () => {
    const schema = buildProductSchema({
      product: { ...BASE_PRODUCT, priceValue: 100 },
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(parseFloat(schema.offers?.shippingDetails?.shippingRate?.value)).toBe(0);
  });

  it("LB product below free-delivery threshold has shippingRate value LB_STANDARD_SHIPPING_USD", () => {
    const schema = buildProductSchema({
      product: { ...BASE_PRODUCT, priceValue: 30 },
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(parseFloat(schema.offers?.shippingDetails?.shippingRate?.value)).toBe(
      LB_STANDARD_SHIPPING_USD,
    );
  });

  it("shippingDetails includes deliveryTime with 1–3 day transitTime", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    const deliveryTime = schema.offers?.shippingDetails?.deliveryTime;
    expect(deliveryTime?.["@type"]).toBe("ShippingDeliveryTime");
    expect(deliveryTime?.transitTime?.minValue).toBe(1);
    expect(deliveryTime?.transitTime?.maxValue).toBe(3);
    expect(deliveryTime?.transitTime?.unitCode).toBe("d");
  });
});

// ---------------------------------------------------------------------------
// mpn
// ---------------------------------------------------------------------------

describe("buildProductSchema — mpn", () => {
  it("mpn is set from osNumericId when product.sku is absent", () => {
    const schema = buildProductSchema({
      product: { ...BASE_PRODUCT, osNumericId: 99 },
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.mpn).toBe("99");
  });

  it("mpn prefers product.sku when present", () => {
    const schema = buildProductSchema({
      product: { ...BASE_PRODUCT, sku: "SKU-ABC", osNumericId: 99 },
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.mpn).toBe("SKU-ABC");
  });

  it("mpn is present and non-empty for a typical product", () => {
    const schema = buildProductSchema({
      product: BASE_PRODUCT,
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(typeof schema.mpn).toBe("string");
    expect(schema.mpn!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateRating
// ---------------------------------------------------------------------------

describe("buildProductSchema — aggregateRating", () => {
  it("aggregateRating is emitted when rating and reviewCount >= 1", () => {
    const schema = buildProductSchema({
      product: { ...BASE_PRODUCT, rating: 4.5, reviewCount: 12 },
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.aggregateRating?.["@type"]).toBe("AggregateRating");
    expect(schema.aggregateRating?.ratingValue).toBe(4.5);
    expect(schema.aggregateRating?.reviewCount).toBe(12);
  });

  it("aggregateRating is NOT emitted when reviewCount is 0", () => {
    const schema = buildProductSchema({
      product: { ...BASE_PRODUCT, rating: 4.5, reviewCount: 0 },
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.aggregateRating).toBeUndefined();
  });

  it("aggregateRating is NOT emitted when rating is absent", () => {
    const schema = buildProductSchema({
      product: { ...BASE_PRODUCT, reviewCount: 5 },
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.aggregateRating).toBeUndefined();
  });

  it("aggregateRating is NOT emitted when reviewCount is absent", () => {
    const schema = buildProductSchema({
      product: { ...BASE_PRODUCT, rating: 4.2 },
      countryCode: "LB",
      canonicalUrl: CANONICAL_URL,
    });
    expect(schema.aggregateRating).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildOfferShipping (standalone)
// ---------------------------------------------------------------------------

describe("buildOfferShipping", () => {
  it("returns {} for priceValue of 0", () => {
    const result = buildOfferShipping({ countryCode: "LB", priceValue: 0 });
    expect(result).toEqual({});
  });

  it("returns {} for NaN priceValue", () => {
    const result = buildOfferShipping({ countryCode: "LB", priceValue: NaN });
    expect(result).toEqual({});
  });

  it("CY always ships free with EUR currency", () => {
    const result = buildOfferShipping({ countryCode: "CY", priceValue: 5 });
    expect(result.shippingDetails?.shippingRate?.value).toBe("0.00");
    expect(result.shippingDetails?.shippingRate?.currency).toBe("EUR");
  });
});
