import { describe, it, expect } from "vitest";

// @ts-expect-error - mjs module without type declarations.
import { generateLlmsTxt, buildLlmsFullTxt, buildJournalSection, buildBlogMdLinks, generateLlmsFullTxt, resolveLlmsFullTxt, LLMS_FULL_TXT_RETRY_WINDOW_MS, FEATURED_LIMIT } from "../../llms.mjs";
import { BLOG_POSTS } from "@workspace/blog-content";

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

  it("includes the Journal hub and every blog article", () => {
    expect(txt).toContain("## Journal");
    expect(txt).toContain(`- [Journal hub](${ORIGIN}/en/blog)`);
    for (const [slug, byLang] of Object.entries(BLOG_POSTS) as [string, any][]) {
      expect(txt).toContain(`[${byLang.en.title}](${ORIGIN}/en/blog/${slug})`);
    }
  });

  it("includes .md twin links for every blog article in the Markdown Pages section", () => {
    for (const [slug] of Object.entries(BLOG_POSTS) as [string, any][]) {
      expect(txt).toContain(`${ORIGIN}/en/blog/${slug}.md`);
    }
  });
});

describe("buildBlogMdLinks", () => {
  it("returns a .md link for each article that has an English title", () => {
    const links = buildBlogMdLinks("https://x", {
      "first-post": { en: { title: "First Post" } },
      "second-post": { en: { title: "Second Post" } },
      "broken-post": { en: {} },
    });
    expect(links).toContain("- [First Post](https://x/en/blog/first-post.md)");
    expect(links).toContain("- [Second Post](https://x/en/blog/second-post.md)");
    expect(links).not.toContain("broken-post");
  });

  it("returns an empty string when there are no posts", () => {
    expect(buildBlogMdLinks("https://x", {})).toBe("");
  });

  it("respects the base path prefix", () => {
    const links = buildBlogMdLinks("https://x/web", {
      "my-post": { en: { title: "My Post" } },
    });
    expect(links).toContain("https://x/web/en/blog/my-post.md");
  });
});

describe("buildJournalSection", () => {
  it("lists the hub plus a link per article with English titles", () => {
    const section = buildJournalSection("https://x", {
      "first-post": { en: { title: "First Post" } },
      "second-post": { en: { title: "Second Post" } },
      "broken-post": { en: {} },
    });
    expect(section).toContain("- [Journal hub](https://x/en/blog)");
    expect(section).toContain("- [First Post](https://x/en/blog/first-post)");
    expect(section).toContain("- [Second Post](https://x/en/blog/second-post)");
    expect(section).not.toContain("broken-post");
  });

  it("still emits the hub link when there are no articles", () => {
    const section = buildJournalSection("https://x", {});
    expect(section).toContain("- [Journal hub](https://x/en/blog)");
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
    // Bound the slice by the next section (## Journal) so bullets from the
    // Journal and Markdown-mirror sections are not miscounted as products.
    const featuredSection = txt.split("## Featured Products")[1].split("## Journal")[0];
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

  it("includes .md twin links for every blog article in the Markdown Pages section", () => {
    const txt = buildLlmsFullTxt({ origin: ORIGIN, basePath: "/", ...MOCK });
    for (const [slug] of Object.entries(BLOG_POSTS) as [string, any][]) {
      expect(txt).toContain(`${ORIGIN}/en/blog/${slug}.md`);
    }
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

describe("resolveLlmsFullTxt — /llms-full.txt route resilience", () => {
  const TTL = 60 * 60 * 1000; // 1h, matches LLMS_TXT_CACHE_TTL_MS in serve.mjs
  const NOW = 1_700_000_000_000;
  const FULL = "FULL-INDEX-BODY";
  const INDEX = "STATIC-INDEX-ONLY";

  const fullOk = async () => FULL;
  const fullThrows = async () => {
    throw new Error("catalog upstream 503");
  };
  const indexBuilder = () => INDEX;

  it("reuses a warm, fresh cache without calling the generator", async () => {
    let calls = 0;
    const result = await resolveLlmsFullTxt({
      cache: { value: "CACHED-RICH", tsMs: NOW - 1000 },
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: async () => {
        calls += 1;
        return FULL;
      },
      generateIndex: indexBuilder,
    });
    expect(result.mode).toBe("fresh");
    expect(result.value).toBe("CACHED-RICH");
    expect(result.tsMs).toBe(NOW - 1000); // timestamp unchanged
    expect(calls).toBe(0); // generator never invoked
  });

  it("regenerates and caches with a full TTL when the cache is cold", async () => {
    const result = await resolveLlmsFullTxt({
      cache: { value: null, tsMs: 0 },
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: fullOk,
      generateIndex: indexBuilder,
    });
    expect(result.mode).toBe("regenerated");
    expect(result.value).toBe(FULL);
    expect(result.tsMs).toBe(NOW); // fresh TTL window
  });

  it("regenerates when the cache is stale (past TTL)", async () => {
    const result = await resolveLlmsFullTxt({
      cache: { value: "OLD", tsMs: NOW - TTL - 1 },
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: fullOk,
      generateIndex: indexBuilder,
    });
    expect(result.mode).toBe("regenerated");
    expect(result.value).toBe(FULL);
    expect(result.tsMs).toBe(NOW);
  });

  it("reuses a warm cache (stale-while-revalidate) when regeneration throws", async () => {
    const warnings: Array<[unknown, string]> = [];
    const result = await resolveLlmsFullTxt({
      cache: { value: "WARM-RICH", tsMs: NOW - TTL - 1 }, // stale → triggers regen attempt
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: fullThrows,
      generateIndex: indexBuilder,
      onError: (err: unknown, mode: string) => warnings.push([err, mode]),
    });
    expect(result.mode).toBe("stale");
    expect(result.value).toBe("WARM-RICH"); // last good copy reused, not empty
    expect(warnings).toHaveLength(1);
    expect(warnings[0][1]).toBe("stale");
  });

  it("serves the static index-only fallback on a cold-cache failure", async () => {
    const warnings: Array<[unknown, string]> = [];
    const result = await resolveLlmsFullTxt({
      cache: { value: null, tsMs: 0 },
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: fullThrows,
      generateIndex: indexBuilder,
      onError: (err: unknown, mode: string) => warnings.push([err, mode]),
    });
    expect(result.mode).toBe("index-fallback");
    expect(result.value).toBe(INDEX); // never empty / never throws
    expect(result.value.length).toBeGreaterThan(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0][1]).toBe("index-fallback");
  });

  it("applies the short retry window after a failure (no per-request retry storm)", async () => {
    // After a failure the timestamp is rewound so the entry is treated as fresh
    // for exactly LLMS_FULL_TXT_RETRY_WINDOW_MS, then becomes stale again.
    const failed = await resolveLlmsFullTxt({
      cache: { value: null, tsMs: 0 },
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: fullThrows,
      generateIndex: indexBuilder,
    });
    expect(failed.tsMs).toBe(NOW - TTL + LLMS_FULL_TXT_RETRY_WINDOW_MS);

    // Within the retry window the cache is still fresh → no regeneration attempt.
    let regenCalls = 0;
    const withinWindow = await resolveLlmsFullTxt({
      cache: { value: failed.value, tsMs: failed.tsMs },
      nowMs: NOW + LLMS_FULL_TXT_RETRY_WINDOW_MS - 1,
      ttlMs: TTL,
      generateFull: async () => {
        regenCalls += 1;
        return FULL;
      },
      generateIndex: indexBuilder,
    });
    expect(withinWindow.mode).toBe("fresh");
    expect(regenCalls).toBe(0);

    // Just past the retry window the entry is stale again → it retries upstream.
    const afterWindow = await resolveLlmsFullTxt({
      cache: { value: failed.value, tsMs: failed.tsMs },
      nowMs: NOW + LLMS_FULL_TXT_RETRY_WINDOW_MS + 1,
      ttlMs: TTL,
      generateFull: fullOk,
      generateIndex: indexBuilder,
    });
    expect(afterWindow.mode).toBe("regenerated");
    expect(afterWindow.value).toBe(FULL);
  });

  it("recovers to the rich full index once the upstream returns after a fallback", async () => {
    // Cold-cache failure → index fallback.
    const fallback = await resolveLlmsFullTxt({
      cache: { value: null, tsMs: 0 },
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: fullThrows,
      generateIndex: indexBuilder,
    });
    expect(fallback.value).toBe(INDEX);

    // Past the retry window, upstream recovers → full index is served and cached.
    const recovered = await resolveLlmsFullTxt({
      cache: { value: fallback.value, tsMs: fallback.tsMs },
      nowMs: NOW + LLMS_FULL_TXT_RETRY_WINDOW_MS + 1,
      ttlMs: TTL,
      generateFull: fullOk,
      generateIndex: indexBuilder,
    });
    expect(recovered.mode).toBe("regenerated");
    expect(recovered.value).toBe(FULL);
    expect(recovered.tsMs).toBe(NOW + LLMS_FULL_TXT_RETRY_WINDOW_MS + 1);
  });
});
