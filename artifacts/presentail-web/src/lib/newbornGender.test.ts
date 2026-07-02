import { describe, it, expect } from "vitest";
import { applyNewbornGenderFilter, type NewbornGender } from "./newbornGender";
import type { Product } from "./queries";

function makeProduct(overrides: Partial<Product> & { id: string; name: string }): Product {
  return {
    wcId: 0,
    price: "50",
    priceValue: 50,
    image: null,
    category: "gift-baskets",
    categories: ["gift-baskets"],
    inStock: true,
    occasions: [],
    ...overrides,
  };
}

const BOY_PREFERRED_CATEGORY = "hand-bouquets";
const GIRL_PREFERRED_CATEGORY = "flower-boxes";

describe("applyNewbornGenderFilter", () => {
  describe("genderMap primary path", () => {
    it("passes through all products when genderKey is 'all'", () => {
      const products = [
        makeProduct({ id: "p1", name: "Boy Bundle" }),
        makeProduct({ id: "p2", name: "Girl Bundle" }),
      ];
      const result = applyNewbornGenderFilter(products, "all", { p1: "boy", p2: "girl" });
      expect(result).toHaveLength(2);
    });

    it("passes through all products when genderKey is empty string", () => {
      const products = [makeProduct({ id: "p1", name: "Baby Bundle" })];
      const result = applyNewbornGenderFilter(products, "", {});
      expect(result).toHaveLength(1);
    });

    it("returns only boy products when genderKey is 'boy'", () => {
      const products = [
        makeProduct({ id: "p1", name: "Blue Hamper" }),
        makeProduct({ id: "p2", name: "Pink Bouquet" }),
        makeProduct({ id: "p3", name: "White Bundle" }),
      ];
      const genderMap: Record<string, NewbornGender> = {
        p1: "boy",
        p2: "girl",
        p3: "neutral",
      };
      const result = applyNewbornGenderFilter(products, "boy", genderMap);
      const ids = result.map((p) => p.id);
      expect(ids).toContain("p1");
      expect(ids).not.toContain("p2");
    });

    it("returns only girl products when genderKey is 'girl'", () => {
      const products = [
        makeProduct({ id: "p1", name: "Blue Hamper" }),
        makeProduct({ id: "p2", name: "Pink Bouquet" }),
      ];
      const genderMap: Record<string, NewbornGender> = {
        p1: "boy",
        p2: "girl",
      };
      const result = applyNewbornGenderFilter(products, "girl", genderMap);
      const ids = result.map((p) => p.id);
      expect(ids).not.toContain("p1");
      expect(ids).toContain("p2");
    });

    it("includes neutral products in a preferred category for 'boy' filter", () => {
      const products = [
        makeProduct({
          id: "p1",
          name: "White Newborn Set",
          category: BOY_PREFERRED_CATEGORY,
          categories: [BOY_PREFERRED_CATEGORY],
        }),
      ];
      const genderMap: Record<string, NewbornGender> = { p1: "neutral" };
      const result = applyNewbornGenderFilter(products, "boy", genderMap);
      expect(result.map((p) => p.id)).toContain("p1");
    });

    it("excludes neutral products NOT in a preferred category for 'boy' filter", () => {
      const products = [
        makeProduct({
          id: "p1",
          name: "White Newborn Set",
          category: "chocolate",
          categories: ["chocolate"],
        }),
        makeProduct({
          id: "p2",
          name: "Newborn Hamper",
          category: BOY_PREFERRED_CATEGORY,
          categories: [BOY_PREFERRED_CATEGORY],
        }),
      ];
      const genderMap: Record<string, NewbornGender> = { p1: "neutral", p2: "neutral" };
      const result = applyNewbornGenderFilter(products, "boy", genderMap);
      expect(result.map((p) => p.id)).not.toContain("p1");
      expect(result.map((p) => p.id)).toContain("p2");
    });

    it("excludes neutral products that carry an excluded colour keyword for 'boy' filter", () => {
      const products = [
        makeProduct({
          id: "p1",
          name: "Pink White Newborn Set",
          category: BOY_PREFERRED_CATEGORY,
          categories: [BOY_PREFERRED_CATEGORY],
        }),
        makeProduct({
          id: "p2",
          name: "White Newborn Hamper",
          category: BOY_PREFERRED_CATEGORY,
          categories: [BOY_PREFERRED_CATEGORY],
        }),
      ];
      const genderMap: Record<string, NewbornGender> = { p1: "neutral", p2: "neutral" };
      const result = applyNewbornGenderFilter(products, "boy", genderMap);
      expect(result.map((p) => p.id)).not.toContain("p1");
      expect(result.map((p) => p.id)).toContain("p2");
    });

    it("excludes neutral products that carry an excluded colour keyword for 'girl' filter", () => {
      const products = [
        makeProduct({
          id: "p1",
          name: "Blue White Newborn Set",
          category: GIRL_PREFERRED_CATEGORY,
          categories: [GIRL_PREFERRED_CATEGORY],
        }),
        makeProduct({
          id: "p2",
          name: "White Flower Box",
          category: GIRL_PREFERRED_CATEGORY,
          categories: [GIRL_PREFERRED_CATEGORY],
        }),
      ];
      const genderMap: Record<string, NewbornGender> = { p1: "neutral", p2: "neutral" };
      const result = applyNewbornGenderFilter(products, "girl", genderMap);
      expect(result.map((p) => p.id)).not.toContain("p1");
      expect(result.map((p) => p.id)).toContain("p2");
    });
  });

  describe("keyword-fallback path (empty genderMap)", () => {
    it("includes products in a preferred category when genderMap is empty for 'boy'", () => {
      const products = [
        makeProduct({
          id: "p1",
          name: "White Newborn Bundle",
          category: BOY_PREFERRED_CATEGORY,
          categories: [BOY_PREFERRED_CATEGORY],
        }),
      ];
      const result = applyNewbornGenderFilter(products, "boy", {});
      expect(result.map((p) => p.id)).toContain("p1");
    });

    it("excludes products NOT in a preferred category when genderMap is empty for 'boy'", () => {
      const products = [
        makeProduct({
          id: "p1",
          name: "White Newborn Bundle",
          category: "chocolate",
          categories: ["chocolate"],
        }),
        makeProduct({
          id: "p2",
          name: "Newborn Hamper",
          category: BOY_PREFERRED_CATEGORY,
          categories: [BOY_PREFERRED_CATEGORY],
        }),
      ];
      const result = applyNewbornGenderFilter(products, "boy", {});
      expect(result.map((p) => p.id)).not.toContain("p1");
      expect(result.map((p) => p.id)).toContain("p2");
    });

    it("includes products in a preferred category when genderMap is empty for 'girl'", () => {
      const products = [
        makeProduct({
          id: "p1",
          name: "White Newborn Bundle",
          category: GIRL_PREFERRED_CATEGORY,
          categories: [GIRL_PREFERRED_CATEGORY],
        }),
      ];
      const result = applyNewbornGenderFilter(products, "girl", {});
      expect(result.map((p) => p.id)).toContain("p1");
    });

    it("excludes products with an excluded colour keyword even when in preferred category (boy filter)", () => {
      const products = [
        makeProduct({
          id: "p1",
          name: "Pink Newborn Bundle",
          category: BOY_PREFERRED_CATEGORY,
          categories: [BOY_PREFERRED_CATEGORY],
        }),
        makeProduct({
          id: "p2",
          name: "White Newborn Hamper",
          category: BOY_PREFERRED_CATEGORY,
          categories: [BOY_PREFERRED_CATEGORY],
        }),
      ];
      const result = applyNewbornGenderFilter(products, "boy", {});
      expect(result.map((p) => p.id)).not.toContain("p1");
      expect(result.map((p) => p.id)).toContain("p2");
    });

    it("excludes products with an excluded colour keyword even when in preferred category (girl filter)", () => {
      const products = [
        makeProduct({
          id: "p1",
          name: "Navy Newborn Bundle",
          category: GIRL_PREFERRED_CATEGORY,
          categories: [GIRL_PREFERRED_CATEGORY],
        }),
        makeProduct({
          id: "p2",
          name: "White Flower Box",
          category: GIRL_PREFERRED_CATEGORY,
          categories: [GIRL_PREFERRED_CATEGORY],
        }),
      ];
      const result = applyNewbornGenderFilter(products, "girl", {});
      expect(result.map((p) => p.id)).not.toContain("p1");
      expect(result.map((p) => p.id)).toContain("p2");
    });
  });

  describe("empty-result safety fallback", () => {
    it("returns all products when the filtered result would be empty", () => {
      const products = [
        makeProduct({ id: "p1", name: "Pink Bundle" }),
        makeProduct({ id: "p2", name: "Rose Bundle" }),
      ];
      const genderMap: Record<string, NewbornGender> = {
        p1: "girl",
        p2: "girl",
      };
      const result = applyNewbornGenderFilter(products, "boy", genderMap);
      expect(result).toHaveLength(2);
    });

    it("returns all products when genderMap is empty and no product matches the fallback criteria", () => {
      const products = [
        makeProduct({ id: "p1", name: "White Bundle", category: "chocolate", categories: ["chocolate"] }),
        makeProduct({ id: "p2", name: "Yellow Bundle", category: "chocolate", categories: ["chocolate"] }),
      ];
      const result = applyNewbornGenderFilter(products, "boy", {});
      expect(result).toHaveLength(2);
    });

    it("returns all products when the product list is empty regardless of filter", () => {
      const result = applyNewbornGenderFilter([], "boy", {});
      expect(result).toHaveLength(0);
    });
  });

  describe("unknown genderKey", () => {
    it("returns all products for an unknown genderKey", () => {
      const products = [makeProduct({ id: "p1", name: "Baby Bundle" })];
      const result = applyNewbornGenderFilter(products, "unknown", {});
      expect(result).toHaveLength(1);
    });
  });
});
