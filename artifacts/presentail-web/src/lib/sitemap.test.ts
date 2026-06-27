import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";

// @ts-expect-error - mjs module without type declarations.
import { buildSitemapXml, generateSitemap } from "../../sitemap.mjs";

const { DOMParser } = new JSDOM().window;

const ORIGIN = "https://new.presentail.com";

// Minimal mock catalog: one entity of each type that has stock and one that is
// empty, so the count filter can be asserted in both directions.
const MOCK = {
  products: [{ slug: "red-roses" }, { slug: null }],
  brands: [{ slug: "acme-flowers" }],
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
  // @ts-expect-error - xmldom Document is structurally compatible for our use.
  return new DOMParser().parseFromString(xml, "text/xml");
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
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    );
    const doc = parse(xml);
    expect(
      doc.documentElement?.getAttribute("xmlns:xhtml"),
    ).toBe("http://www.w3.org/1999/xhtml");
  });

  it("excludes categories with count 0 and includes those with count > 0", () => {
    expect(xml).toContain("/category/bouquets");
    expect(xml).not.toContain("/category/empty-category");
  });

  it("excludes occasions with count 0 and includes those with count > 0", () => {
    expect(xml).toContain("/occasion/birthday");
    expect(xml).not.toContain("/occasion/empty-occasion");
  });

  it("emits hreflang alternates for en/ar/fr + x-default on every <url> with a prefix", () => {
    const doc = parse(xml);
    const urlNodes = Array.from(doc.getElementsByTagName("url"));

    // Locale-prefixed entries (every entry except the three language-agnostic
    // ones: root "/", /llms.txt, /llms-full.txt) must carry alternates.
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
