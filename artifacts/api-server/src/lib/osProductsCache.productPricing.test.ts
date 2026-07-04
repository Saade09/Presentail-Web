/**
 * Unit tests for enrichProductPricingFromOs and getOsProductPricingMap.
 *
 * enrichProductPricingFromOs is a private function called fire-and-forget
 * inside fetchAndStore(). We expose it for testing via
 * __enrichProductPricingForTest so we can await it and inspect
 * cachedProductPricing via getOsProductPricingMap().
 *
 * Test setup:
 *   1. Mock fetchOsProducts to return products with known osNumericIds so
 *      storeCache is populated by fetchAndStoreForTesting().
 *   2. Mock global fetch (used by enrichProductPricingFromOs for the
 *      single-product OS endpoint) to return controlled pricing fields.
 *   3. Call __enrichProductPricingForTest() and assert the resulting map.
 *
 * Scenarios covered:
 *   - Modern regular_price / sale_price scheme → discountPriceUsd set,
 *     regularPriceUsd preserved as the "was" price.
 *   - sale_price absent → price field used as discountPriceUsd when < regular.
 *   - Legacy discount_price_usd scheme (no regular_price) → discountPriceUsd
 *     set, regularPriceUsd null.
 *   - AED-only discount (discount_price_aed, no USD discount) → stored with
 *     discountPriceAed only.
 *   - No discount on either side → product NOT stored in map (keeps map small).
 *   - OS fetch failure for one product does not poison the rest of the map.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import type { OSProduct } from "@workspace/presentail-os";
import {
  getOsProductPricingMap,
  fetchAndStoreForTesting,
  __enrichProductPricingForTest,
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

vi.mock("./personalisationRequirementInference", () => ({
  inferPersonalisationRequirements: vi.fn().mockResolvedValue({}),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeProduct(
  id: string,
  osNumericId: number,
): OSProduct {
  return {
    id,
    name: `Product ${id}`,
    price: 50,
    osNumericId,
    images: [],
    inStock: true,
    categories: [],
    occasions: [],
    brands: [],
  };
}

/** Build a mock fetch response returning the given product pricing fields. */
function makePricingResponse(fields: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ product: fields }),
  } as unknown as Response;
}

/** Config object used for all __enrichProductPricingForTest calls. */
const TEST_CONFIG = {
  baseUrl: "https://os.presentail.com",
  apiKey: "test-api-key",
  workspace: "presentail",
};

// ── Test setup ───────────────────────────────────────────────────────────────

import { fetchOsProducts } from "@workspace/presentail-os";

const originalApiKey = process.env.PRESENTAIL_OS_API_KEY;

beforeEach(() => {
  process.env.PRESENTAIL_OS_API_KEY = "test-key";
  process.env.PRESENTAIL_OS_BRAND_ALLOWLIST = "";
  __resetBrandFilterStateForTest();
  vi.mocked(fetchOsProducts).mockResolvedValue({ products: [] });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

afterAll(() => {
  if (originalApiKey === undefined) {
    delete process.env.PRESENTAIL_OS_API_KEY;
  } else {
    process.env.PRESENTAIL_OS_API_KEY = originalApiKey;
  }
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("enrichProductPricingFromOs — modern regular_price / sale_price scheme", () => {
  it("stores regularPriceUsd and discountPriceUsd when sale_price < regular_price", async () => {
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("rose-bouquet", 101)],
    });
    await fetchAndStoreForTesting();

    vi.mocked(fetch).mockResolvedValue(
      makePricingResponse({ regular_price: "80", sale_price: "60" }),
    );

    await __enrichProductPricingForTest(TEST_CONFIG);

    const map = getOsProductPricingMap();
    expect(map.has("101")).toBe(true);
    const entry = map.get("101")!;
    expect(entry.regularPriceUsd).toBe(80);
    expect(entry.discountPriceUsd).toBe(60);
    expect(entry.discountPriceAed).toBeNull();
  });

  it("uses price field as discountPriceUsd when sale_price is absent but price < regular_price", async () => {
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("tulip-box", 102)],
    });
    await fetchAndStoreForTesting();

    vi.mocked(fetch).mockResolvedValue(
      makePricingResponse({ regular_price: "100", price: "75" }),
    );

    await __enrichProductPricingForTest(TEST_CONFIG);

    const map = getOsProductPricingMap();
    const entry = map.get("102")!;
    expect(entry.regularPriceUsd).toBe(100);
    expect(entry.discountPriceUsd).toBe(75);
  });

  it("does not set discountPriceUsd when sale_price equals regular_price (no real discount)", async () => {
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("candle-gift", 103)],
    });
    await fetchAndStoreForTesting();

    vi.mocked(fetch).mockResolvedValue(
      makePricingResponse({ regular_price: "50", sale_price: "50" }),
    );

    await __enrichProductPricingForTest(TEST_CONFIG);

    // discountPriceUsd must not be set (sale_price must be < regular_price)
    const map = getOsProductPricingMap();
    expect(map.has("103")).toBe(false);
  });

  it("does not set discountPriceUsd when sale_price is greater than regular_price", async () => {
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("basket-luxury", 104)],
    });
    await fetchAndStoreForTesting();

    vi.mocked(fetch).mockResolvedValue(
      makePricingResponse({ regular_price: "40", sale_price: "55" }),
    );

    await __enrichProductPricingForTest(TEST_CONFIG);

    const map = getOsProductPricingMap();
    expect(map.has("104")).toBe(false);
  });
});

describe("enrichProductPricingFromOs — legacy discount_price_usd scheme", () => {
  it("stores discountPriceUsd from discount_price_usd with null regularPriceUsd when regular_price is absent", async () => {
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("orchid-classic", 201)],
    });
    await fetchAndStoreForTesting();

    vi.mocked(fetch).mockResolvedValue(
      makePricingResponse({ discount_price_usd: "45" }),
    );

    await __enrichProductPricingForTest(TEST_CONFIG);

    const map = getOsProductPricingMap();
    expect(map.has("201")).toBe(true);
    const entry = map.get("201")!;
    expect(entry.discountPriceUsd).toBe(45);
    expect(entry.regularPriceUsd).toBeNull();
  });

  it("stores discountPriceUsd from discount_price_usd when regular_price is zero", async () => {
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("lily-wrap", 202)],
    });
    await fetchAndStoreForTesting();

    vi.mocked(fetch).mockResolvedValue(
      makePricingResponse({ regular_price: "0", discount_price_usd: "30" }),
    );

    await __enrichProductPricingForTest(TEST_CONFIG);

    const map = getOsProductPricingMap();
    const entry = map.get("202")!;
    expect(entry.discountPriceUsd).toBe(30);
    expect(entry.regularPriceUsd).toBeNull();
  });
});

describe("enrichProductPricingFromOs — AED-only discount", () => {
  it("stores discountPriceAed when discount_price_aed is set and no USD discount", async () => {
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("daisy-bunch", 301)],
    });
    await fetchAndStoreForTesting();

    vi.mocked(fetch).mockResolvedValue(
      makePricingResponse({ discount_price_aed: "150" }),
    );

    await __enrichProductPricingForTest(TEST_CONFIG);

    const map = getOsProductPricingMap();
    expect(map.has("301")).toBe(true);
    const entry = map.get("301")!;
    expect(entry.discountPriceAed).toBe(150);
    expect(entry.discountPriceUsd).toBeNull();
    expect(entry.regularPriceUsd).toBeNull();
  });

  it("stores both discountPriceUsd and discountPriceAed when both are present", async () => {
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("sunflower-box", 302)],
    });
    await fetchAndStoreForTesting();

    vi.mocked(fetch).mockResolvedValue(
      makePricingResponse({ regular_price: "90", sale_price: "70", discount_price_aed: "260" }),
    );

    await __enrichProductPricingForTest(TEST_CONFIG);

    const map = getOsProductPricingMap();
    const entry = map.get("302")!;
    expect(entry.discountPriceUsd).toBe(70);
    expect(entry.discountPriceAed).toBe(260);
    expect(entry.regularPriceUsd).toBe(90);
  });
});

describe("enrichProductPricingFromOs — products with no discount", () => {
  it("does not add products with no discount fields to the map", async () => {
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("plain-product", 401)],
    });
    await fetchAndStoreForTesting();

    vi.mocked(fetch).mockResolvedValue(
      makePricingResponse({ price: "55" }),
    );

    await __enrichProductPricingForTest(TEST_CONFIG);

    const map = getOsProductPricingMap();
    expect(map.has("401")).toBe(false);
    expect(map.size).toBe(0);
  });

  it("does not add a product when all price fields are zero", async () => {
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("zero-price", 402)],
    });
    await fetchAndStoreForTesting();

    vi.mocked(fetch).mockResolvedValue(
      makePricingResponse({ regular_price: "0", sale_price: "0", discount_price_usd: "0" }),
    );

    await __enrichProductPricingForTest(TEST_CONFIG);

    expect(getOsProductPricingMap().has("402")).toBe(false);
  });
});

describe("enrichProductPricingFromOs — fetch failure resilience", () => {
  it("stores successful products even when one product fetch fails", async () => {
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [
        makeProduct("good-product", 501),
        makeProduct("bad-product", 502),
      ],
    });
    await fetchAndStoreForTesting();

    vi.mocked(fetch)
      .mockImplementationOnce((_url: string | URL | Request) => {
        // First call (for product 501): success
        return Promise.resolve(
          makePricingResponse({ regular_price: "60", sale_price: "40" }),
        );
      })
      .mockImplementationOnce((_url: string | URL | Request) => {
        // Second call (for product 502): HTTP error
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        } as unknown as Response);
      });

    await __enrichProductPricingForTest(TEST_CONFIG);

    const map = getOsProductPricingMap();
    // The good product must be stored.
    expect(map.has("501")).toBe(true);
    expect(map.get("501")!.discountPriceUsd).toBe(40);
    // The failed product must not appear.
    expect(map.has("502")).toBe(false);
  });

  it("clears pricing map when storeCache is empty (no products to enrich)", async () => {
    // Start with a non-empty state
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("prior-product", 601)],
    });
    await fetchAndStoreForTesting();
    vi.mocked(fetch).mockResolvedValue(
      makePricingResponse({ regular_price: "80", sale_price: "60" }),
    );
    await __enrichProductPricingForTest(TEST_CONFIG);
    expect(getOsProductPricingMap().size).toBe(1);

    // Now simulate a cycle where all stores have no products.
    __resetBrandFilterStateForTest();
    vi.mocked(fetchOsProducts).mockResolvedValue({ products: [] });
    await fetchAndStoreForTesting();

    // enrichProductPricingFromOs returns early when idSet is empty,
    // leaving cachedProductPricing as the new empty map from __reset.
    await __enrichProductPricingForTest(TEST_CONFIG);
    expect(getOsProductPricingMap().size).toBe(0);
  });

  it("deduplicates the same osNumericId across stores — map has exactly one entry for the shared id", async () => {
    // storeCache has 4 store specs; fetchOsProducts returns the same product
    // (osNumericId=701) for every store. enrichProductPricingFromOs collects
    // unique osNumericIds via an idSet, so the resulting map must contain
    // exactly one entry for "701" regardless of how many stores share it.
    vi.mocked(fetchOsProducts).mockResolvedValue({
      products: [makeProduct("shared-prod", 701)],
    });
    vi.mocked(fetch).mockResolvedValue(
      makePricingResponse({ regular_price: "70", sale_price: "50" }),
    );

    await fetchAndStoreForTesting();
    await __enrichProductPricingForTest(TEST_CONFIG);

    const map = getOsProductPricingMap();
    expect(map.has("701")).toBe(true);
    expect(map.size).toBe(1);
    expect(map.get("701")!.discountPriceUsd).toBe(50);
    expect(map.get("701")!.regularPriceUsd).toBe(70);
  });
});
