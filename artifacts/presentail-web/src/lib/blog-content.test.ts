import { describe, it, expect } from "vitest";
import {
  BLOG_RELATED_SLUGS,
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

describe("teddy-bear-gifts-lebanon — part one content", () => {
  const article = BLOG_POSTS["teddy-bear-gifts-lebanon"].en;

  it("preserves the slug, category, published date, and requested SEO fields", () => {
    expect(article.slug).toBe("teddy-bear-gifts-lebanon");
    expect(article.h1).toBe("Teddy Bear Gifts in Lebanon: A Guide for Every Occasion");
    expect(article.title).toBe("Teddy Bear Gifts in Lebanon: Sizes, Prices & Delivery | Presentail");
    expect(article.description).toBe(
      "Choosing a teddy bear in Lebanon — which size suits which occasion, what they cost, how to pair one with flowers or balloons, and same-day delivery nationwide.",
    );
    expect(article.dek).toBe(
      "Which size for which occasion, what to expect to pay, and how to get one to the door the same day.",
    );
    expect(article.datePublished).toBe("2026-08-13");
    expect(article.dateModified).toBe("2026-08-24");
    expect(article.toc).toBe(true);
    expect(getBlogPostMeta(article.slug).category).toBe("gifting-guides");
  });

  it("uses the Lebanon stuffed-animals CTA and requested related articles", () => {
    expect(article.cta).toEqual({
      label: "Shop teddy bears in Lebanon",
      path: "/category/stuffed-animals",
      country: "lb",
    });
    expect(article.relatedSlugs).toEqual([
      "gift-shop-in-lebanon",
      "balloon-delivery-beirut-lebanon",
      "best-cakes-lebanon",
    ]);
    expect(BLOG_RELATED_SLUGS["teddy-bear-gifts-lebanon"]).toEqual(article.relatedSlugs);
  });

  it("contains the complete Part 1 size and occasion guidance", () => {
    const sizeSection = article.sections.find(
      (section) => section.heading === "Start with the size, not the bear",
    );
    const occasionHeading = article.sections.find(
      (section) => section.heading === "The bears, and who they are for",
    );
    const occasionSections = article.sections.filter((section) => section.subheading);

    expect(sizeSection?.items).toHaveLength(4);
    expect(sizeSection?.items?.[0]).toContain("Small (roughly 25–40 cm)");
    expect(sizeSection?.items?.[3]).toContain("Life-size (around 200 cm)");
    expect(sizeSection?.callout).toEqual({
      variant: "info",
      body: "Rule of thumb — the closer the relationship, the bigger the bear can be. For a colleague or a new acquaintance, small to medium is the safe range.",
    });
    expect(occasionHeading).toBeTruthy();
    expect(occasionSections.map((section) => section.heading)).toEqual([
      "Birthdays and everyday gifting",
      "Romance and anniversaries",
      "New babies and children",
      "When you want a reaction",
    ]);
    expect(occasionSections[0]?.body).toContain("Birthday Bear</a> (around $32)");
    expect(occasionSections[0]?.body).toContain("Marmalade Bear</a> (around $74)");
    expect(occasionSections[3]?.body).toContain("roughly 200 cm");
    expect(occasionSections[3]?.pullQuote).toBe(
      "A teddy bear is one of the few gifts where the size is the message.",
    );
  });

  it("keeps product links and quoted prices aligned with the current catalogue", () => {
    const body = article.sections.map((section) => section.body ?? "").join("\n");
    expect(body).toContain('href="/en-lb/beirut/product/birthday-bear"');
    expect(body).toContain('href="/en-lb/beirut/product/marmalade-bear"');
    expect(body).toContain('href="/en-lb/beirut/product/giant-teddy-bear"');
    expect(body).toContain('href="/en-lb/beirut/product/love-bear"');
    expect(body).toContain("Birthday Bear</a> (around $32)");
    expect(body).toContain("Marmalade Bear</a> (around $74)");
    expect(body).toContain("Love Bear</a> (around $32)");
    expect(body).not.toContain("$381");
    expect(body).toContain("teddy bear Lebanon");
  });

  it("contains the requested Part 2 sections, links, service callout, and FAQ schema", () => {
    const costSection = article.sections.find(
      (section) => section.heading === "What a teddy bear costs in Lebanon",
    );
    const pairingSection = article.sections.find(
      (section) => section.heading === "Pair it with one thing, not four",
    );
    const deliverySection = article.sections.find(
      (section) => section.heading === "Delivery across Lebanon",
    );
    const faqSection = article.sections.find(
      (section) => section.heading === "Frequently asked questions",
    );
    const faqSchema = article.extraJsonLd?.find((schema) => schema["@type"] === "FAQPage") as {
      mainEntity?: Array<{ name: string; acceptedAnswer: { text: string } }>;
    } | undefined;

    expect(costSection?.ordered).toBe(true);
    expect(costSection?.items).toEqual([
      "Around $30 — small and medium classic bears. Fine on their own for a child, better paired with balloons or chocolate for an adult.",
      "$70 to $150 — larger bears and the more considered designs. This is where most birthday and anniversary gifting lands.",
      "$300 and up — life-size and rose bears. A single-gift budget, not something you add to a basket.",
    ]);
    expect(pairingSection?.items?.[0]).toContain(
      'href="/en/blog/balloon-delivery-beirut-lebanon">Balloons</a>',
    );
    expect(pairingSection?.items?.[3]).toContain(
      'href="/en/blog/best-cakes-lebanon">A cake</a>',
    );
    expect(deliverySection?.callout).toEqual({
      variant: "service",
      title: "Same-day across Lebanon",
      body: "Order before midday for same-day delivery. Scheduling ahead? Pick your date and a two-hour window at checkout.",
    });
    expect(faqSection?.faqItems).toHaveLength(7);
    expect(faqSchema?.mainEntity).toHaveLength(7);
    expect(faqSchema?.mainEntity?.map((item) => item.name)).toEqual(
      faqSection?.faqItems?.map((item) => item.q),
    );
    expect(faqSchema?.mainEntity?.map((item) => item.acceptedAnswer.text)).toEqual(
      faqSection?.faqItems?.map((item) => item.a),
    );
    expect(getBlogPostReadingTime(article.slug, "en")).toBeGreaterThan(5);
  });
});
