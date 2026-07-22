/**
 * Regression guard: GET /woo/occasion-products must never return an empty
 * product list when a slug like "ramadan" is tagged on OS products but is
 * absent from the formal OS occasions catalog endpoint.
 *
 * The route accepts slugs from two sources:
 *  1. getOsOccasions()       — the formal OS catalog
 *  2. getOsProductOccasions() — occasions embedded directly in product tags
 *
 * Without this test a future refactor of the validation check could silently
 * reintroduce the empty-page bug (returning [] even with matching products).
 *
 * Guarantees verified:
 *  1. Slug valid only via product-embedded occasions → products returned.
 *  2. Slug absent from BOTH sources → empty groups (guard still works).
 *  3. Slug valid via the formal catalog (not product occasions) → products returned.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { OSProduct, OSProductOccasion } from "@workspace/presentail-os";

// ---------------------------------------------------------------------------
// Hoist mutable mock references so individual tests can override return values.
// ---------------------------------------------------------------------------

const {
  getOsOccasionsMock,
  getOsProductOccasionsMock,
  getOsProductsMock,
} = vi.hoisted(() => ({
  getOsOccasionsMock: vi.fn<() => OSProductOccasion[] | null>(),
  getOsProductOccasionsMock: vi.fn<() => ReadonlyMap<string, OSProductOccasion>>(),
  getOsProductsMock: vi.fn<(storeKey: string) => OSProduct[] | null>(),
}));

// ---------------------------------------------------------------------------
// Module mocks — match the full import surface of woo.ts
// ---------------------------------------------------------------------------

vi.mock("../lib/osProductsCache", () => ({
  getOsProducts: getOsProductsMock,
  getOsCategories: vi.fn().mockReturnValue([]),
  getOsBrands: vi.fn().mockReturnValue([]),
  getOsRawCatalogBrands: vi.fn().mockReturnValue([]),
  getOsOccasions: getOsOccasionsMock,
  getOsProductOccasions: getOsProductOccasionsMock,
  getOsProductBySlug: vi.fn().mockReturnValue(null),
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

const RAMADAN_OCCASION: OSProductOccasion = {
  id: "occ-ramadan",
  slug: "ramadan",
  name: "Ramadan",
};

/**
 * Builds a minimal OS product that:
 *  - is in stock (passes isVisibleProduct)
 *  - is tagged with the "ramadan" occasion
 *  - belongs to the "flowers" category (matches an OCCASION_TYPE_CATEGORIES entry)
 *  - has no deliverable-country/city restrictions (passes isDeliverable for any filter)
 */
function makeRamadanProduct(overrides: Partial<OSProduct> = {}): OSProduct {
  return {
    id: "ramadan-bouquet",
    name: "Ramadan Bouquet",
    price: 45,
    images: [{ url: "https://example.com/img.jpg" }],
    inStock: true,
    categories: [{ id: "cat-flowers", slug: "flowers", name: "Flowers" }],
    occasions: [RAMADAN_OCCASION],
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

describe("GET /woo/occasion-products — product-embedded occasion fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns products when slug exists only in product-embedded occasions (not in OS catalog)", async () => {
    // Formal OS catalog has NO "ramadan" entry — cache is warm but catalog is out of sync.
    getOsOccasionsMock.mockReturnValue([
      { id: "occ-birthday", slug: "birthday", name: "Birthday" },
    ]);
    // Product tags DO include "ramadan".
    getOsProductOccasionsMock.mockReturnValue(
      new Map([["ramadan", RAMADAN_OCCASION]])
    );
    // The store cache has one product tagged with "ramadan".
    getOsProductsMock.mockReturnValue([makeRamadanProduct()]);

    const app = await buildApp();
    const res = await request(app).get("/woo/occasion-products?slug=ramadan");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // At least one group with at least one product must be returned.
    expect(res.body.groups).toBeInstanceOf(Array);
    expect(res.body.groups.length).toBeGreaterThan(0);
    const allProducts = res.body.groups.flatMap((g: { products: unknown[] }) => g.products);
    expect(allProducts.length).toBeGreaterThan(0);
  });

  it("returns empty groups when slug is absent from BOTH sources (guard still works)", async () => {
    // Formal catalog has "birthday" but NOT "ramadan".
    getOsOccasionsMock.mockReturnValue([
      { id: "occ-birthday", slug: "birthday", name: "Birthday" },
    ]);
    // Product tags also contain no "ramadan" entry.
    getOsProductOccasionsMock.mockReturnValue(new Map());
    // Even if there were matching products in the cache, the slug must be rejected.
    getOsProductsMock.mockReturnValue([makeRamadanProduct()]);

    const app = await buildApp();
    const res = await request(app).get("/woo/occasion-products?slug=ramadan");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.groups).toEqual([]);
  });

  it("returns products when slug is in the formal OS catalog (primary path still works)", async () => {
    // Formal catalog includes "ramadan" directly.
    getOsOccasionsMock.mockReturnValue([
      { id: "occ-ramadan", slug: "ramadan", name: "Ramadan" },
    ]);
    // Product occasions map is empty (shouldn't matter — catalog path is sufficient).
    getOsProductOccasionsMock.mockReturnValue(new Map());
    getOsProductsMock.mockReturnValue([makeRamadanProduct()]);

    const app = await buildApp();
    const res = await request(app).get("/woo/occasion-products?slug=ramadan");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const allProducts = res.body.groups.flatMap((g: { products: unknown[] }) => g.products);
    expect(allProducts.length).toBeGreaterThan(0);
  });

  it("falls back to OCCASION_SLUGS allowlist when OS occasions cache is null (cold start)", async () => {
    // Cache not yet populated — getOsOccasions() returns null.
    getOsOccasionsMock.mockReturnValue(null);
    // Product occasions are also empty (cold start — no products cached either).
    getOsProductOccasionsMock.mockReturnValue(new Map());
    // "ramadan" is in the static OCCASION_SLUGS allowlist, so it should still be accepted.
    getOsProductsMock.mockReturnValue([makeRamadanProduct()]);

    const app = await buildApp();
    const res = await request(app).get("/woo/occasion-products?slug=ramadan");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Products should still be returned via the static-allowlist cold-start path.
    const allProducts = res.body.groups.flatMap((g: { products: unknown[] }) => g.products);
    expect(allProducts.length).toBeGreaterThan(0);
  });

  it("rejects an unknown slug even when OS occasions cache is null (cold start guard)", async () => {
    // Cache not populated and slug is not in the static allowlist.
    getOsOccasionsMock.mockReturnValue(null);
    getOsProductOccasionsMock.mockReturnValue(new Map());
    getOsProductsMock.mockReturnValue([]);

    const app = await buildApp();
    const res = await request(app).get("/woo/occasion-products?slug=totally-unknown-slug");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.groups).toEqual([]);
  });

  it("returns empty groups when no slug query param is provided", async () => {
    getOsOccasionsMock.mockReturnValue([]);
    getOsProductOccasionsMock.mockReturnValue(new Map());
    getOsProductsMock.mockReturnValue([]);

    const app = await buildApp();
    const res = await request(app).get("/woo/occasion-products");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.groups).toEqual([]);
  });

  it("places products with unrecognised categories into the catch-all 'other-gifts' group", async () => {
    // Product tagged with "ramadan" but its only category ("rings") does not match
    // any OCCASION_TYPE_CATEGORIES entry — it must not be silently dropped.
    getOsOccasionsMock.mockReturnValue([
      { id: "occ-ramadan", slug: "ramadan", name: "Ramadan" },
    ]);
    getOsProductOccasionsMock.mockReturnValue(new Map());

    const ringProduct = makeRamadanProduct({
      id: "ramadan-ring",
      name: "Ramadan Ring",
      categories: [{ id: "cat-rings", slug: "rings", name: "Rings" }],
    });
    getOsProductsMock.mockReturnValue([ringProduct]);

    const app = await buildApp();
    const res = await request(app).get("/woo/occasion-products?slug=ramadan");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const groups: { slug: string; products: unknown[] }[] = res.body.groups;
    // The product must appear in the catch-all group.
    const catchAll = groups.find((g) => g.slug === "other-gifts");
    expect(catchAll).toBeDefined();
    expect(catchAll!.products.length).toBeGreaterThan(0);

    // All products returned across groups must be accounted for in `total`.
    const totalReturned = groups.reduce((sum, g) => sum + g.products.length, 0);
    expect(res.body.total).toBe(totalReturned);
  });

  it("total matches actual products returned across all groups (no silent drops)", async () => {
    // Mix: one product in a known category + one in an unknown category.
    getOsOccasionsMock.mockReturnValue([
      { id: "occ-ramadan", slug: "ramadan", name: "Ramadan" },
    ]);
    getOsProductOccasionsMock.mockReturnValue(new Map());

    const flowerProduct = makeRamadanProduct({
      id: "ramadan-bouquet",
      name: "Ramadan Bouquet",
      categories: [{ id: "cat-flowers", slug: "flowers", name: "Flowers" }],
    });
    const ringProduct = makeRamadanProduct({
      id: "ramadan-ring",
      name: "Ramadan Ring",
      categories: [{ id: "cat-rings", slug: "rings", name: "Rings" }],
    });
    getOsProductsMock.mockReturnValue([flowerProduct, ringProduct]);

    const app = await buildApp();
    const res = await request(app).get("/woo/occasion-products?slug=ramadan");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const groups: { slug: string; products: unknown[] }[] = res.body.groups;
    // Both products must appear somewhere in the groups.
    const allProducts = groups.flatMap((g) => g.products);
    expect(allProducts.length).toBe(2);

    // `total` must equal the number of products actually returned.
    expect(res.body.total).toBe(2);
  });
});
