import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";

import {
  buildSitemapXml,
  generateSitemap,
  resolveSitemap,
  SITEMAP_RETRY_WINDOW_MS,
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

describe("buildSitemapXml", () => {
  const xml = buildSitemapXml({
    origin: ORIGIN,
    basePath: "/",
    ...MOCK,
    lastmod: "2026-06-27",
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
      lastmod: "2026-06-27",
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
      lastmod: "2026-06-27",
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
      lastmod: "2026-06-27",
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
      lastmod: "2026-06-27",
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
      lastmod: "2026-06-27",
    });
    expect(xmlNoImage).not.toContain("<image:image>");
  });

  it("excludes categories with count 0 and includes those with count > 0", () => {
    expect(xml).toContain("/category/bouquets");
    expect(xml).not.toContain("/category/empty-category");
  });

  it("excludes occasions with count 0 and includes those with count > 0", () => {
    expect(xml).toContain("/occasion/birthday");
    expect(xml).not.toContain("/occasion/empty-occasion");
  });

  it("does not include /llms.txt or /llms-full.txt in the sitemap", () => {
    expect(xml).not.toContain("/llms.txt");
    expect(xml).not.toContain("/llms-full.txt");
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

  it("includes a <lastmod> on every entry", () => {
    const doc = parse(xml);
    const urlNodes = Array.from(doc.getElementsByTagName("url"));
    expect(urlNodes.length).toBeGreaterThan(0);
    for (const url of urlNodes) {
      const lastmod = url.getElementsByTagName("lastmod")[0]?.textContent;
      expect(lastmod).toBe("2026-06-27");
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
