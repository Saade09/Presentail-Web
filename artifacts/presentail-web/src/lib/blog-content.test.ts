import { describe, it, expect } from "vitest";
import {
  BLOG_POSTS,
  getBlogPostMeta,
  getBlogPostReadingTime,
} from "@workspace/blog-content";
import type { BlogLang } from "@workspace/blog-content";

/**
 * Guards the shared blog source of truth (@workspace/blog-content,
 * lib/blog-content/src/blogPostsCopy.js) which feeds the web blog pages, the
 * mobile app, AND the server-side SEO injector. A future content edit could
 * drop or malform an `ogImage` for a single locale and silently degrade
 * shared-link previews (og:image / JSON-LD image) everywhere it is consumed.
 *
 * Every article, in every language, must carry a well-formed ogImage:
 * a non-empty url plus positive integer width/height. There is no intentional
 * exception today — if one is ever needed, add the slug to ALLOWED_NO_OG_IMAGE
 * below with a comment explaining why a preview-less article is acceptable.
 */

const LANGS = ["en", "ar", "fr"] as const satisfies readonly BlogLang[];

// New articles may launch in English before editorial translations are ready.
// Keep this allowlist explicit so older published posts still require all
// supported translations.
const ENGLISH_ONLY_SLUGS = new Set<string>(["bouquet-delivery-dubai"]);

// Slugs intentionally allowed to omit ogImage. Keep empty unless an article
// genuinely should not have a shared-link preview, and document the reason.
const ALLOWED_NO_OG_IMAGE = new Set<string>();

describe("@workspace/blog-content — ogImage integrity", () => {
  const slugs = Object.keys(BLOG_POSTS);

  it("exposes at least one article", () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  for (const slug of slugs) {
    describe(slug, () => {
      const langs = BLOG_POSTS[slug];
      const requiredLangs: readonly BlogLang[] = ENGLISH_ONLY_SLUGS.has(slug)
        ? ["en"]
        : LANGS;

      it.each(requiredLangs)("has a %s translation", (lang) => {
        expect(langs[lang], `${slug}.${lang} is missing`).toBeTruthy();
      });

      it.each(requiredLangs)("has a well-formed ogImage for %s", (lang) => {
        const article = langs[lang];
        if (!article) return;

        if (ALLOWED_NO_OG_IMAGE.has(slug)) {
          return;
        }

        const og = article.ogImage;
        expect(og, `${slug}.${lang} is missing ogImage`).toBeTruthy();
        if (!og) return;

        expect(
          typeof og.url === "string" && og.url.trim().length > 0,
          `${slug}.${lang} ogImage.url must be a non-empty string`,
        ).toBe(true);

        expect(
          Number.isInteger(og.width) && og.width > 0,
          `${slug}.${lang} ogImage.width must be a positive integer`,
        ).toBe(true);

        expect(
          Number.isInteger(og.height) && og.height > 0,
          `${slug}.${lang} ogImage.height must be a positive integer`,
        ).toBe(true);
      });
    });
  }
});

describe("bouquet-delivery-dubai — part two content", () => {
  const article = BLOG_POSTS["bouquet-delivery-dubai"].en;

  it("is categorized for the Flowers Journal section with a sensible reading time", () => {
    expect(getBlogPostMeta("bouquet-delivery-dubai").category).toBe("flowers");
    expect(getBlogPostReadingTime("bouquet-delivery-dubai", "en")).toBeGreaterThan(5);
  });

  it("keeps the requested part-two sections in order", () => {
    expect(article.sections.map((section) => section.heading).filter(Boolean).slice(-6)).toEqual([
      "Hand bouquets or flower boxes?",
      "What to add — and what not to",
      "Dubai's climate is part of the decision",
      "Getting the delivery details right",
      "Ordering bouquet delivery in Dubai",
      "Frequently asked questions",
    ]);
    expect(article.sections.find((section) => section.heading === "Hand bouquets or flower boxes?")).toMatchObject({
      items: [
        expect.stringContaining("Hand bouquets are wrapped and tied"),
        expect.stringContaining("Flower boxes arrive already arranged"),
      ],
    });
    expect(article.sections.some((section) => section.pullQuote === "The best bouquet is the one the recipient does not have to do anything with.")).toBe(true);
  });

  it("has seven visible FAQ pairs and matching FAQPage JSON-LD", () => {
    const faqSection = article.sections.find((section) => section.heading === "Frequently asked questions");
    const faqSchema = article.extraJsonLd?.find((schema) => schema["@type"] === "FAQPage") as {
      mainEntity?: Array<{ name: string; acceptedAnswer: { text: string } }>;
    } | undefined;

    expect(faqSection?.faqItems).toHaveLength(7);
    expect(faqSchema?.mainEntity).toHaveLength(7);
    expect(faqSchema?.mainEntity?.map((item) => item.name)).toEqual(
      faqSection?.faqItems?.map((item) => item.q),
    );
    expect(faqSchema?.mainEntity?.map((item) => item.acceptedAnswer.text)).toEqual(
      faqSection?.faqItems?.map((item) => item.a),
    );
  });

  it("keeps storefront links in the Dubai market and canonical blog links", () => {
    const editorialMarkup = article.sections
      .map((section) => section.body ?? "")
      .join("\n");
    expect(editorialMarkup).toContain('href="/en-ae/dubai/category/flower-boxes"');
    expect(editorialMarkup).toContain('href="/en/blog/gift-baskets-dubai"');
    expect(editorialMarkup).toContain('href="/en/blog/what-to-send-when-there-are-no-words"');
    expect(editorialMarkup).not.toContain("/en-lb/");
  });
});
