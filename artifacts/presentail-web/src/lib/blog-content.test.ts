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
const ENGLISH_ONLY_SLUGS = new Set<string>([
  "bouquet-delivery-dubai",
  "balloon-arrangement-ideas",
  "cake-for-proposal",
]);

// Slugs intentionally allowed to omit ogImage. This guide has no suitable
// arrangement photograph in the project, so it deliberately uses the shared
// site-wide Open Graph fallback rather than a misleading placeholder image.
const ALLOWED_NO_OG_IMAGE = new Set<string>(["balloon-arrangement-ideas"]);

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

describe("@workspace/blog-content — authored product-link integrity", () => {
  it("does not retain the retired Chocolate Rocher product URL", () => {
    expect(JSON.stringify(BLOG_POSTS)).not.toContain(
      "chocolate-rocher-cake--899",
    );
    expect(BLOG_POSTS["best-cakes-lebanon"].en.sections.map(
      (section) => section.body ?? "",
    ).join("\n")).toContain(
      'href="/en-lb/beirut/category/cakes"',
    );
  });
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
    const faqSchema = article.extraJsonLd?.find((schema) => "@type" in schema && schema["@type"] === "FAQPage") as {
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

describe("fathers-day-gifts-lebanon — informational rewrite", () => {
  const article = BLOG_POSTS["fathers-day-gifts-lebanon"].en;

  it("preserves its identity while targeting the date-and-etiquette query", () => {
    expect(article.slug).toBe("fathers-day-gifts-lebanon");
    expect(article.title).toBe(
      "When Is Father's Day in Lebanon? Date + Gift Ideas | Presentail",
    );
    expect(article.h1).toBe(
      "When Is Father's Day in Lebanon? The Date, and What to Actually Get Him",
    );
    expect(article.description).toBe(
      "Father's Day in Lebanon is 21 June every year — not the third Sunday like the US and UK. Here's the date, why it differs, and what to actually get him.",
    );
    expect(article.dek).toBe(
      "It's 21 June, it's the same date every year, and it is not the day the rest of your family abroad is celebrating.",
    );
    expect(article.datePublished).toBe("2026-08-13");
    expect(article.dateModified).toBe("2026-09-06");
    expect(article.toc).toBe(true);
    expect(getBlogPostMeta(article.slug).category).toBe("gifting-guides");
  });

  it("uses the Beirut Father's Day CTA and requested related articles", () => {
    expect(article.cta).toEqual({
      label: "Shop Father's Day gifts",
      path: "/occasion/fathers-day",
      country: "lb",
    });
    expect(article.relatedSlugs).toEqual([
      "mothers-day-gifts-lebanon",
      "gift-shop-in-lebanon",
      "corporate-gifting-lebanon",
    ]);
    expect(BLOG_RELATED_SLUGS[article.slug]).toEqual(article.relatedSlugs);
  });

  it("keeps the supplied sections, calendar dates, and verified prices", () => {
    expect(
      article.sections.map((section) => section.heading).filter(Boolean),
    ).toEqual([
      "When is Father's Day in Lebanon?",
      "Why the date is different from the US and UK",
      "What Lebanese dads actually want",
      "The dad who has everything",
      "The dad who won't ask for anything",
      "The dad who is far away",
      "The new dad",
      "Gift ideas that land",
      "Sending from abroad",
      "When to order",
      "Ready to order?",
      "Frequently asked questions",
    ]);

    const dateSection = article.sections.find(
      (section) => section.heading === "When is Father's Day in Lebanon?",
    );
    expect(dateSection?.items).toEqual([
      "2027 — 21 June, a Monday",
      "2028 — 21 June, a Wednesday",
      "2029 — 21 June, a Thursday",
      "2030 — 21 June, a Friday",
    ]);

    const giftIdeas = article.sections.find(
      (section) => section.heading === "Gift ideas that land",
    );
    expect(giftIdeas?.items?.join("\n")).toContain("Dad's Garden</a> ($120)");
    expect(giftIdeas?.items?.join("\n")).toContain("Cheers to Dad</a> ($165)");
    expect(giftIdeas?.items?.join("\n")).toContain(
      "Happy Father's Day Balloon</a> ($13)",
    );
  });

  it("keeps every commerce link on the Beirut hub and the deliberate anchor intact", () => {
    const editorialMarkup = article.sections
      .flatMap((section) => [section.body ?? "", ...(section.items ?? [])])
      .join("\n");

    expect(editorialMarkup).toContain(
      '<a href="/en-lb/beirut/occasion/fathers-day">Father\'s Day gifts in Lebanon</a>',
    );
    expect(editorialMarkup).not.toContain("/en-lb/metn/");
    expect(editorialMarkup.match(/href="\/en-lb\/beirut\//g)?.length).toBeGreaterThan(0);
  });

  it("has exactly five visible FAQs and identical FAQPage structured data", () => {
    const faqSection = article.sections.find(
      (section) => section.heading === "Frequently asked questions",
    );
    const faqSchema = article.extraJsonLd?.find(
      (schema) =>
        (schema as { "@type"?: string })["@type"] === "FAQPage",
    ) as {
      mainEntity?: Array<{
        name: string;
        acceptedAnswer: { text: string };
      }>;
    } | undefined;

    expect(faqSection?.faqItems).toHaveLength(5);
    expect(faqSchema?.mainEntity).toHaveLength(5);
    expect(faqSchema?.mainEntity?.map((item) => item.name)).toEqual(
      faqSection?.faqItems?.map((item) => item.q),
    );
    expect(
      faqSchema?.mainEntity?.map((item) => item.acceptedAnswer.text),
    ).toEqual(faqSection?.faqItems?.map((item) => item.a));
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
    const faqSchema = article.extraJsonLd?.find((schema) => "@type" in schema && schema["@type"] === "FAQPage") as {
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

describe("balloon-arrangement-ideas content", () => {
  const article = BLOG_POSTS["balloon-arrangement-ideas"].en;

  it("has the requested English-only SEO, taxonomy, hero, CTA, and recommendation data", () => {
    expect(BLOG_POSTS["balloon-arrangement-ideas"].ar).toBeUndefined();
    expect(BLOG_POSTS["balloon-arrangement-ideas"].fr).toBeUndefined();
    expect(article.slug).toBe("balloon-arrangement-ideas");
    expect(article.title).toBe("12 Balloon Arrangement Ideas for Any Occasion | Presentail");
    expect(article.description).toBe(
      "Balloon arrangement ideas that actually work — bouquets, columns, garlands, number displays and ceiling clouds, plus how to pick colours and how long each one lasts.",
    );
    expect(article.h1).toBe(
      "Balloon Arrangement Ideas: 12 Ways to Style Balloons for Any Occasion",
    );
    expect(article.dek).toBe(
      "Bouquets, columns, garlands, ceiling clouds and number displays — what each one suits, what it costs you in effort, and how long it lasts.",
    );
    expect(article.geographyLabel).toBe("Lebanon");
    expect(article.categoryLabel).toBe("Gifting Guides");
    expect(article.datePublished).toBe("2026-08-25");
    expect(article.ogImage).toBeUndefined();
    expect(article.ogImageAlt).toBeUndefined();
    expect(article.toc).toBe(true);
    expect(article.cta).toEqual({
      label: "Shop balloon arrangements",
      path: "/category/balloons",
      country: "lb",
    });
    expect(article.recommendation).toEqual({
      title: "Ready-made balloon bundles",
      body:
        "Sixty arrangements that arrive inflated, weighted and colour-matched — with same-day delivery across Lebanon.",
      label: "View balloons",
      path: "/category/balloons",
      country: "lb",
    });
  });

  it("contains the complete structure, ordered ideas, notes, pull quote, and FAQ", () => {
    expect(article.sections.map((section) => section.heading).filter(Boolean)).toEqual([
      "Before you choose: three decisions that do the work",
      "Classic arrangements that work anywhere",
      "1. The balloon bouquet",
      "2. The balloon column",
      "3. The table centrepiece cluster",
      "Statement pieces for a big moment",
      "4. The number display",
      "5. The organic garland",
      "6. The ceiling cloud",
      "Small-space and gifting arrangements",
      "7. The single oversized balloon",
      "8. Balloon-in-a-box",
      "9. Balloons paired with flowers or a cake",
      "Themed ideas by occasion",
      "10. New arrivals and baby showers",
      "11. Get well and hospital visits",
      "12. Anniversaries and proposals",
      "Helium or air — and how long it all lasts",
      "The easier route: order the arrangement ready-made",
      "Frequently asked questions",
    ]);
    const beforeChoosing = article.sections[1];
    expect(beforeChoosing.ordered).toBe(true);
    expect(beforeChoosing.items).toHaveLength(3);
    expect(beforeChoosing.callout).toEqual({
      variant: "info",
      body:
        "Odd numbers look better than even ones. Three, five or seven balloons in a cluster read as designed; four or six read as leftover.",
    });
    const ideas = article.sections.filter((section) => section.subheading);
    expect(ideas).toHaveLength(12);
    expect(ideas.slice(0, 6).map((section) => section.note)).toEqual([
      "Effort: none if ordered. Lifespan: helium latex floats 8–12 hours; foil holds for days.",
      "Effort: moderate. Lifespan: several days.",
      "Effort: low. Lifespan: one evening on helium.",
      "Effort: low. Lifespan: foil numbers hold air for weeks.",
      "Effort: high — budget two hours. Lifespan: several days, longer indoors.",
      "Effort: minimal. Lifespan: one evening.",
    ]);
    expect(ideas.slice(6).every((section) => section.note === undefined)).toBe(true);
    expect(article.sections.some(
      (section) =>
        section.pullQuote ===
        "The best balloon arrangement is the one people photograph without being asked to.",
    )).toBe(true);
    const babySection = article.sections.find(
      (section) => section.heading === "10. New arrivals and baby showers",
    );
    expect(babySection?.body).toContain(
      'href="/en/blog/baby-boy-balloons">baby boy balloons</a>',
    );
    const readyMadeSection = article.sections.find(
      (section) => section.heading === "The easier route: order the arrangement ready-made",
    );
    expect(readyMadeSection?.body).toContain(
      'href="/en/blog/balloon-delivery-beirut-lebanon">our balloon delivery guide</a>',
    );
    const heliumSection = article.sections.find(
      (section) => section.heading === "Helium or air — and how long it all lasts",
    );
    expect(heliumSection?.body).toBe(
      "The single most common disappointment with balloons is timing, and it comes down to gas.",
    );
    expect(heliumSection?.items).toEqual([
      "Helium latex floats roughly 8 to 12 hours untreated. Fine for an evening, not for a weekend.",
      "Foil and mylar hold helium for several days and often a week or more, which is why every long-lived arrangement leans on them.",
      "Air-filled arrangements — garlands, columns, anything built on a frame — last for days and do not float at all. If the balloons do not need to rise, use air.",
    ]);
    const faqSection = article.sections.find(
      (section) => section.heading === "Frequently asked questions",
    );
    const faqSchema = article.extraJsonLd?.find(
      (schema) => "@type" in schema && schema["@type"] === "FAQPage",
    ) as { mainEntity?: Array<{ name: string; acceptedAnswer: { text: string } }> } | undefined;
    expect(faqSection?.faqItems).toHaveLength(7);
    expect(faqSchema?.mainEntity).toHaveLength(7);
    expect(faqSchema?.mainEntity?.map((item) => item.name)).toEqual(
      faqSection?.faqItems?.map((item) => item.q),
    );
    expect(faqSchema?.mainEntity?.map((item) => item.acceptedAnswer.text)).toEqual(
      faqSection?.faqItems?.map((item) => item.a),
    );
    expect(getBlogPostMeta(article.slug).category).toBe("gifting-guides");
  });

  it("registers the requested related-article graph", () => {
    expect(BLOG_RELATED_SLUGS["balloon-arrangement-ideas"]).toEqual([
      "balloon-delivery-beirut-lebanon",
      "baby-boy-balloons",
      "best-cakes-lebanon",
    ]);
    expect(article.relatedSlugs).toEqual(BLOG_RELATED_SLUGS["balloon-arrangement-ideas"]);
    expect(BLOG_POSTS["balloon-delivery-beirut-lebanon"].en.relatedSlugs).toContain(
      "balloon-arrangement-ideas",
    );
    expect(getBlogPostReadingTime(article.slug, "en")).toBeGreaterThan(2);
  });
});

describe("cake-for-proposal content", () => {
  const article = BLOG_POSTS["cake-for-proposal"].en;

  it("has the requested English-only SEO, taxonomy, hero, CTA and recommendation data", () => {
    expect(BLOG_POSTS["cake-for-proposal"].ar).toBeUndefined();
    expect(BLOG_POSTS["cake-for-proposal"].fr).toBeUndefined();
    expect(article).toMatchObject({
      slug: "cake-for-proposal",
      title: "Cake for a Proposal: 9 Ideas and How to Order One | Presentail",
      h1: "Cake for a Proposal: 9 Ideas, and How to Get One Made",
      description:
        "Proposal cake ideas that work — Marry Me designs, ring-box cakes, what to write on it, what size to order, and how to have a custom one made and delivered.",
      dek:
        "What to put on it, what size to order, when to bring it out — and how to have a custom proposal cake delivered.",
      geographyLabel: "Lebanon",
      categoryLabel: "Gifting Guides",
      datePublished: "2026-08-25",
      toc: true,
      ogImage: {
        url: "/blog/best-cakes-lebanon.webp",
        width: 1408,
        height: 768,
      },
      ogImageAlt: "A simple proposal cake with a piped message",
      cta: {
        label: "Order a proposal cake",
        path: "/category/cakes",
        country: "lb",
      },
    });
    expect(article.recommendation).toEqual({
      title: "Cakes for the moment",
      body:
        "Order from our range with a personalised message, or request a custom proposal cake — delivered across Lebanon.",
      label: "Browse cakes",
      path: "/category/cakes",
      country: "lb",
      image: {
        url: "/blog/best-cakes-lebanon.webp",
        width: 1408,
        height: 768,
        alt: "A simple proposal cake with a piped message",
      },
    });
    expect(article.sections[0]?.body).toBe(
      "A proposal cake has one job, and it is not dessert. It is the reveal — the object that says the thing before you do, while your hands are busy and your voice is not cooperating. Which is why the best proposal cakes are simple, legible from a metre away, and photograph in a single frame.\n\nNine ideas below, then the practical part: what to write on it, what size to order for a proposal that is usually just two people, and how to have a custom one made.",
    );
    expect(getBlogPostMeta(article.slug).category).toBe("gifting-guides");
  });

  it("contains the exact ideas, practical guidance, quote, callout and inline link", () => {
    const ideas = article.sections.filter((section) => section.subheading);
    const writingSection = article.sections.find((section) => section.heading === "What to write on it");
    const sizeSection = article.sections.find(
      (section) => section.heading === "Size and flavour: order for the moment, not the crowd",
    );
    const timingSection = article.sections.find((section) => section.heading === "Timing the reveal");
    const pairingSection = article.sections.find((section) => section.heading === "What to send with it");
    const orderingSection = article.sections.find((section) => section.heading === "How to order a proposal cake");
    const faqSection = article.sections.find(
      (section) => section.heading === "Frequently asked questions",
    );
    const faqSchema = article.extraJsonLd?.find(
      (schema) => "@type" in schema && schema["@type"] === "FAQPage",
    ) as { mainEntity?: Array<{ name: string; acceptedAnswer: { text: string } }> } | undefined;

    expect(article.sections.map((section) => section.heading).filter(Boolean)).toEqual([
      "Nine proposal cake ideas",
      "1. The classic \"Marry Me\" cake",
      "2. The ring-box cake",
      "3. White cake with fresh flowers",
      "4. The reveal under the lid",
      "5. The date cake",
      "6. Dessert for two",
      "7. The bilingual cake",
      "8. Chocolate drip with a ring topper",
      "9. The \"She Said Yes\" cake",
      "What to write on it",
      "Size and flavour: order for the moment, not the crowd",
      "Timing the reveal",
      "What to send with it",
      "How to order a proposal cake",
      "Frequently asked questions",
    ]);
    expect(ideas).toHaveLength(9);
    expect(ideas.map((section) => section.heading)).toEqual([
      "1. The classic \"Marry Me\" cake",
      "2. The ring-box cake",
      "3. White cake with fresh flowers",
      "4. The reveal under the lid",
      "5. The date cake",
      "6. Dessert for two",
      "7. The bilingual cake",
      "8. Chocolate drip with a ring topper",
      "9. The \"She Said Yes\" cake",
    ]);
    expect(ideas.map((section) => section.body)).toEqual([
      "Two words, piped clean across the top of a plain cake. It works because it removes every possible ambiguity, and because a photograph of it needs no caption. Keep the cake itself undecorated — white, ivory or dark chocolate — so the words carry the whole message.",
      "A small square or round cake designed to look like a ring box, sometimes with the real ring set into a hollow on top. Higher-effort and much higher-impact, and it solves the question of where to hold the ring until the moment arrives.",
      "A single-tier white cake dressed with fresh blooms — roses, ranunculus, whatever is in season. No writing at all. This is the choice when the proposal is the surprise and the cake is the setting rather than the announcement, and it doubles as the centrepiece if you are proposing at a dinner.",
      "A cake delivered in a closed box, with the message on the inside of the lid or written across the cake so it appears only when the box opens. The pause between \"there is a cake\" and \"oh\" is the entire point.",
      "Piped with the date you met, the date of your first trip, or the coordinates of where you are standing. Quieter than \"Marry Me\" and more personal — for the couple whose story has a specific reference point.",
      "A miniature cake, sized for two people, because that is usually the actual audience. A six-inch cake for a proposal on a balcony makes far more sense than a party cake nobody will finish. Small also travels better and photographs closer.",
      "\"Btetzawajini?\" in Arabic, or a mix of Arabic and English across the tiers. For a lot of couples here this reads warmer and more like them than the English version — and it lands differently with family afterwards.",
      "A dark chocolate drip cake with a small gold or acrylic ring topper. The one on this list that suits a proposal happening at a restaurant table, since it looks like an ordinary celebration cake until you read the topper.",
      "Not for the proposal — for the day after. A second, smaller cake for the family dinner or the office announcement, which is often the moment people forget to plan for and later wish they had photographed.",
    ]);
    expect(writingSection).toMatchObject({
      body: "Short beats clever. The message has to be readable in a photo and understood in a second.",
      items: [
        "Marry me — unimprovable.",
        "Will you marry me? — the full question, when you want it unmistakable.",
        "Forever? — for couples who already talk about forever.",
        "One more yes — if there is a running joke about it.",
        "Btetzawajini? — the Arabic version, and often the one that gets the bigger reaction.",
        "The date — no words at all, just the day that started it.",
      ],
      callout: {
        variant: "info",
        body:
          "Test it by imagining the photo. If the message is not readable in a picture taken from across a table, it is too long or too ornate.",
      },
    });
    expect(article.sections.find((section) => section.body?.startsWith("Avoid anything"))?.body).toBe(
      "Avoid anything that needs explaining, anything longer than five words, and script fonts on a small cake — they blur at photo distance.",
    );
    expect(sizeSection?.items).toEqual([
      "Proposing privately — a six-inch cake, serving four to six. Enough to share that evening, small enough to carry.",
      "Proposing at a family dinner — eight to ten servings, so nobody is watching someone else eat.",
      "Proposing then announcing — order two: the small one for the moment, a larger one for the gathering after.",
    ]);
    expect(article.sections.find((section) => section.body?.startsWith("On flavour"))?.body).toBe(
      "On flavour, choose theirs, not yours, and choose something that survives sitting out. Chocolate holds up. Cream-heavy and fresh-fruit cakes are less forgiving if the cake waits an hour in a warm room for its moment — a real consideration in a Lebanese or Gulf summer.",
    );
    expect(timingSection?.items).toEqual([
      "Keep the cake out of sight until the moment — a car, a kitchen, a neighbour's flat, a restaurant's back room.",
      "If you are at a restaurant, tell the staff exactly when to bring it out, and give them a signal rather than a time.",
      "Decide who is filming before you start. Ask them to hold one wide shot rather than moving around.",
      "If the cake is being delivered, schedule it before the two of you arrive, not during.",
    ]);
    expect(pairingSection?.items?.[1]).toBe(
      'A <a href="/en/blog/balloon-arrangement-ideas">ring balloon</a> or a small cluster of red heart balloons gives the photo a background.',
    );
    expect(article.sections.find((section) => section.body?.startsWith("What not to do"))?.body).toBe(
      "What not to do: all three. A proposal photographed against a wall of decoration looks like a party, not a question.",
    );
    expect(orderingSection?.body).toBe(
      "Custom proposal cakes — piped messages, ring-box designs, toppers — can be made on request. Tell us what you want written and the design you have in mind, and allow a few days' lead time so it can be made properly rather than rushed.",
    );
    expect(article.sections.find((section) => section.pullQuote)?.pullQuote).toBe(
      "The cake is not dessert. It is the sentence you cannot get out.",
    );
    expect(faqSection?.faqItems).toEqual([
      {
        q: "What should I write on a proposal cake?",
        a: 'Keep it under five words so it reads in a photograph. "Marry me", "Will you marry me?", "Forever?" or the Arabic "Btetzawajini?" all work. A meaningful date with no words at all is a quieter alternative.',
      },
      {
        q: "Can I order a custom proposal cake?",
        a: "Yes. Custom messages, ring-box designs and toppers can be made on request. Tell us the wording and design you want and allow a few days' lead time. Cakes from our standard range can be ordered same-day with a personalised gift note when you order before midday.",
      },
      {
        q: "What size cake should I get for a proposal?",
        a: "A six-inch cake serving four to six is right for a private proposal, since the audience is usually two people. Order eight to ten servings if you are proposing at a family dinner, or order two cakes — a small one for the moment and a larger one for the celebration after.",
      },
      {
        q: "What flavour works best for a proposal cake?",
        a: "Choose the flavour they like, and favour something that holds up if the cake has to wait out of the fridge. Chocolate is the safest choice; cream-heavy and fresh-fruit cakes are less forgiving in a warm room.",
      },
      {
        q: "When should the cake come out during a proposal?",
        a: "After the moment has started, not before, since once the cake is on the table the surprise is over. If you are in a restaurant, agree a signal with the staff rather than a fixed time. If it is being delivered, schedule it to arrive before you do.",
      },
      {
        q: "Can I have a proposal cake delivered with flowers?",
        a: "Yes. Cakes can be ordered alongside flowers, balloons and chocolates for a single delivery, with a two-hour delivery window so everything arrives together at the right moment.",
      },
      {
        q: "How far in advance should I order?",
        a: "For a custom cake, allow a few days. For a cake from our existing range, order before midday for same-day delivery, or schedule up to 30 days ahead and pick your two-hour window.",
      },
    ]);
    expect(faqSchema?.mainEntity?.map((item) => item.name)).toEqual(
      faqSection?.faqItems?.map((item) => item.q),
    );
    expect(faqSchema?.mainEntity?.map((item) => item.acceptedAnswer.text)).toEqual(
      faqSection?.faqItems?.map((item) => item.a),
    );
    expect(getBlogPostReadingTime(article.slug, "en")).toBeGreaterThan(3);
  });

  it("registers the requested related-article graph without relying on stale per-locale links", () => {
    expect(BLOG_RELATED_SLUGS["cake-for-proposal"]).toEqual([
      "best-cakes-lebanon",
      "balloon-arrangement-ideas",
      "flower-shops-in-lebanon",
    ]);
    expect(article.relatedSlugs).toEqual(BLOG_RELATED_SLUGS["cake-for-proposal"]);
  });
});
