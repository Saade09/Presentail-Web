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

// ── sale_price / regular_price — mapOsProductToWcShape ────────────────────────

describe("mapOsProductToWcShape — sale_price / regular_price fields", () => {
  it("uses regular_price as the base price and sale_price as the discount when both are valid and sale < regular", () => {
    const p = makeOsProduct({ price: 15, regular_price: "25", sale_price: "15" });
    const wc = mapOsProductToWcShape(p);
    // Base price (crossed-out) should be regular_price, not p.price
    expect(parseFloat(wc.price ?? "")).toBe(25);
    expect(wc.discountPriceValue).toBe(15);
  });

  it("sale_price absent, p.price === regular_price → no discount (no actual sale active)", () => {
    // Default makeOsProduct price = 25; regular_price = 25 means no reduction
    const p = makeOsProduct({ price: 25, regular_price: "25", sale_price: undefined });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceValue).toBeNull();
    expect(parseFloat(wc.price ?? "")).toBe(25);
  });

  it("sale_price absent, p.price < regular_price → p.price used as discount (WC active price)", () => {
    // When regular_price is set, legacy discount_price_usd is NOT used; p.price is authoritative
    const p = makeOsProduct({ price: 18, regular_price: "25", sale_price: undefined, discount_price_usd: "18" });
    const wc = mapOsProductToWcShape(p);
    // p.price (18) < regular_price (25): discount is active
    expect(wc.discountPriceValue).toBe(18);
    expect(parseFloat(wc.price ?? "")).toBe(25);
  });

  it("sale_price equal to regular_price → no discount (not a real sale)", () => {
    const p = makeOsProduct({ price: 25, regular_price: "25", sale_price: "25" });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceValue).toBeNull();
  });

  it("sale_price greater than regular_price → no discount (invalid sale configuration)", () => {
    const p = makeOsProduct({ price: 30, regular_price: "25", sale_price: "30" });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceValue).toBeNull();
  });

  it("sale_price present but regular_price absent → no discount from sale_price path", () => {
    const p = makeOsProduct({ sale_price: "15", regular_price: undefined });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceValue).toBeNull();
  });

  it("regular_price '0' is treated as absent (falls back to p.price as base)", () => {
    const p = makeOsProduct({ price: 25, regular_price: "0", sale_price: "15" });
    const wc = mapOsProductToWcShape(p);
    expect(parseFloat(wc.price ?? "")).toBe(25);
    expect(wc.discountPriceValue).toBeNull();
  });

  it("sale_price '0' but p.price < regular_price → p.price used as discount", () => {
    const p = makeOsProduct({ price: 20, regular_price: "25", sale_price: "0" });
    const wc = mapOsProductToWcShape(p);
    // sale_price=0 is invalid; p.price=20 < regular_price=25 activates the discount
    expect(wc.discountPriceValue).toBe(20);
    expect(parseFloat(wc.price ?? "")).toBe(25);
  });

  it("p.price < regular_price (no sale_price field) → p.price used as discount", () => {
    const p = makeOsProduct({ price: 90, regular_price: "130" });
    const wc = mapOsProductToWcShape(p);
    expect(parseFloat(wc.price ?? "")).toBe(130);
    expect(wc.discountPriceValue).toBe(90);
  });

  it("p.price === regular_price → no discount (price hasn't been reduced)", () => {
    const p = makeOsProduct({ price: 130, regular_price: "130" });
    const wc = mapOsProductToWcShape(p);
    expect(wc.discountPriceValue).toBeNull();
  });
});

// ── sale_price / regular_price — full pipeline ────────────────────────────────

describe("sale_price / regular_price — full pipeline (OS → WcShape → transformed)", () => {
  it("sale + regular prices survive the full pipeline and display correctly", () => {
    const os = makeOsProduct({ price: 15, regular_price: "25", sale_price: "15" });
    const wc = mapOsProductToWcShape(os);
    const result = transformProduct(wc, "$");
    // priceValue = regular_price (the crossed-out base)
    expect(result.priceValue).toBe(25);
    // discountPriceValue = sale_price (shown prominently)
    expect(result.discountPriceValue).toBe(15);
  });

  it("sale_price ≥ regular_price → no discount after full pipeline", () => {
    const os = makeOsProduct({ price: 25, regular_price: "25", sale_price: "25" });
    const wc = mapOsProductToWcShape(os);
    const result = transformProduct(wc, "$");
    expect(result.discountPriceValue).toBeNull();
  });

  it("regular_price only (no sale_price), p.price < regular_price → p.price is the sale price", () => {
    const os = makeOsProduct({ price: 25, regular_price: "30" });
    const wc = mapOsProductToWcShape(os);
    const result = transformProduct(wc, "$");
    // regular_price is the crossed-out base; p.price (25) is the active selling price
    expect(result.priceValue).toBe(30);
    expect(result.discountPriceValue).toBe(25);
  });

  it("legacy discount_price_usd still works when sale_price/regular_price are absent", () => {
    const os = makeOsProduct({ price: 25, discount_price_usd: "18" });
    const wc = mapOsProductToWcShape(os);
    const result = transformProduct(wc, "$");
    expect(result.priceValue).toBe(25);
    expect(result.discountPriceValue).toBe(18);
  });

  it("p.price < regular_price (no sale_price) → slash price shown via p.price", () => {
    const os = makeOsProduct({ price: 90, regular_price: "130" });
    const wc = mapOsProductToWcShape(os);
    const result = transformProduct(wc, "$");
    // regular_price becomes the crossed-out base
    expect(result.priceValue).toBe(130);
    // p.price (90) is the active selling price — shown prominently
    expect(result.discountPriceValue).toBe(90);
  });

  it("p.price === regular_price → no discount (no sale active)", () => {
    const os = makeOsProduct({ price: 130, regular_price: "130" });
    const wc = mapOsProductToWcShape(os);
    const result = transformProduct(wc, "$");
    expect(result.priceValue).toBe(130);
    expect(result.discountPriceValue).toBeNull();
  });
});
