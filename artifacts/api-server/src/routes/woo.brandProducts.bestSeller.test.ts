/**
 * Regression guard: GET /woo/brand-products must return correct isBestSeller
 * badges even when the in-place OSProduct annotation (p.isBestSeller) has not
 * yet been written for the current refresh cycle.
 *
 * Background
 * ----------
 * The best-seller annotation block in osProductsCache.ts runs AFTER fresh
 * products are stored in storeCache: it queries the DB for local sales, ranks
 * products, and then writes p.isBestSeller in-place.  Between the moment
 * products enter the cache and the moment the annotation completes, any
 * in-flight request would see p.isBestSeller = undefined → false.
 *
 * The fix: the endpoint reads getCachedBestSellerIds() — a module-level Set
 * that persists across refresh cycles — and uses it to override isBestSeller
 * on each mapped product AFTER mapOsProductToWcShape runs.  This Set retains
 * the IDs from the previous annotation cycle until the new one finishes, so
 * badges remain correct while a refresh is in-flight.
 *
 * Guarantees verified
 * -------------------
 * 1. Product flagged by getCachedBestSellerIds() → isBestSeller: true in
 *    response, even when p.isBestSeller is false/undefined on the OSProduct.
 * 2. Product NOT in getCachedBestSellerIds() → isBestSeller: false, even
 *    when p.isBestSeller happens to be true (belt-and-suspenders).
 * 3. Empty bestSellerIds (cold start, no prior cycle) → isBestSeller: false
 *    for all products (no false positives).
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
} = vi.hoisted(() => ({
  getOsProductsMock: vi.fn<(storeKey: string) => OSProduct[] | null>(),
  getCachedBestSellerIdsMock: vi.fn<() => ReadonlySet<string>>(),
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
  // Required by the brand slug mismatch fix in the brand-products route.
  getOsBrandNameToCanonicalSlug: vi.fn().mockReturnValue(new Map()),
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
// Test data
// ---------------------------------------------------------------------------

function makeProduct(overrides: Partial<OSProduct> = {}): OSProduct {
  return {
    id: "rose-bouquet",
    name: "Rose Bouquet",
    price: 50,
    images: [{ url: "https://example.com/img.jpg" }],
    inStock: true,
    categories: [],
    occasions: [],
    brands: [{ id: "hallab", slug: "hallab", name: "Hallab" }],
    isBestSeller: false,
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

describe("GET /woo/brand-products — best-seller badge reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("marks a product as best-seller when getCachedBestSellerIds contains its slug, even if p.isBestSeller is false", async () => {
    const product = makeProduct({ id: "rose-bouquet", isBestSeller: false });
    getOsProductsMock.mockReturnValue([product]);
    // Simulate: previous cycle's annotation set contains this slug; current
    // cycle's in-place write (p.isBestSeller) is still false/in-flight.
    getCachedBestSellerIdsMock.mockReturnValue(new Set(["rose-bouquet"]));

    const app = await buildApp();
    const res = await request(app).get("/woo/brand-products?slug=hallab");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].isBestSeller).toBe(true);
  });

  it("does NOT mark a product as best-seller when its slug is absent from getCachedBestSellerIds", async () => {
    const product = makeProduct({ id: "rose-bouquet", isBestSeller: false });
    getOsProductsMock.mockReturnValue([product]);
    getCachedBestSellerIdsMock.mockReturnValue(new Set(["other-product"]));

    const app = await buildApp();
    const res = await request(app).get("/woo/brand-products?slug=hallab");

    expect(res.status).toBe(200);
    expect(res.body.products[0].isBestSeller).toBe(false);
  });

  it("returns isBestSeller: false for all products when getCachedBestSellerIds is empty (cold start, no prior cycle)", async () => {
    const product = makeProduct({ id: "rose-bouquet" });
    getOsProductsMock.mockReturnValue([product]);
    getCachedBestSellerIdsMock.mockReturnValue(new Set());

    const app = await buildApp();
    const res = await request(app).get("/woo/brand-products?slug=hallab");

    expect(res.status).toBe(200);
    expect(res.body.products[0].isBestSeller).toBe(false);
  });

  it("correctly classifies multiple products: some best-sellers, some not", async () => {
    const bs = makeProduct({ id: "rose-bouquet", name: "Rose Bouquet", isBestSeller: false });
    const other = makeProduct({ id: "lily-vase", name: "Lily Vase", isBestSeller: false });
    getOsProductsMock.mockReturnValue([bs, other]);
    getCachedBestSellerIdsMock.mockReturnValue(new Set(["rose-bouquet"]));

    const app = await buildApp();
    const res = await request(app).get("/woo/brand-products?slug=hallab");

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(2);
    // transformProduct maps WcProduct.slug (= OS product id) to the response `id` field.
    const byId = Object.fromEntries(
      res.body.products.map((p: { id: string; isBestSeller: boolean }) => [p.id, p.isBestSeller])
    );
    expect(byId["rose-bouquet"]).toBe(true);
    expect(byId["lily-vase"]).toBe(false);
  });

  it("exposes totalSales as popularity in the response so the Best Seller sort has non-zero values to rank by", async () => {
    // Regression guard: OS returns totalSales=0 for every product.
    // The best-seller annotation block writes the blended score (OS totalSales +
    // DB order count) back onto p.totalSales. That value is then mapped to
    // total_sales in mapOsProductToWcShape and finally to `popularity` in the
    // API response. If this pipeline is broken the sort sees all-zeros and
    // "Best Seller" produces no visible reordering.
    const popular = makeProduct({ id: "rose-bouquet", totalSales: 42 });
    const cold = makeProduct({ id: "lily-vase", totalSales: 0 });
    getOsProductsMock.mockReturnValue([popular, cold]);
    getCachedBestSellerIdsMock.mockReturnValue(new Set());

    const app = await buildApp();
    const res = await request(app).get("/woo/brand-products?slug=hallab");

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(
      res.body.products.map((p: { id: string; popularity: number }) => [p.id, p.popularity])
    );
    // The popular product must carry its totalSales through to popularity.
    expect(byId["rose-bouquet"]).toBe(42);
    // The cold product with no sales must have popularity 0, not undefined.
    expect(byId["lily-vase"]).toBe(0);
  });

  it("sets a public shared-cache policy on the brands reference endpoint", async () => {
    getOsProductsMock.mockReturnValue([]);
    getCachedBestSellerIdsMock.mockReturnValue(new Set());

    const app = await buildApp();
    const res = await request(app).get("/woo/brands");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe(
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    );
  });
});
