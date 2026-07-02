import { describe, it, expect } from "vitest";
import { inferFromKeywords } from "./newbornGenderInference";

describe("inferFromKeywords", () => {
  describe("boy keywords", () => {
    it("detects 'blue' in the product name", () => {
      expect(inferFromKeywords("Blue Baby Hamper")).toBe("boy");
    });

    it("detects 'navy' in the product name", () => {
      expect(inferFromKeywords("Navy Newborn Bundle")).toBe("boy");
    });

    it("detects 'teal' in the product name", () => {
      expect(inferFromKeywords("Teal Flower Box")).toBe("boy");
    });

    it("detects 'boy' in the product name", () => {
      expect(inferFromKeywords("Baby Boy Gift Set")).toBe("boy");
    });

    it("detects 'cyan' in the product name", () => {
      expect(inferFromKeywords("Cyan Bouquet Newborn")).toBe("boy");
    });

    it("detects 'turquoise' in the product name", () => {
      expect(inferFromKeywords("Turquoise Bear Gift")).toBe("boy");
    });

    it("detects 'denim' in the product name", () => {
      expect(inferFromKeywords("Denim Newborn Basket")).toBe("boy");
    });

    it("detects a boy keyword in the description when name is neutral", () => {
      expect(inferFromKeywords("Newborn Bundle", "A lovely blue arrangement")).toBe("boy");
    });

    it("is case-insensitive for boy keywords", () => {
      expect(inferFromKeywords("NAVY Newborn Gift")).toBe("boy");
    });
  });

  describe("girl keywords", () => {
    it("detects 'pink' in the product name", () => {
      expect(inferFromKeywords("Pink Baby Bouquet")).toBe("girl");
    });

    it("detects 'rose' in the product name", () => {
      expect(inferFromKeywords("Rose Newborn Bundle")).toBe("girl");
    });

    it("detects 'fuchsia' in the product name", () => {
      expect(inferFromKeywords("Fuchsia Baby Hamper")).toBe("girl");
    });

    it("detects 'lavender' in the product name", () => {
      expect(inferFromKeywords("Lavender Gift Basket")).toBe("girl");
    });

    it("detects 'girl' in the product name", () => {
      expect(inferFromKeywords("Baby Girl Flower Box")).toBe("girl");
    });

    it("detects 'blush' in the product name", () => {
      expect(inferFromKeywords("Blush Newborn Set")).toBe("girl");
    });

    it("detects 'magenta' in the product name", () => {
      expect(inferFromKeywords("Magenta Floral Bundle")).toBe("girl");
    });

    it("detects 'lilac' in the product name", () => {
      expect(inferFromKeywords("Lilac Newborn Hamper")).toBe("girl");
    });

    it("detects 'mauve' in the product name", () => {
      expect(inferFromKeywords("Mauve Baby Gift")).toBe("girl");
    });

    it("detects a girl keyword in the description when name is neutral", () => {
      expect(inferFromKeywords("Newborn Bundle", "Filled with pink roses")).toBe("girl");
    });

    it("is case-insensitive for girl keywords", () => {
      expect(inferFromKeywords("PINK Baby Gift")).toBe("girl");
    });
  });

  describe("ambiguous / neutral products", () => {
    it("returns null for a white-themed product (no gender signal)", () => {
      expect(inferFromKeywords("White Newborn Hamper")).toBeNull();
    });

    it("returns null for a yellow-themed product", () => {
      expect(inferFromKeywords("Yellow Bear Bundle")).toBeNull();
    });

    it("returns null when neither name nor description carry a signal", () => {
      expect(inferFromKeywords("Newborn Gift Set", "A beautiful arrangement")).toBeNull();
    });

    it("returns null when there is no description", () => {
      expect(inferFromKeywords("Luxury Newborn Bundle")).toBeNull();
    });

    it("returns null for an empty name with no description", () => {
      expect(inferFromKeywords("")).toBeNull();
    });
  });

  describe("conflicting signals (both boy and girl keywords present)", () => {
    it("returns null when both boy and girl keywords appear in the name", () => {
      expect(inferFromKeywords("Blue and Pink Newborn Bundle")).toBeNull();
    });

    it("returns null when boy keyword is in name and girl keyword is in description", () => {
      expect(inferFromKeywords("Blue Baby Hamper", "Includes pink roses")).toBeNull();
    });

    it("returns null when girl keyword is in name and boy keyword is in description", () => {
      expect(inferFromKeywords("Pink Baby Bouquet", "Wrapped in navy ribbon")).toBeNull();
    });

    it("returns null when both signals appear only in the description", () => {
      expect(inferFromKeywords("Newborn Bundle", "Blue and pink flowers")).toBeNull();
    });
  });

  describe("word-boundary matching", () => {
    it("does not match 'boy' as a substring of another word", () => {
      expect(inferFromKeywords("Buoyant Newborn Gift")).toBeNull();
    });

    it("does not match 'rose' as a substring of another word", () => {
      expect(inferFromKeywords("Rosewood Newborn Set")).toBeNull();
    });

    it("does not match 'navy' as a substring of another word", () => {
      expect(inferFromKeywords("Unavailable Newborn Bundle")).toBeNull();
    });
  });
});
