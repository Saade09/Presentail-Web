import { describe, it, expect } from "vitest";
import { BLOG_POSTS } from "@workspace/blog-content";

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

const LANGS = ["en", "ar", "fr"] as const;

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

      it.each(LANGS)("has a %s translation", (lang) => {
        expect(langs[lang], `${slug}.${lang} is missing`).toBeTruthy();
      });

      it.each(LANGS)("has a well-formed ogImage for %s", (lang) => {
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
