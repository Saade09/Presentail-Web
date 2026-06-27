/**
 * Unit tests for the zero-product brand filter in osProductsCache.ts.
 *
 * After every fetch cycle fetchAndStore() does two things in sequence:
 *
 *   1. Builds cachedBrands from the OS catalog-attributes endpoint (all brands
 *      from OS, initially including zero-product ones).
 *   2. Computes cachedBrandProductCounts from storeCache (slug → in-stock count).
 *   3. Filters cachedBrands: removes any brand whose slug is absent from
 *      cachedBrandProductCounts (i.e. brands with zero in-stock products).
 *
 * So the public surface used by search and brand listings is:
 *
 *   getOsBrands()             — brands WITH ≥1 in-stock product only
 *   getOsBrandProductCounts() — slug → nonzero count map
 *
 * Tests call fetchAndStoreForTesting() with controlled OS fetcher mocks so
 * they exercise the real production assembly path rather than duplicating
 * any logic inside test helpers.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import type { OSProduct, OSProductBrand, OSCatalogAttributeBrand } from "@workspace/presentail-os";
import {
  getOsBrands,
  getOsBrandProductCounts,
  fetchAndStoreForTesting,
  __resetBrandFilterStateForTest,
} from "./osProductsCache";

// ── Module-level mocks ──────────────────────────────────────────────────────

vi.mock("@workspace/presentail-os", async (importOriginal) => {
  const original = await importOriginal<typeof import("@workspace/presentail-os")>();
  return {
    ...original,
    fetchOsProducts: vi.fn().mockResolvedValue({ products: [] }),
    fetchOsCategories: vi.fn().mockResolvedValue({ categories: [] }),
    fetchOsCatalogAttributesBrands: vi.fn().mockResolvedValue({ brands: [] }),
    fetchOsOccasions: vi.fn().mockResolvedValue({ occasions: [] }),
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
  osPriceSnapshotsTable: {},
  osPriceAlertsTable: {},
  gt: vi.fn(),
  lt: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("./logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("./alerts", () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./indexNow", () => ({
  submitIndexNowUrls: vi.fn().mockResolvedValue(undefined),
  buildCanonicalUrls: vi.fn().mockReturnValue([]),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeOsCatalogBrand(slug: string, name: string): OSCatalogAttributeBrand {
  return { id: slug, slug, name };
}

function makeOsEmbeddedBrand(slug: string, name: string): OSProductBrand {
  return { id: slug, slug, name };
}

function makeProduct(
  id: string,
  brands: OSProductBrand[],
  inStock = true,
): OSProduct {
  return {
    id,
    name: `Product ${id}`,
    price: 10,
    images: [],
    inStock,
    categories: [],
    occasions: [],
    brands,
  };
}

// ── Test setup ───────────────────────────────────────────────────────────────

import { fetchOsProducts, fetchOsCatalogAttributesBrands } from "@workspace/presentail-os";

const originalApiKey = process.env.PRESENTAIL_OS_API_KEY;
const originalBrandAllowlist = process.env.PRESENTAIL_OS_BRAND_ALLOWLIST;

beforeEach(() => {
  // fetchAndStore returns early when no API key is set.
  process.env.PRESENTAIL_OS_API_KEY = "test-key";
  // Disable the brand allowlist so test products with arbitrary brand slugs
  // are not filtered out before reaching storeCache. An empty string means
  // "no filtering" per applyBrandAllowlist() in osProductsCache.ts.
  process.env.PRESENTAIL_OS_BRAND_ALLOWLIST = "";
  __resetBrandFilterStateForTest();
  vi.mocked(fetchOsProducts).mockResolvedValue({ products: [] });
  vi.mocked(fetchOsCatalogAttributesBrands).mockResolvedValue({ brands: [] });
});

afterAll(() => {
  if (originalApiKey === undefined) {
    delete process.env.PRESENTAIL_OS_API_KEY;
  } else {
    process.env.PRESENTAIL_OS_API_KEY = originalApiKey;
  }
  if (originalBrandAllowlist === undefined) {
    delete process.env.PRESENTAIL_OS_BRAND_ALLOWLIST;
  } else {
    process.env.PRESENTAIL_OS_BRAND_ALLOWLIST = originalBrandAllowlist;
  }
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("osProductsCache — zero-product brand filter", () => {
  it("getOsBrands excludes brand C when brandMap has A/B/C but only A/B have products", async () => {
    // This is the core regression guard: the catalog-attributes endpoint returns
    // three brands (A, B, C) but only products for A and B exist in the store
    // cache. Brand C must be filtered out of getOsBrands() so it cannot leak
    // into search metadata or brand listings.
    const brandA = makeOsEmbeddedBrand("brand-a", "Brand A");
    const brandB = makeOsEmbeddedBrand("brand-b", "Brand B");

    vi.mocked(fetchOsCatalogAttributesBrands).mockResolvedValue({
      brands: [
        makeOsCatalogBrand("brand-a", "Brand A"),
        makeOsCatalogBrand("brand-b", "Brand B"),
        makeOsCatalogBrand("brand-c", "Brand C"), // zero products
      ],
    });
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [
        makeProduct("prod-1", [brandA]),
        makeProduct("prod-2", [brandB]),
      ],
    });

    await fetchAndStoreForTesting();

    const brands = getOsBrands();
    expect(brands).not.toBeNull();

    const slugs = brands!.map((b) => b.slug);
    // A and B have products — they must appear.
    expect(slugs).toContain("brand-a");
    expect(slugs).toContain("brand-b");
    // C has no products — it must be filtered out.
    expect(slugs).not.toContain("brand-c");
    // Exactly two brands (A and B).
    expect(brands).toHaveLength(2);
  });

  it("getOsBrandProductCounts has nonzero entries for A/B and no entry for C", async () => {
    const brandA = makeOsEmbeddedBrand("brand-a", "Brand A");
    const brandB = makeOsEmbeddedBrand("brand-b", "Brand B");

    vi.mocked(fetchOsCatalogAttributesBrands).mockResolvedValue({
      brands: [
        makeOsCatalogBrand("brand-a", "Brand A"),
        makeOsCatalogBrand("brand-b", "Brand B"),
        makeOsCatalogBrand("brand-c", "Brand C"),
      ],
    });
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [
        makeProduct("prod-1", [brandA]),
        makeProduct("prod-2", [brandB]),
      ],
    });

    await fetchAndStoreForTesting();

    const counts = getOsBrandProductCounts();
    expect(counts.get("brand-a")).toBe(1);
    expect(counts.get("brand-b")).toBe(1);
    expect(counts.has("brand-c")).toBe(false);
  });

  it("out-of-stock products do not count — brand with only OOS products is filtered out", async () => {
    vi.mocked(fetchOsCatalogAttributesBrands).mockResolvedValue({
      brands: [makeOsCatalogBrand("brand-a", "Brand A")],
    });
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [
        makeProduct("prod-oos", [makeOsEmbeddedBrand("brand-a", "Brand A")], false),
      ],
    });

    await fetchAndStoreForTesting();

    // Brand A has only OOS products — it must be filtered from getOsBrands().
    const brands = getOsBrands();
    expect(brands ?? []).toHaveLength(0);
    expect(getOsBrandProductCounts().has("brand-a")).toBe(false);
  });

  it("deduplicates the same product id across stores — brand count stays at 1", async () => {
    const brandA = makeOsEmbeddedBrand("brand-a", "Brand A");

    vi.mocked(fetchOsCatalogAttributesBrands).mockResolvedValue({
      brands: [makeOsCatalogBrand("brand-a", "Brand A")],
    });
    // fetchOsProducts is called for every store spec; returning the same
    // product id each time simulates it appearing in multiple store caches.
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("shared-prod", [brandA])],
    });

    await fetchAndStoreForTesting();

    // Must be counted exactly once, not once per store.
    expect(getOsBrandProductCounts().get("brand-a")).toBe(1);
  });

  it("counts each brand separately when a product is linked to multiple brands", async () => {
    const brandA = makeOsEmbeddedBrand("brand-a", "Brand A");
    const brandB = makeOsEmbeddedBrand("brand-b", "Brand B");

    vi.mocked(fetchOsCatalogAttributesBrands).mockResolvedValue({
      brands: [
        makeOsCatalogBrand("brand-a", "Brand A"),
        makeOsCatalogBrand("brand-b", "Brand B"),
      ],
    });
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("multi-brand", [brandA, brandB])],
    });

    await fetchAndStoreForTesting();

    expect(getOsBrandProductCounts().get("brand-a")).toBe(1);
    expect(getOsBrandProductCounts().get("brand-b")).toBe(1);
    // Both brands have products — both must appear in getOsBrands().
    const slugs = getOsBrands()!.map((b) => b.slug);
    expect(slugs).toContain("brand-a");
    expect(slugs).toContain("brand-b");
  });

  it("getOsBrands returns null and counts are empty when no products are present", async () => {
    vi.mocked(fetchOsCatalogAttributesBrands).mockResolvedValue({
      brands: [makeOsCatalogBrand("brand-a", "Brand A")],
    });
    vi.mocked(fetchOsProducts).mockResolvedValue({ products: [] });

    await fetchAndStoreForTesting();

    // No products → brand A filtered out → cachedBrands becomes empty after
    // the filter pass. getOsBrands() may return null (never set) or [].
    const brands = getOsBrands();
    expect(brands === null || brands.length === 0).toBe(true);
    expect(getOsBrandProductCounts().size).toBe(0);
  });

  it("reset clears brands and counts", async () => {
    vi.mocked(fetchOsCatalogAttributesBrands).mockResolvedValue({
      brands: [makeOsCatalogBrand("brand-a", "Brand A")],
    });
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("prod-1", [makeOsEmbeddedBrand("brand-a", "Brand A")])],
    });

    await fetchAndStoreForTesting();
    expect(getOsBrands()).not.toBeNull();
    expect(getOsBrandProductCounts().size).toBeGreaterThan(0);

    __resetBrandFilterStateForTest();
    expect(getOsBrands()).toBeNull();
    expect(getOsBrandProductCounts().size).toBe(0);
  });
});
