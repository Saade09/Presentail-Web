import { describe, expect, it } from "vitest";
import { productMatchesSearchQuery, type Product } from "./queries";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "red-rose-box",
    wcId: 1,
    name: "Red Rose Box",
    price: "$50",
    priceValue: 50,
    image: { uri: "/rose.jpg" },
    category: "flower-boxes",
    categories: ["flower-boxes"],
    inStock: true,
    occasions: ["birthday"],
    ...overrides,
  };
}

describe("productMatchesSearchQuery", () => {
  it("requires every query word to match a searchable product field", () => {
    const rose = product({
      description: "A romantic gift",
      brandNames: ["Presentail"],
      categoryNames: ["Flower Boxes"],
    });

    expect(productMatchesSearchQuery(rose, "red presentail")).toBe(true);
    expect(productMatchesSearchQuery(rose, "red chocolate")).toBe(false);
  });

  it("keeps Unicode language searches intact", () => {
    const greekProduct = product({ name: "Κόκκινα τριαντάφυλλα" });
    const arabicProduct = product({ name: "زهور حمراء" });

    expect(productMatchesSearchQuery(greekProduct, "τριαντάφυλλα")).toBe(true);
    expect(productMatchesSearchQuery(arabicProduct, "زهور حمراء")).toBe(true);
  });
});