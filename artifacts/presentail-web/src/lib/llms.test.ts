import { describe, it, expect } from "vitest";

// @ts-expect-error - mjs module without type declarations.
import {
  generateLlmsTxt,
  buildLlmsFullTxt,
  generateLlmsFullTxt,
  FEATURED_LIMIT,
} from "../../llms.mjs";

const ORIGIN = "https://new.presentail.com";

const MOCK = {
  brands: [{ name: "Acme Flowers" }, { name: "" }, { name: null }],
  occasions: [
    { name: "Birthday", slug: "birthday" },
    { name: "Anniversary", slug: "anniversary" },
    { name: "", slug: "blank" },
  ],
  products: [
    {
      name: "Red Roses",
      popularity: 10,
      brandNames: ["Acme Flowers"],
      priceValue: 49.4,
      occasions: ["birthday"],
    },
    {
      name: "White Lilies",
      popularity: 99,
      brandNames: ["Bloom Co"],
      priceValue: 75,
      occasions: ["anniversary", "unknown-slug"],
    },
    { name: "", popularity: 1000 },
  ],
};

describe("generateLlmsTxt", () => {
  const txt = generateLlmsTxt(ORIGIN, "/");

  it("always includes the title, intro, and Pages section", () => {
    expect(txt).toContain("# Presentail");
    expect(txt).toContain("## Pages");
    expect(txt).toContain(`(${ORIGIN}/)`);
  });

  it("respects the base path prefix", () => {
    const prefixed = generateLlmsTxt(ORIGIN, "/web");
    expect(prefixed).toContain(`${ORIGIN}/web/en-lb/beirut/brands`);
  });
});

describe("buildLlmsFullTxt", () => {
  it("populates Brands / Occasions / Featured Products when data is present", () => {
    const txt = buildLlmsFullTxt({ origin: ORIGIN, basePath: "/", ...MOCK });
    expect(txt).toContain("## Brands");
    expect(txt).toContain("- Acme Flowers");
    expect(txt).toContain("## Occasions");
    expect(txt).toContain("- Birthday");
    expect(txt).toContain("- Anniversary");
    expect(txt).toContain("## Featured Products");
    expect(txt).toContain("Red Roses");
    expect(txt).toContain("White Lilies");
  });

  it("filters out empty/null brand and occasion names", () => {
    const txt = buildLlmsFullTxt({ origin: ORIGIN, basePath: "/", ...MOCK });
    const brandsSection = txt.split("## Brands")[1].split("## Occasions")[0];
    const brandLines = brandsSection.split("\n").filter((l: string) => l.startsWith("- "));
    expect(brandLines).toEqual(["- Acme Flowers"]);
    const occasionsSection = txt.split("## Occasions")[1].split("## Featured Products")[0];
    const occasionLines = occasionsSection.split("\n").filter((l: string) => l.startsWith("- "));
    expect(occasionLines).toEqual(["- Birthday", "- Anniversary"]);
  });

  it("emits graceful fallback copy when brands/occasions are empty", () => {
    const txt = buildLlmsFullTxt({
      origin: ORIGIN,
      basePath: "/",
      brands: [],
      occasions: [],
      products: [],
    });
    expect(txt).toContain("_Brand list not yet available._");
    expect(txt).toContain("_Occasion list not yet available._");
  });

  it("omits the Featured Products section entirely when no products have names", () => {
    const txt = buildLlmsFullTxt({
      origin: ORIGIN,
      basePath: "/",
      brands: MOCK.brands,
      occasions: MOCK.occasions,
      products: [{ name: "" }, { popularity: 5 }],
    });
    expect(txt).not.toContain("## Featured Products");
  });

  it("sorts featured products by popularity (descending)", () => {
    const txt = buildLlmsFullTxt({ origin: ORIGIN, basePath: "/", ...MOCK });
    const lilyIdx = txt.indexOf("White Lilies");
    const roseIdx = txt.indexOf("Red Roses");
    expect(lilyIdx).toBeGreaterThan(-1);
    expect(roseIdx).toBeGreaterThan(-1);
    // White Lilies (popularity 99) must come before Red Roses (popularity 10).
    expect(lilyIdx).toBeLessThan(roseIdx);
  });

  it("caps featured products at the limit", () => {
    const many = Array.from({ length: FEATURED_LIMIT + 25 }, (_, i) => ({
      name: `Product ${i}`,
      popularity: i,
    }));
    const txt = buildLlmsFullTxt({
      origin: ORIGIN,
      basePath: "/",
      brands: MOCK.brands,
      occasions: MOCK.occasions,
      products: many,
    });
    const featuredSection = txt.split("## Featured Products")[1].split("## Full content")[0];
    const itemLines = featuredSection.split("\n").filter((l: string) => l.startsWith("- "));
    expect(itemLines.length).toBe(FEATURED_LIMIT);
  });

  it("resolves occasion slugs to names and falls back to the raw slug", () => {
    const txt = buildLlmsFullTxt({ origin: ORIGIN, basePath: "/", ...MOCK });
    // birthday -> "Birthday"; unknown-slug stays as-is.
    expect(txt).toContain("Red Roses by Acme Flowers (~$49) — Birthday");
    expect(txt).toContain("unknown-slug");
  });

  it("always includes the Pages and Full content sections", () => {
    const txt = buildLlmsFullTxt({ origin: ORIGIN, basePath: "/", ...MOCK });
    expect(txt).toContain("## Pages");
    expect(txt).toContain("## Full content");
    // Full content sections are H3 entries from LLMS_PAGE_SECTIONS.
    expect(txt).toContain("### Home");
    expect(txt).toContain("### FAQs");
  });

  it("includes Pages and Full content even when all catalog data is empty", () => {
    const txt = buildLlmsFullTxt({
      origin: ORIGIN,
      basePath: "/",
      brands: [],
      occasions: [],
      products: [],
    });
    expect(txt).toContain("## Pages");
    expect(txt).toContain("## Full content");
  });
});

describe("generateLlmsFullTxt", () => {
  it("fetches the catalog endpoints and assembles the full index", async () => {
    const fetched: string[] = [];
    const fakeFetch = async (url: string) => {
      fetched.push(url);
      if (url.includes("/api/woo/brands")) return { brands: MOCK.brands };
      if (url.includes("/api/catalog/metadata")) return { occasions: MOCK.occasions };
      if (url.includes("/api/woo/products")) return { products: MOCK.products };
      return null;
    };

    const txt = await generateLlmsFullTxt(ORIGIN, "/", fakeFetch, "http://localhost:80");

    expect(fetched.some((u) => u.includes("/api/woo/brands"))).toBe(true);
    expect(fetched.some((u) => u.includes("/api/catalog/metadata"))).toBe(true);
    expect(fetched.some((u) => u.includes("/api/woo/products"))).toBe(true);

    expect(txt).toContain("- Acme Flowers");
    expect(txt).toContain("- Birthday");
    expect(txt).toContain("White Lilies");
    expect(txt).toContain("## Full content");
  });

  it("degrades gracefully when every endpoint returns null", async () => {
    const fakeFetch = async () => null;
    const txt = await generateLlmsFullTxt(ORIGIN, "/", fakeFetch, "http://localhost:80");
    expect(txt).toContain("_Brand list not yet available._");
    expect(txt).toContain("_Occasion list not yet available._");
    expect(txt).not.toContain("## Featured Products");
    expect(txt).toContain("## Pages");
    expect(txt).toContain("## Full content");
  });
});
