import { describe, it, expect } from "vitest";
import {
  buildInternalLinks,
  buildCollectionInternalLinks,
} from "../../artifacts/presentail-web/src/lib/internalLinks";
import type {
  InternalLinksProduct,
  InternalLinksLocale,
  InternalLinksContext,
} from "../../artifacts/presentail-web/src/lib/internalLinks";

const EN_BEIRUT: InternalLinksLocale = { lang: "en", country: "lb", city: "beirut" };

const PRODUCT_FULL: InternalLinksProduct = {
  id: "red-roses-box",
  name: "Red Roses Box",
  category: "flower-boxes",
  categories: ["flower-boxes"],
  occasions: ["birthday"],
  brandNames: ["Presentail Flowers & Gifts"],
  popularity: 100,
};

const CATEGORIES = [
  { id: "flower-boxes", name: "Flower Boxes" },
  { id: "hand-bouquets", name: "Hand Bouquets" },
  { id: "plants", name: "Plants" },
];
const OCCASIONS = [
  { id: "birthday", name: "Birthday" },
  { id: "anniversary", name: "Anniversary" },
];
const BRANDS = [
  { slug: "presentail-flowers--gifts", name: "Presentail Flowers & Gifts" },
];
const CONTEXT_FULL: InternalLinksContext = {
  categories: CATEGORIES,
  occasions: OCCASIONS,
  brands: BRANDS,
};

describe("buildInternalLinks", () => {
  it("product with category + occasion + brand → 4 links (cat, occ, brand, city)", () => {
    const links = buildInternalLinks(PRODUCT_FULL, EN_BEIRUT, CONTEXT_FULL);
    const hrefs = links.map((l) => l.href);
    expect(hrefs).toContain("/en-lb/beirut/category/flower-boxes");
    expect(hrefs).toContain("/en-lb/beirut/occasion/birthday");
    expect(hrefs.some((h) => h.includes("/brand/"))).toBe(true);
    expect(hrefs).toContain("/en-lb/beirut/");
  });

  it("returns max 5 links even when product has many categories and occasions", () => {
    const bigProduct: InternalLinksProduct = {
      id: "big",
      name: "Big Product",
      category: "flower-boxes",
      categories: ["flower-boxes", "bundles", "plants", "balloons", "cakes"],
      occasions: ["birthday", "anniversary", "graduation"],
      brandNames: ["Presentail Flowers & Gifts"],
      popularity: 50,
    };
    const manyProducts: InternalLinksProduct[] = Array.from({ length: 10 }, (_, i) => ({
      id: `other-${i}`,
      name: `Other ${i}`,
      category: "flower-boxes",
      categories: ["flower-boxes"],
      occasions: [],
      popularity: 10 - i,
    }));
    const links = buildInternalLinks(bigProduct, EN_BEIRUT, {
      ...CONTEXT_FULL,
      allProducts: manyProducts,
    });
    expect(links.length).toBeLessThanOrEqual(5);
  });

  it("no duplicate hrefs in result", () => {
    const links = buildInternalLinks(PRODUCT_FULL, EN_BEIRUT, CONTEXT_FULL);
    const hrefs = links.map((l) => l.href);
    const unique = new Set(hrefs);
    expect(unique.size).toBe(hrefs.length);
  });

  it("city link anchor text contains cityName", () => {
    const links = buildInternalLinks(PRODUCT_FULL, EN_BEIRUT, CONTEXT_FULL);
    const cityLink = links.find((l) => l.href === "/en-lb/beirut/");
    expect(cityLink).toBeDefined();
    expect(cityLink!.anchorText.toLowerCase()).toContain("beirut");
  });

  it("empty product (no categories, no occasion, no brand) → at minimum 1 link (city homepage)", () => {
    const emptyProduct: InternalLinksProduct = {
      id: "bare",
      name: "Bare Product",
      category: "",
      categories: [],
      occasions: [],
      popularity: 0,
    };
    const links = buildInternalLinks(emptyProduct, EN_BEIRUT, {});
    expect(links.length).toBeGreaterThanOrEqual(1);
    const cityLink = links.find((l) => l.href === "/en-lb/beirut/");
    expect(cityLink).toBeDefined();
  });

  it("related products capped at 2", () => {
    const manyRelated: InternalLinksProduct[] = Array.from({ length: 8 }, (_, i) => ({
      id: `related-${i}`,
      name: `Related ${i}`,
      category: "flower-boxes",
      categories: ["flower-boxes"],
      occasions: [],
      popularity: 100 - i,
    }));
    const links = buildInternalLinks(PRODUCT_FULL, EN_BEIRUT, {
      ...CONTEXT_FULL,
      allProducts: manyRelated,
    });
    const relatedLinks = links.filter((l) => l.href.includes("/product/"));
    expect(relatedLinks.length).toBeLessThanOrEqual(2);
  });

  it("uses category name from context when available", () => {
    const links = buildInternalLinks(PRODUCT_FULL, EN_BEIRUT, CONTEXT_FULL);
    const catLink = links.find((l) => l.href.includes("/category/"));
    expect(catLink?.anchorText).toBe("Flower Boxes");
  });

  it("falls back to capitalised slug when category not in context", () => {
    const links = buildInternalLinks(PRODUCT_FULL, EN_BEIRUT, {});
    const catLink = links.find((l) => l.href.includes("/category/"));
    expect(catLink?.anchorText).toBe("Flower Boxes");
  });

  it("returns no nofollow rel on any link", () => {
    const links = buildInternalLinks(PRODUCT_FULL, EN_BEIRUT, CONTEXT_FULL);
    expect(links.every((l) => !l.rel)).toBe(true);
  });

  it("Arabic locale: city anchor contains Beirut", () => {
    const arLocale: InternalLinksLocale = { lang: "ar", country: "lb", city: "beirut" };
    const links = buildInternalLinks(PRODUCT_FULL, arLocale, CONTEXT_FULL);
    const cityLink = links.find((l) => l.href.endsWith("/ar-lb/beirut/"));
    expect(cityLink).toBeDefined();
    expect(cityLink!.anchorText).toContain("Beirut");
  });

  it("product without a city: no city homepage link", () => {
    const noCity: InternalLinksLocale = { lang: "en", country: "lb", city: null };
    const links = buildInternalLinks(PRODUCT_FULL, noCity, CONTEXT_FULL);
    expect(links.every((l) => l.href !== "/en-lb/")).toBe(true);
  });
});

describe("buildCollectionInternalLinks", () => {
  it("category collection: links to occasions and city and all-collections page", () => {
    const links = buildCollectionInternalLinks(
      { slug: "flower-boxes", name: "Flower Boxes", type: "category" },
      EN_BEIRUT,
      CONTEXT_FULL,
    );
    expect(links.some((l) => l.href.includes("/occasion/"))).toBe(true);
    expect(links.some((l) => l.href === "/en-lb/beirut/")).toBe(true);
    expect(links.some((l) => l.href.includes("/shop"))).toBe(true);
  });

  it("occasion collection: links to categories and all-occasions page", () => {
    const links = buildCollectionInternalLinks(
      { slug: "birthday", name: "Birthday", type: "occasion" },
      EN_BEIRUT,
      CONTEXT_FULL,
    );
    expect(links.some((l) => l.href.includes("/category/"))).toBe(true);
    expect(links.some((l) => l.href.includes("/occasions"))).toBe(true);
  });

  it("returns max 5 links", () => {
    const bigContext: InternalLinksContext = {
      categories: Array.from({ length: 10 }, (_, i) => ({ id: `cat-${i}`, name: `Cat ${i}` })),
      occasions: Array.from({ length: 10 }, (_, i) => ({ id: `occ-${i}`, name: `Occ ${i}` })),
    };
    const links = buildCollectionInternalLinks(
      { slug: "birthday", name: "Birthday", type: "occasion" },
      EN_BEIRUT,
      bigContext,
    );
    expect(links.length).toBeLessThanOrEqual(5);
  });
});
