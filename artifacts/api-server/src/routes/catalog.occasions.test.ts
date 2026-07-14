/**
 * Unit/regression tests for the occasion-active filter in GET /catalog/metadata.
 *
 * isOccasionActive checks two fields so either a boolean-flag rename (isActive)
 * or a string-status rename (status) is caught before it reaches production:
 *   isActive === false  →  inactive
 *   status === "inactive"  →  inactive
 *   absent / true / "active"  →  active
 *
 * Coverage:
 *   A. status string field (the task-level contract)
 *      1. status "inactive" → excluded from /catalog/metadata
 *      2. status "active"   → included
 *      3. status absent     → included (treated as active)
 *   B. isActive boolean field (secondary / dual-check)
 *      4. isActive === false     → excluded
 *      5. isActive === true      → included
 *      6. isActive === undefined → included
 *   C. Hardcoded occasions (from @workspace/catalog-data)
 *      7. Hardcoded occ whose OS counterpart has status "inactive" → excluded
 *      8. Hardcoded occ with no OS counterpart                     → always included
 *      9. One inactive, one without OS counterpart                 → only inactive one removed
 *   D. OS-only occasions (not in the hardcoded list)
 *     10. status "inactive" → excluded
 *     11. status absent     → included
 *     12. Sourced from product-occasions map with status "inactive" → excluded
 *     13. Sourced from product-occasions map with status absent     → included
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock references
// ---------------------------------------------------------------------------

const {
  getOsOccasionsMock,
  getOsProductOccasionsMock,
  getOsBrandsMock,
  getOsRawCatalogBrandsMock,
  getOsBrandProductCountsMock,
  getOsCategoryProductCountsMock,
  getOsCategoryProductCountsByCountryMock,
  getOsOccasionProductCountsMock,
  getOsOccasionProductCountsByCountryMock,
} = vi.hoisted(() => ({
  getOsOccasionsMock: vi.fn(),
  getOsProductOccasionsMock: vi.fn(),
  getOsBrandsMock: vi.fn(),
  getOsRawCatalogBrandsMock: vi.fn(),
  getOsBrandProductCountsMock: vi.fn(),
  getOsCategoryProductCountsMock: vi.fn(),
  getOsCategoryProductCountsByCountryMock: vi.fn(),
  getOsOccasionProductCountsMock: vi.fn(),
  getOsOccasionProductCountsByCountryMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../lib/osProductsCache", () => ({
  getOsOccasions: getOsOccasionsMock,
  getOsProductOccasions: getOsProductOccasionsMock,
  getOsBrands: getOsBrandsMock,
  getOsRawCatalogBrands: getOsRawCatalogBrandsMock,
  getOsCategories: vi.fn().mockReturnValue([]),
  getOsBrandProductCounts: getOsBrandProductCountsMock,
  getOsCategoryProductCounts: getOsCategoryProductCountsMock,
  getOsCategoryProductCountsByCountry: getOsCategoryProductCountsByCountryMock,
  getOsOccasionProductCounts: getOsOccasionProductCountsMock,
  getOsOccasionProductCountsByCountry: getOsOccasionProductCountsByCountryMock,
  getOsProductEmbeddedCategories: vi.fn().mockReturnValue(new Map()),
  getOsProductPricingMap: vi.fn().mockReturnValue(new Map()),
  getCachedBestSellerIds: vi.fn().mockReturnValue(new Set()),
}));

vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
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

vi.mock("@workspace/api-zod", () => ({
  GetCatalogMetadataResponse: { parse: (v: unknown) => v },
  GetCurrenciesResponse: { parse: (v: unknown) => v },
}));

// Two hardcoded occasions used across tests.
// "birthday" has an OS counterpart in most tests; "anniversary" never does.
const HARDCODED_OCCASIONS = [
  { id: "birthday", name: "Birthday", icon: "cake", description: "Birthday gifts", image: null },
  { id: "anniversary", name: "Anniversary", icon: "heart", description: "Anniversary gifts", image: null },
];

vi.mock("@workspace/catalog-data", () => ({
  occasions: HARDCODED_OCCASIONS,
  categories: [],
  CURRENCIES: [],
  COUNTRY_TO_CURRENCY_MAP: {},
  FALLBACK_CURRENCY_CODE: "USD",
}));

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

async function buildApp() {
  const { default: catalogRouter } = await import("./catalog");
  const app = express();
  app.use(express.json());
  app.use((_req: unknown, _res: unknown, next: () => void) => {
    (_req as any).log = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
    next();
  });
  app.use("/api", catalogRouter);
  return app;
}

// Helper: hit GET /api/catalog/metadata and return the occasions array.
async function getOccasions(app: express.Express): Promise<{ id: string }[]> {
  const res = await request(app).get("/api/catalog/metadata");
  expect(res.status).toBe(200);
  return res.body.occasions as { id: string }[];
}

// ---------------------------------------------------------------------------
// Shared setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getOsBrandsMock.mockReturnValue([]);
  getOsRawCatalogBrandsMock.mockReturnValue([]);
  getOsBrandProductCountsMock.mockReturnValue(new Map());
  getOsCategoryProductCountsMock.mockReturnValue(new Map());
  getOsCategoryProductCountsByCountryMock.mockReturnValue(new Map());
  getOsOccasionProductCountsMock.mockReturnValue(new Map());
  getOsOccasionProductCountsByCountryMock.mockReturnValue(new Map());
  getOsProductOccasionsMock.mockReturnValue(new Map());
});

afterEach(() => {
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// A. status string field
// ---------------------------------------------------------------------------

describe("status string field — isOccasionActive contract", () => {
  it("1. excludes an occasion with status 'inactive'", async () => {
    getOsOccasionsMock.mockReturnValue([
      { id: "1", slug: "birthday", name: "Birthday", status: "inactive" },
    ]);
    const app = await buildApp();
    const ids = (await getOccasions(app)).map((o) => o.id);
    expect(ids).not.toContain("birthday");
  });

  it("2. includes an occasion with status 'active'", async () => {
    getOsOccasionsMock.mockReturnValue([
      { id: "1", slug: "birthday", name: "Birthday", status: "active" },
    ]);
    const app = await buildApp();
    const ids = (await getOccasions(app)).map((o) => o.id);
    expect(ids).toContain("birthday");
  });

  it("3. includes an occasion with no status field (treated as active)", async () => {
    getOsOccasionsMock.mockReturnValue([
      { id: "1", slug: "birthday", name: "Birthday" }, // status absent
    ]);
    const app = await buildApp();
    const ids = (await getOccasions(app)).map((o) => o.id);
    expect(ids).toContain("birthday");
  });
});

// ---------------------------------------------------------------------------
// B. isActive boolean field (dual-check — both fields must work)
// ---------------------------------------------------------------------------

describe("isActive boolean field — dual-check", () => {
  it("4. excludes an occasion with isActive === false", async () => {
    getOsOccasionsMock.mockReturnValue([
      { id: "1", slug: "birthday", name: "Birthday", isActive: false },
    ]);
    const app = await buildApp();
    const ids = (await getOccasions(app)).map((o) => o.id);
    expect(ids).not.toContain("birthday");
  });

  it("5. includes an occasion with isActive === true", async () => {
    getOsOccasionsMock.mockReturnValue([
      { id: "1", slug: "birthday", name: "Birthday", isActive: true },
    ]);
    const app = await buildApp();
    const ids = (await getOccasions(app)).map((o) => o.id);
    expect(ids).toContain("birthday");
  });

  it("6. includes an occasion with isActive === undefined", async () => {
    getOsOccasionsMock.mockReturnValue([
      { id: "1", slug: "birthday", name: "Birthday", isActive: undefined },
    ]);
    const app = await buildApp();
    const ids = (await getOccasions(app)).map((o) => o.id);
    expect(ids).toContain("birthday");
  });
});

// ---------------------------------------------------------------------------
// C. Hardcoded occasions
// ---------------------------------------------------------------------------

describe("hardcoded occasions", () => {
  it("7. excludes a hardcoded occasion whose OS counterpart has status 'inactive'", async () => {
    getOsOccasionsMock.mockReturnValue([
      { id: "1", slug: "birthday", name: "Birthday", status: "inactive" },
    ]);
    const app = await buildApp();
    const ids = (await getOccasions(app)).map((o) => o.id);
    expect(ids).not.toContain("birthday");
  });

  it("8. always includes a hardcoded occasion that has no OS counterpart", async () => {
    getOsOccasionsMock.mockReturnValue([]); // "anniversary" has no OS entry
    const app = await buildApp();
    const ids = (await getOccasions(app)).map((o) => o.id);
    expect(ids).toContain("anniversary");
  });

  it("9. removes only the inactive hardcoded occasion, keeps unmatched ones", async () => {
    getOsOccasionsMock.mockReturnValue([
      { id: "1", slug: "birthday", name: "Birthday", status: "inactive" },
      // "anniversary" has no OS counterpart → stays visible
    ]);
    const app = await buildApp();
    const ids = (await getOccasions(app)).map((o) => o.id);
    expect(ids).not.toContain("birthday");
    expect(ids).toContain("anniversary");
  });
});

// ---------------------------------------------------------------------------
// D. OS-only occasions (not in the hardcoded list)
// ---------------------------------------------------------------------------

describe("OS-only occasions", () => {
  it("10. excludes an OS-only occasion with status 'inactive'", async () => {
    getOsOccasionsMock.mockReturnValue([
      { id: "10", slug: "valentines-day", name: "Valentine's Day", status: "inactive" },
    ]);
    const app = await buildApp();
    const ids = (await getOccasions(app)).map((o) => o.id);
    expect(ids).not.toContain("valentines-day");
  });

  it("11. includes an OS-only occasion with no status field (treated as active)", async () => {
    getOsOccasionsMock.mockReturnValue([
      { id: "10", slug: "valentines-day", name: "Valentine's Day" }, // status absent
    ]);
    const app = await buildApp();
    const ids = (await getOccasions(app)).map((o) => o.id);
    expect(ids).toContain("valentines-day");
  });

  it("12. excludes an OS-only occasion from the product-occasions map with status 'inactive'", async () => {
    getOsOccasionsMock.mockReturnValue([]);
    getOsProductOccasionsMock.mockReturnValue(
      new Map([
        ["mothers-day", { id: "20", slug: "mothers-day", name: "Mother's Day", status: "inactive" }],
      ])
    );
    const app = await buildApp();
    const ids = (await getOccasions(app)).map((o) => o.id);
    expect(ids).not.toContain("mothers-day");
  });

  it("13. includes an OS-only occasion from the product-occasions map with no status field", async () => {
    getOsOccasionsMock.mockReturnValue([]);
    getOsProductOccasionsMock.mockReturnValue(
      new Map([
        ["mothers-day", { id: "20", slug: "mothers-day", name: "Mother's Day" }],
      ])
    );
    const app = await buildApp();
    const ids = (await getOccasions(app)).map((o) => o.id);
    expect(ids).toContain("mothers-day");
  });
});
