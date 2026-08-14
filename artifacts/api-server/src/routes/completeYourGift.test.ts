import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import type { OSProduct } from "@workspace/presentail-os";

// ---------------------------------------------------------------------------
// Route-level tests for GET /products/complete-your-gift: slot ordering,
// empty-slot omission, cart dedupe, anchor-category skipping, flag modes,
// and response shape.
// ---------------------------------------------------------------------------

const { mockGetOsProducts, mockGetOsProductBySlug, mockGetOsProductPricingMap, mockGetMetricsCache } =
  vi.hoisted(() => ({
    mockGetOsProducts: vi.fn(),
    mockGetOsProductBySlug: vi.fn(),
    mockGetOsProductPricingMap: vi.fn(() => new Map()),
    mockGetMetricsCache: vi.fn(() => new Map()),
  }));

vi.mock("../lib/osProductsCache", () => ({
  getOsProducts: mockGetOsProducts,
  getOsProductBySlug: mockGetOsProductBySlug,
  getOsProductPricingMap: mockGetOsProductPricingMap,
}));

vi.mock("../lib/productRankingService", () => ({
  getMetricsCache: mockGetMetricsCache,
}));

const { mockGetDeliverySlots, mockGetRate } = vi.hoisted(() => ({
  mockGetDeliverySlots: vi.fn(() => [] as unknown[]),
  mockGetRate: vi.fn(async () => 3.6725),
}));

vi.mock("../lib/osLocationsCache", () => ({
  getDeliverySlots: mockGetDeliverySlots,
}));

vi.mock("../lib/fx", () => ({
  getRate: mockGetRate,
  roundForCurrency: (amount: number, _currency: string) => Math.round(amount / 5) * 5,
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeProduct(overrides: Partial<OSProduct> & { id: string }): OSProduct {
  return {
    name: overrides.id,
    price: 25,
    images: [{ url: `https://img/${overrides.id}.jpg`, alt: `alt-${overrides.id}` }],
    inStock: true,
    categories: [],
    occasions: [],
    brands: [],
    osNumericId: 100,
    wcId: 0,
    ...overrides,
  } as OSProduct;
}

function cat(slug: string) {
  return { id: slug, slug, name: slug };
}

async function buildApp() {
  const router = (await import("./completeYourGift")).default;
  const app = express();
  app.use((req, _res, next) => {
    (req as any).log = { info: vi.fn(), warn: vi.fn() };
    next();
  });
  app.use(router);
  return app;
}

const anchor = makeProduct({ id: "rose-bouquet", categories: [cat("flowers")] });

const fullCatalog = [
  anchor,
  makeProduct({ id: "teddy-1", categories: [cat("stuffed-animals")], osNumericId: 1, totalSales: 50 }),
  makeProduct({ id: "balloon-1", categories: [cat("balloons")], osNumericId: 2, totalSales: 40 }),
  makeProduct({ id: "cake-1", categories: [cat("cakes")], osNumericId: 3, totalSales: 30, personalisationRequired: true }),
  makeProduct({ id: "choc-1", categories: [cat("chocolate")], osNumericId: 4, totalSales: 20 }),
  makeProduct({ id: "choc-2", categories: [cat("chocolate")], osNumericId: 5, totalSales: 90 }),
];

const savedEnv: Record<string, string | undefined> = {};
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (!(k in savedEnv)) savedEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  setEnv({ CYG_ROLLOUT: "on", CYG_ROLLOUT_PCT: undefined });
  mockGetOsProducts.mockReturnValue(fullCatalog);
  mockGetOsProductBySlug.mockImplementation((slug: string) =>
    fullCatalog.find((p) => p.id === slug) ?? null,
  );
  mockGetOsProductPricingMap.mockReturnValue(new Map());
  mockGetMetricsCache.mockReturnValue(new Map());
  mockGetDeliverySlots.mockReturnValue([]);
  mockGetRate.mockResolvedValue(3.6725);
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("GET /products/complete-your-gift", () => {
  it("returns all four slots in fixed order with full shape", async () => {
    const app = await buildApp();
    const res = await request(app).get("/products/complete-your-gift?slug=rose-bouquet");
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.rulesVersion).toBe("cyg-rules-v1");
    expect(res.body.experiment).toMatchObject({ id: "complete-your-gift-v1", variant: "treatment" });
    expect(res.body.slots.map((s: any) => s.category)).toEqual([
      "chocolate",
      "cake",
      "balloon",
      "stuffed-animal",
    ]);
    const slot = res.body.slots[0];
    expect(slot).toMatchObject({
      slotIndex: 0,
      productSlug: "choc-2", // highest smoothed totalSales
      currency: "USD",
      inStock: true,
      quantity: { min: 1, max: 10 },
      rulesVersion: "cyg-rules-v1",
    });
    expect(slot.imageUrl).toContain("choc-2");
    expect(slot.imageAlt).toBe("alt-choc-2");
    expect(typeof slot.token).toBe("string");
    expect(slot.scoreRef).toMatchObject({ explored: false });
    expect(typeof slot.scoreRef.score).toBe("number");
  });

  it("flags requiresOptions on cakes with mandatory personalisation", async () => {
    const app = await buildApp();
    const res = await request(app).get("/products/complete-your-gift?slug=rose-bouquet");
    const cake = res.body.slots.find((s: any) => s.category === "cake");
    expect(cake.requiresOptions).toBe(true);
    const balloon = res.body.slots.find((s: any) => s.category === "balloon");
    expect(balloon.requiresOptions).toBe(false);
  });

  it("omits empty slots cleanly instead of padding", async () => {
    mockGetOsProducts.mockReturnValue([
      anchor,
      makeProduct({ id: "choc-only", categories: [cat("chocolate")] }),
      makeProduct({ id: "teddy-oos", categories: [cat("stuffed-animals")], inStock: false }),
    ]);
    const app = await buildApp();
    const res = await request(app).get("/products/complete-your-gift?slug=rose-bouquet");
    expect(res.body.slots.map((s: any) => s.category)).toEqual(["chocolate"]);
  });

  it("dedupes against cart items", async () => {
    const app = await buildApp();
    const res = await request(app).get(
      "/products/complete-your-gift?slug=rose-bouquet&cart=choc-2,teddy-1",
    );
    const choc = res.body.slots.find((s: any) => s.category === "chocolate");
    expect(choc.productSlug).toBe("choc-1"); // choc-2 in cart → next best
    expect(res.body.slots.find((s: any) => s.category === "stuffed-animal")).toBeUndefined();
  });

  it("skips the anchor's own category slot", async () => {
    mockGetOsProductBySlug.mockReturnValue(
      makeProduct({ id: "cake-anchor", categories: [cat("cakes")] }),
    );
    const app = await buildApp();
    const res = await request(app).get("/products/complete-your-gift?slug=cake-anchor");
    expect(res.body.slots.map((s: any) => s.category)).not.toContain("cake");
  });

  it("returns enabled:false with control variant when the kill switch is off", async () => {
    setEnv({ CYG_ROLLOUT: "off" });
    const app = await buildApp();
    const res = await request(app).get("/products/complete-your-gift?slug=rose-bouquet");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      enabled: false,
      slots: [],
      experiment: { variant: "control", mode: "off" },
    });
    expect(mockGetOsProducts).not.toHaveBeenCalled();
  });

  it("respects percentage rollout with deterministic session assignment", async () => {
    setEnv({ CYG_ROLLOUT: "percentage", CYG_ROLLOUT_PCT: "100" });
    const app = await buildApp();
    const withSession = await request(app).get(
      "/products/complete-your-gift?slug=rose-bouquet&sessionId=abc",
    );
    expect(withSession.body.enabled).toBe(true);
    const noSession = await request(app).get("/products/complete-your-gift?slug=rose-bouquet");
    expect(noSession.body.enabled).toBe(false);
  });

  it("rejects invalid queries", async () => {
    const app = await buildApp();
    expect((await request(app).get("/products/complete-your-gift")).status).toBe(400);
    expect(
      (await request(app).get("/products/complete-your-gift?slug=x&store=mars")).status,
    ).toBe(400);
    expect(
      (await request(app).get("/products/complete-your-gift?slug=x&date=not-a-date")).status,
    ).toBe(400);
  });

  it("404s for an unknown anchor", async () => {
    mockGetOsProductBySlug.mockReturnValue(null);
    const app = await buildApp();
    const res = await request(app).get("/products/complete-your-gift?slug=nope");
    expect(res.status).toBe(404);
  });

  it("returns empty slots when the catalog cache is cold", async () => {
    mockGetOsProducts.mockReturnValue(null);
    const app = await buildApp();
    const res = await request(app).get("/products/complete-your-gift?slug=rose-bouquet");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: true, slots: [] });
  });

  it("uses sale price as the incremental price when discounted", async () => {
    mockGetOsProductPricingMap.mockReturnValue(
      new Map([["5", { discountPriceUsd: 15, discountPriceAed: null, regularPriceUsd: 25 }]]),
    );
    const app = await buildApp();
    const res = await request(app).get("/products/complete-your-gift?slug=rose-bouquet");
    const choc = res.body.slots.find((s: any) => s.category === "chocolate");
    expect(choc.productSlug).toBe("choc-2");
    expect(choc.incrementalPriceUsd).toBe(15);
    expect(choc.regularPriceUsd).toBe(25);
    // Lebanon store — USD display currency, no FX applied.
    expect(choc.currency).toBe("USD");
    expect(choc.incrementalPrice).toBe(15);
  });

  it("resolves AED display prices for Gulf stores via FX conversion", async () => {
    const app = await buildApp();
    const res = await request(app).get(
      "/products/complete-your-gift?slug=rose-bouquet&store=dubai",
    );
    const choc = res.body.slots.find((s: any) => s.category === "chocolate");
    expect(choc.currency).toBe("AED");
    expect(choc.incrementalPriceUsd).toBe(25);
    // 25 USD * 3.6725 = 91.8125 → rounded to nearest 5 = 90 (test rounding stub)
    expect(choc.incrementalPrice).toBe(90);
    expect(mockGetRate).toHaveBeenCalledWith("AED");
  });

  it("prefers the OS-authored AED sale price over FX conversion when discounted", async () => {
    mockGetOsProductPricingMap.mockReturnValue(
      new Map([["5", { discountPriceUsd: 15, discountPriceAed: 55, regularPriceUsd: 25 }]]),
    );
    const app = await buildApp();
    const res = await request(app).get(
      "/products/complete-your-gift?slug=rose-bouquet&store=abudhabi",
    );
    const choc = res.body.slots.find((s: any) => s.category === "chocolate");
    expect(choc.currency).toBe("AED");
    expect(choc.incrementalPrice).toBe(55); // OS AED price, not converted
    expect(choc.incrementalPriceUsd).toBe(15);
  });

  it("returns EUR display currency for Cyprus", async () => {
    const app = await buildApp();
    const res = await request(app).get(
      "/products/complete-your-gift?slug=rose-bouquet&store=cyprus",
    );
    const choc = res.body.slots.find((s: any) => s.category === "chocolate");
    expect(choc.currency).toBe("EUR");
    expect(mockGetRate).toHaveBeenCalledWith("EUR");
  });

  it("serves USD reference prices when the FX rate lookup fails", async () => {
    mockGetRate.mockRejectedValue(new Error("fx down"));
    const app = await buildApp();
    const res = await request(app).get(
      "/products/complete-your-gift?slug=rose-bouquet&store=dubai",
    );
    expect(res.status).toBe(200);
    const choc = res.body.slots.find((s: any) => s.category === "chocolate");
    // rate falls back to 1 → 25 * 1 rounded to nearest 5 = 25
    expect(choc.incrementalPrice).toBe(25);
  });

  it("returns empty slots with a reason when the delivery date is not servable", async () => {
    // Only a same-day-only slot exists and the requested date is in the future
    // relative to a same-day-only configuration → not deliverable.
    mockGetDeliverySlots.mockReturnValue([
      { label: "Same day", enabled: true, sameDayEnabled: true, nextDayEnabled: false, cutoffHour: 14 },
    ]);
    const app = await buildApp();
    const res = await request(app).get(
      "/products/complete-your-gift?slug=rose-bouquet&city=ae-dubai&date=2099-01-01",
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: true, slots: [], reason: "date_not_deliverable" });
  });

  it("serves recommendations when the delivery date is servable", async () => {
    mockGetDeliverySlots.mockReturnValue([
      { label: "Evening", enabled: true },
    ]);
    const app = await buildApp();
    const res = await request(app).get(
      "/products/complete-your-gift?slug=rose-bouquet&city=ae-dubai&date=2099-01-01",
    );
    expect(res.body.slots.length).toBeGreaterThan(0);
    expect(mockGetDeliverySlots).toHaveBeenCalledWith("ae-dubai");
  });
});
