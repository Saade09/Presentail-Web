/**
 * Regression guard: GET /woo/brand-products must include products whose
 * product-embedded brand slug differs from the canonical catalog-attribute slug.
 *
 * Root cause
 * ----------
 * The brand filter was `p.brands.some((b) => b.slug === brandSlug)`, which
 * only matched the raw embedded slug. When the OS catalog-attributes endpoint
 * returns a canonical slug like "katb-kitab" but the product's embedded brand
 * object carries a different slug (e.g. "katb-el-kitab") the product was
 * silently dropped — causing brand pages to show fewer products than OS admin.
 *
 * Fix
 * ---
 * The filter now also resolves the product's embedded brand *name* through the
 * `cachedBrandNameToCanonicalSlug` map (keyed by normalised name). If the
 * resolved canonical slug matches the requested brand slug, the product is
 * included even when the embedded slugs differ.
 *
 * Guarantees verified
 * -------------------
 * 1. A product with an embedded brand slug mismatch is included when its brand
 *    *name* resolves to the requested canonical slug.
 * 2. Products whose embedded brand slug matches directly still work.
 * 3. Products whose brand slug AND name both fail to resolve are excluded.
 * 4. The fix does not affect other filtering (inStock, isDeliverable).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { OSProduct } from "@workspace/presentail-os";

// ---------------------------------------------------------------------------
// Hoist mutable mock references
// ---------------------------------------------------------------------------

const {
  getOsProductsMock,
  getCachedBestSellerIdsMock,
  getOsBrandNameToCanonicalSlugMock,
} = vi.hoisted(() => ({
  getOsProductsMock: vi.fn<(storeKey: string) => OSProduct[] | null>(),
  getCachedBestSellerIdsMock: vi.fn<() => ReadonlySet<string>>(),
  getOsBrandNameToCanonicalSlugMock: vi.fn<() => ReadonlyMap<string, string>>(),
}));

// ---------------------------------------------------------------------------
// Module mocks — match the full import surface of woo.ts
// ---------------------------------------------------------------------------

vi.mock("../lib/osProductsCache", () => ({
  getOsProducts: getOsProductsMock,
  getOsCategories: vi.fn().mockReturnValue([]),
  getOsBrands: vi.fn().mockReturnValue([]),
  getOsRawCatalogBrands: vi.fn().mockReturnValue([]),
  getOsOccasions: vi.fn().mockReturnValue([]),
  getOsProductOccasions: vi.fn().mockReturnValue(new Map()),
  getOsProductBySlug: vi.fn().mockReturnValue(null),
  getCachedBestSellerIds: getCachedBestSellerIdsMock,
  getOsBrandNameToCanonicalSlug: getOsBrandNameToCanonicalSlugMock,
  normaliseBrandName: (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
}));

vi.mock("../lib/wooStore", () => ({
  resolveStoreFromRequest: vi.fn().mockReturnValue({
    storeKey: "lb",
    baseUrl: "https://example.com",
    consumerKey: "ck_test",
    consumerSecret: "cs_test",
    country: "LB",
    currencySymbol: "$",
  }),
}));

vi.mock("../lib/auth", () => ({ authenticate: vi.fn().mockResolvedValue({ ok: false }) }));

vi.mock("../lib/wooOrders", () => ({
  WooOrderSchema: { safeParse: vi.fn().mockReturnValue({ success: false }) },
  attemptCreateOsOrder: vi.fn(),
  enqueuePendingWcOrder: vi.fn(),
  listPendingWooOrders: vi.fn().mockResolvedValue([]),
  normalizePlatform: vi.fn().mockReturnValue(null),
  recordSuccessfulWcOrder: vi.fn(),
  recordFailedPaymentAttempt: vi.fn(),
  isCouponErrorCode: vi.fn().mockReturnValue(false),
}));

vi.mock("../lib/catalog", () => ({
  verifyStripePayment: vi.fn().mockResolvedValue(false),
  verifyStripePaymentIntentPaid: vi.fn().mockResolvedValue(false),
  verifyMamoPayment: vi.fn().mockResolvedValue(false),
  captureAndVerifyPayPalOrder: vi.fn().mockResolvedValue(false),
}));

vi.mock("../lib/checkoutIntents", () => ({
  consumePaymentIntent: vi.fn().mockReturnValue(null),
  verifyCartMatchesSnapshot: vi.fn().mockReturnValue(null),
}));

vi.mock("../lib/customers", () => ({
  upsertCustomer: vi.fn().mockResolvedValue({ customer: { id: 1 }, created: false }),
  syncCustomerToWoo: vi.fn().mockResolvedValue(1),
  getCustomerByWcId: vi.fn().mockResolvedValue(null),
  getCustomerById: vi.fn().mockResolvedValue(null),
}));

vi.mock("../lib/loyalty", () => ({ creditReferralRedemption: vi.fn().mockResolvedValue(undefined) }));

vi.mock("../lib/fbConversions", () => ({ sendCapiPurchase: vi.fn().mockResolvedValue(undefined) }));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@workspace/db", () => ({
  db: {},
  appOrdersTable: {},
  pendingWooOrdersTable: {},
}));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeProduct(overrides: Partial<OSProduct> = {}): OSProduct {
  return {
    id: "product-1",
    name: "Test Product",
    price: 30,
    images: [{ url: "https://example.com/img.jpg" }],
    inStock: true,
    categories: [],
    occasions: [],
    brands: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function buildApp() {
  const { default: wooRouter } = await import("./woo");
  const app = express();
  app.use(express.json());
  app.use((_req: any, _res: unknown, next: () => void) => {
    (_req as any).log = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
    next();
  });
  app.use(wooRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /woo/brand-products — brand slug mismatch fix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedBestSellerIdsMock.mockReturnValue(new Set());
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("includes a product whose embedded brand slug differs from the canonical slug, matched by name", async () => {
    // The catalog-attribute endpoint gave brand "Katb Kitab" slug "katb-kitab".
    // The product carries the brand with slug "katb-el-kitab" (wrong) but correct name.
    const product = makeProduct({
      id: "product-mismatch",
      brands: [{ id: "katb-el-kitab", slug: "katb-el-kitab", name: "Katb Kitab" }],
    });
    getOsProductsMock.mockReturnValue([product]);
    // Simulate the cachedBrandNameToCanonicalSlug map built from catalog-attributes.
    getOsBrandNameToCanonicalSlugMock.mockReturnValue(
      new Map([["katb kitab", "katb-kitab"]]),
    );

    const app = await buildApp();
    const res = await request(app).get("/woo/brand-products?slug=katb-kitab");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].id).toBe("product-mismatch");
  });

  it("includes a product whose embedded brand slug matches the canonical slug directly", async () => {
    const product = makeProduct({
      id: "product-direct",
      brands: [{ id: "hallab", slug: "hallab", name: "Hallab" }],
    });
    getOsProductsMock.mockReturnValue([product]);
    // Map doesn't contain "hallab" → canonical lookup returns undefined.
    getOsBrandNameToCanonicalSlugMock.mockReturnValue(new Map());

    const app = await buildApp();
    const res = await request(app).get("/woo/brand-products?slug=hallab");

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].id).toBe("product-direct");
  });

  it("excludes a product whose brand slug and name both fail to match the requested slug", async () => {
    const product = makeProduct({
      id: "product-other-brand",
      brands: [{ id: "some-other-brand", slug: "some-other-brand", name: "Some Other Brand" }],
    });
    getOsProductsMock.mockReturnValue([product]);
    // The name map maps "some other brand" → "some-other-brand", not "katb-kitab".
    getOsBrandNameToCanonicalSlugMock.mockReturnValue(
      new Map([["some other brand", "some-other-brand"]]),
    );

    const app = await buildApp();
    const res = await request(app).get("/woo/brand-products?slug=katb-kitab");

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(0);
  });

  it("includes multiple products: some with matching slug, some matched via name only", async () => {
    // Product 1: direct slug match.
    const p1 = makeProduct({
      id: "prod-direct",
      brands: [{ id: "katb-kitab", slug: "katb-kitab", name: "Katb Kitab" }],
    });
    // Product 2: name-resolved match (embedded slug is wrong).
    const p2 = makeProduct({
      id: "prod-name-match",
      brands: [{ id: "katb-el-kitab", slug: "katb-el-kitab", name: "Katb Kitab" }],
    });
    // Product 3: belongs to a different brand entirely.
    const p3 = makeProduct({
      id: "prod-other",
      brands: [{ id: "hallab", slug: "hallab", name: "Hallab" }],
    });
    getOsProductsMock.mockReturnValue([p1, p2, p3]);
    getOsBrandNameToCanonicalSlugMock.mockReturnValue(
      new Map([
        ["katb kitab", "katb-kitab"],
        ["hallab", "hallab"],
      ]),
    );

    const app = await buildApp();
    const res = await request(app).get("/woo/brand-products?slug=katb-kitab");

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(2);
    const ids = res.body.products.map((p: { id: string }) => p.id);
    expect(ids).toContain("prod-direct");
    expect(ids).toContain("prod-name-match");
    expect(ids).not.toContain("prod-other");
  });

  it("excludes out-of-stock products even when brand matches", async () => {
    const product = makeProduct({
      id: "oos-product",
      inStock: false,
      brands: [{ id: "katb-kitab", slug: "katb-kitab", name: "Katb Kitab" }],
    });
    getOsProductsMock.mockReturnValue([product]);
    getOsBrandNameToCanonicalSlugMock.mockReturnValue(new Map());

    const app = await buildApp();
    const res = await request(app).get("/woo/brand-products?slug=katb-kitab");

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(0);
  });
});
