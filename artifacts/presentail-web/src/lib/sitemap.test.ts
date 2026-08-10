import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { BLOG_POSTS } from "@workspace/blog-content";

import {
  buildSitemapXml,
  buildSitemapIndexXml,
  generateSitemap,
  resolveSitemap,
  SITEMAP_RETRY_WINDOW_MS,
  SITEMAP_CITIES,
  SITEMAP_STATIC_PATHS,
  SITEMAP_CANONICAL_CITIES,
  SITEMAP_LANGS,
// @ts-expect-error - mjs module without type declarations.
} from "../../sitemap.mjs";

const { DOMParser } = new JSDOM().window;

const ORIGIN = "https://presentail.com";

// Minimal mock catalog: one entity of each type that has stock and one that is
// empty, so the count filter can be asserted in both directions.
const MOCK = {
  products: [{ slug: "red-roses" }, { slug: null }],
  brands: [{ slug: "acme-flowers", count: 5 }, { slug: "empty-brand", count: 0 }],
  occasions: [
    { id: "birthday", count: 5 },
    { id: "empty-occasion", count: 0 },
  ],
  categories: [
    { id: "bouquets", count: 12 },
    { id: "empty-category", count: 0 },
  ],
};

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, "text/xml") as Document;
}

describe("buildSitemapIndexXml", () => {
  const xml = buildSitemapIndexXml(ORIGIN, "/");

  it("is a well-formed <sitemapindex>", () => {
    const doc = parse(xml);
    expect(doc.documentElement?.nodeName).toBe("sitemapindex");
    expect(doc.getElementsByTagName("parsererror").length).toBe(0);
  });

  it("points at one child sitemap per locale", () => {
    for (const lang of SITEMAP_LANGS) {
      expect(xml).toContain(`<loc>${ORIGIN}/sitemap-${lang}.xml</loc>`);
    }
    const doc = parse(xml);
    expect(doc.getElementsByTagName("sitemap").length).toBe(SITEMAP_LANGS.length);
  });

  it("respects a non-root basePath", () => {
    const prefixed = buildSitemapIndexXml(ORIGIN, "/web/");
    expect(prefixed).toContain(`<loc>${ORIGIN}/web/sitemap-en.xml</loc>`);
  });
});

describe("buildSitemapXml — per-locale generation", () => {
  const xmlByLocale = Object.fromEntries(
    SITEMAP_LANGS.map((lang: string) => [
      lang,
      buildSitemapXml({ origin: ORIGIN, basePath: "/", locale: lang, ...MOCK }),
    ]),
  );

  it("each locale's <loc> entries use that locale's language prefix", () => {
    for (const lang of SITEMAP_LANGS) {
      expect(xmlByLocale[lang]).toContain(
        `<loc>${ORIGIN}/${lang}-lb/beirut</loc>`,
      );
      // No <loc> in another language prefix (alternates are fine).
      for (const other of SITEMAP_LANGS) {
        if (other === lang) continue;
        expect(xmlByLocale[lang]).not.toContain(
          `<loc>${ORIGIN}/${other}-lb/beirut</loc>`,
        );
      }
    }
  });

  it("every locale's entries carry reciprocal alternates for all three languages plus x-default", () => {
    for (const lang of SITEMAP_LANGS) {
      const doc = parse(xmlByLocale[lang]);
      const firstUrl = Array.from(doc.getElementsByTagName("url")).find(
        (u) => u.getElementsByTagName("xhtml:link").length > 0,
      )!;
      const links = Array.from(firstUrl.getElementsByTagName("xhtml:link"));
      const hreflangs = links.map((l) => l.getAttribute("hreflang"));
      expect(hreflangs).toEqual(
        expect.arrayContaining(["en-LB", "ar-LB", "fr-LB", "x-default"]),
      );
      // x-default always points at the English variant.
      const xDefault = links.find((l) => l.getAttribute("hreflang") === "x-default")!;
      expect(xDefault.getAttribute("href")).toContain("/en-lb/");
    }
  });

  it("each locale sitemap has the same number of locale-prefixed entries (deterministic, no per-city inflation)", () => {
    const counts = SITEMAP_LANGS.map(
      (lang: string) => parse(xmlByLocale[lang]).getElementsByTagName("url").length,
    );
    // The en sitemap carries one extra entry: the un-prefixed root "/".
    expect(counts[0]).toBe(counts[1] + 1);
    expect(counts[1]).toBe(counts[2]);
  });

  it("only the en sitemap lists the un-prefixed root URL", () => {
    expect(xmlByLocale.en).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(xmlByLocale.ar).not.toContain(`<loc>${ORIGIN}/</loc>`);
    expect(xmlByLocale.fr).not.toContain(`<loc>${ORIGIN}/</loc>`);
  });

  it("products appear at hub-city canonical URLs only, per locale", () => {
    for (const lang of SITEMAP_LANGS) {
      expect(xmlByLocale[lang]).toContain(
        `<loc>${ORIGIN}/${lang}-lb/beirut/product/red-roses</loc>`,
      );
      // Not per-city: no product entry for a non-hub city.
      expect(xmlByLocale[lang]).not.toContain(
        `<loc>${ORIGIN}/${lang}-lb/tripoli/product/red-roses</loc>`,
      );
    }
  });

  it("the blog index appears in all three locale sitemaps as a lang-only canonical URL", () => {
    for (const lang of SITEMAP_LANGS) {
      // Blog content is city-independent; each locale sitemap emits the
      // lang-only canonical (/{lang}/blog) instead of a city-prefixed variant.
      expect(xmlByLocale[lang]).toContain(
        `<loc>${ORIGIN}/${lang}/blog</loc>`,
      );
    }
  });

  it("product <image:image> blocks carry over into non-English locale sitemaps", () => {
    const xmlAr = buildSitemapXml({
      origin: ORIGIN,
      basePath: "/",
      locale: "ar",
      products: [
        { slug: "red-roses", name: "Red Roses", imageUrl: "https://cdn.example.com/red.jpg" },
      ],
    });
    expect(xmlAr).toContain("<image:image>");
    expect(xmlAr).toContain("<image:loc>https://cdn.example.com/red.jpg</image:loc>");
  });

  it("falls back to English for an unknown locale", () => {
    const xml = buildSitemapXml({ origin: ORIGIN, basePath: "/", locale: "zz", ...MOCK });
    expect(xml).toContain(`<loc>${ORIGIN}/en-lb/beirut</loc>`);
  });
});

describe("generateSitemap — locale pass-through", () => {
  it("generates the requested locale's URL prefix", async () => {
    const fakeFetch = async (url: string) => {
      if (url.includes("/api/woo/products")) return { products: [{ slug: "p1" }] };
      if (url.includes("/api/woo/brands")) return { brands: [] };
      return { occasions: [], categories: [] };
    };
    const xml = await generateSitemap(ORIGIN, "/", fakeFetch, "http://localhost:80", "fr");
    expect(xml).toContain(`<loc>${ORIGIN}/fr-lb/beirut/product/p1</loc>`);
    expect(xml).not.toContain(`<loc>${ORIGIN}/en-lb/beirut/product/p1</loc>`);
  });
});

describe("buildSitemapXml", () => {
  const xml = buildSitemapXml({
    origin: ORIGIN,
    basePath: "/",
    ...MOCK,
  });

  it("produces well-formed XML", () => {
    const doc = parse(xml);
    // xmldom reports parse errors as <parsererror> nodes; a healthy parse has
    // a documentElement named <urlset>.
    expect(doc.documentElement?.nodeName).toBe("urlset");
    expect(doc.getElementsByTagName("parsererror").length).toBe(0);
  });

  it("declares the xhtml namespace on <urlset>", () => {
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    const doc = parse(xml);
    expect(
      doc.documentElement?.getAttribute("xmlns:xhtml"),
    ).toBe("http://www.w3.org/1999/xhtml");
  });

  it("declares the image namespace on <urlset>", () => {
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    const doc = parse(xml);
    expect(
      doc.documentElement?.getAttribute("xmlns:image"),
    ).toBe("http://www.google.com/schemas/sitemap-image/1.1");
  });

  it("includes <image:image> for products that have imageUrl and name", () => {
    const xmlWithImage = buildSitemapXml({
      origin: ORIGIN,
      basePath: "/",
      products: [
        {
          slug: "red-roses",
          name: "Red Roses",
          imageUrl: "https://os.presentail.com/api/storage/public-objects/red-roses.jpg",
        },
        { slug: "no-image" },
      ],
    });

    expect(xmlWithImage).toContain("<image:image>");
    expect(xmlWithImage).toContain("<image:loc>https://os.presentail.com/api/storage/public-objects/red-roses.jpg</image:loc>");
    expect(xmlWithImage).toContain("<image:title>Red Roses</image:title>");
    expect(xmlWithImage).not.toContain("no-image</image:title>");
  });

  it("<image:loc> is a valid URL when imageUrl is provided", () => {
    const imageUrl = "https://os.presentail.com/api/storage/public-objects/bouquet.jpg";
    const xmlWithImage = buildSitemapXml({
      origin: ORIGIN,
      basePath: "/",
      products: [{ slug: "bouquet", name: "Bouquet", imageUrl }],
    });

    const match = xmlWithImage.match(/<image:loc>(.+?)<\/image:loc>/);
    expect(match).not.toBeNull();
    expect(() => new URL(match![1])).not.toThrow();
  });

  it("<image:title> is non-empty for products with a name", () => {
    const xmlWithImage = buildSitemapXml({
      origin: ORIGIN,
      basePath: "/",
      products: [
        {
          slug: "flowers",
          name: "Spring Flowers",
          imageUrl: "https://os.presentail.com/api/storage/public-objects/flowers.jpg",
        },
      ],
    });

    const match = xmlWithImage.match(/<image:title>(.+?)<\/image:title>/);
    expect(match).not.toBeNull();
    expect(match![1].length).toBeGreaterThan(0);
  });

  it("<image:caption> uses buildProductImageAlt EN pattern (name – delivered in Beirut)", () => {
    const xmlWithImage = buildSitemapXml({
      origin: ORIGIN,
      basePath: "/",
      products: [
        {
          slug: "spring-bouquet",
          name: "Spring Bouquet",
          imageUrl: "https://os.presentail.com/api/storage/public-objects/spring.jpg",
        },
      ],
    });

    const match = xmlWithImage.match(/<image:caption>(.+?)<\/image:caption>/);
    expect(match).not.toBeNull();
    const caption = match![1];
    expect(caption).toBe("Spring Bouquet \u2013 delivered in Beirut");
    expect(caption.length).toBeLessThanOrEqual(125);
  });

  it("does not emit <image:image> for products without imageUrl", () => {
    const xmlNoImage = buildSitemapXml({
      origin: ORIGIN,
      basePath: "/",
      products: [{ slug: "red-roses" }],
    });
    expect(xmlNoImage).not.toContain("<image:image>");
  });

  it("excludes categories with count 0 and includes those with count > 0", () => {
    expect(xml).toContain("/category/bouquets");
    expect(xml).not.toContain("/category/empty-category");
  });

  it("includes a curated category with count 0 in the EN sitemap (curated-bypass)", () => {
    // "balloons" has curated SEO content for lb/beirut in English — even with
    // count: 0 it must appear in the English sitemap so the hand-written page
    // is always discoverable by Googlebot.
    const xmlEn = buildSitemapXml({
      origin: ORIGIN,
      basePath: "/",
      locale: "en",
      categories: [{ id: "balloons", count: 0 }],
    });
    expect(xmlEn).toContain("/category/balloons");
  });

  it("excludes a curated category with count 0 from AR and FR sitemaps (curated content is EN-only)", () => {
    // The curated bypass is scoped to the locale that actually has hand-written
    // copy. For AR and FR, no curated balloons copy exists, so the normal
    // eligibility gate applies — a zero-count category must be omitted.
    for (const locale of ["ar", "fr"]) {
      const xmlNonEn = buildSitemapXml({
        origin: ORIGIN,
        basePath: "/",
        locale,
        categories: [{ id: "balloons", count: 0 }],
      });
      expect(xmlNonEn, `locale ${locale}: zero-count curated category must be absent`).not.toContain(
        "/category/balloons",
      );
    }
  });

  it("excludes occasions with count 0 and includes those with count > 0", () => {
    expect(xml).toContain("/occasion/birthday");
    expect(xml).not.toContain("/occasion/empty-occasion");
  });

  it("does not include /llms.txt or /llms-full.txt in the sitemap", () => {
    expect(xml).not.toContain("/llms.txt");
    expect(xml).not.toContain("/llms-full.txt");
  });

  it("does not include any tracking parameters in <loc> entries", () => {
    const doc = parse(xml);
    const locs = Array.from(doc.getElementsByTagName("loc"));
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      const locText = loc.textContent ?? "";
      expect(locText, `<loc> must not contain srsltid: ${locText}`).not.toContain("srsltid");
      expect(locText, `<loc> must not contain gclid: ${locText}`).not.toContain("gclid");
      expect(locText, `<loc> must not contain fbclid: ${locText}`).not.toContain("fbclid");
      expect(locText, `<loc> must not contain utm_: ${locText}`).not.toContain("utm_");
    }
  });

  it("does not include any robots.txt-blocked private-content paths", () => {
    // These paths are Disallowed in robots.txt. They must never appear in the
    // sitemap — not even as a segment of a longer URL — so we assert that the
    // raw substring is absent from the entire sitemap XML.
    const blocked = [
      "/sign-in",
      "/order-confirmed",
      "/favorites",
      "/checkout",
      "/cart",
      "/auth",
      "/account",
    ];
    for (const path of blocked) {
      expect(xml, `blocked path ${path} must be absent from the sitemap`).not.toContain(path);
    }
  });

  it("emits hreflang alternates for en/ar/fr + x-default on every <url> with a prefix", () => {
    const doc = parse(xml);
    const urlNodes = Array.from(doc.getElementsByTagName("url"));

    // Locale-prefixed entries (every entry except the one language-agnostic
    // one: root "/") must carry alternates.
    const prefixed = urlNodes.filter((u) => {
      const loc = u.getElementsByTagName("loc")[0]?.textContent ?? "";
      return /\/(en|ar|fr)-(lb|ae|cy)\//.test(loc);
    });
    expect(prefixed.length).toBeGreaterThan(0);

    for (const url of prefixed) {
      const links = Array.from(url.getElementsByTagName("xhtml:link"));
      const hreflangs = links
        .map((l) => l.getAttribute("hreflang"))
        .filter(Boolean)
        .sort();
      // Country is derived from the loc; assert all four codes are present.
      const loc = url.getElementsByTagName("loc")[0]?.textContent ?? "";
      const country = (loc.match(/\/(?:en|ar|fr)-(lb|ae|cy)\//)?.[1] ?? "").toUpperCase();
      expect(hreflangs).toEqual(
        [`en-${country}`, `ar-${country}`, `fr-${country}`, "x-default"].sort(),
      );
    }
  });

  it("omits <lastmod> on catalog/static entries (no fabricated dates)", () => {
    const doc = parse(xml);
    const urlNodes = Array.from(doc.getElementsByTagName("url"));
    expect(urlNodes.length).toBeGreaterThan(0);
    for (const url of urlNodes) {
      const loc = url.getElementsByTagName("loc")[0]?.textContent ?? "";
      // Blog articles carry a real datePublished and are allowed a <lastmod>;
      // everything else must omit the field.
      if (loc.includes("/blog/")) continue;
      expect(url.getElementsByTagName("lastmod").length, `no lastmod on ${loc}`).toBe(0);
    }
  });

  it("emits the real datePublished as <lastmod> on blog article entries only", () => {
    const xmlBlog = buildSitemapXml({
      origin: ORIGIN,
      basePath: "/",
      products: [{ slug: "red-roses" }],
      blogPosts: {
        "dated-post": { en: { datePublished: "2025-03-15" } },
        "undated-post": {},
      },
    });
    const doc = parse(xmlBlog);
    for (const url of Array.from(doc.getElementsByTagName("url"))) {
      const loc = url.getElementsByTagName("loc")[0]?.textContent ?? "";
      const lastmod = url.getElementsByTagName("lastmod")[0]?.textContent;
      if (loc.includes("/blog/dated-post")) {
        expect(lastmod).toBe("2025-03-15");
      } else {
        expect(lastmod).toBeUndefined();
      }
    }
  });
});

describe("generateSitemap", () => {
  it("fetches the catalog endpoints and applies the count filter", async () => {
    const fetched: string[] = [];
    const fakeFetch = async (url: string) => {
      fetched.push(url);
      if (url.includes("/api/woo/products")) return { products: MOCK.products };
      if (url.includes("/api/woo/brands")) return { brands: MOCK.brands };
      if (url.includes("/api/catalog/metadata")) {
        return { occasions: MOCK.occasions, categories: MOCK.categories };
      }
      return null;
    };

    const xml = await generateSitemap(
      ORIGIN,
      "/",
      fakeFetch,
      "http://localhost:80",
    );

    expect(fetched.some((u) => u.includes("/api/woo/products"))).toBe(true);
    expect(fetched.some((u) => u.includes("/api/woo/brands"))).toBe(true);
    expect(fetched.some((u) => u.includes("/api/catalog/metadata"))).toBe(true);

    expect(xml).toContain("/category/bouquets");
    expect(xml).not.toContain("/category/empty-category");
    expect(xml).toContain("/occasion/birthday");
    expect(xml).not.toContain("/occasion/empty-occasion");
    expect(xml).toContain("/product/red-roses");
    expect(xml).toContain("/brand/acme-flowers");
    expect(xml).not.toContain("/brand/empty-brand");

    expect(parse(xml).documentElement?.nodeName).toBe("urlset");
  });

  it("degrades gracefully when an endpoint returns null", async () => {
    const fakeFetch = async () => null;
    const xml = await generateSitemap(
      ORIGIN,
      "/",
      fakeFetch,
      "http://localhost:80",
    );
    // Still well-formed; only the static locale pages + root entries remain.
    expect(parse(xml).documentElement?.nodeName).toBe("urlset");
    expect(xml).not.toContain("/category/");
    expect(xml).not.toContain("/product/");
  });
});

describe("resolveSitemap — /sitemap.xml route resilience", () => {
  const TTL = 15 * 60 * 1000; // 15min, matches SITEMAP_CACHE_TTL_MS in serve.mjs
  const NOW = 1_700_000_000_000;
  const FULL = '<?xml version="1.0"?><urlset>FULL-CATALOG</urlset>';

  // The real cold-cache fallback: a catalog-free sitemap that still emits the
  // root + static locale pages, so it is always valid, non-empty XML.
  const staticBuilder = () => buildSitemapXml({ origin: ORIGIN, basePath: "/" });
  const fullOk = async () => FULL;
  const fullThrows = async () => {
    throw new Error("catalog upstream 503");
  };

  it("reuses a warm, fresh cache without calling the generator", async () => {
    let calls = 0;
    const result = await resolveSitemap({
      cache: { value: "CACHED-SITEMAP", tsMs: NOW - 1000 },
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: async () => {
        calls += 1;
        return FULL;
      },
      generateStatic: staticBuilder,
    });
    expect(result.mode).toBe("fresh");
    expect(result.value).toBe("CACHED-SITEMAP");
    expect(result.tsMs).toBe(NOW - 1000); // timestamp unchanged
    expect(calls).toBe(0); // generator never invoked
  });

  it("regenerates and caches with a full TTL when the cache is cold", async () => {
    const result = await resolveSitemap({
      cache: { value: null, tsMs: 0 },
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: fullOk,
      generateStatic: staticBuilder,
    });
    expect(result.mode).toBe("regenerated");
    expect(result.value).toBe(FULL);
    expect(result.tsMs).toBe(NOW); // fresh TTL window
  });

  it("regenerates when the cache is stale (past TTL)", async () => {
    const result = await resolveSitemap({
      cache: { value: "OLD", tsMs: NOW - TTL - 1 },
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: fullOk,
      generateStatic: staticBuilder,
    });
    expect(result.mode).toBe("regenerated");
    expect(result.value).toBe(FULL);
    expect(result.tsMs).toBe(NOW);
  });

  it("reuses a warm cache (stale-while-revalidate) when regeneration throws", async () => {
    const warnings: Array<[unknown, string]> = [];
    const result = await resolveSitemap({
      cache: { value: "WARM-SITEMAP", tsMs: NOW - TTL - 1 }, // stale → triggers regen attempt
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: fullThrows,
      generateStatic: staticBuilder,
      onError: (err: unknown, mode: string) => warnings.push([err, mode]),
    });
    expect(result.mode).toBe("stale");
    expect(result.value).toBe("WARM-SITEMAP"); // last good copy reused, not empty
    expect(warnings).toHaveLength(1);
    expect(warnings[0][1]).toBe("stale");
  });

  it("serves a valid, non-empty static sitemap on a cold-cache failure", async () => {
    const warnings: Array<[unknown, string]> = [];
    const result = await resolveSitemap({
      cache: { value: null, tsMs: 0 },
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: fullThrows,
      generateStatic: staticBuilder,
      onError: (err: unknown, mode: string) => warnings.push([err, mode]),
    });
    expect(result.mode).toBe("static-fallback");
    // Never empty / never throws — and the fallback is itself well-formed XML
    // carrying the root + static locale pages (no catalog entries).
    expect(result.value.length).toBeGreaterThan(0);
    const doc = parse(result.value);
    expect(doc.documentElement?.nodeName).toBe("urlset");
    expect(doc.getElementsByTagName("parsererror").length).toBe(0);
    expect(doc.getElementsByTagName("url").length).toBeGreaterThan(0);
    // Catalog-derived URLs are absent in the static fallback.
    expect(result.value).not.toContain("/product/");
    expect(result.value).not.toContain("/category/");
    expect(warnings).toHaveLength(1);
    expect(warnings[0][1]).toBe("static-fallback");
  });

  it("applies the short retry window after a failure (no per-request retry storm)", async () => {
    // After a failure the timestamp is rewound so the entry is treated as fresh
    // for exactly SITEMAP_RETRY_WINDOW_MS, then becomes stale again.
    const failed = await resolveSitemap({
      cache: { value: null, tsMs: 0 },
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: fullThrows,
      generateStatic: staticBuilder,
    });
    expect(failed.tsMs).toBe(NOW - TTL + SITEMAP_RETRY_WINDOW_MS);

    // Within the retry window the cache is still fresh → no regeneration attempt.
    let regenCalls = 0;
    const withinWindow = await resolveSitemap({
      cache: { value: failed.value, tsMs: failed.tsMs },
      nowMs: NOW + SITEMAP_RETRY_WINDOW_MS - 1,
      ttlMs: TTL,
      generateFull: async () => {
        regenCalls += 1;
        return FULL;
      },
      generateStatic: staticBuilder,
    });
    expect(withinWindow.mode).toBe("fresh");
    expect(regenCalls).toBe(0);

    // Just past the retry window the entry is stale again → it retries upstream.
    const afterWindow = await resolveSitemap({
      cache: { value: failed.value, tsMs: failed.tsMs },
      nowMs: NOW + SITEMAP_RETRY_WINDOW_MS + 1,
      ttlMs: TTL,
      generateFull: fullOk,
      generateStatic: staticBuilder,
    });
    expect(afterWindow.mode).toBe("regenerated");
    expect(afterWindow.value).toBe(FULL);
  });

  it("recovers to the full catalog sitemap once the upstream returns after a fallback", async () => {
    // Cold-cache failure → static fallback.
    const fallback = await resolveSitemap({
      cache: { value: null, tsMs: 0 },
      nowMs: NOW,
      ttlMs: TTL,
      generateFull: fullThrows,
      generateStatic: staticBuilder,
    });
    expect(fallback.mode).toBe("static-fallback");

    // Past the retry window, upstream recovers → full sitemap is served and cached.
    const recovered = await resolveSitemap({
      cache: { value: fallback.value, tsMs: fallback.tsMs },
      nowMs: NOW + SITEMAP_RETRY_WINDOW_MS + 1,
      ttlMs: TTL,
      generateFull: fullOk,
      generateStatic: staticBuilder,
    });
    expect(recovered.mode).toBe("regenerated");
    expect(recovered.value).toBe(FULL);
    expect(recovered.tsMs).toBe(NOW + SITEMAP_RETRY_WINDOW_MS + 1);
  });
});

// ---------------------------------------------------------------------------
// SITEMAP_STATIC_PATHS — explicit constant guard
//
// These tests pin the set of static sub-paths that every city × lang combo
// gets an entry for. When a new top-level route is added to the sitemap the
// developer must update SITEMAP_STATIC_PATHS — the tests below will fail and
// remind them to do so.
// ---------------------------------------------------------------------------
describe("SITEMAP_STATIC_PATHS — expected contents", () => {
  const EXPECTED_STATIC_PATHS = [
    "/",
    "/brands",
    "/occasions",
    "/contact",
    "/faqs",
    "/weddings",
    "/corporate",
  ];

  it("contains every expected static sub-path", () => {
    for (const p of EXPECTED_STATIC_PATHS) {
      expect(
        SITEMAP_STATIC_PATHS,
        `SITEMAP_STATIC_PATHS should include "${p}"`,
      ).toContain(p);
    }
  });

  it("does not contain unexpected extra paths (update this test when adding new ones)", () => {
    const unexpected = (SITEMAP_STATIC_PATHS as string[]).filter(
      (p: string) => !EXPECTED_STATIC_PATHS.includes(p),
    );
    expect(
      unexpected,
      `Unexpected entries in SITEMAP_STATIC_PATHS: ${unexpected.join(", ")} — update both SITEMAP_STATIC_PATHS and this test together`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SITEMAP_CITIES — expected structure
//
// Pins the three-country structure and city counts so that adding a new
// country or city without updating the constant is caught immediately.
// ---------------------------------------------------------------------------
describe("SITEMAP_CITIES — expected structure", () => {
  it("has entries for exactly the three active countries: lb, ae, cy", () => {
    expect(Object.keys(SITEMAP_CITIES).sort()).toEqual(["ae", "cy", "lb"]);
  });

  it("Lebanon has 26 cities", () => {
    expect((SITEMAP_CITIES as Record<string, string[]>).lb).toHaveLength(26);
  });

  it("UAE has 7 cities", () => {
    expect((SITEMAP_CITIES as Record<string, string[]>).ae).toHaveLength(7);
  });

  it("Cyprus has 4 cities", () => {
    expect((SITEMAP_CITIES as Record<string, string[]>).cy).toHaveLength(4);
  });

  it("includes the canonical representative city for each country", () => {
    expect((SITEMAP_CITIES as Record<string, string[]>).lb).toContain("beirut");
    expect((SITEMAP_CITIES as Record<string, string[]>).ae).toContain("dubai");
    expect((SITEMAP_CITIES as Record<string, string[]>).cy).toContain("nicosia");
  });

  it("SITEMAP_CANONICAL_CITIES matches the expected per-country representatives", () => {
    expect((SITEMAP_CANONICAL_CITIES as Record<string, string>).lb).toBe("beirut");
    expect((SITEMAP_CANONICAL_CITIES as Record<string, string>).ae).toBe("dubai");
    expect((SITEMAP_CANONICAL_CITIES as Record<string, string>).cy).toBe("nicosia");
  });

  it("SITEMAP_LANGS contains en, ar, and fr", () => {
    expect((SITEMAP_LANGS as string[]).sort()).toEqual(["ar", "en", "fr"]);
  });
});

// ---------------------------------------------------------------------------
// buildSitemapXml — top-level route type coverage
//
// Each route type (static pages, products, brands, occasions, categories,
// blog articles) must produce at least one <url> in the output. Adding a new
// route type to the sitemap generator without adding it here causes this
// section to fall out of sync — update it alongside sitemap.mjs.
// ---------------------------------------------------------------------------
describe("buildSitemapXml — top-level route type coverage", () => {
  const xmlFull = buildSitemapXml({
    origin: ORIGIN,
    basePath: "/",
    products: [{ slug: "red-roses", name: "Red Roses", imageUrl: "https://os.presentail.com/api/storage/public-objects/roses.jpg" }],
    brands: [{ slug: "acme-flowers", count: 5 }],
    occasions: [{ id: "birthday", count: 5 }],
    categories: [{ id: "bouquets", count: 12 }],
    blogPosts: { "top-10-flowers": {} },
    // totalProductCount: 30 keeps every entity's ratio >= UNIQUENESS_RATIO_MIN (0.15):
    // brand 5/30 = 0.167, occasion 5/30 = 0.167, category 12/30 = 0.40
    totalProductCount: 30,
  });

  it("includes the un-prefixed root URL /", () => {
    expect(xmlFull).toContain(`<loc>${ORIGIN}/</loc>`);
  });

  it("includes product URLs", () => {
    expect(xmlFull).toContain("/product/red-roses");
  });

  it("includes brand URLs", () => {
    expect(xmlFull).toContain("/brand/acme-flowers");
  });

  it("includes occasion URLs", () => {
    expect(xmlFull).toContain("/occasion/birthday");
  });

  it("includes category URLs", () => {
    expect(xmlFull).toContain("/category/bouquets");
  });

  it("includes blog article URLs", () => {
    expect(xmlFull).toContain("/blog/top-10-flowers");
  });

  it("includes every static sub-path from SITEMAP_STATIC_PATHS for at least one city", () => {
    for (const subpath of SITEMAP_STATIC_PATHS as string[]) {
      const rest = subpath === "/" ? "" : subpath;
      const needle = `/en-lb/beirut${rest}`;
      expect(xmlFull, `static path ${subpath} should appear as ${needle}`).toContain(needle);
    }
  });

  it("emits product URLs for all three canonical countries", () => {
    expect(xmlFull).toContain("/en-lb/beirut/product/red-roses");
    expect(xmlFull).toContain("/en-ae/dubai/product/red-roses");
    expect(xmlFull).toContain("/en-cy/nicosia/product/red-roses");
  });

  it("emits brand URLs for all three canonical countries", () => {
    expect(xmlFull).toContain("/en-lb/beirut/brand/acme-flowers");
    expect(xmlFull).toContain("/en-ae/dubai/brand/acme-flowers");
    expect(xmlFull).toContain("/en-cy/nicosia/brand/acme-flowers");
  });

  it("emits occasion URLs for all three canonical countries", () => {
    expect(xmlFull).toContain("/en-lb/beirut/occasion/birthday");
    expect(xmlFull).toContain("/en-ae/dubai/occasion/birthday");
    expect(xmlFull).toContain("/en-cy/nicosia/occasion/birthday");
  });

  it("emits blog article URLs as lang-only canonical paths (no city/country)", () => {
    // Blog articles are city-independent; each locale sitemap emits one URL
    // per article using the /{lang}/blog/:slug format (no city or country).
    expect(xmlFull).toContain("/en/blog/top-10-flowers");
    expect(xmlFull).toContain("/ar/blog/top-10-flowers");
    expect(xmlFull).toContain("/fr/blog/top-10-flowers");
    // Old city-prefixed blog URLs must NOT appear (they 301-redirect to these).
    expect(xmlFull).not.toContain("/en-lb/beirut/blog/top-10-flowers");
    expect(xmlFull).not.toContain("/en-ae/dubai/blog/top-10-flowers");
    expect(xmlFull).not.toContain("/en-cy/nicosia/blog/top-10-flowers");
  });
});

// ---------------------------------------------------------------------------
// buildSitemapXml — per-country city coverage
//
// Every city in every country must produce URLs in the sitemap (for the
// static sub-paths). Adding a new city to SITEMAP_CITIES but forgetting to
// keep the list consistent with the web router will surface here.
// ---------------------------------------------------------------------------
describe("buildSitemapXml — per-country city coverage", () => {
  const xmlStatic = buildSitemapXml({
    origin: ORIGIN,
    basePath: "/",
  });

  it("includes static page URLs for every Lebanon city", () => {
    for (const city of (SITEMAP_CITIES as Record<string, string[]>).lb) {
      expect(xmlStatic, `Lebanon city "${city}" should appear in the sitemap`).toContain(`/en-lb/${city}`);
    }
  });

  it("includes static page URLs for every UAE city", () => {
    for (const city of (SITEMAP_CITIES as Record<string, string[]>).ae) {
      expect(xmlStatic, `UAE city "${city}" should appear in the sitemap`).toContain(`/en-ae/${city}`);
    }
  });

  it("includes static page URLs for every Cyprus city", () => {
    for (const city of (SITEMAP_CITIES as Record<string, string[]>).cy) {
      expect(xmlStatic, `Cyprus city "${city}" should appear in the sitemap`).toContain(`/en-cy/${city}`);
    }
  });

  it("emits all three language variants for each city (en, ar, fr)", () => {
    for (const lang of SITEMAP_LANGS as string[]) {
      expect(xmlStatic).toContain(`/${lang}-lb/beirut`);
      expect(xmlStatic).toContain(`/${lang}-ae/dubai`);
      expect(xmlStatic).toContain(`/${lang}-cy/nicosia`);
    }
  });

  it("emits an x-default hreflang for locale-prefixed city pages", () => {
    expect(xmlStatic).toContain('hreflang="x-default"');
  });
});

// ---------------------------------------------------------------------------
// buildSitemapXml — excluded / noindex paths
//
// Paths that are either blocked in robots.txt or marked noindex must never
// appear in the sitemap. Adding a new noindex group-B page without also
// listing it here will leave this guard incomplete — update both together.
// ---------------------------------------------------------------------------
describe("buildSitemapXml — excluded / noindex paths", () => {
  const xmlFull = buildSitemapXml({
    origin: ORIGIN,
    basePath: "/",
    products: [{ slug: "red-roses" }],
    brands: [{ slug: "acme-flowers", count: 5 }],
    occasions: [{ id: "birthday", count: 5 }],
    categories: [{ id: "bouquets", count: 12 }],
    blogPosts: { "hello-world": {} },
    totalProductCount: 30,
  });

  it("does not include /shop (canonical category/occasion clean paths used instead)", () => {
    expect(xmlFull).not.toContain("/shop");
  });

  const NOINDEX_GROUP_B = ["/privacy", "/terms", "/careers", "/partner"];

  for (const p of NOINDEX_GROUP_B) {
    it(`does not include noindex Group B path ${p}`, () => {
      expect(xmlFull).not.toContain(p);
    });
  }

  it("includes the blog index as a lang-only canonical URL (not city-prefixed)", () => {
    // xmlFull is built for the default locale (en), so <loc> carries /en/blog.
    // The ar and fr variants appear as hreflang alternates in the same <url> block.
    expect(xmlFull).toContain(`${ORIGIN}/en/blog<`);
    // hreflang alternates for the other languages must also be present.
    expect(xmlFull).toContain(`href="${ORIGIN}/ar/blog"`);
    expect(xmlFull).toContain(`href="${ORIGIN}/fr/blog"`);
    // Old city-prefixed blog index URLs must NOT appear (they 301-redirect here).
    expect(xmlFull).not.toContain(`${ORIGIN}/en-lb/beirut/blog<`);
    expect(xmlFull).not.toContain(`${ORIGIN}/en-ae/dubai/blog<`);
    expect(xmlFull).not.toContain(`${ORIGIN}/en-cy/nicosia/blog<`);
  });

  it("does not include llms.txt or llms-full.txt", () => {
    expect(xmlFull).not.toContain("/llms.txt");
    expect(xmlFull).not.toContain("/llms-full.txt");
  });
});

// ---------------------------------------------------------------------------
// buildSitemapXml — product lifecycle / availability filtering
//
// DISCONTINUED products must be omitted (they return 410 and must not be
// submitted to Google via the sitemap). SOLD_OUT_TEMPORARILY and
// SEASONAL_UNAVAILABLE products must remain in the sitemap but with a lower
// crawl-priority signal (0.4) to deprioritise re-crawling out-of-stock pages.
// ---------------------------------------------------------------------------
describe("buildSitemapXml — product availability lifecycle filtering", () => {
  const makeXml = (products: object[]) =>
    buildSitemapXml({
      origin: ORIGIN,
      basePath: "/",
      products,
    });

  it("includes ACTIVE products (no inStock / status fields) at priority 0.8", () => {
    const xml = makeXml([{ slug: "active-product" }]);
    expect(xml).toContain("/product/active-product");
    const priorityMatch = xml.match(
      /product\/active-product[\s\S]*?<priority>([^<]+)<\/priority>/,
    );
    expect(priorityMatch?.[1]).toBe("0.8");
  });

  it("includes ACTIVE products (inStock=true) at priority 0.8", () => {
    const xml = makeXml([{ slug: "in-stock", inStock: true, status: null, tags: [] }]);
    expect(xml).toContain("/product/in-stock");
    const priorityMatch = xml.match(
      /product\/in-stock[\s\S]*?<priority>([^<]+)<\/priority>/,
    );
    expect(priorityMatch?.[1]).toBe("0.8");
  });

  it("omits DISCONTINUED products entirely (status=discontinued)", () => {
    const xml = makeXml([
      { slug: "discontinued-product", inStock: false, status: "discontinued", tags: [] },
    ]);
    expect(xml).not.toContain("/product/discontinued-product");
  });

  it("omits DISCONTINUED products even when inStock is true", () => {
    const xml = makeXml([
      { slug: "disc-in-stock", inStock: true, status: "discontinued", tags: [] },
    ]);
    expect(xml).not.toContain("/product/disc-in-stock");
  });

  it("includes SOLD_OUT_TEMPORARILY products at priority 0.4", () => {
    const xml = makeXml([
      { slug: "sold-out", inStock: false, status: null, tags: [] },
    ]);
    expect(xml).toContain("/product/sold-out");
    const priorityMatch = xml.match(
      /product\/sold-out[\s\S]*?<priority>([^<]+)<\/priority>/,
    );
    expect(priorityMatch?.[1]).toBe("0.4");
  });

  it("includes SEASONAL_UNAVAILABLE products at priority 0.4", () => {
    const xml = makeXml([
      { slug: "seasonal-product", inStock: false, status: null, tags: ["seasonal"] },
    ]);
    expect(xml).toContain("/product/seasonal-product");
    const priorityMatch = xml.match(
      /product\/seasonal-product[\s\S]*?<priority>([^<]+)<\/priority>/,
    );
    expect(priorityMatch?.[1]).toBe("0.4");
  });

  it("sold-out products keep changefreq=weekly", () => {
    const xml = makeXml([
      { slug: "sold-out-freq", inStock: false, status: null, tags: [] },
    ]);
    const freqMatch = xml.match(
      /product\/sold-out-freq[\s\S]*?<changefreq>([^<]+)<\/changefreq>/,
    );
    expect(freqMatch?.[1]).toBe("weekly");
  });

  it("filters out DISCONTINUED but keeps active products in the same list", () => {
    const xml = makeXml([
      { slug: "active-one", inStock: true, status: null, tags: [] },
      { slug: "disc-one", inStock: false, status: "discontinued", tags: [] },
      { slug: "sold-out-one", inStock: false, status: null, tags: [] },
    ]);
    expect(xml).toContain("/product/active-one");
    expect(xml).not.toContain("/product/disc-one");
    expect(xml).toContain("/product/sold-out-one");
  });
});

// ---------------------------------------------------------------------------
// Blog posts: Achrafieh and Roses — language coverage confirmation
//
// Both "flower-shop-in-achrafieh" and "send-roses-to-lebanon" have full
// en/ar/fr translations in BLOG_POSTS. This suite confirms they appear in
// each locale sitemap with the correct /{lang}/blog/:slug canonical URL and
// reciprocal hreflang alternates covering all three languages + x-default.
//
// This is a regression guard: if either post loses its ar/fr content or the
// sitemap generator starts filtering by translation completeness, these tests
// fail immediately instead of silently dropping the pages from the sitemap.
// ---------------------------------------------------------------------------
describe("buildSitemapXml — Achrafieh and Roses blog posts in all locale sitemaps", () => {
  const CHECKED_SLUGS = ["flower-shop-in-achrafieh", "send-roses-to-lebanon"] as const;

  it("both posts exist in BLOG_POSTS with en, ar, and fr translations", () => {
    for (const slug of CHECKED_SLUGS) {
      const entry = (BLOG_POSTS as Record<string, Record<string, unknown>>)[slug];
      expect(entry, `BLOG_POSTS["${slug}"] is missing`).toBeDefined();
      for (const lang of ["en", "ar", "fr"]) {
        const variant = entry?.[lang] as Record<string, unknown> | undefined;
        expect(variant, `BLOG_POSTS["${slug}"]["${lang}"] is missing`).toBeDefined();
        // Must have real content — at minimum a non-empty title and description.
        expect(
          typeof variant?.title === "string" && variant.title.length > 0,
          `BLOG_POSTS["${slug}"]["${lang}"].title is empty or missing`,
        ).toBe(true);
        expect(
          typeof variant?.description === "string" && variant.description.length > 0,
          `BLOG_POSTS["${slug}"]["${lang}"].description is empty or missing`,
        ).toBe(true);
      }
    }
  });

  /**
   * Find the <url> node whose <loc> exactly matches `loc`, or return null.
   * Used to scope hreflang assertions to the article's own sitemap entry rather
   * than searching the whole XML string (which could match sibling entries or
   * the blog-index block and give a false-positive).
   */
  function findUrlNodeByLoc(doc: Document, loc: string): Element | null {
    const urlNodes = Array.from(doc.getElementsByTagName("url"));
    return (
      urlNodes.find((u) => u.getElementsByTagName("loc")[0]?.textContent === loc) ?? null
    );
  }

  for (const locale of ["en", "ar", "fr"] as const) {
    it(`"${locale}" sitemap includes both posts as /${locale}/blog/<slug> canonical URLs`, () => {
      const xml = buildSitemapXml({
        origin: ORIGIN,
        basePath: "/",
        locale,
        // Use the real BLOG_POSTS so this test reflects the live content file.
      });
      for (const slug of CHECKED_SLUGS) {
        expect(xml, `/${locale}/blog/${slug} must appear in the ${locale} sitemap`).toContain(
          `<loc>${ORIGIN}/${locale}/blog/${slug}</loc>`,
        );
      }
    });

    it(`"${locale}" sitemap blog entries for both posts carry en/ar/fr hreflang alternates on the article's own <url> node`, () => {
      const xml = buildSitemapXml({
        origin: ORIGIN,
        basePath: "/",
        locale,
      });
      const doc = parse(xml);
      for (const slug of CHECKED_SLUGS) {
        const canonicalLoc = `${ORIGIN}/${locale}/blog/${slug}`;
        const urlNode = findUrlNodeByLoc(doc, canonicalLoc);
        expect(urlNode, `<url> node for <loc>${canonicalLoc}</loc> not found in ${locale} sitemap`).not.toBeNull();

        const links = Array.from(urlNode!.getElementsByTagName("xhtml:link"));
        const hreflangMap = Object.fromEntries(
          links
            .map((l) => [l.getAttribute("hreflang"), l.getAttribute("href")])
            .filter(([hl]) => hl !== null),
        );

        // Each article's own <url> must have reciprocal alternates for all three languages.
        for (const altLang of ["en", "ar", "fr"]) {
          expect(
            hreflangMap[altLang],
            `hreflang="${altLang}" missing from the <url> node for ${slug} in ${locale} sitemap`,
          ).toBe(`${ORIGIN}/${altLang}/blog/${slug}`);
        }

        // x-default must be present on this node and point at the English variant.
        expect(
          hreflangMap["x-default"],
          `hreflang="x-default" missing from the <url> node for ${slug} in ${locale} sitemap`,
        ).toBe(`${ORIGIN}/en/blog/${slug}`);
      }
    });
  }

  it("blog entries for both posts do NOT use the old city-prefixed URL format", () => {
    const xml = buildSitemapXml({
      origin: ORIGIN,
      basePath: "/",
      locale: "en",
    });
    for (const slug of CHECKED_SLUGS) {
      // City-prefixed blog URLs 301-redirect to the canonical /{lang}/blog/:slug
      // form; they must never appear in the sitemap.
      expect(xml, `city-prefixed blog URL for ${slug} must not appear in sitemap`).not.toContain(
        `/beirut/blog/${slug}`,
      );
    }
  });
});

describe("generateSitemap — product availability fields passed to builder", () => {
  it("omits products with status=discontinued from the sitemap", async () => {
    const fakeFetch = async (url: string) => {
      if (url.includes("/api/woo/products")) {
        return {
          products: [
            { slug: "active-p", inStock: true, status: null, tags: [] },
            { slug: "disc-p", inStock: false, status: "discontinued", tags: [] },
            { slug: "sold-out-p", inStock: false, status: null, tags: [] },
          ],
        };
      }
      return null;
    };
    const xml = await generateSitemap(ORIGIN, "/", fakeFetch, "http://localhost:80");
    expect(xml).toContain("/product/active-p");
    expect(xml).not.toContain("/product/disc-p");
    expect(xml).toContain("/product/sold-out-p");
  });

  it("assigns priority 0.4 to sold-out products via generateSitemap", async () => {
    const fakeFetch = async (url: string) => {
      if (url.includes("/api/woo/products")) {
        return { products: [{ slug: "oos", inStock: false, status: null, tags: [] }] };
      }
      return null;
    };
    const xml = await generateSitemap(ORIGIN, "/", fakeFetch, "http://localhost:80");
    expect(xml).toContain("/product/oos");
    const priorityMatch = xml.match(/product\/oos[\s\S]*?<priority>([^<]+)<\/priority>/);
    expect(priorityMatch?.[1]).toBe("0.4");
  });
});
