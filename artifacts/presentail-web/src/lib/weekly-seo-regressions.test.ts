import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "@workspace/blog-content";
import { shopStrings } from "@/locales/shop";
import { buildProductSeo } from "./seo.mjs";
import { buildSitemapXml } from "../../sitemap.mjs";
import { CATEGORY_SEO_CONTENT } from "@/data/categorySeoContent.mjs";

describe("weekly crawl SEO regressions", () => {
  it("keeps English fallback blog aliases out of translated sitemaps", () => {
    const en = {
      title: "English only",
      description: "English fallback",
      datePublished: "2026-01-01",
    };
    const article = { en };
    Object.defineProperty(article, "fr", { get: () => en, enumerable: true });

    const xml = buildSitemapXml({
      origin: "https://presentail.com",
      locale: "fr",
      blogPostsArg: { "english-only": article },
    });

    expect(xml).not.toContain("/fr/blog/english-only");
  });

  it("localizes the balloons taxonomy label in every storefront language", () => {
    expect(shopStrings["shop.cat.balloons"]).toEqual({
      en: "Balloons",
      ar: "بالونات",
      fr: "Ballons",
      el: "Μπαλόνια",
    });
  });

  it("keeps same-name product variants distinct without changing the H1", () => {
    const balloon = buildProductSeo({
      lang: "en",
      productName: "Great Dad Celebration Balloon",
      productVariant: "Balloons",
      city: "Beirut",
    });
    const fathersDay = buildProductSeo({
      lang: "en",
      productName: "Great Dad Celebration Balloon",
      productVariant: "Father's Day",
      city: "Beirut",
    });

    expect(balloon.title).not.toBe(fathersDay.title);
    expect(balloon.title).toContain("Balloons");
    expect(fathersDay.title).toContain("Father's Day");
    expect(balloon.h1).toBe("Great Dad Celebration Balloon");
    expect(fathersDay.h1).toBe("Great Dad Celebration Balloon");
  });

  it("preserves distinguishing product-name suffixes when titles are truncated", () => {
    const sixteen = buildProductSeo({
      lang: "en",
      productName: "Ferrero Rocher Chocolate Box (16 Pieces)",
      productVariant: "Chocolate",
      city: "Beirut",
    });
    const twentyFour = buildProductSeo({
      lang: "en",
      productName: "Ferrero Rocher Chocolate Box (24 Pieces)",
      productVariant: "Chocolate",
      city: "Beirut",
    });

    expect(sixteen.title).not.toBe(twentyFour.title);
    expect(sixteen.title).toContain("16 Pieces");
    expect(twentyFour.title).toContain("24 Pieces");
    expect(sixteen.title.length).toBeLessThanOrEqual(65);
    expect(twentyFour.title.length).toBeLessThanOrEqual(65);
  });

  it("emits only the canonical newborn occasion slug in Cyprus balloon copy", () => {
    const cyBalloonCopy = JSON.stringify({
      larnaca: CATEGORY_SEO_CONTENT.en["cy/larnaca"]?.balloons,
      limassol: CATEGORY_SEO_CONTENT.en["cy/limassol"]?.balloons,
      paphos: CATEGORY_SEO_CONTENT.en["cy/paphos"]?.balloons,
    });

    expect(cyBalloonCopy).not.toContain("/occasion/new-baby");
    expect(cyBalloonCopy.match(/\/occasion\/new-born/g)).toHaveLength(3);
  });

  it("does not link the discontinued Monkey product from editorial content", () => {
    expect(JSON.stringify(BLOG_POSTS)).not.toContain(
      'href=\\"/en-lb/beirut/product/monkey\\"',
    );
  });
});