import { describe, it, expect } from "vitest";
import { applyRecipientFilter } from "./birthdayRecipients";
import type { Product } from "./queries";

function makeProduct(overrides: Partial<Product> & { id: string; name: string }): Product {
  return {
    wcId: 0,
    price: "50",
    priceValue: 50,
    image: null,
    category: "bundles",
    categories: ["bundles"],
    inStock: true,
    occasions: [],
    ...overrides,
  };
}

describe("applyRecipientFilter", () => {
  describe("no filter", () => {
    it("returns all products when recipientKey is 'all'", () => {
      const products = [
        makeProduct({ id: "p1", name: "Bouquet" }),
        makeProduct({ id: "p2", name: "Chocolate Box" }),
      ];
      expect(applyRecipientFilter(products, "all")).toHaveLength(2);
    });

    it("returns all products when recipientKey is empty string", () => {
      const products = [makeProduct({ id: "p1", name: "Gift" })];
      expect(applyRecipientFilter(products, "")).toHaveLength(1);
    });

    it("returns all products when recipientKey is unknown", () => {
      const products = [makeProduct({ id: "p1", name: "Gift" })];
      expect(applyRecipientFilter(products, "unknown")).toHaveLength(1);
    });
  });

  describe("dad filter", () => {
    it("includes products in dad's preferred categories", () => {
      const products = [
        makeProduct({ id: "p1", name: "Dark Chocolate Box", category: "chocolate", categories: ["chocolate"] }),
        makeProduct({ id: "p2", name: "Whisky Bundle", category: "spirits", categories: ["spirits"] }),
        makeProduct({ id: "p3", name: "Green Plant", category: "plants", categories: ["plants"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      expect(result.map((p) => p.id)).toContain("p1");
      expect(result.map((p) => p.id)).toContain("p2");
      expect(result.map((p) => p.id)).toContain("p3");
    });

    it("excludes products with colour keywords in the name", () => {
      const products = [
        makeProduct({ id: "p1", name: "Pink Chocolate Box", category: "chocolate", categories: ["chocolate"] }),
        makeProduct({ id: "p2", name: "Dark Chocolate Box", category: "chocolate", categories: ["chocolate"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      expect(result.map((p) => p.id)).not.toContain("p1");
      expect(result.map((p) => p.id)).toContain("p2");
    });

    it("excludes 'Bloom in Love Gift Set' (romantic keyword 'love', category: bundles)", () => {
      const products = [
        makeProduct({ id: "p1", name: "Bloom in Love Gift Set", category: "bundles", categories: ["bundles"] }),
        makeProduct({ id: "p2", name: "Dark Chocolate Box", category: "chocolate", categories: ["chocolate"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      expect(result.map((p) => p.id)).not.toContain("p1");
      expect(result.map((p) => p.id)).toContain("p2");
    });

    it("excludes products with 'heart' or 'hearts' in the name", () => {
      const products = [
        makeProduct({ id: "p1", name: "Red Hearts Bundle", category: "bundles", categories: ["bundles"] }),
        makeProduct({ id: "p2", name: "Sweetheart Box", category: "bundles", categories: ["bundles"] }),
        makeProduct({ id: "p3", name: "Gourmet Chocolate Bundle", category: "bundles", categories: ["bundles"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      const ids = result.map((p) => p.id);
      expect(ids).not.toContain("p1");
      expect(ids).not.toContain("p2");
      expect(ids).toContain("p3");
    });

    it("excludes products with 'romance' or 'romantic' in the name", () => {
      const products = [
        makeProduct({ id: "p1", name: "Romance Bundle", category: "bundles", categories: ["bundles"] }),
        makeProduct({ id: "p2", name: "Romantic Evening Set", category: "bundles", categories: ["bundles"] }),
        makeProduct({ id: "p3", name: "Gift Basket", category: "gift-baskets", categories: ["gift-baskets"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      const ids = result.map((p) => p.id);
      expect(ids).not.toContain("p1");
      expect(ids).not.toContain("p2");
      expect(ids).toContain("p3");
    });

    it("excludes 'Bloom Like Her' (contains 'her', category: flower-boxes)", () => {
      const products = [
        makeProduct({ id: "p1", name: "Bloom Like Her", category: "flower-boxes", categories: ["flower-boxes"] }),
        makeProduct({ id: "p2", name: "Summer Fever Box", category: "flower-boxes", categories: ["flower-boxes"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      const ids = result.map((p) => p.id);
      expect(ids).not.toContain("p1");
      expect(ids).toContain("p2");
    });

    it("excludes 'Passionate Petals' (contains 'passionate', category: flower-boxes)", () => {
      const products = [
        makeProduct({ id: "p1", name: "Passionate Petals", category: "flower-boxes", categories: ["flower-boxes"] }),
        makeProduct({ id: "p2", name: "Sunflower Box", category: "flower-boxes", categories: ["flower-boxes"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      const ids = result.map((p) => p.id);
      expect(ids).not.toContain("p1");
      expect(ids).toContain("p2");
    });

    it("excludes 'Plum Florals' (contains 'plum', pink/purple color, category: flower-boxes)", () => {
      const products = [
        makeProduct({ id: "p1", name: "Plum Florals", category: "flower-boxes", categories: ["flower-boxes"] }),
        makeProduct({ id: "p2", name: "Garden Green Box", category: "flower-boxes", categories: ["flower-boxes"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      const ids = result.map((p) => p.id);
      expect(ids).not.toContain("p1");
      expect(ids).toContain("p2");
    });

    it("excludes 'Fresh Promises' (contains 'promise', category: flower-boxes)", () => {
      const products = [
        makeProduct({ id: "p1", name: "Fresh Promises", category: "flower-boxes", categories: ["flower-boxes"] }),
        makeProduct({ id: "p2", name: "Fresh Garden Box", category: "flower-boxes", categories: ["flower-boxes"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      const ids = result.map((p) => p.id);
      expect(ids).not.toContain("p1");
      expect(ids).toContain("p2");
    });

    it("excludes 'Rosé Reverie' and 'Rosé Fever Bundle' (contains 'rosé', category: flower-boxes/bundles)", () => {
      const products = [
        makeProduct({ id: "p1", name: "Rosé Reverie", category: "flower-boxes", categories: ["flower-boxes"] }),
        makeProduct({ id: "p2", name: "Rosé Fever Bundle", category: "bundles", categories: ["bundles"] }),
        makeProduct({ id: "p3", name: "Summer Citrus Box", category: "flower-boxes", categories: ["flower-boxes"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      const ids = result.map((p) => p.id);
      expect(ids).not.toContain("p1");
      expect(ids).not.toContain("p2");
      expect(ids).toContain("p3");
    });

    it("includes 'Summer Fever Box' (sunflower box, category: flower-boxes)", () => {
      const products = [
        makeProduct({ id: "p1", name: "Summer Fever Box", category: "flower-boxes", categories: ["flower-boxes"] }),
        makeProduct({ id: "p2", name: "Bloom in Love Gift Set", category: "bundles", categories: ["bundles"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      const ids = result.map((p) => p.id);
      expect(ids).toContain("p1");
      expect(ids).not.toContain("p2");
    });

    it("excludes flower-boxes with romantic keywords even though category is now preferred", () => {
      const products = [
        makeProduct({ id: "p1", name: "Love Blooms Box", category: "flower-boxes", categories: ["flower-boxes"] }),
        makeProduct({ id: "p2", name: "Summer Sunflower Box", category: "flower-boxes", categories: ["flower-boxes"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      const ids = result.map((p) => p.id);
      expect(ids).not.toContain("p1");
      expect(ids).toContain("p2");
    });

    it("excludes products not in dad's preferred categories", () => {
      const products = [
        makeProduct({ id: "p1", name: "Hand Bouquet", category: "hand-bouquets", categories: ["hand-bouquets"] }),
        makeProduct({ id: "p2", name: "Chocolate Box", category: "chocolate", categories: ["chocolate"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      const ids = result.map((p) => p.id);
      expect(ids).not.toContain("p1");
      expect(ids).toContain("p2");
    });

    it("falls back to all products when filtering would yield an empty result", () => {
      const products = [
        makeProduct({ id: "p1", name: "Love Bouquet", category: "hand-bouquets", categories: ["hand-bouquets"] }),
        makeProduct({ id: "p2", name: "Pink Basket", category: "flower-baskets", categories: ["flower-baskets"] }),
      ];
      const result = applyRecipientFilter(products, "dad");
      expect(result).toHaveLength(2);
    });
  });

  describe("mom filter", () => {
    it("includes flower-boxes and hand-bouquets for mom", () => {
      const products = [
        makeProduct({ id: "p1", name: "Love Blooms Box", category: "flower-boxes", categories: ["flower-boxes"] }),
        makeProduct({ id: "p2", name: "Spring Bouquet", category: "hand-bouquets", categories: ["hand-bouquets"] }),
      ];
      const result = applyRecipientFilter(products, "mom");
      const ids = result.map((p) => p.id);
      expect(ids).toContain("p1");
      expect(ids).toContain("p2");
    });

    it("does not exclude romantic-keyword products for mom", () => {
      const products = [
        makeProduct({ id: "p1", name: "Bloom in Love Gift Set", category: "bundles", categories: ["bundles"] }),
      ];
      const result = applyRecipientFilter(products, "mom");
      expect(result.map((p) => p.id)).toContain("p1");
    });
  });

  describe("jedo filter", () => {
    it("includes flower-boxes for jedo", () => {
      const products = [
        makeProduct({ id: "p1", name: "Summer Fever Box", category: "flower-boxes", categories: ["flower-boxes"] }),
      ];
      const result = applyRecipientFilter(products, "jedo");
      expect(result.map((p) => p.id)).toContain("p1");
    });

    it("excludes romantic-keyword products for jedo", () => {
      const products = [
        makeProduct({ id: "p1", name: "Love Blooms Box", category: "flower-boxes", categories: ["flower-boxes"] }),
        makeProduct({ id: "p2", name: "Summer Box", category: "flower-boxes", categories: ["flower-boxes"] }),
      ];
      const result = applyRecipientFilter(products, "jedo");
      const ids = result.map((p) => p.id);
      expect(ids).not.toContain("p1");
      expect(ids).toContain("p2");
    });
  });

  describe("husband filter", () => {
    it("includes flower-boxes for husband", () => {
      const products = [
        makeProduct({ id: "p1", name: "Summer Fever Box", category: "flower-boxes", categories: ["flower-boxes"] }),
      ];
      const result = applyRecipientFilter(products, "husband");
      expect(result.map((p) => p.id)).toContain("p1");
    });

    it("excludes romantic-keyword products for husband", () => {
      const products = [
        makeProduct({ id: "p1", name: "Romance Bundle", category: "bundles", categories: ["bundles"] }),
        makeProduct({ id: "p2", name: "Gourmet Bundle", category: "bundles", categories: ["bundles"] }),
      ];
      const result = applyRecipientFilter(products, "husband");
      const ids = result.map((p) => p.id);
      expect(ids).not.toContain("p1");
      expect(ids).toContain("p2");
    });
  });

  describe("boyfriend filter", () => {
    it("excludes romantic-keyword products for boyfriend", () => {
      const products = [
        makeProduct({ id: "p1", name: "Sweetheart Bundle", category: "bundles", categories: ["bundles"] }),
        makeProduct({ id: "p2", name: "Gourmet Chocolate Bundle", category: "bundles", categories: ["bundles"] }),
      ];
      const result = applyRecipientFilter(products, "boyfriend");
      const ids = result.map((p) => p.id);
      expect(ids).not.toContain("p1");
      expect(ids).toContain("p2");
    });
  });

  describe("unaffected recipients", () => {
    it("girlfriend sees flower-boxes and is not subject to romantic-keyword exclusion", () => {
      const products = [
        makeProduct({ id: "p1", name: "Bloom in Love Gift Set", category: "flower-boxes", categories: ["flower-boxes"] }),
      ];
      const result = applyRecipientFilter(products, "girlfriend");
      expect(result.map((p) => p.id)).toContain("p1");
    });

    it("wife sees flower-boxes and is not subject to romantic-keyword exclusion", () => {
      const products = [
        makeProduct({ id: "p1", name: "Romance Flower Box", category: "flower-boxes", categories: ["flower-boxes"] }),
      ];
      const result = applyRecipientFilter(products, "wife");
      expect(result.map((p) => p.id)).toContain("p1");
    });

    it("teta sees flower-boxes and is not subject to romantic-keyword exclusion", () => {
      const products = [
        makeProduct({ id: "p1", name: "Love Blooms Box", category: "flower-boxes", categories: ["flower-boxes"] }),
      ];
      const result = applyRecipientFilter(products, "teta");
      expect(result.map((p) => p.id)).toContain("p1");
    });
  });
});
