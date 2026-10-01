import { describe, expect, it } from "vitest";
import {
  buildBlogSeo,
  buildBrandSeo,
  buildCategorySeo,
  buildContactSeo,
  buildFaqsSeo,
  buildOccasionSeo,
  buildProductSeo,
  buildStaticSeo,
  normalizeSeoText,
} from "./seo.mjs";
import {
  findHreflangConsistencyIssues,
  validateSeoDocument,
} from "../../scripts/seo-checks/metadata-validator.mjs";

describe("shared H1/title metadata policy", () => {
  it.each([
    ["en", "Beirut"],
    ["fr", "Beyrouth"],
    ["ar", "بيروت"],
  ])("builds natural, distinct localized entity metadata in %s", (lang, city) => {
    const pages = [
      buildProductSeo({ lang, productName: "Summer Daisy Garden", city }),
      buildCategorySeo({ lang, categoryName: "Balloons", city, productCount: 4 }),
      buildOccasionSeo({ lang, occasionName: "Birthday", city, productCount: 4 }),
      buildBrandSeo({ lang, brandName: "Roses de Chloé", city }),
      buildStaticSeo({ lang, routeKey: "corporate", city }),
      buildContactSeo({ lang, city }),
      buildFaqsSeo({ lang, city }),
    ];
    for (const page of pages) {
      expect(page.title).toBeTruthy();
      expect(page.h1).toBeTruthy();
      expect(normalizeSeoText(page.title)).not.toBe(normalizeSeoText(page.h1));
    }
  });

  it("preserves a valid authored blog SEO title", () => {
    const seo = buildBlogSeo({
      lang: "fr",
      seoTitle: "Cadeaux d’entreprise au Liban pour vos équipes | Presentail",
      articleTitle: "Legacy article title",
      h1: "Cadeaux d’entreprise au Liban : idées pour équipes et clients",
      description: "Description",
    });
    expect(seo.title).toBe("Cadeaux d’entreprise au Liban pour vos équipes | Presentail");
  });

  it("replaces an authored blog title that only differs by the brand suffix", () => {
    const seo = buildBlogSeo({
      lang: "en",
      articleTitle: "Flower Shops in Lebanon | Presentail",
      h1: "Flower Shops in Lebanon",
      description: "Description",
    });
    expect(seo.title).toContain("Gift Guide");
    expect(seo.title.length).toBeLessThanOrEqual(65);
    expect(normalizeSeoText(seo.title)).not.toBe(normalizeSeoText(seo.h1));
  });

  it("normalizes entities, Unicode, punctuation, whitespace and brand suffixes", () => {
    expect(normalizeSeoText("  FLOWER&nbsp;Shops — in Lebanon | Presentail "))
      .toBe(normalizeSeoText("flower shops in lebanon"));
  });

  it("reports normalized H1/title collisions in raw HTML", () => {
    const report = validateSeoDocument(
      `<html><head><title>Flower Shops in Lebanon | Presentail</title><meta name="description" content="A useful guide"><link rel="canonical" href="https://presentail.com/en/blog/test"><link rel="alternate" hreflang="en" href="https://presentail.com/en/blog/test"><link rel="alternate" hreflang="x-default" href="https://presentail.com/en/blog/test"></head><body><h1>Flower shops in Lebanon</h1></body></html>`,
      "https://presentail.com/en/blog/test",
    );
    expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("h1-title-collision");
  });

  it("does not hide a canonical query mismatch", () => {
    const report = validateSeoDocument(
      `<html><head><title>A sufficiently descriptive test page title</title><meta name="description" content="A useful guide"><link rel="canonical" href="https://presentail.com/en/blog/test"></head><body><h1>Test guide</h1></body></html>`,
      "https://presentail.com/en/blog/test?page=2",
      { expectedIndexable: false },
    );
    expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("incorrect-canonical");
  });

  it("requires the current locale hreflang to point to the canonical URL", () => {
    const report = validateSeoDocument(
      `<html><head><title>A sufficiently descriptive test page title</title><meta name="description" content="A useful guide"><link rel="canonical" href="https://presentail.com/fr/blog/test"><link rel="alternate" hreflang="en" href="https://presentail.com/en/blog/test"><link rel="alternate" hreflang="x-default" href="https://presentail.com/en/blog/test"></head><body><h1>Guide test</h1></body></html>`,
      "https://presentail.com/fr/blog/test",
    );
    expect(report.issues.map((issue: { code: string }) => issue.code)).toContain("missing-hreflang-self");
  });

  it("reports missing expected sibling locales across a scanned route group", () => {
    const en = validateSeoDocument(
      `<html><head><title>English gift guide with useful context</title><meta name="description" content="A useful guide"><link rel="canonical" href="https://presentail.com/en/blog/test"><link rel="alternate" hreflang="en" href="https://presentail.com/en/blog/test"><link rel="alternate" hreflang="x-default" href="https://presentail.com/en/blog/test"></head><body><h1>English gift guide</h1></body></html>`,
      "https://presentail.com/en/blog/test",
    );
    const fr = validateSeoDocument(
      `<html><head><title>Guide cadeaux français avec contexte</title><meta name="description" content="Un guide utile"><link rel="canonical" href="https://presentail.com/fr/blog/test"><link rel="alternate" hreflang="fr" href="https://presentail.com/fr/blog/test"><link rel="alternate" hreflang="x-default" href="https://presentail.com/en/blog/test"></head><body><h1>Guide cadeaux français</h1></body></html>`,
      "https://presentail.com/fr/blog/test",
    );
    expect(findHreflangConsistencyIssues([en, fr]).map((issue: { code: string }) => issue.code))
      .toContain("missing-expected-hreflang");
  });
});