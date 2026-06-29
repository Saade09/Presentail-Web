/**
 * Regression guard: discount fields (discountPriceValue / discountPriceAed)
 * must be preserved end-to-end through mapOsProductToWcShape → transformProduct.
 *
 * A future refactor of either function could silently drop these fields; these
 * tests catch that before it reaches production.
 */

import { describe, it, expect, vi } from "vitest";
import type { OSProduct } from "@workspace/presentail-os";
import { mapOsProductToWcShape, transformProduct } from "./woo";

// ── Module mocks ─────────────────────────────────────────────────────────────
// woo.ts imports a number of side-effectful modules; mock them all so the file
// can be imported without a real DB, WooCommerce, or Stripe connection.

vi.mock("../lib/auth", () => ({ authenticate: vi.fn() }));

vi.mock("../lib/wooOrders", () => ({
  WooOrderSchema: { parse: vi.fn() },
  attemptCreateOsOrder: vi.fn(),
  enqueuePendingWcOrder: vi.fn(),
  listPendingWooOrders: vi.fn(),
  normalizePlatform: vi.fn(),
  recordSuccessfulWcOrder: vi.fn(),
}));

vi.mock("../lib/catalog", () => ({
  verifyStripePayment: vi.fn(),
  verifyStripePaymentIntentPaid: vi.fn(),
  verifyMamoPayment: vi.fn(),
  captureAndVerifyPayPalOrder: vi.fn(),
}));

vi.mock("../lib/checkoutIntents", () => ({
  consumePaymentIntent: vi.fn(),
  verifyCartMatchesSnapshot: vi.fn(),
}));

vi.mock("../lib/customers", () => ({
  upsertCustomer: vi.fn(),
  syncCustomerToWoo: vi.fn(),
  getCustomerByWcId: vi.fn(),
}));

vi.mock("../lib/loyalty", () => ({ creditReferralRedemption: vi.fn() }));

vi.mock("../lib/fbConversions", () => ({ sendCapiPurchase: vi.fn() }));

vi.mock("../lib/wooStore", () => ({ resolveStoreFromRequest: vi.fn() }));

vi.mock("../lib/osProductsCache", () => ({
  getOsProducts: vi.fn(),
  getOsCategories: vi.fn(),
  getOsBrands: vi.fn(),
  getOsOccasions: vi.fn(),
  getOsProductBySlug: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOsProduct(overrides: Partial<OSProduct> = {}): OSProduct {
  return {
    id: "test-product",
    name: "Test Product",
    price: 25,
    images: [],
    inStock: true,
    categories: [],
    occasions: [],
    brands: [],
    ...overrides,
  };
}

// ── mapOsProductToWcShape — discount field tests ──────────────────────────────

describe("mapOsProductToWcShape — discount fields", () => {
  it("passes through a valid USD discount price", () => {
    const p = makeOsProduct({ discount_price_usd: "20" });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceValue).toBe(20);
    expect(wc.discountPriceAed).toBeNull();
  });

  it("passes through a valid AED discount price", () => {
    const p = makeOsProduct({ discount_price_aed: "73.5" });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceAed).toBe(73.5);
    expect(wc.discountPriceValue).toBeNull();
  });

  it("passes through both USD and AED discount prices together", () => {
    const p = makeOsProduct({ discount_price_usd: "19.99", discount_price_aed: "73.5" });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceValue).toBe(19.99);
    expect(wc.discountPriceAed).toBe(73.5);
  });

  it("returns null for discountPriceValue when discount_price_usd is absent", () => {
    const p = makeOsProduct();
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceValue).toBeNull();
  });

  it("returns null for discountPriceAed when discount_price_aed is absent", () => {
    const p = makeOsProduct();
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceAed).toBeNull();
  });

  it("returns null when discount_price_usd is null", () => {
    const p = makeOsProduct({ discount_price_usd: null });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceValue).toBeNull();
  });

  it("returns null when discount_price_aed is null", () => {
    const p = makeOsProduct({ discount_price_aed: null });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceAed).toBeNull();
  });

  it("returns null when discount_price_usd is the string '0'", () => {
    const p = makeOsProduct({ discount_price_usd: "0" });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceValue).toBeNull();
  });

  it("returns null when discount_price_aed is the string '0'", () => {
    const p = makeOsProduct({ discount_price_aed: "0" });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceAed).toBeNull();
  });

  it("returns null when discount_price_usd is an empty string", () => {
    const p = makeOsProduct({ discount_price_usd: "" });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceValue).toBeNull();
  });

  it("returns null when discount_price_aed is an empty string", () => {
    const p = makeOsProduct({ discount_price_aed: "" });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceAed).toBeNull();
  });

  it("returns null for a negative discount price (not a valid discount)", () => {
    const p = makeOsProduct({ discount_price_usd: "-5", discount_price_aed: "-1" });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceValue).toBeNull();
    expect(wc.discountPriceAed).toBeNull();
  });
});

// ── transformProduct — discount field pass-through ────────────────────────────

describe("transformProduct — discount fields", () => {
  it("passes discountPriceValue through from WcProduct", () => {
    const wc = {
      id: 0,
      slug: "test-slug",
      price: "25",
      name: "Test Product",
      stock_status: "instock",
      images: [],
      categories: [],
      discountPriceValue: 20,
      discountPriceAed: null,
    };
    const result = transformProduct(wc);
    expect(result.discountPriceValue).toBe(20);
  });

  it("passes discountPriceAed through from WcProduct", () => {
    const wc = {
      id: 0,
      slug: "test-slug",
      price: "92",
      name: "Test Product",
      stock_status: "instock",
      images: [],
      categories: [],
      discountPriceValue: null,
      discountPriceAed: 73.5,
    };
    const result = transformProduct(wc);
    expect(result.discountPriceAed).toBe(73.5);
  });

  it("passes both discount fields through when both are set", () => {
    const wc = {
      id: 0,
      slug: "test-slug",
      price: "25",
      name: "Test Product",
      stock_status: "instock",
      images: [],
      categories: [],
      discountPriceValue: 19.99,
      discountPriceAed: 73.5,
    };
    const result = transformProduct(wc);
    expect(result.discountPriceValue).toBe(19.99);
    expect(result.discountPriceAed).toBe(73.5);
  });

  it("outputs null for discountPriceValue when absent from WcProduct", () => {
    const wc = {
      id: 0,
      slug: "test-slug",
      price: "25",
      name: "Test Product",
      stock_status: "instock",
      images: [],
      categories: [],
    };
    const result = transformProduct(wc);
    expect(result.discountPriceValue).toBeNull();
  });

  it("outputs null for discountPriceAed when absent from WcProduct", () => {
    const wc = {
      id: 0,
      slug: "test-slug",
      price: "25",
      name: "Test Product",
      stock_status: "instock",
      images: [],
      categories: [],
    };
    const result = transformProduct(wc);
    expect(result.discountPriceAed).toBeNull();
  });

  it("outputs null for both discount fields when both are explicitly null", () => {
    const wc = {
      id: 0,
      slug: "test-slug",
      price: "25",
      name: "Test Product",
      stock_status: "instock",
      images: [],
      categories: [],
      discountPriceValue: null,
      discountPriceAed: null,
    };
    const result = transformProduct(wc);
    expect(result.discountPriceValue).toBeNull();
    expect(result.discountPriceAed).toBeNull();
  });
});

// ── Full pipeline: mapOsProductToWcShape → transformProduct ───────────────────

describe("discount fields — full pipeline (OS → WcShape → transformed)", () => {
  it("USD discount survives the full pipeline", () => {
    const os = makeOsProduct({ discount_price_usd: "18" });
    const wc = mapOsProductToWcShape(os);
    const result = transformProduct(wc, "$");
    expect(result.discountPriceValue).toBe(18);
    expect(result.discountPriceAed).toBeNull();
  });

  it("AED discount survives the full pipeline", () => {
    const os = makeOsProduct({ discount_price_aed: "66" });
    const wc = mapOsProductToWcShape(os);
    const result = transformProduct(wc, "AED");
    expect(result.discountPriceAed).toBe(66);
    expect(result.discountPriceValue).toBeNull();
  });

  it("both discount fields survive the full pipeline together", () => {
    const os = makeOsProduct({ discount_price_usd: "18", discount_price_aed: "66" });
    const wc = mapOsProductToWcShape(os);
    const result = transformProduct(wc, "AED");
    expect(result.discountPriceValue).toBe(18);
    expect(result.discountPriceAed).toBe(66);
  });

  it("no discount fields → both null after full pipeline", () => {
    const os = makeOsProduct();
    const wc = mapOsProductToWcShape(os);
    const result = transformProduct(wc);
    expect(result.discountPriceValue).toBeNull();
    expect(result.discountPriceAed).toBeNull();
  });

  it("zero-value string discount → null after full pipeline (not a real discount)", () => {
    const os = makeOsProduct({ discount_price_usd: "0", discount_price_aed: "0" });
    const wc = mapOsProductToWcShape(os);
    const result = transformProduct(wc);
    expect(result.discountPriceValue).toBeNull();
    expect(result.discountPriceAed).toBeNull();
  });
});
