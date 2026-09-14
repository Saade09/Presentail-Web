// Unit tests for the country-availability gate in resolveCartItems().
//
// Covers:
//   1. Product with deliverableCountries: ["CY"] is rejected for LB.
//   2. Same product is accepted for CY.
//   3. Product with empty/absent deliverableCountries is accepted for any country (unrestricted).
//   4. resolveCartItems with no destinationCountry never rejects on availability.
//   5. Case-insensitivity: lowercase deliverableCountries and destinationCountry still work.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("./osLocationsCache", () => ({
  getDeliverySlots: vi.fn().mockReturnValue([]),
  getExpressConfig: vi.fn().mockReturnValue({}),
  getOsCountryFreeDeliveryThresholdUsd: vi.fn().mockReturnValue(null),
  getOsCountryFreeDeliveryEnabled: vi.fn().mockReturnValue(null),
  getOsCityFreeDeliveryThresholdUsd: vi.fn().mockReturnValue(null),
  getOsCityFreeDeliveryEnabled: vi.fn().mockReturnValue(null),
  getOsCityDeliveryFeeUsd: vi.fn().mockReturnValue(null),
}));

vi.mock("./osProductsCache", () => ({
  getOsProductBySlug: vi.fn(),
  getOsProductByWcId: vi.fn(),
  getOsProductPricingMap: vi.fn().mockReturnValue(new Map()),
  hasOsProducts: vi.fn().mockReturnValue(true),
}));

vi.mock("./wooStore", () => ({
  resolveStore: vi.fn().mockReturnValue({ storeKey: "lebanon", baseUrl: "", consumerKey: "", consumerSecret: "" }),
}));

vi.mock("@workspace/delivery", async (importActual) => {
  const actual = await importActual<typeof import("@workspace/delivery")>();
  return { ...actual };
});

import { resolveCartItems } from "./catalog";
import { getOsProductBySlug, getOsProductByWcId } from "./osProductsCache";

const getOsProductBySlugMock = vi.mocked(getOsProductBySlug);
const getOsProductByWcIdMock = vi.mocked(getOsProductByWcId);

// A realistic OS product restricted to Cyprus only.
const CY_ONLY_PRODUCT = {
  id: "single-red-rose",
  osNumericId: 42,
  wcId: 0,
  name: "Single Red Rose",
  price: 25,
  images: [],
  inStock: true,
  categories: [],
  occasions: [],
  brands: [],
  deliverableCountries: ["CY"],
};

// An unrestricted product — no deliverableCountries set.
const UNRESTRICTED_PRODUCT = {
  id: "velvet-rose-bouquet",
  osNumericId: 99,
  wcId: 100,
  name: "Velvet Rose Bouquet",
  price: 50,
  images: [],
  inStock: true,
  categories: [],
  occasions: [],
  brands: [],
  deliverableCountries: undefined,
};

// An explicitly empty deliverableCountries product (also unrestricted).
const EMPTY_LIST_PRODUCT = {
  id: "balloon-bouquet",
  osNumericId: 77,
  wcId: 0,
  name: "Balloon Bouquet",
  price: 30,
  images: [],
  inStock: true,
  categories: [],
  occasions: [],
  brands: [],
  deliverableCountries: [] as string[],
};

const LB_ITEM = { wcId: 0, osSlug: "single-red-rose", quantity: 1 };
const UNRESTRICTED_ITEM = { wcId: 100, osSlug: "velvet-rose-bouquet", quantity: 1 };
const EMPTY_LIST_ITEM = { wcId: 0, osSlug: "balloon-bouquet", quantity: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  getOsProductBySlugMock.mockReturnValue(null);
  getOsProductByWcIdMock.mockReturnValue(null);
});

describe("resolveCartItems — country availability gate", () => {
  describe("CY-only product", () => {
    beforeEach(() => {
      getOsProductBySlugMock.mockImplementation((slug) => {
        if (slug === "single-red-rose") return CY_ONLY_PRODUCT as any;
        return undefined;
      });
    });

    it("rejects the product when destinationCountry is LB", async () => {
      const result = await resolveCartItems([LB_ITEM], undefined, {
        destinationCountry: "LB",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toMatch(/single-red-rose/);
        expect(result.message).toMatch(/LB/);
        expect(result.message).toMatch(/not available/i);
      }
    });

    it("accepts the product when destinationCountry is CY", async () => {
      const result = await resolveCartItems([LB_ITEM], undefined, {
        destinationCountry: "CY",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.items).toHaveLength(1);
        expect(result.items[0]!.osSlug).toBe("single-red-rose");
      }
    });

    it("accepts the product when no destinationCountry is provided (pre-guard paths)", async () => {
      const result = await resolveCartItems([LB_ITEM]);
      expect(result.ok).toBe(true);
    });

    it("is case-insensitive for destinationCountry input (lowercase lb)", async () => {
      const result = await resolveCartItems([LB_ITEM], undefined, {
        destinationCountry: "lb",
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("unrestricted product (deliverableCountries absent)", () => {
    beforeEach(() => {
      getOsProductByWcIdMock.mockImplementation((wcId) => {
        if (wcId === 100) return UNRESTRICTED_PRODUCT as any;
        return undefined;
      });
      getOsProductBySlugMock.mockImplementation((slug) => {
        if (slug === "velvet-rose-bouquet") return UNRESTRICTED_PRODUCT as any;
        return undefined;
      });
    });

    it("accepts the product for LB when deliverableCountries is absent", async () => {
      // fetchWcProductPrice will fall back to slug cache; mock via osSlug path.
      getOsProductByWcIdMock.mockReturnValue(UNRESTRICTED_PRODUCT as any);
      const result = await resolveCartItems([UNRESTRICTED_ITEM], undefined, {
        destinationCountry: "LB",
      });
      expect(result.ok).toBe(true);
    });

    it("accepts the product for AE when deliverableCountries is absent", async () => {
      getOsProductByWcIdMock.mockReturnValue(UNRESTRICTED_PRODUCT as any);
      const result = await resolveCartItems([UNRESTRICTED_ITEM], undefined, {
        destinationCountry: "AE",
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("product with empty deliverableCountries list", () => {
    beforeEach(() => {
      getOsProductBySlugMock.mockImplementation((slug) => {
        if (slug === "balloon-bouquet") return EMPTY_LIST_PRODUCT as any;
        return undefined;
      });
    });

    it("accepts the product for any country when list is empty (unrestricted)", async () => {
      const result = await resolveCartItems([EMPTY_LIST_ITEM], undefined, {
        destinationCountry: "LB",
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("any-store fallback with availability gate", () => {
    it("rejects a product resolved from any-store fallback when destination is excluded", async () => {
      // First call (store-specific) returns undefined; second call (any-store) returns the restricted product.
      getOsProductBySlugMock
        .mockReturnValueOnce(null)            // store-specific miss
        .mockReturnValueOnce(CY_ONLY_PRODUCT as any); // any-store hit

      const result = await resolveCartItems([LB_ITEM], undefined, {
        destinationCountry: "LB",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toMatch(/not available/i);
        expect(result.message).toMatch(/LB/);
      }
    });
  });
});
