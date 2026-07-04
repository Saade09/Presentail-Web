/**
 * Integration tests for GET /api/catalog/products-pricing.
 *
 * Verifies that the endpoint:
 *   - Returns { ok: true, pricing: {} } when the map is empty.
 *   - Serialises all map entries with the correct field names.
 *   - Preserves null values for discountPriceUsd / discountPriceAed /
 *     regularPriceUsd (not omitted or coerced to 0).
 *   - Sets Cache-Control: public, max-age=60 on every response.
 *   - Responds with 200 regardless of cache state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// ── Hoisted mock references ──────────────────────────────────────────────────

const { getOsProductPricingMapMock } = vi.hoisted(() => ({
  getOsProductPricingMapMock: vi.fn<[], ReadonlyMap<string, { discountPriceUsd: number | null; discountPriceAed: number | null; regularPriceUsd: number | null }>>(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("../lib/osProductsCache", () => ({
  getOsProductPricingMap: getOsProductPricingMapMock,
  getOsBrands: vi.fn().mockReturnValue([]),
  getOsRawCatalogBrands: vi.fn().mockReturnValue([]),
  getOsBrandProductCounts: vi.fn().mockReturnValue(new Map()),
  getOsCategories: vi.fn().mockReturnValue([]),
  getOsCategoryProductCounts: vi.fn().mockReturnValue(new Map()),
  getOsOccasions: vi.fn().mockReturnValue([]),
  getOsOccasionProductCounts: vi.fn().mockReturnValue(new Map()),
  getOsProductOccasions: vi.fn().mockReturnValue(new Map()),
  getOsProductEmbeddedCategories: vi.fn().mockReturnValue(new Map()),
}));

vi.mock("../lib/imageTransform", () => ({
  transformImage: vi.fn(),
  resolveWidth: (raw?: string) => {
    if (!raw) return 800;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1600) : 800;
  },
  resolveFormat: (raw?: string) => (raw === "jpeg" ? "jpeg" : "webp"),
  resolveQuality: (raw?: string) => {
    if (!raw) return 82;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 100) : 82;
  },
}));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("@workspace/catalog-data", () => ({
  categories: [],
  occasions: [],
  CURRENCIES: [],
  COUNTRY_TO_CURRENCY_MAP: {},
  FALLBACK_CURRENCY_CODE: "USD",
}));

vi.mock("@workspace/api-zod", () => ({
  GetCatalogMetadataResponse: { parse: (v: unknown) => v },
  GetCurrenciesResponse: { parse: (v: unknown) => v },
}));

// ── App builder ───────────────────────────────────────────────────────────────

async function buildApp() {
  const { default: catalogRouter } = await import("./catalog");
  const app = express();
  app.use(express.json());
  app.use((_req: unknown, _res: unknown, next: () => void) => {
    (_req as Record<string, unknown>).log = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    next();
  });
  app.use("/api", catalogRouter);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/catalog/products-pricing", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    getOsProductPricingMapMock.mockReturnValue(new Map());
    app = await buildApp();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns ok:true with empty pricing object when map is empty", async () => {
    getOsProductPricingMapMock.mockReturnValue(new Map());

    const res = await request(app).get("/api/catalog/products-pricing");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, pricing: {} });
  });

  it("serialises all map entries with correct field names", async () => {
    getOsProductPricingMapMock.mockReturnValue(
      new Map([
        ["101", { discountPriceUsd: 60, discountPriceAed: 220, regularPriceUsd: 80 }],
        ["202", { discountPriceUsd: 45, discountPriceAed: null, regularPriceUsd: null }],
      ]),
    );

    const res = await request(app).get("/api/catalog/products-pricing");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.pricing["101"]).toEqual({
      discountPriceUsd: 60,
      discountPriceAed: 220,
      regularPriceUsd: 80,
    });
    expect(res.body.pricing["202"]).toEqual({
      discountPriceUsd: 45,
      discountPriceAed: null,
      regularPriceUsd: null,
    });
  });

  it("preserves null values — does not coerce them to 0 or omit them", async () => {
    getOsProductPricingMapMock.mockReturnValue(
      new Map([
        ["303", { discountPriceUsd: null, discountPriceAed: 180, regularPriceUsd: null }],
      ]),
    );

    const res = await request(app).get("/api/catalog/products-pricing");

    const entry = res.body.pricing["303"];
    expect(entry.discountPriceUsd).toBeNull();
    expect(entry.regularPriceUsd).toBeNull();
    expect(entry.discountPriceAed).toBe(180);
  });

  it("sets Cache-Control: public, max-age=60", async () => {
    const res = await request(app).get("/api/catalog/products-pricing");

    expect(res.headers["cache-control"]).toContain("public");
    expect(res.headers["cache-control"]).toContain("max-age=60");
  });

  it("returns a non-empty pricing map when the OS product cache is warmed", async () => {
    getOsProductPricingMapMock.mockReturnValue(
      new Map([
        ["501", { discountPriceUsd: 55, discountPriceAed: 202, regularPriceUsd: 75 }],
        ["502", { discountPriceUsd: 30, discountPriceAed: null, regularPriceUsd: 50 }],
        ["503", { discountPriceUsd: null, discountPriceAed: 148, regularPriceUsd: null }],
      ]),
    );

    const res = await request(app).get("/api/catalog/products-pricing");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const keys = Object.keys(res.body.pricing);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).toEqual(expect.arrayContaining(["501", "502", "503"]));
    expect(res.body.pricing["501"].discountPriceUsd).toBe(55);
    expect(res.body.pricing["501"].discountPriceAed).toBe(202);
    expect(res.body.pricing["501"].regularPriceUsd).toBe(75);
    expect(res.body.pricing["503"].discountPriceUsd).toBeNull();
    expect(res.body.pricing["503"].discountPriceAed).toBe(148);
  });

  it("includes all entries from a map with many products", async () => {
    const entries: [string, { discountPriceUsd: number | null; discountPriceAed: number | null; regularPriceUsd: number | null }][] = Array.from(
      { length: 5 },
      (_, i) => [
        String(i + 1),
        { discountPriceUsd: (i + 1) * 10, discountPriceAed: null, regularPriceUsd: (i + 1) * 15 },
      ],
    );
    getOsProductPricingMapMock.mockReturnValue(new Map(entries));

    const res = await request(app).get("/api/catalog/products-pricing");

    expect(Object.keys(res.body.pricing)).toHaveLength(5);
    for (const [id, entry] of entries) {
      expect(res.body.pricing[id]).toEqual(entry);
    }
  });
});
