import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-expect-error - mjs import without types; the module is plain JS.
import { injectSeoTagsAsync, buildSeoHead, parseDimsFromBuffer, initImageDimsDb, genericSeoCache, getCachedGenericSeo, setCachedGenericSeo, collectJsonLdProblems, stripTrackingParams } from "../../seo-inject.mjs";
import { buildProductSeo, buildCategorySeo, buildOccasionSeo, buildBrandSeo } from "../../src/lib/seo.mjs";

const HTML = `<!doctype html><html lang="en"><head><title>Old</title></head><body></body></html>`;

const OPTS = {
  apiBaseUrl: "https://api.test",
  origin: "https://presentail.test",
  basePath: "",
};

function mockFetchOnce(body: unknown, ok = true) {
  const fn = vi.fn().mockResolvedValueOnce({
    ok,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("injectSeoTagsAsync — /product/<slug>", () => {
  it("uses product name, description, image and price when API returns the product", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      product: {
        name: "Velvet Rose Bouquet",
        description: "A dozen long-stem velvet roses, hand-tied.",
        image: { uri: "https://cdn.test/velvet.jpg" },
        priceValue: 89.5,
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/product/velvet-rose-bouquet",
      OPTS,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1); // entity API only — branded og-image used (no CDN image probe)
    expect(fetchMock.mock.calls[0][0]).toContain("/api/woo/product?");
    expect(fetchMock.mock.calls[0][0]).toContain("slug=velvet-rose-bouquet");
    expect(fetchMock.mock.calls[0][0]).toContain("countryCode=AE");
    expect(fetchMock.mock.calls[0][0]).toContain("cityId=ae-dubai");
    expect(out).toContain("<title>Velvet Rose Bouquet — Dubai | Presentail</title>");
    expect(out).toContain(
      'content="A dozen long-stem velvet roses, hand-tied."',
    );
    expect(out).toContain(
      '<meta property="og:image" content="https://presentail.test/api/og-image/product/velvet-rose-bouquet"',
    );
    expect(out).toContain('<meta property="og:type" content="product"');
    // AE market: price is converted from USD to AED (3.6725 peg): 89.5 × 3.6725 = 328.69
    expect(out).toContain(
      '<meta property="product:price:amount" content="328.69"',
    );
    expect(out).toContain(
      '<meta property="product:price:currency" content="AED"',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-ae/dubai/product/velvet-rose-bouquet"',
    );
  });

  it("falls back to the generic product preview when the product 404s", async () => {
    mockFetchOnce({ ok: false }, false);
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/product/missing-product",
      OPTS,
    );
    expect(out).not.toContain("missing-product | Presentail");
    expect(out).toContain("<title>Gift Delivery in Dubai | Presentail</title>");
    expect(out).not.toContain('property="product:price:amount"');
  });

  it("falls back when the API is unreachable (network error)", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/analytics/events")) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      throw new Error("ECONNREFUSED");
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/product/anything",
      OPTS,
    );
    const entityCalls = fetchMock.mock.calls.filter(
      (c) => !String(c[0]).includes("/api/analytics/events"),
    );
    expect(entityCalls).toHaveLength(1);
    expect(out).toContain("<title>Gift Delivery in Dubai | Presentail</title>");
  });
});

describe("injectSeoTagsAsync — /brand/<slug>", () => {
  it("uses brand name, stripped description and image when API returns the brand", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      brand: {
        name: "Acme Florals",
        description:
          "<p>Hand-tied <strong>bouquets</strong> &amp; gifts.</p>",
        image: "https://cdn.test/acme.jpg",
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/brand/acme-florals",
      OPTS,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3); // entity API + image dimension fetch + brand-products count
    expect(fetchMock.mock.calls[0][0]).toContain("/api/woo/brand?");
    expect(fetchMock.mock.calls[0][0]).toContain("slug=acme-florals");
    expect(out).toContain("<title>Acme Florals | Presentail</title>");
    expect(out).toContain(
      'content="Hand-tied bouquets &amp; gifts."',
    );
    expect(out).toContain(
      '<meta property="og:image" content="https://cdn.test/acme.jpg"',
    );
    expect(out).toContain('<meta property="og:type" content="website"');
    expect(out).toContain(
      '<meta name="twitter:card" content="summary_large_image"',
    );
  });

  it("falls back to the generic preview when the brand 404s", async () => {
    mockFetchOnce({ ok: false }, false);
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/brand/missing-brand",
      OPTS,
    );
    expect(out).not.toContain("missing-brand | Presentail");
    expect(out).toContain("<title>Brand Collection in Dubai | Presentail</title>");
    expect(out).toContain(
      'content="Shop this brand\'s full collection for delivery in Dubai, the UAE on Presentail."',
    );
  });

  it("falls back when the API returns ok=false", async () => {
    mockFetchOnce({ ok: false, error: "not_found" }, true);
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/brand/whatever",
      OPTS,
    );
    expect(out).toContain("<title>Brand Collection in Dubai | Presentail</title>");
  });

  it("emits FAQPage JSON-LD with brand name and city substituted", async () => {
    mockFetchOnce({
      ok: true,
      brand: {
        name: "Acme Florals",
        description: "Hand-tied bouquets and gifts.",
        image: null,
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/brand/acme-florals",
      OPTS,
    );
    expect(out).toContain('"@type":"FAQPage"');
    expect(out).toContain('"How do I order Acme Florals delivery in Dubai?"');
    expect(out).toContain('"Is same-day Acme Florals delivery available in Dubai?"');
    expect(out).toContain('"Can I include a personalised message with my Acme Florals order?"');
    expect(out).toContain("Browse the Acme Florals collection above");
    expect(out).toContain("same-day delivery is available in Dubai");
  });

  it("emits FAQPage JSON-LD in Arabic for ar locale brand pages", async () => {
    mockFetchOnce({
      ok: true,
      brand: {
        name: "بستان فلاورز",
        description: "زهور طازجة.",
        image: null,
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/ar-ae/dubai/brand/bustan-flowers",
      OPTS,
    );
    expect(out).toContain('"@type":"FAQPage"');
    expect(out).toContain("كيف أطلب توصيل");
    expect(out).toContain("بستان فلاورز");
  });
});

describe("injectSeoTagsAsync — /shop?n=<slug> category", () => {
  it("uses the category name and description for ?n=<slug>", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      category: {
        name: "Birthday Cakes",
        description: "<p>Same-day cake delivery.</p>",
        image: "https://cdn.test/cakes.jpg",
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "?n=birthday-cakes",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3); // entity API + image dimension fetch + listing products fetch
    expect(fetchMock.mock.calls[0][0]).toContain("/api/woo/category?");
    expect(fetchMock.mock.calls[0][0]).toContain("slug=birthday-cakes");
    expect(out).toContain("<title>Birthday Cakes Delivery in Dubai | Presentail</title>");
    expect(out).toContain('content="Same-day cake delivery."');
    expect(out).toContain(
      '<meta property="og:image" content="https://cdn.test/cakes.jpg"',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-ae/dubai/category/birthday-cakes"',
    );
  });

  it("also recognises the canonical ?category=<slug> alias", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      category: {
        name: "Roses",
        description: "Long-stem roses.",
        image: null,
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-lb/beirut/shop", {
      ...OPTS,
      search: "?category=roses",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // entity API + listing products fetch (no image URL → no dims fetch)
    expect(fetchMock.mock.calls[0][0]).toContain("slug=roses");
    expect(out).toContain("<title>Roses Delivery in Beirut | Presentail</title>");
    // When entity has no image the fallback opengraph.jpg is used → always summary_large_image.
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(out).toContain('<meta property="og:image" content="https://presentail.test/opengraph.jpg"');
  });

  it("falls back to the generic shop preview when no category param is present", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toContain("<title>Shop Flowers &amp; Gifts in Dubai | Presentail</title>");
  });

  it("falls back to the generic shop preview when the category 404s", async () => {
    mockFetchOnce({ ok: false }, false);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "?n=nope",
    });
    expect(out).toContain("<title>Shop Flowers &amp; Gifts in Dubai | Presentail</title>");
  });
});

describe("injectSeoTagsAsync — /shop?occasion=<slug>", () => {
  it("uses the occasion name and description when API returns the occasion", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      occasion: {
        name: "Birthday Gifts",
        description: "<p>Make every birthday memorable.</p>",
        image: "https://cdn.test/birthday.jpg",
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "?occasion=birthday",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // entity API + listing products fetch (branded og-image, no CDN probe)
    expect(fetchMock.mock.calls[0][0]).toContain("/api/woo/occasion?");
    expect(fetchMock.mock.calls[0][0]).toContain("slug=birthday");
    expect(out).toContain("<title>Birthday Gifts Flowers &amp; Gifts in Dubai | Presentail</title>");
    expect(out).toContain('content="Make every birthday memorable."');
    expect(out).toContain(
      '<meta property="og:image" content="https://presentail.test/api/og-image/occasion/birthday"',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-ae/dubai/occasion/birthday"',
    );
  });

  it("falls back to the generic shop preview when the occasion 404s", async () => {
    mockFetchOnce({ ok: false }, false);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "?occasion=nope",
    });
    expect(out).toContain(
      "<title>Shop Flowers &amp; Gifts in Dubai | Presentail</title>",
    );
  });

  it("falls back when the occasion API is unreachable", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/analytics/events")) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      throw new Error("ETIMEDOUT");
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "?occasion=anniversary",
    });
    const entityCalls = fetchMock.mock.calls.filter(
      (c) => !String(c[0]).includes("/api/analytics/events"),
    );
    expect(entityCalls).toHaveLength(1);
    expect(out).toContain(
      "<title>Shop Flowers &amp; Gifts in Dubai | Presentail</title>",
    );
  });

  it("prefers the category param over the occasion param", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      category: { name: "Roses", description: "Long-stem roses.", image: null },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "?category=roses&occasion=birthday",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // entity API + listing products fetch (image null → no dims fetch)
    expect(fetchMock.mock.calls[0][0]).toContain("/api/woo/category?");
    expect(fetchMock.mock.calls[0][0]).not.toContain("/api/woo/occasion");
    expect(out).toContain("<title>Roses Delivery in Dubai | Presentail</title>");
  });

  it("serves occasion from entity cache on second call within TTL (no extra API call)", async () => {
    const pngBuf = makePngBuffer(800, 533);
    const imageUrl = "https://cdn.cache-hit-test/occasion-cache-hit-unique.png";
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/occasion-products")) {
        // SEO listing fetch — not counted as an entity or dims fetch.
        return { ok: true, json: async () => ({ ok: true, groups: [] }) };
      }
      if (u.includes("/api/woo/occasion")) {
        entityFetchCount++;
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            ok: true,
            occasion: {
              name: "Cache Hit Occasion",
              description: "Occasion served from cache on second call.",
              image: imageUrl,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const callOpts = {
      apiBaseUrl: "https://api.cache-hit-test",
      origin: "https://presentail.cache-hit-test",
      basePath: "",
      search: "?occasion=cache-hit-occasion-unique-slug",
    };

    // First call (miss): entity fetched from API and cached.
    const out1 = await injectSeoTagsAsync(
      CACHE_INV_HTML,
      "/en-ae/dubai/shop",
      callOpts,
    );
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(0); // branded og-image used — no CDN image probe
    expect(out1).toContain("<title>Cache Hit Occasion Flowers &amp; Gifts in Dubai | Presentail</title>");

    // Second call immediately (TTL not expired, no ETag): served from cache.
    const out2 = await injectSeoTagsAsync(
      CACHE_INV_HTML,
      "/en-ae/dubai/shop",
      callOpts,
    );
    expect(entityFetchCount).toBe(1); // entity served from cache
    expect(dimsFetchCount).toBe(0);   // still 0 — branded og-image, no probe
    expect(out2).toContain("<title>Cache Hit Occasion Flowers &amp; Gifts in Dubai | Presentail</title>");

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("strips tracking params from the canonical when /shop?occasion=<slug>&gclid=<id>", async () => {
    mockFetchOnce({
      ok: true,
      occasion: {
        name: "Birthday Gifts",
        description: "<p>Make every birthday memorable.</p>",
        image: null,
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "?occasion=birthday&gclid=abc123",
    });
    expect(out).toContain(
      'rel="canonical" href="https://presentail.test/en-ae/dubai/occasion/birthday"',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-ae/dubai/occasion/birthday"',
    );
    expect(out).not.toContain("gclid");
  });
});

describe("injectSeoTagsAsync — /occasion/:slug (clean path)", () => {
  const CLEAN_PATH_OPTS = { ...OPTS, apiBaseUrl: "https://api.clean-path-test" };

  it("fetches occasion and emits rich SEO tags for /occasion/birthday path", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      occasion: {
        name: "Birthday Gifts",
        description: "<p>Make every birthday memorable.</p>",
        image: "https://cdn.test/birthday-clean.jpg",
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/occasion/birthday-path-unique",
      CLEAN_PATH_OPTS,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2); // entity API + listing products fetch (branded og-image, no CDN probe)
    expect(fetchMock.mock.calls[0][0]).toContain("/api/woo/occasion?");
    expect(fetchMock.mock.calls[0][0]).toContain("slug=birthday-path-unique");
    expect(out).toContain("<title>Birthday Gifts Flowers &amp; Gifts in Dubai | Presentail</title>");
    expect(out).toContain('content="Make every birthday memorable."');
    expect(out).toContain(
      '<meta property="og:image" content="https://presentail.test/api/og-image/occasion/birthday-path-unique"',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-ae/dubai/occasion/birthday-path-unique"',
    );
    expect(out).toContain(
      'rel="canonical" href="https://presentail.test/en-ae/dubai/occasion/birthday-path-unique"',
    );
  });

  it("falls back to the generic locale preview when the occasion 404s on the clean path", async () => {
    mockFetchOnce({ ok: false }, false);
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/occasion/nope-clean",
      CLEAN_PATH_OPTS,
    );
    // The clean /occasion/<slug> path falls back to the city-level generic page title.
    expect(out).toContain("Dubai | Presentail");
  });
});

describe("injectSeoTagsAsync — /category/:slug (clean path)", () => {
  const CLEAN_PATH_OPTS = { ...OPTS, apiBaseUrl: "https://api.clean-cat-test" };

  it("fetches category and emits rich SEO tags for /category/hand-bouquets path", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      category: {
        name: "Hand Bouquets",
        description: "<p>Beautiful hand-tied bouquets.</p>",
        image: "https://cdn.test/bouquets-clean.jpg",
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-lb/beirut/category/hand-bouquets-path-unique",
      CLEAN_PATH_OPTS,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3); // entity API + image dimension fetch + listing products fetch
    expect(fetchMock.mock.calls[0][0]).toContain("/api/woo/category?");
    expect(fetchMock.mock.calls[0][0]).toContain("slug=hand-bouquets-path-unique");
    expect(fetchMock.mock.calls[0][0]).toContain("countryCode=LB");
    expect(fetchMock.mock.calls[0][0]).toContain("cityId=lb-beirut");
    expect(out).toContain("<title>Hand Bouquets Delivery in Beirut | Presentail</title>");
    expect(out).toContain('content="Beautiful hand-tied bouquets."');
    expect(out).toContain(
      '<meta property="og:image" content="https://cdn.test/bouquets-clean.jpg"',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-lb/beirut/category/hand-bouquets-path-unique"',
    );
    expect(out).toContain(
      'rel="canonical" href="https://presentail.test/en-lb/beirut/category/hand-bouquets-path-unique"',
    );
  });

  it("falls back to the generic locale preview when the category 404s on the clean path", async () => {
    mockFetchOnce({ ok: false }, false);
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-lb/beirut/category/nope-clean",
      CLEAN_PATH_OPTS,
    );
    // The clean /category/<slug> path falls back to the city-level generic page title.
    expect(out).toContain("Beirut | Presentail");
  });

  it("legacy /shop?category=<slug> canonical redirects to clean path in og:url", async () => {
    mockFetchOnce({
      ok: true,
      category: {
        name: "Hand Bouquets",
        description: "Beautiful bouquets.",
        image: null,
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-lb/beirut/shop", {
      ...CLEAN_PATH_OPTS,
      search: "?category=hand-bouquets-legacy-unique",
    });
    expect(out).toContain("<title>Hand Bouquets Delivery in Beirut | Presentail</title>");
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-lb/beirut/category/hand-bouquets-legacy-unique"',
    );
    expect(out).toContain(
      'rel="canonical" href="https://presentail.test/en-lb/beirut/category/hand-bouquets-legacy-unique"',
    );
  });

  it("strips tracking params from the canonical when /shop?category=<slug>&gclid=<id>", async () => {
    mockFetchOnce({
      ok: true,
      category: {
        name: "Hand Bouquets",
        description: "Beautiful bouquets.",
        image: null,
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-lb/beirut/shop", {
      ...CLEAN_PATH_OPTS,
      search: "?category=hand-bouquets-tracking-unique&gclid=xyz789",
    });
    expect(out).toContain(
      'rel="canonical" href="https://presentail.test/en-lb/beirut/category/hand-bouquets-tracking-unique"',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-lb/beirut/category/hand-bouquets-tracking-unique"',
    );
    expect(out).not.toContain("gclid");
  });

  it("strips tracking params from the canonical when /shop?n=<slug>&gclid=<id>", async () => {
    mockFetchOnce({
      ok: true,
      category: {
        name: "Hand Bouquets",
        description: "Beautiful bouquets.",
        image: null,
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-lb/beirut/shop", {
      ...CLEAN_PATH_OPTS,
      search: "?n=hand-bouquets-n-tracking-unique&gclid=xyz789",
    });
    expect(out).toContain(
      'rel="canonical" href="https://presentail.test/en-lb/beirut/category/hand-bouquets-n-tracking-unique"',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-lb/beirut/category/hand-bouquets-n-tracking-unique"',
    );
    expect(out).not.toContain("gclid");
  });
});

describe("injectSeoTagsAsync — /brands?category=<slug>", () => {
  it("uses the category name and image when filtering brands by category", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      category: {
        name: "Tulips",
        description: "<p>Fresh tulips.</p>",
        image: "https://cdn.test/tulips.jpg",
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/brands", {
      ...OPTS,
      search: "?category=tulips",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // entity API + image dimension fetch
    expect(fetchMock.mock.calls[0][0]).toContain("/api/woo/category?");
    expect(fetchMock.mock.calls[0][0]).toContain("slug=tulips");
    expect(out).toContain("<title>Tulips Brands in Dubai | Presentail</title>");
    expect(out).toContain('content="Fresh tulips."');
    expect(out).toContain(
      '<meta property="og:image" content="https://cdn.test/tulips.jpg"',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-ae/dubai/brands?category=tulips"',
    );
  });

  it("accepts the ?n=<slug> alias and falls back to a localized description when none is provided", async () => {
    mockFetchOnce({
      ok: true,
      category: { name: "Cakes", description: "", image: null },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-lb/beirut/brands", {
      ...OPTS,
      search: "?n=cakes",
    });
    expect(out).toContain("<title>Cakes Brands in Beirut | Presentail</title>");
    expect(out).toContain(
      'content="Discover Presentail\'s hand-picked partner brands offering Cakes for delivery in Beirut, Lebanon."',
    );
    // No entity image → fallback opengraph.jpg → always summary_large_image.
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image"');
  });

  it("uses the occasion endpoint when filtering brands by occasion", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      occasion: {
        name: "Birthday",
        description: "Birthday gifts.",
        image: "https://cdn.test/bd.jpg",
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/brands", {
      ...OPTS,
      search: "?occasion=birthday-brands-unique",
    });
    expect(fetchMock.mock.calls[0][0]).toContain("/api/woo/occasion?");
    expect(out).toContain(
      "<title>Birthday Brands in Dubai | Presentail</title>",
    );
  });

  it("falls back to the generic brands preview when the category 404s", async () => {
    mockFetchOnce({ ok: false }, false);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/brands", {
      ...OPTS,
      search: "?category=missing",
    });
    expect(out).toContain(
      "<title>Partner Brands in Dubai | Presentail</title>",
    );
  });

  it("falls back to the generic brands preview when no filter is present", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/brands", {
      ...OPTS,
      search: "",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toContain(
      "<title>Partner Brands in Dubai | Presentail</title>",
    );
  });
});

describe("injectSeoTagsAsync — entity hreflang gating (per-country availability)", () => {
  // Reusable mock: succeeds for any entity or listing fetch, fails image dims.
  function makeFetchMock(entityKey: string, entityBody: unknown) {
    return vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes(entityKey)) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => entityBody,
        };
      }
      // listing products, brand-products, etc.
      if (
        u.includes("/api/woo/category-products") ||
        u.includes("/api/woo/occasion-products") ||
        u.includes("/api/woo/brand-products")
      ) {
        return { ok: true, json: async () => ({ ok: true, count: 5, products: [], groups: [] }) };
      }
      // Analytics events — swallow silently.
      if (u.includes("/api/analytics/events")) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      // Image dims and anything else — fail so dims resolve to null.
      return { ok: false, status: 404 };
    });
  }

  it("product: emits hreflang only for requesting country when other countries are cold cache", async () => {
    const slug = "hrl-gating-product-cold-1";
    const fetchMock = makeFetchMock("/api/woo/product", {
      ok: true,
      product: { name: "Test Rose", description: "A rose.", image: { uri: "" }, priceValue: 50 },
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(HTML, `/en-lb/beirut/product/${slug}`, OPTS);

    // Requesting country (LB) — always included with all 3 locale alternates + x-default.
    expect(out).toContain('hreflang="en-LB"');
    expect(out).toContain('hreflang="ar-LB"');
    expect(out).toContain('hreflang="fr-LB"');
    expect(out).toContain('hreflang="x-default"');

    // Other countries (AE, CY) — cold cache → must be absent.
    expect(out).not.toContain('hreflang="en-AE"');
    expect(out).not.toContain('hreflang="ar-AE"');
    expect(out).not.toContain('hreflang="en-CY"');
    expect(out).not.toContain('hreflang="ar-CY"');
  });

  it("product: includes all 3 countries once all are warm in the entity cache", async () => {
    const slug = "hrl-gating-product-warm-1";
    const fetchMock = makeFetchMock("/api/woo/product", {
      ok: true,
      product: { name: "Warm Rose", description: "A rose.", image: { uri: "" }, priceValue: 50 },
    });
    vi.stubGlobal("fetch", fetchMock);

    // Pre-warm LB and CY entity cache entries with their canonical cities.
    await injectSeoTagsAsync(HTML, `/en-lb/beirut/product/${slug}`, OPTS);
    await injectSeoTagsAsync(HTML, `/en-cy/limassol/product/${slug}`, OPTS);

    // AE request — LB and CY entries are now in cache with canonical city keys.
    const out = await injectSeoTagsAsync(HTML, `/en-ae/dubai/product/${slug}`, OPTS);

    expect(out).toContain('hreflang="en-LB"');
    expect(out).toContain('hreflang="en-AE"');
    expect(out).toContain('hreflang="en-CY"');
    // x-default always points at en-lb/beirut.
    expect(out).toContain(
      `href="https://presentail.test/en-lb/beirut/product/${slug}"`,
    );
    // All 9 locale alternates (3 langs × 3 countries) plus x-default.
    expect(out).toContain('hreflang="ar-LB"');
    expect(out).toContain('hreflang="fr-AE"');
    expect(out).toContain('hreflang="ar-CY"');
  });

  it("product: hreflang href contains encoded slug", async () => {
    const slug = "hrl-gating-product-warm-2";
    const fetchMock = makeFetchMock("/api/woo/product", {
      ok: true,
      product: { name: "Warm Rose", description: "", image: { uri: "" }, priceValue: 50 },
    });
    vi.stubGlobal("fetch", fetchMock);
    await injectSeoTagsAsync(HTML, `/en-lb/beirut/product/${slug}`, OPTS);
    const out = await injectSeoTagsAsync(HTML, `/en-lb/beirut/product/${slug}`, OPTS);
    expect(out).toContain(`href="https://presentail.test/en-lb/beirut/product/${slug}"`);
  });

  it("brand: emits hreflang only for requesting country when other countries are cold cache", async () => {
    const slug = "hrl-gating-brand-cold-1";
    const fetchMock = makeFetchMock("/api/woo/brand", {
      ok: true,
      brand: { name: "Test Brand", description: "", image: null },
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(HTML, `/en-ae/dubai/brand/${slug}`, OPTS);

    expect(out).toContain('hreflang="en-AE"');
    expect(out).toContain('hreflang="ar-AE"');
    expect(out).toContain('hreflang="fr-AE"');
    expect(out).not.toContain('hreflang="en-LB"');
    expect(out).not.toContain('hreflang="en-CY"');
    // x-default still emitted (points at en-lb/beirut even if LB cold — it's the canonical default locale).
    expect(out).toContain('hreflang="x-default"');
  });

  it("brand: includes all 3 countries once all are warm in entity cache", async () => {
    const slug = "hrl-gating-brand-warm-1";
    const fetchMock = makeFetchMock("/api/woo/brand", {
      ok: true,
      brand: { name: "Warm Brand", description: "", image: null },
    });
    vi.stubGlobal("fetch", fetchMock);

    await injectSeoTagsAsync(HTML, `/en-lb/beirut/brand/${slug}`, OPTS);
    await injectSeoTagsAsync(HTML, `/en-ae/dubai/brand/${slug}`, OPTS);
    const out = await injectSeoTagsAsync(HTML, `/en-cy/limassol/brand/${slug}`, OPTS);

    expect(out).toContain('hreflang="en-LB"');
    expect(out).toContain('hreflang="en-AE"');
    expect(out).toContain('hreflang="en-CY"');
  });

  it("category: emits hreflang only for requesting country when cold cache", async () => {
    const slug = "hrl-gating-category-cold-1";
    const fetchMock = makeFetchMock("/api/woo/category", {
      ok: true,
      category: { name: "Roses", description: "", image: null },
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(HTML, `/en-lb/beirut/category/${slug}`, OPTS);

    expect(out).toContain('hreflang="en-LB"');
    expect(out).not.toContain('hreflang="en-AE"');
    expect(out).not.toContain('hreflang="en-CY"');
    expect(out).toContain(`href="https://presentail.test/en-lb/beirut/category/${slug}"`);
  });

  it("occasion: emits hreflang only for requesting country when cold cache", async () => {
    const slug = "hrl-gating-occasion-cold-1";
    const fetchMock = makeFetchMock("/api/woo/occasion", {
      ok: true,
      occasion: { name: "Birthday", description: "", image: null },
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(HTML, `/en-ae/dubai/occasion/${slug}`, OPTS);

    expect(out).toContain('hreflang="en-AE"');
    expect(out).not.toContain('hreflang="en-LB"');
    expect(out).not.toContain('hreflang="en-CY"');
    expect(out).toContain(`href="https://presentail.test/en-ae/dubai/occasion/${slug}"`);
  });

  it("occasion: includes all 3 countries once all are warm in entity cache", async () => {
    const slug = "hrl-gating-occasion-warm-1";
    const fetchMock = makeFetchMock("/api/woo/occasion", {
      ok: true,
      occasion: { name: "Anniversary", description: "", image: null },
    });
    vi.stubGlobal("fetch", fetchMock);

    await injectSeoTagsAsync(HTML, `/en-lb/beirut/occasion/${slug}`, OPTS);
    await injectSeoTagsAsync(HTML, `/en-cy/limassol/occasion/${slug}`, OPTS);
    const out = await injectSeoTagsAsync(HTML, `/en-ae/dubai/occasion/${slug}`, OPTS);

    expect(out).toContain('hreflang="en-LB"');
    expect(out).toContain('hreflang="en-AE"');
    expect(out).toContain('hreflang="en-CY"');
  });

  it("brandsFilter (/brands?category=<slug>) does NOT emit entity-gated hreflang", async () => {
    // brands-filter pages (/brands?category=<slug>) use buildBrandsFilterHead which
    // overrides the generic headSnippet entirely. My implementation only adds
    // hreflang gating to the product/brand/category/occasion branches, not to
    // brandsFilter. Since buildBrandsFilterHead does not include hreflang,
    // these pages end up with no hreflang alternates at all.
    const fetchMock = makeFetchMock("/api/woo/category", {
      ok: true,
      category: { name: "Luxury Brands", description: "", image: null },
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/brands", {
      ...OPTS,
      search: "?category=hrl-gating-bf-cold-1",
    });

    // brands-filter headSnippet does not include any hreflang tags.
    expect(out).not.toContain('hreflang="en-AE"');
    expect(out).not.toContain('hreflang="en-LB"');
    expect(out).not.toContain('hreflang="en-CY"');
    expect(out).not.toContain('hreflang="x-default"');
  });
});

describe("buildSeoHead — city slug allowlist", () => {
  it("emits localized canonical/hreflang for a supported AE city slug", () => {
    const out = buildSeoHead("/en-ae/ras-al-khaimah/shop", {
      origin: "https://presentail.test",
      basePath: "",
    });
    expect(out.headSnippet).toContain(
      'rel="canonical" href="https://presentail.test/en-ae/ras-al-khaimah/shop"',
    );
    expect(out.headSnippet).toContain('hreflang="en-AE"');
    expect(out.headSnippet).toContain('hreflang="ar-AE"');
    expect(out.headSnippet).toContain('hreflang="x-default"');
    expect(out.cityLabel).toBe("Ras Al Khaimah");
  });

  it("treats /en-ae/al-ain/... as out-of-locale (no localized canonical/hreflang, no city label)", () => {
    const out = buildSeoHead("/en-ae/al-ain/shop", {
      origin: "https://presentail.test",
      basePath: "",
    });
    // Falls back to landing canonical at "/" since the city is unsupported.
    expect(out.headSnippet).toContain(
      'rel="canonical" href="https://presentail.test/"',
    );
    expect(out.headSnippet).not.toContain("/en-ae/al-ain");
    expect(out.headSnippet).not.toContain("hreflang=");
    expect(out.cityLabel).toBe("");
    expect(out.titleTag).not.toContain("Al Ain");
    expect(out.titleTag).not.toContain("Al-Ain");
  });
});

describe("buildSeoHead — hreflang alternates (full 10-alternate set)", () => {
  const ORIGIN = "https://presentail.com";
  const OPTS_FULL = { origin: ORIGIN, basePath: "" };

  function getAlternates(headSnippet: string): Array<{ hreflang: string; href: string }> {
    const re = /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g;
    const results: Array<{ hreflang: string; href: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(headSnippet)) !== null) {
      results.push({ hreflang: m[1], href: m[2] });
    }
    return results;
  }

  beforeEach(() => {
    genericSeoCache.clear();
  });

  it("emits exactly 10 alternates for /en-lb/tripoli/shop (all 9 locales + x-default)", () => {
    const { headSnippet } = buildSeoHead("/en-lb/tripoli/shop", OPTS_FULL);
    const alts = getAlternates(headSnippet);
    expect(alts).toHaveLength(10);
    expect(alts.map((a) => a.hreflang)).toEqual([
      "en-LB", "ar-LB", "fr-LB",
      "en-AE", "ar-AE", "fr-AE",
      "en-CY", "ar-CY", "fr-CY",
      "x-default",
    ]);
  });

  it("uses canonical cities (not the browsed city) when building alternate hrefs — /en-ae/dubai/shop", () => {
    const { headSnippet } = buildSeoHead("/en-ae/dubai/shop", OPTS_FULL);
    const alts = getAlternates(headSnippet);
    expect(alts).toHaveLength(10);
    const byHreflang = Object.fromEntries(alts.map((a) => [a.hreflang, a.href]));
    expect(byHreflang["en-LB"]).toBe(`${ORIGIN}/en-lb/beirut/shop`);
    expect(byHreflang["ar-LB"]).toBe(`${ORIGIN}/ar-lb/beirut/shop`);
    expect(byHreflang["fr-LB"]).toBe(`${ORIGIN}/fr-lb/beirut/shop`);
    expect(byHreflang["en-AE"]).toBe(`${ORIGIN}/en-ae/dubai/shop`);
    expect(byHreflang["ar-AE"]).toBe(`${ORIGIN}/ar-ae/dubai/shop`);
    expect(byHreflang["fr-AE"]).toBe(`${ORIGIN}/fr-ae/dubai/shop`);
    expect(byHreflang["en-CY"]).toBe(`${ORIGIN}/en-cy/limassol/shop`);
    expect(byHreflang["ar-CY"]).toBe(`${ORIGIN}/ar-cy/limassol/shop`);
    expect(byHreflang["fr-CY"]).toBe(`${ORIGIN}/fr-cy/limassol/shop`);
    expect(byHreflang["x-default"]).toBe(`${ORIGIN}/en-lb/beirut/shop`);
  });

  it("emits zero alternates for /en-lb/beirut/checkout (noindex guard)", () => {
    const { headSnippet } = buildSeoHead("/en-lb/beirut/checkout", OPTS_FULL);
    const alts = getAlternates(headSnippet);
    expect(alts).toHaveLength(0);
  });

  it("x-default always points to en-lb/beirut/{entityPath} regardless of requesting locale", () => {
    const paths = [
      { path: "/en-lb/tripoli/shop", entity: "shop" },
      { path: "/ar-lb/beirut/shop", entity: "shop" },
      { path: "/fr-ae/dubai/shop", entity: "shop" },
      { path: "/en-cy/limassol/shop", entity: "shop" },
    ];
    for (const { path, entity } of paths) {
      genericSeoCache.clear();
      const { headSnippet } = buildSeoHead(path, OPTS_FULL);
      const alts = getAlternates(headSnippet);
      const xDefault = alts.find((a) => a.hreflang === "x-default");
      expect(xDefault, `x-default missing for ${path}`).toBeDefined();
      expect(xDefault!.href).toBe(`${ORIGIN}/en-lb/beirut/${entity}`);
    }
  });

  it("alternates for an unknown sub-route point to locale homes (soft-404 guard)", () => {
    const { headSnippet } = buildSeoHead("/en-lb/beirut/some-unknown-route", OPTS_FULL);
    const alts = getAlternates(headSnippet);
    expect(alts).toHaveLength(10);
    const byHreflang = Object.fromEntries(alts.map((a) => [a.hreflang, a.href]));
    expect(byHreflang["en-LB"]).toBe(`${ORIGIN}/en-lb/beirut`);
    expect(byHreflang["ar-LB"]).toBe(`${ORIGIN}/ar-lb/beirut`);
    expect(byHreflang["fr-LB"]).toBe(`${ORIGIN}/fr-lb/beirut`);
    expect(byHreflang["en-AE"]).toBe(`${ORIGIN}/en-ae/dubai`);
    expect(byHreflang["ar-AE"]).toBe(`${ORIGIN}/ar-ae/dubai`);
    expect(byHreflang["fr-AE"]).toBe(`${ORIGIN}/fr-ae/dubai`);
    expect(byHreflang["en-CY"]).toBe(`${ORIGIN}/en-cy/limassol`);
    expect(byHreflang["ar-CY"]).toBe(`${ORIGIN}/ar-cy/limassol`);
    expect(byHreflang["fr-CY"]).toBe(`${ORIGIN}/fr-cy/limassol`);
    expect(byHreflang["x-default"]).toBe(`${ORIGIN}/en-lb/beirut`);
  });
});

describe("buildSeoHead — route-dependent og:/twitter: share copy", () => {
  const ORIGIN_OPTS = { origin: "https://presentail.test", basePath: "" };

  // Extract the content of a single <meta> tag by its property/name selector.
  function getMeta(head: string, selector: string): string | null {
    const re = new RegExp(`<meta ${selector} content="([^"]*)"`);
    const m = head.match(re);
    return m ? m[1] : null;
  }

  beforeEach(() => {
    // buildSeoHead memoizes by (pathname, basePath, origin); clear between
    // cases so each assertion exercises a fresh compute.
    genericSeoCache.clear();
  });

  it("landing (/) uses the dedicated short landing OG/Twitter copy, not the long page title", () => {
    const { headSnippet, title } = buildSeoHead("/", ORIGIN_OPTS);
    expect(title).toBe(
      "Online Flower & Gift Delivery | Presentail | Express Delivery",
    );
    expect(getMeta(headSnippet, 'property="og:title"')).toBe(
      "Online Flower &amp; Gift Delivery | Presentail",
    );
    expect(getMeta(headSnippet, 'property="og:description"')).toBe(
      "Order flowers, cakes, balloons and gifts online with Presentail. Express same-day delivery available in Lebanon, UAE, and Cyprus.",
    );
    expect(getMeta(headSnippet, 'name="twitter:title"')).toBe(
      "Online Flower &amp; Gift Delivery | Presentail",
    );
    expect(getMeta(headSnippet, 'name="twitter:description"')).toBe(
      "Send flowers and gifts online with Presentail. Express same-day delivery in Lebanon, UAE, and Cyprus.",
    );
  });

  it("EN locale home (/en-lb/beirut) uses the dedicated home OG/Twitter copy with {city} resolved", () => {
    const { headSnippet, title } = buildSeoHead("/en-lb/beirut", ORIGIN_OPTS);
    // The page <title> keeps the longer template…
    expect(title).toBe("Flower & Gift Delivery in Beirut | Presentail");
    // …while og:/twitter: use the dedicated shorter home copy.
    expect(getMeta(headSnippet, 'property="og:title"')).toBe(
      "Flowers &amp; Gifts in Beirut | Presentail",
    );
    expect(getMeta(headSnippet, 'property="og:description"')).toBe(
      "Send flowers, cakes and gifts in Beirut with same-day delivery from Presentail.",
    );
    expect(getMeta(headSnippet, 'name="twitter:title"')).toBe(
      "Flowers &amp; Gifts in Beirut | Presentail",
    );
    expect(getMeta(headSnippet, 'name="twitter:description"')).toBe(
      "Send flowers and gifts in Beirut — same-day delivery by Presentail.",
    );
  });

  it("AR locale home (/ar-lb/beirut) uses the Arabic home copy with the Arabic city name", () => {
    const { headSnippet } = buildSeoHead("/ar-lb/beirut", ORIGIN_OPTS);
    expect(getMeta(headSnippet, 'property="og:title"')).toBe(
      "الأزهار والهدايا في بيروت | Presentail",
    );
    expect(getMeta(headSnippet, 'property="og:description"')).toBe(
      "أرسل الأزهار والكعك والهدايا في بيروت مع توصيل في نفس اليوم من Presentail.",
    );
    expect(getMeta(headSnippet, 'name="twitter:title"')).toBe(
      "الأزهار والهدايا في بيروت | Presentail",
    );
    expect(getMeta(headSnippet, 'name="twitter:description"')).toBe(
      "أرسل الأزهار والهدايا في بيروت — توصيل في نفس اليوم من Presentail.",
    );
  });

  it("AR Lebanon route (/ar-lb/beirut/shop) emits og:locale = ar_LB", () => {
    const { headSnippet } = buildSeoHead("/ar-lb/beirut/shop", ORIGIN_OPTS);
    expect(getMeta(headSnippet, 'property="og:locale"')).toBe("ar_LB");
  });

  it("AR UAE route (/ar-ae/dubai/shop) emits og:locale = ar_AE", () => {
    const { headSnippet } = buildSeoHead("/ar-ae/dubai/shop", ORIGIN_OPTS);
    expect(getMeta(headSnippet, 'property="og:locale"')).toBe("ar_AE");
  });

  it("AR Cyprus route (/ar-cy/nicosia/shop) emits og:locale = ar_CY", () => {
    const { headSnippet } = buildSeoHead("/ar-cy/nicosia/shop", ORIGIN_OPTS);
    expect(getMeta(headSnippet, 'property="og:locale"')).toBe("ar_CY");
  });

  it("EN Lebanon route (/en-lb/beirut/shop) emits og:locale = en_US", () => {
    const { headSnippet } = buildSeoHead("/en-lb/beirut/shop", ORIGIN_OPTS);
    expect(getMeta(headSnippet, 'property="og:locale"')).toBe("en_US");
  });

  it("FR Lebanon route (/fr-lb/beirut/shop) emits og:locale = fr_FR", () => {
    const { headSnippet } = buildSeoHead("/fr-lb/beirut/shop", ORIGIN_OPTS);
    expect(getMeta(headSnippet, 'property="og:locale"')).toBe("fr_FR");
  });

  it("FR locale home (/fr-lb/beirut) uses the French home copy with the French city name", () => {
    const { headSnippet } = buildSeoHead("/fr-lb/beirut", ORIGIN_OPTS);
    expect(getMeta(headSnippet, 'property="og:title"')).toBe(
      "Fleurs et cadeaux à Beyrouth | Presentail",
    );
    expect(getMeta(headSnippet, 'property="og:description"')).toBe(
      "Envoyez fleurs, gâteaux et cadeaux à Beyrouth avec la livraison le jour même par Presentail.",
    );
    expect(getMeta(headSnippet, 'name="twitter:title"')).toBe(
      "Fleurs et cadeaux à Beyrouth | Presentail",
    );
    expect(getMeta(headSnippet, 'name="twitter:description"')).toBe(
      "Envoyez fleurs et cadeaux à Beyrouth — livraison le jour même par Presentail.",
    );
  });

  it("soft-404 sub-route (/en-lb/beirut/<unknown>) falls back to the page title/description, NOT the dedicated home copy", () => {
    const { headSnippet, title } = buildSeoHead(
      "/en-lb/beirut/some-unknown-route",
      ORIGIN_OPTS,
    );
    // detectRouteKey falls back to "home" but isUnknownSubRoute disables the
    // dedicated home OG copy, so og:/twitter: mirror the page title/description.
    expect(title).toBe("Flower & Gift Delivery in Beirut | Presentail");
    const expectedTitle = "Flower &amp; Gift Delivery in Beirut | Presentail";
    expect(getMeta(headSnippet, 'property="og:title"')).toBe(expectedTitle);
    expect(getMeta(headSnippet, 'name="twitter:title"')).toBe(expectedTitle);
    // It must NOT use the dedicated home share title.
    expect(getMeta(headSnippet, 'property="og:title"')).not.toBe(
      "Flowers &amp; Gifts in Beirut | Presentail",
    );
    const expectedDesc =
      "Send flowers, cakes, balloons, plants, chocolates and gifts online in Beirut. Express same-day delivery available with Presentail.";
    expect(getMeta(headSnippet, 'property="og:description"')).toBe(expectedDesc);
    expect(getMeta(headSnippet, 'name="twitter:description"')).toBe(
      expectedDesc,
    );
    // Canonical must point to the locale home, NOT the unknown subroute.
    // The client SeoHead mirrors this guard via isUnknownSubRoute.
    expect(headSnippet).toContain(
      'rel="canonical" href="https://presentail.test/en-lb/beirut"',
    );
    // The canonical link specifically must not contain the unknown subroute.
    const canonicalMatch = headSnippet.match(/<link[^>]+rel="canonical"[^>]*>/);
    expect(canonicalMatch?.[0]).not.toContain("/some-unknown-route");
  });

  it("shop route (/en-lb/beirut/shop) uses the dedicated shorter GENERIC_OG share copy", () => {
    const { headSnippet, title } = buildSeoHead(
      "/en-lb/beirut/shop",
      ORIGIN_OPTS,
    );
    // Shop now has a dedicated GENERIC_OG entry so OG/Twitter use shorter,
    // more share-friendly copy — matching the client-side SeoHead behaviour
    // and eliminating the server/client metadata divergence.
    expect(title).toBe("Shop Flowers & Gifts in Beirut | Presentail");
    const expectedTitle = "Shop Flowers &amp; Gifts in Beirut | Presentail";
    expect(getMeta(headSnippet, 'property="og:title"')).toBe(expectedTitle);
    expect(getMeta(headSnippet, 'name="twitter:title"')).toBe(expectedTitle);
    // OG description uses the dedicated shorter share copy.
    expect(getMeta(headSnippet, 'property="og:description"')).toBe(
      "Browse curated bouquets, cakes and luxury gifts in Beirut with same-day delivery from Presentail.",
    );
    // Twitter description uses its own shorter variant.
    expect(getMeta(headSnippet, 'name="twitter:description"')).toBe(
      "Shop flowers, cakes and gifts in Beirut — same-day delivery by Presentail.",
    );
  });

  it("category fallback (/en-lb/beirut/category/<slug>) uses the dedicated short category OG/Twitter copy", () => {
    // buildSeoHead returns the generic head used when the per-entity category
    // lookup is unavailable; it must carry the shorter generic category copy
    // rather than the long page title/description.
    const { headSnippet, title } = buildSeoHead(
      "/en-lb/beirut/category/roses",
      ORIGIN_OPTS,
    );
    // The page <title> keeps the longer template…
    expect(title).toBe("Gift Delivery in Beirut | Presentail");
    // …while og:/twitter: use the dedicated shorter category copy.
    expect(getMeta(headSnippet, 'property="og:title"')).toBe(
      "Shop Gifts by Category in Beirut | Presentail",
    );
    expect(getMeta(headSnippet, 'property="og:description"')).toBe(
      "Browse Presentail's gift categories in Beirut with same-day delivery.",
    );
    expect(getMeta(headSnippet, 'name="twitter:title"')).toBe(
      "Shop Gifts by Category in Beirut | Presentail",
    );
    expect(getMeta(headSnippet, 'name="twitter:description"')).toBe(
      "Browse gifts by category in Beirut — same-day delivery by Presentail.",
    );
  });

  it("AR category fallback (/ar-lb/beirut/category/<slug>) uses the Arabic category copy", () => {
    const { headSnippet } = buildSeoHead(
      "/ar-lb/beirut/category/roses",
      ORIGIN_OPTS,
    );
    expect(getMeta(headSnippet, 'property="og:title"')).toBe(
      "تسوّق الهدايا حسب الفئة في بيروت | Presentail",
    );
    expect(getMeta(headSnippet, 'name="twitter:description"')).toBe(
      "تصفّح الهدايا حسب الفئة في بيروت — توصيل في نفس اليوم من Presentail.",
    );
  });

  it("FR category fallback (/fr-lb/beirut/category/<slug>) uses the French category copy", () => {
    const { headSnippet } = buildSeoHead(
      "/fr-lb/beirut/category/roses",
      ORIGIN_OPTS,
    );
    expect(getMeta(headSnippet, 'property="og:title"')).toBe(
      "Acheter des cadeaux par catégorie à Beyrouth | Presentail",
    );
    expect(getMeta(headSnippet, 'name="twitter:description"')).toBe(
      "Parcourez les cadeaux par catégorie à Beyrouth — livraison le jour même par Presentail.",
    );
  });
});

describe("buildSeoHead — OG image dimensions and alt tags on generic pages", () => {
  it("always emits og:image pointing to /opengraph.jpg on a landing-page path", () => {
    const { headSnippet } = buildSeoHead("/", {
      origin: "https://presentail.test",
      basePath: "",
    });
    expect(headSnippet).toContain(
      'property="og:image" content="https://presentail.test/opengraph.jpg"',
    );
  });

  it("emits og:image:width = 1280 on a generic locale page", () => {
    const { headSnippet } = buildSeoHead("/en-lb/beirut", {
      origin: "https://presentail.test",
      basePath: "",
    });
    expect(headSnippet).toContain('<meta property="og:image:width" content="1280"');
  });

  it("emits og:image:height = 720 on a generic locale page", () => {
    const { headSnippet } = buildSeoHead("/en-lb/beirut", {
      origin: "https://presentail.test",
      basePath: "",
    });
    expect(headSnippet).toContain('<meta property="og:image:height" content="720"');
  });

  it("emits og:image:alt on a generic locale page", () => {
    const { headSnippet } = buildSeoHead("/en-ae/dubai/shop", {
      origin: "https://presentail.test",
      basePath: "",
    });
    expect(headSnippet).toMatch(/property="og:image:alt" content="[^"]+"/);
  });

  it("emits twitter:image:alt on a generic locale page", () => {
    const { headSnippet } = buildSeoHead("/en-ae/dubai/shop", {
      origin: "https://presentail.test",
      basePath: "",
    });
    expect(headSnippet).toMatch(/name="twitter:image:alt" content="[^"]+"/);
  });

  it("emits all four OG image tags together on a shop page", () => {
    const { headSnippet } = buildSeoHead("/fr-cy/limassol/shop", {
      origin: "https://presentail.test",
      basePath: "",
    });
    expect(headSnippet).toContain('property="og:image"');
    expect(headSnippet).toContain('<meta property="og:image:width" content="1280"');
    expect(headSnippet).toContain('<meta property="og:image:height" content="720"');
    expect(headSnippet).toMatch(/property="og:image:alt" content="[^"]+"/);
    expect(headSnippet).toMatch(/name="twitter:image:alt" content="[^"]+"/);
  });
});

describe("injectSeoTagsAsync — entity pages with image: og:image:alt and twitter:image:alt", () => {
  it("emits og:image:alt when product has an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          product: {
            name: "Rose Bouquet",
            description: "Beautiful roses.",
            image: { uri: "https://cdn.test/rose.jpg" },
            priceValue: 65,
          },
        }),
      }),
    );
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/product/rose-bouquet",
      OPTS,
    );
    expect(out).toMatch(/property="og:image:alt" content="[^"]+"/);
  });

  it("emits twitter:image:alt when product has an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          product: {
            name: "Orchid Vase",
            description: "Elegant orchids.",
            image: { uri: "https://cdn.test/orchid.jpg" },
            priceValue: 90,
          },
        }),
      }),
    );
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/product/orchid-vase",
      OPTS,
    );
    expect(out).toMatch(/name="twitter:image:alt" content="[^"]+"/);
  });

  it("does NOT emit og:image:width/height when the product supplies its own image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          product: {
            name: "Sunflower Bunch",
            description: "Bright sunflowers.",
            image: { uri: "https://cdn.test/sunflower.jpg" },
            priceValue: 45,
          },
        }),
      }),
    );
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-lb/beirut/product/sunflower-bunch",
      OPTS,
    );
    // Branded og-image always carries fixed 1200×630 dimensions.
    expect(out).toContain('<meta property="og:image:width" content="1200"');
    expect(out).toContain('<meta property="og:image:height" content="630"');
  });

  it("emits og:image:alt and twitter:image:alt for a brand with an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          brand: {
            name: "Garden Studio",
            description: "Fresh florals.",
            image: "https://cdn.test/garden.jpg",
          },
        }),
      }),
    );
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/brand/garden-studio",
      OPTS,
    );
    expect(out).toMatch(/property="og:image:alt" content="[^"]+"/);
    expect(out).toMatch(/name="twitter:image:alt" content="[^"]+"/);
  });
});

describe("injectSeoTagsAsync — entity pages with no image: /opengraph.jpg fallback with 1280×720", () => {
  it("falls back to /opengraph.jpg when product image is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          product: {
            name: "Mystery Box",
            description: "A curated mystery gift.",
            image: null,
            priceValue: 55,
          },
        }),
      }),
    );
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/product/mystery-box",
      OPTS,
    );
    // null product image → branded og-image is used (publicOrigin + slug).
    expect(out).toContain(
      'property="og:image" content="https://presentail.test/api/og-image/product/mystery-box"',
    );
    expect(out).toContain('<meta property="og:image:width" content="1200"');
    expect(out).toContain('<meta property="og:image:height" content="630"');
    expect(out).toMatch(/property="og:image:alt" content="[^"]+"/);
    expect(out).toMatch(/name="twitter:image:alt" content="[^"]+"/);
  });

  it("falls back to /opengraph.jpg when brand image is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          brand: {
            name: "No-Photo Brand",
            description: "Great gifts, no photo yet.",
            image: null,
          },
        }),
      }),
    );
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-lb/beirut/brand/no-photo-brand",
      OPTS,
    );
    expect(out).toContain(
      'property="og:image" content="https://presentail.test/opengraph.jpg"',
    );
    expect(out).toContain('<meta property="og:image:width" content="1280"');
    expect(out).toContain('<meta property="og:image:height" content="720"');
    expect(out).toMatch(/property="og:image:alt" content="[^"]+"/);
    expect(out).toMatch(/name="twitter:image:alt" content="[^"]+"/);
  });

  it("falls back to /opengraph.jpg when category image is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          category: {
            name: "Candles",
            description: "Scented luxury candles.",
            image: null,
          },
        }),
      }),
    );
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "?n=candles",
    });
    expect(out).toContain(
      'property="og:image" content="https://presentail.test/opengraph.jpg"',
    );
    expect(out).toContain('<meta property="og:image:width" content="1280"');
    expect(out).toContain('<meta property="og:image:height" content="720"');
    expect(out).toMatch(/property="og:image:alt" content="[^"]+"/);
    expect(out).toMatch(/name="twitter:image:alt" content="[^"]+"/);
  });

  it("respects the basePath when building the fallback opengraph.jpg URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          brand: {
            name: "Prefixed Brand",
            description: "Testing base path.",
            image: null,
          },
        }),
      }),
    );
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/brand/prefixed-brand",
      { ...OPTS, basePath: "/web" },
    );
    expect(out).toContain(
      'property="og:image" content="https://presentail.test/web/opengraph.jpg"',
    );
    expect(out).toContain('<meta property="og:image:width" content="1280"');
    expect(out).toContain('<meta property="og:image:height" content="720"');
  });
});

describe("landing page — description length within SEO-recommended 110–160 chars", () => {
  it("English landing description is between 110 and 160 characters", () => {
    const { headSnippet } = buildSeoHead("/", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const m = headSnippet.match(/name="description" content="([^"]+)"/);
    expect(m, "description meta tag must be present").not.toBeNull();
    const desc = m![1];
    expect(desc.length).toBeGreaterThanOrEqual(110);
    expect(desc.length).toBeLessThanOrEqual(160);
  });

  it("French landing description is between 110 and 160 characters", () => {
    const { headSnippet } = buildSeoHead("/fr-lb/beirut", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const m = headSnippet.match(/name="description" content="([^"]+)"/);
    expect(m, "description meta tag must be present").not.toBeNull();
    const desc = m![1];
    expect(desc.length).toBeGreaterThanOrEqual(110);
    expect(desc.length).toBeLessThanOrEqual(160);
  });

  it("Arabic landing description is non-empty and at most 160 characters", () => {
    const { headSnippet } = buildSeoHead("/ar-lb/beirut", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const m = headSnippet.match(/name="description" content="([^"]+)"/);
    expect(m, "description meta tag must be present").not.toBeNull();
    const desc = m![1];
    // Arabic is information-dense — each glyph covers more meaning, so
    // the character count is naturally lower than the English 110–160 range.
    expect(desc.length).toBeGreaterThan(0);
    expect(desc.length).toBeLessThanOrEqual(160);
  });

  it("landing page title tag is non-empty and at most 80 characters", () => {
    const { titleTag, title } = buildSeoHead("/", {
      origin: "https://presentail.test",
      basePath: "",
    });
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(titleTag).toContain("<title>");
    expect(titleTag).toContain("</title>");
  });
});

describe("injectSeoTagsAsync — description sanitisation", () => {
  it("strips HTML and decodes basic entities from WooCommerce descriptions", async () => {
    mockFetchOnce({
      ok: true,
      brand: {
        name: "Tagged",
        description:
          '<div><p>Fresh   blooms&nbsp;&amp; gifts</p><a href="x">link</a></div>',
        image: null,
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/brand/tagged",
      OPTS,
    );
    expect(out).toContain('content="Fresh blooms &amp; gifts link"');
    expect(out).not.toContain("<p>");
    expect(out).not.toContain("&nbsp;");
  });

  it("clamps long descriptions to 300 chars with an ellipsis", async () => {
    const long = "a".repeat(500);
    mockFetchOnce({
      ok: true,
      category: { name: "Big", description: long, image: null },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "?n=big",
    });
    const m = out.match(
      /<meta name="description" content="(a+…)"\s*\/>/,
    );
    expect(m, "expected clamped description meta").not.toBeNull();
    // 299 'a's + ellipsis = 300 chars total.
    expect(m![1].length).toBe(300);
    expect(m![1].endsWith("…")).toBe(true);
    expect(m![1].slice(0, -1)).toBe("a".repeat(299));
  });

  it("keeps short descriptions intact", async () => {
    mockFetchOnce({
      ok: true,
      category: {
        name: "Small",
        description: "Short and sweet.",
        image: null,
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "?n=small",
    });
    expect(out).toContain('content="Short and sweet."');
    expect(out).not.toContain("…");
  });
});

// ---------------------------------------------------------------------------
// parseDimsFromBuffer — unit tests
// ---------------------------------------------------------------------------

function makePngBuffer(width: number, height: number): ArrayBuffer {
  const b = new Uint8Array(24);
  // PNG signature
  b[0] = 0x89; b[1] = 0x50; b[2] = 0x4e; b[3] = 0x47;
  b[4] = 0x0d; b[5] = 0x0a; b[6] = 0x1a; b[7] = 0x0a;
  // IHDR chunk length + type (not checked by parser, just padding)
  b[8] = 0x00; b[9] = 0x00; b[10] = 0x00; b[11] = 0x0d;
  b[12] = 0x49; b[13] = 0x48; b[14] = 0x44; b[15] = 0x52;
  // Width big-endian at b[16..19]
  b[16] = (width >>> 24) & 0xff;
  b[17] = (width >>> 16) & 0xff;
  b[18] = (width >>> 8) & 0xff;
  b[19] = width & 0xff;
  // Height big-endian at b[20..23]
  b[20] = (height >>> 24) & 0xff;
  b[21] = (height >>> 16) & 0xff;
  b[22] = (height >>> 8) & 0xff;
  b[23] = height & 0xff;
  return b.buffer;
}

function makeJpegBuffer(width: number, height: number): ArrayBuffer {
  // SOI + SOF0 segment with enough bytes for parseJpegDims
  const b = new Uint8Array(11);
  b[0] = 0xff; b[1] = 0xd8; // SOI
  b[2] = 0xff; b[3] = 0xc0; // SOF0 marker
  b[4] = 0x00; b[5] = 0x11; // segment length = 17
  b[6] = 0x08;              // precision
  // Height big-endian at b[7..8]
  b[7] = (height >>> 8) & 0xff;
  b[8] = height & 0xff;
  // Width big-endian at b[9..10]
  b[9] = (width >>> 8) & 0xff;
  b[10] = width & 0xff;
  return b.buffer;
}

function makeWebpVP8XBuffer(width: number, height: number): ArrayBuffer {
  const b = new Uint8Array(30);
  // RIFF header
  b[0] = 0x52; b[1] = 0x49; b[2] = 0x46; b[3] = 0x46; // "RIFF"
  // file size (ignored in parser)
  b[4] = 0x00; b[5] = 0x00; b[6] = 0x00; b[7] = 0x00;
  // WEBP
  b[8] = 0x57; b[9] = 0x45; b[10] = 0x42; b[11] = 0x50; // "WEBP"
  // VP8X chunk id
  b[12] = 0x56; b[13] = 0x50; b[14] = 0x38; b[15] = 0x58; // "VP8X"
  // chunk size (10) little-endian
  b[16] = 0x0a; b[17] = 0x00; b[18] = 0x00; b[19] = 0x00;
  // flags + reserved (b[20..23])
  b[20] = 0x00; b[21] = 0x00; b[22] = 0x00; b[23] = 0x00;
  // Canvas width - 1, 24-bit little-endian at b[24..26]
  const w1 = width - 1;
  b[24] = w1 & 0xff;
  b[25] = (w1 >>> 8) & 0xff;
  b[26] = (w1 >>> 16) & 0xff;
  // Canvas height - 1, 24-bit little-endian at b[27..29]
  const h1 = height - 1;
  b[27] = h1 & 0xff;
  b[28] = (h1 >>> 8) & 0xff;
  b[29] = (h1 >>> 16) & 0xff;
  return b.buffer;
}

function makeWebpVP8LBuffer(width: number, height: number): ArrayBuffer {
  // bits[0..13] = width-1, bits[14..27] = height-1
  const bits = ((height - 1) << 14) | (width - 1);
  const b = new Uint8Array(25);
  // RIFF header
  b[0] = 0x52; b[1] = 0x49; b[2] = 0x46; b[3] = 0x46; // "RIFF"
  b[4] = 0x00; b[5] = 0x00; b[6] = 0x00; b[7] = 0x00; // file size
  // WEBP
  b[8] = 0x57; b[9] = 0x45; b[10] = 0x42; b[11] = 0x50; // "WEBP"
  // VP8L chunk id
  b[12] = 0x56; b[13] = 0x50; b[14] = 0x38; b[15] = 0x4c; // "VP8L"
  // chunk size (little-endian, not checked in parser)
  b[16] = 0x05; b[17] = 0x00; b[18] = 0x00; b[19] = 0x00;
  // VP8L signature byte
  b[20] = 0x2f;
  // bitstream start — width-1 in bits 0..13, height-1 in bits 14..27
  b[21] = bits & 0xff;
  b[22] = (bits >>> 8) & 0xff;
  b[23] = (bits >>> 16) & 0xff;
  b[24] = (bits >>> 24) & 0xff;
  return b.buffer;
}

describe("parseDimsFromBuffer — PNG", () => {
  it("parses width and height from a minimal valid PNG header", () => {
    expect(parseDimsFromBuffer(makePngBuffer(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  it("parses a non-square PNG correctly", () => {
    expect(parseDimsFromBuffer(makePngBuffer(100, 200))).toEqual({ width: 100, height: 200 });
  });

  it("returns null when the PNG buffer is too short (< 24 bytes)", () => {
    const short = new Uint8Array(20);
    short[0] = 0x89; short[1] = 0x50; short[2] = 0x4e; short[3] = 0x47;
    expect(parseDimsFromBuffer(short.buffer)).toBeNull();
  });

  it("returns null when a PNG has zero-valued dimensions", () => {
    expect(parseDimsFromBuffer(makePngBuffer(0, 0))).toBeNull();
  });
});

describe("parseDimsFromBuffer — JPEG", () => {
  it("parses width and height from a SOF0-only JPEG buffer", () => {
    expect(parseDimsFromBuffer(makeJpegBuffer(320, 240))).toEqual({ width: 320, height: 240 });
  });

  it("parses a large JPEG correctly", () => {
    expect(parseDimsFromBuffer(makeJpegBuffer(4032, 3024))).toEqual({ width: 4032, height: 3024 });
  });

  it("returns null for a truncated JPEG buffer that has no SOF marker", () => {
    const b = new Uint8Array([0xff, 0xd8]);
    expect(parseDimsFromBuffer(b.buffer)).toBeNull();
  });
});

describe("parseDimsFromBuffer — WebP VP8X", () => {
  it("parses canvas dimensions from a VP8X chunk", () => {
    expect(parseDimsFromBuffer(makeWebpVP8XBuffer(400, 300))).toEqual({ width: 400, height: 300 });
  });

  it("adds 1 to the stored canvas-minus-1 values correctly", () => {
    expect(parseDimsFromBuffer(makeWebpVP8XBuffer(1, 1))).toEqual({ width: 1, height: 1 });
  });

  it("returns null when the VP8X buffer is shorter than 30 bytes", () => {
    const b = new Uint8Array(29);
    b[0]=0x52; b[1]=0x49; b[2]=0x46; b[3]=0x46;
    b[8]=0x57; b[9]=0x45; b[10]=0x42; b[11]=0x50;
    b[12]=0x56; b[13]=0x50; b[14]=0x38; b[15]=0x58;
    expect(parseDimsFromBuffer(b.buffer)).toBeNull();
  });
});

describe("parseDimsFromBuffer — WebP VP8L", () => {
  it("decodes width and height from a VP8L bitstream header", () => {
    expect(parseDimsFromBuffer(makeWebpVP8LBuffer(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it("decodes a 1x1 VP8L image", () => {
    expect(parseDimsFromBuffer(makeWebpVP8LBuffer(1, 1))).toEqual({ width: 1, height: 1 });
  });

  it("returns null when the VP8L signature byte (0x2F) is absent", () => {
    const buf = makeWebpVP8LBuffer(640, 480);
    const b = new Uint8Array(buf);
    b[20] = 0x00; // corrupt the signature byte
    expect(parseDimsFromBuffer(b.buffer)).toBeNull();
  });
});

describe("parseDimsFromBuffer — unknown / short buffers", () => {
  it("returns null for an empty buffer", () => {
    expect(parseDimsFromBuffer(new ArrayBuffer(0))).toBeNull();
  });

  it("returns null for a 3-byte buffer (too short for any format)", () => {
    expect(parseDimsFromBuffer(new Uint8Array([0x89, 0x50, 0x4e]).buffer)).toBeNull();
  });

  it("returns null for an unrecognised 4-byte magic", () => {
    expect(parseDimsFromBuffer(new Uint8Array([0x00, 0x01, 0x02, 0x03]).buffer)).toBeNull();
  });

  it("returns null for a GIF header (not a supported format)", () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x10, 0x00]);
    expect(parseDimsFromBuffer(gif.buffer)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// og:image:width / og:image:height in buildEntityHead — integration tests
// ---------------------------------------------------------------------------

const DIMS_HTML = `<!doctype html><html lang="en"><head><title>Old</title></head><body></body></html>`;
const DIMS_OPTS = {
  apiBaseUrl: "https://api.dims-test",
  origin: "",
  basePath: "",
};

describe("og:image:width / og:image:height via injectSeoTagsAsync", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("emits og:image:width and og:image:height when image dimensions are resolved from a PNG header", async () => {
    // First fetch: product API. Second fetch: image Range request → PNG bytes.
    const pngBuf = makePngBuffer(1200, 630);
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Dims Product",
              description: "Has dimensions.",
              image: { uri: "https://cdn.dims-test/img-dims.png" },
              priceValue: 75,
            },
          }),
        };
      }
      // Image Range fetch
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      DIMS_HTML,
      "/en-ae/dubai/product/dims-product-png",
      DIMS_OPTS,
    );

    expect(out).toContain('<meta property="og:image:width" content="1200"');
    expect(out).toContain('<meta property="og:image:height" content="630"');
    expect(out).toContain('<meta property="og:image" content="https://cdn.dims-test/img-dims.png"');
  });

  it("emits og:image:width and og:image:height when image dimensions are resolved from a JPEG header", async () => {
    const jpegBuf = makeJpegBuffer(800, 600);
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Dims JPEG Product",
              description: "JPEG dims.",
              image: { uri: "https://cdn.dims-test/img-dims.jpg" },
              priceValue: 60,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => jpegBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      DIMS_HTML,
      "/en-ae/dubai/product/dims-product-jpeg",
      DIMS_OPTS,
    );

    expect(out).toContain('<meta property="og:image:width" content="800"');
    expect(out).toContain('<meta property="og:image:height" content="600"');
  });

  it("emits og:image:width and og:image:height when image dimensions are resolved from a WebP VP8X header", async () => {
    const webpBuf = makeWebpVP8XBuffer(1200, 628);
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Dims WebP Product",
              description: "WebP dims.",
              image: { uri: "https://cdn.dims-test/img-dims.webp" },
              priceValue: 55,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => webpBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      DIMS_HTML,
      "/en-ae/dubai/product/dims-product-webp",
      DIMS_OPTS,
    );

    expect(out).toContain('<meta property="og:image:width" content="1200"');
    expect(out).toContain('<meta property="og:image:height" content="628"');
  });

  it("omits og:image:width and og:image:height when the image fetch returns unrecognised bytes", async () => {
    const unknownBuf = new Uint8Array([0x00, 0x01, 0x02, 0x03]).buffer;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Nodims Product",
              description: "No parseable dims.",
              image: { uri: "https://cdn.dims-test/img-nodims.bin" },
              priceValue: 40,
            },
          }),
        };
      }
      return { ok: true, status: 200, arrayBuffer: async () => unknownBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      DIMS_HTML,
      "/en-ae/dubai/product/nodims-product",
      DIMS_OPTS,
    );

    expect(out).toContain('<meta property="og:image" content="https://cdn.dims-test/img-nodims.bin"');
    expect(out).not.toContain('property="og:image:width"');
    expect(out).not.toContain('property="og:image:height"');
  });

  it("emits the default 1280×720 dimensions when no product image is present (opengraph.jpg fallback)", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "No Image Product",
              description: "No image at all.",
              image: null,
              priceValue: 30,
            },
          }),
        };
      }
      // Should not be called for image fetch since imageUrl is null
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      DIMS_HTML,
      "/en-ae/dubai/product/no-image-product",
      DIMS_OPTS,
    );

    expect(out).toContain('<meta property="og:image:width" content="1280"');
    expect(out).toContain('<meta property="og:image:height" content="720"');
    // Should fall back to the default opengraph image, not a product image
    expect(out).toContain("opengraph.jpg");
  });

  it("omits og:image:width and og:image:height when the image fetch fails with a network error", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Network Error Product",
              description: "Image fetch will fail.",
              image: { uri: "https://cdn.dims-test/img-neterr.png" },
              priceValue: 45,
            },
          }),
        };
      }
      throw new Error("ETIMEDOUT");
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      DIMS_HTML,
      "/en-ae/dubai/product/neterr-product",
      DIMS_OPTS,
    );

    expect(out).toContain('<meta property="og:image" content="https://cdn.dims-test/img-neterr.png"');
    expect(out).not.toContain('property="og:image:width"');
    expect(out).not.toContain('property="og:image:height"');
  });
});

// ---------------------------------------------------------------------------
// Image dims cache invalidation — fetchEntityForSeoCached evicts dims entries
// ---------------------------------------------------------------------------
//
// When the entity cache TTL expires (60 s) and the entity is freshly fetched,
// fetchEntityForSeoCached calls evictImageDims() for each image URL carried by
// the fresh entity.  This forces fetchImageDimensions to re-probe the CDN even
// though the dims cache TTL (1 h) has not yet expired.  Without this eviction,
// a CDN image update at an unchanged URL would serve stale dimensions for up to
// an hour.
//
// Strategy:
//   1. First injectSeoTagsAsync call → entity + dims both freshly fetched.
//   2. Advance fake clock past entity TTL (60 s) but NOT past dims TTL (1 h).
//   3. Second call → entity cache miss → fresh entity fetch → evictImageDims →
//      dims cache entry deleted → dims re-fetched (not served from cache).
//   4. Dims fetch count must be 2, proving eviction happened.
//
// We use `vi.useFakeTimers({ toFake: ['Date'] })` so only Date.now() is faked;
// real setTimeout/clearTimeout still operate, keeping the AbortController timer
// in fetchImageDimensions functional.
// ---------------------------------------------------------------------------

const CACHE_INV_HTML = `<!doctype html><html lang="en"><head><title>Old</title></head><body></body></html>`;
const CACHE_INV_OPTS = {
  apiBaseUrl: "https://api.cache-inv-test",
  origin: "",
  basePath: "",
};

describe("image dims cache invalidation — product (image.uri shape)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("re-fetches image dims when the entity cache expires and the entity is freshly fetched", async () => {
    const pngBuf = makePngBuffer(1200, 630);
    // Use a URL unique to this test so other tests' cached entries don't interfere.
    const imageUrl = "https://cdn.cache-inv-test/product-cache-inv-unique.png";
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        entityFetchCount++;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Cache Inv Product",
              description: "Dims eviction test.",
              image: { uri: imageUrl },
              priceValue: 60,
            },
          }),
        };
      }
      // Image dims Range request.
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity fetched fresh → dims fetched and cached.
    await injectSeoTagsAsync(
      CACHE_INV_HTML,
      "/en-ae/dubai/product/cache-inv-product",
      CACHE_INV_OPTS,
    );
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Advance time past entity cache TTL (60 s) but well under dims TTL (1 h).
    vi.setSystemTime(new Date(Date.now() + 61_000));

    // Second call: entity cache expired → fresh entity fetch → evictImageDims
    // removes the dims entry → dims re-probed from CDN.
    await injectSeoTagsAsync(
      CACHE_INV_HTML,
      "/en-ae/dubai/product/cache-inv-product",
      CACHE_INV_OPTS,
    );
    expect(entityFetchCount).toBe(2);
    // Without eviction this would remain 1 (served from dims cache).
    expect(dimsFetchCount).toBe(2);
  });

  it("does NOT re-fetch image dims when the entity is served from cache (dims reused)", async () => {
    const pngBuf = makePngBuffer(800, 600);
    const imageUrl = "https://cdn.cache-inv-test/product-cache-hit-unique.png";
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        entityFetchCount++;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Cache Hit Product",
              description: "Dims should be reused.",
              image: { uri: imageUrl },
              priceValue: 45,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity + dims freshly fetched.
    await injectSeoTagsAsync(
      CACHE_INV_HTML,
      "/en-ae/dubai/product/cache-hit-product",
      CACHE_INV_OPTS,
    );
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Second call immediately (entity cache still valid → no eviction → dims reused).
    await injectSeoTagsAsync(
      CACHE_INV_HTML,
      "/en-ae/dubai/product/cache-hit-product",
      CACHE_INV_OPTS,
    );
    expect(entityFetchCount).toBe(1); // entity served from cache
    expect(dimsFetchCount).toBe(1);   // dims served from cache (no eviction)
  });
});

describe("image dims cache invalidation — brand (string image field)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("re-fetches image dims after brand entity cache expires", async () => {
    const pngBuf = makePngBuffer(600, 400);
    const imageUrl = "https://cdn.cache-inv-test/brand-cache-inv-unique.png";
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/brand-products")) {
        // product-count fetch — not an entity fetch
        return { ok: true, json: async () => ({ ok: true, count: 5 }) };
      }
      if (u.includes("/api/woo/brand")) {
        entityFetchCount++;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            brand: {
              name: "Cache Inv Brand",
              description: "Brand dims eviction test.",
              image: imageUrl,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity + dims freshly fetched.
    await injectSeoTagsAsync(
      CACHE_INV_HTML,
      "/en-ae/dubai/brand/cache-inv-brand",
      CACHE_INV_OPTS,
    );
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Advance past entity TTL only.
    vi.setSystemTime(new Date(Date.now() + 61_000));

    // Second call: entity cache miss → fresh fetch → evictImageDims → dims re-fetched.
    await injectSeoTagsAsync(
      CACHE_INV_HTML,
      "/en-ae/dubai/brand/cache-inv-brand",
      CACHE_INV_OPTS,
    );
    expect(entityFetchCount).toBe(2);
    expect(dimsFetchCount).toBe(2);
  });
});

describe("image dims cache invalidation — occasion (string image field)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("re-fetches image dims after occasion entity cache expires", async () => {
    const pngBuf = makePngBuffer(600, 400);
    const imageUrl = "https://cdn.cache-inv-test/occasion-cache-inv-unique.png";
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/occasion-products")) {
        // SEO listing fetch — not counted as an entity or dims fetch.
        return { ok: true, json: async () => ({ ok: true, groups: [] }) };
      }
      if (String(url).includes("/api/woo/occasion")) {
        entityFetchCount++;
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            ok: true,
            occasion: {
              name: "Cache Inv Occasion",
              description: "Occasion dims eviction test.",
              image: imageUrl,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const callOpts = {
      ...CACHE_INV_OPTS,
      search: "?occasion=cache-inv-occasion-unique-slug",
    };

    // First call: entity + dims freshly fetched.
    await injectSeoTagsAsync(CACHE_INV_HTML, "/en-ae/dubai/shop", callOpts);
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Advance past entity TTL only (dims TTL is 1 h, far in the future).
    vi.setSystemTime(new Date(Date.now() + 61_000));

    // Second call: entity cache miss → fresh fetch → evictImageDims → dims re-fetched.
    await injectSeoTagsAsync(CACHE_INV_HTML, "/en-ae/dubai/shop", callOpts);
    expect(entityFetchCount).toBe(2);
    expect(dimsFetchCount).toBe(2);
  });

  it("does NOT re-fetch image dims when occasion entity is served from cache (dims reused)", async () => {
    const pngBuf = makePngBuffer(800, 533);
    const imageUrl = "https://cdn.cache-inv-test/occasion-cache-dims-hit-unique.png";
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/occasion-products")) {
        // SEO listing fetch — not counted as an entity or dims fetch.
        return { ok: true, json: async () => ({ ok: true, groups: [] }) };
      }
      if (String(url).includes("/api/woo/occasion")) {
        entityFetchCount++;
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            ok: true,
            occasion: {
              name: "Cache Dims Hit Occasion",
              description: "Dims should be reused within TTL.",
              image: imageUrl,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const callOpts = {
      ...CACHE_INV_OPTS,
      search: "?occasion=cache-dims-hit-occasion-unique-slug",
    };

    // First call: entity + dims freshly fetched.
    await injectSeoTagsAsync(CACHE_INV_HTML, "/en-ae/dubai/shop", callOpts);
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Second call immediately (entity cache still valid → no eviction → dims reused).
    await injectSeoTagsAsync(CACHE_INV_HTML, "/en-ae/dubai/shop", callOpts);
    expect(entityFetchCount).toBe(1); // entity served from cache
    expect(dimsFetchCount).toBe(1);   // dims served from cache (no eviction)
  });
});

describe("image dims cache invalidation — wishlist path (evictImageDims on wishlist cache miss)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("re-fetches image dims after wishlist entity cache expires", async () => {
    const pngBuf = makePngBuffer(900, 600);
    // Use URLs unique to this test to avoid cache cross-contamination.
    const imageUrl = "https://cdn.cache-inv-test/wishlist-hero-unique.png";
    let wishlistFetchCount = 0;
    let productFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/favorites/share/")) {
        wishlistFetchCount++;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            favorites: [
              { productSlug: "wishlist-hero-product", countryCode: "AE" },
            ],
          }),
        };
      }
      if (u.includes("/api/woo/product")) {
        productFetchCount++;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Wishlist Hero",
              description: "First product in the wishlist.",
              image: { uri: imageUrl },
              priceValue: 80,
            },
          }),
        };
      }
      // Image dims Range request.
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const shareToken = "wishlist-cache-inv-tok01";

    // First call: wishlist + product + dims all freshly fetched.
    await injectSeoTagsAsync(CACHE_INV_HTML, `/favorites/share/${shareToken}`, CACHE_INV_OPTS);
    expect(wishlistFetchCount).toBe(1);
    expect(productFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Advance past entity TTL (60 s) so the wishlist cache entry expires.
    vi.setSystemTime(new Date(Date.now() + 61_000));

    // Second call: wishlist cache miss → fresh fetch → evictImageDims(imageUrl) →
    // dims cache entry deleted → dims re-fetched.
    await injectSeoTagsAsync(CACHE_INV_HTML, `/favorites/share/${shareToken}`, CACHE_INV_OPTS);
    expect(wishlistFetchCount).toBe(2);
    // The product used by the wishlist path goes through fetchEntityForSeoCached,
    // so the product entity cache also expires here (same 60 s TTL).
    expect(productFetchCount).toBe(2);
    // Dims must be re-fetched because evictImageDims is called when the wishlist
    // result is freshly computed (even though the dims TTL has not expired).
    expect(dimsFetchCount).toBe(2);
  });

  it("reuses image dims when the wishlist entity cache is still valid", async () => {
    const pngBuf = makePngBuffer(900, 600);
    const imageUrl = "https://cdn.cache-inv-test/wishlist-hero-cache-hit-unique.png";
    let wishlistFetchCount = 0;
    let productFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/favorites/share/")) {
        wishlistFetchCount++;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            favorites: [
              { productSlug: "wishlist-cache-hit-product", countryCode: "LB" },
            ],
          }),
        };
      }
      if (u.includes("/api/woo/product")) {
        productFetchCount++;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Wishlist Cache Hit",
              description: "Dims should be reused from cache.",
              image: { uri: imageUrl },
              priceValue: 70,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const shareToken = "wishlist-cache-hit-tok02";

    // First call.
    await injectSeoTagsAsync(CACHE_INV_HTML, `/favorites/share/${shareToken}`, CACHE_INV_OPTS);
    expect(wishlistFetchCount).toBe(1);
    expect(productFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Second call immediately — wishlist cache valid, dims cache valid, nothing re-fetched.
    await injectSeoTagsAsync(CACHE_INV_HTML, `/favorites/share/${shareToken}`, CACHE_INV_OPTS);
    expect(wishlistFetchCount).toBe(1);
    expect(productFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Wishlist shared-link preview — basic rendering and fallback behaviour
//
// /favorites/share/:token renders a rich OG preview (title, description,
// og:image with dimensions) when the API resolves the token. Any failure
// (HTTP 404, ok:false body, network error) must fall back to the generic
// preview so social crawlers still see *something* useful.
// ---------------------------------------------------------------------------

const WISHLIST_BASIC_HTML = `<!doctype html><html lang="en"><head><title>Old</title></head><body></body></html>`;
const WISHLIST_BASIC_OPTS = {
  apiBaseUrl: "https://api.wl-basic-test",
  origin: "https://presentail.wl-basic-test",
  basePath: "",
};

describe("injectSeoTagsAsync — /favorites/share/:token wishlist preview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders title, description, og:image, and dims for a multi-item wishlist", async () => {
    const imageUrl = "https://cdn.wl-basic-test/wl-multi-hero-unique.png";
    const pngBuf = makePngBuffer(1200, 628);

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/favorites/share/")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            favorites: [
              { productSlug: "wl-multi-hero", countryCode: "LB" },
              { productSlug: "wl-multi-second", countryCode: "LB" },
              { productSlug: "wl-multi-third", countryCode: "LB" },
            ],
          }),
        };
      }
      if (u.includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Wishlist Hero",
              description: "Hero product for the multi-item wishlist.",
              image: { uri: imageUrl },
              priceValue: 90,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      WISHLIST_BASIC_HTML,
      "/favorites/share/wl-basic-multi-tok01",
      WISHLIST_BASIC_OPTS,
    );

    expect(out).toContain("<title>Gift Wishlist — 3 items on Presentail</title>");
    expect(out).toContain("Someone shared a wishlist of 3 gifts with you on Presentail");
    expect(out).toContain(`content="${imageUrl}"`);
    expect(out).toContain('content="1200"');
    expect(out).toContain('content="628"');
  });

  it("uses singular 'item' and single-item description for a 1-item wishlist", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/favorites/share/")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            favorites: [{ productSlug: "wl-single-hero", countryCode: "AE" }],
          }),
        };
      }
      if (u.includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Single Hero Product",
              description: "Only item in the wishlist.",
              image: { uri: "https://cdn.wl-basic-test/wl-single-hero-unique.png" },
              priceValue: 55,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBuffer(800, 600) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      WISHLIST_BASIC_HTML,
      "/favorites/share/wl-basic-single-tok02",
      WISHLIST_BASIC_OPTS,
    );

    expect(out).toContain("<title>Gift Wishlist — 1 item on Presentail</title>");
    expect(out).toContain("Someone shared a wishlist with you on Presentail");
    // Must not use plural forms for a single item.
    expect(out).not.toContain("1 items");
    expect(out).not.toContain("1 gifts");
  });

  it("falls back to the generic preview when the share token is not found (API 404)", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/favorites/share/")) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBuffer(800, 600) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      WISHLIST_BASIC_HTML,
      "/favorites/share/wl-basic-notfound-tok03",
      WISHLIST_BASIC_OPTS,
    );

    expect(out).not.toContain("Gift Wishlist");
    // Falls back to generic — no wishlist-specific title.
    expect(out).toContain("<title>");
  });

  it("falls back to the generic preview when the API body has ok:false (expired token)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: "token_expired" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      WISHLIST_BASIC_HTML,
      "/favorites/share/wl-basic-expired-tok04",
      WISHLIST_BASIC_OPTS,
    );

    expect(out).not.toContain("Gift Wishlist");
  });

  it("falls back to the generic preview on a network error fetching the shared list", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      WISHLIST_BASIC_HTML,
      "/favorites/share/wl-basic-neterr-tok05",
      WISHLIST_BASIC_OPTS,
    );

    expect(out).not.toContain("Gift Wishlist");
  });

  it("renders a 0-item wishlist when favorites array is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, favorites: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      WISHLIST_BASIC_HTML,
      "/favorites/share/wl-basic-empty-tok06",
      WISHLIST_BASIC_OPTS,
    );

    // count: 0 still renders — wishlist token resolves to a valid (empty) list.
    expect(out).toContain("Gift Wishlist — 0 items on Presentail");
  });

  it("renders wishlist with fallback og:image when the hero product has no image URI", async () => {
    // When the hero product has no image, buildEntityHead falls back to the
    // generic /opengraph.jpg asset — og:image is still present but points
    // to the site-wide fallback rather than a product photo.
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/favorites/share/")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            favorites: [{ productSlug: "wl-noimage-hero", countryCode: "LB" }],
          }),
        };
      }
      if (u.includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "No-image Product",
              description: "Product with no hero image.",
              image: null,
              priceValue: 40,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBuffer(800, 600) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      WISHLIST_BASIC_HTML,
      "/favorites/share/wl-basic-noimage-tok07",
      WISHLIST_BASIC_OPTS,
    );

    expect(out).toContain("Gift Wishlist — 1 item on Presentail");
    // Falls back to the site-wide OG image when the product has no photo.
    expect(out).toContain('property="og:image"');
    expect(out).toContain("opengraph.jpg");
  });
});

// ---------------------------------------------------------------------------
// ETag/304 for the hero product fetch inside the wishlist cache-miss path
//
// The wishlist cache entry does not itself carry ETag/Last-Modified headers,
// so conditional requests are not sent to /api/favorites/share/:token.
// However, the *hero product* inside the wishlist path goes through
// fetchEntityForSeoCached, which does support ETag-based conditional requests.
//
// On a wishlist cache miss the hero product fetch sends If-None-Match when
// the product entry has a cached ETag. When the product API responds 304,
// fetchEntityForSeoCached signals freshlyFetched=false via the out parameter,
// and the wishlist path skips evictImageDims — the image URL has not changed
// so the cached dimensions remain accurate and no CDN Range-request is wasted.
// When the product API responds 200 (new or changed entity), freshlyFetched=true
// and evictImageDims IS called so stale dims are replaced.
// ---------------------------------------------------------------------------

const WISHLIST_ETAG_HTML = `<!doctype html><html lang="en"><head><title>Old</title></head><body></body></html>`;
const WISHLIST_ETAG_OPTS = {
  apiBaseUrl: "https://api.wl-etag-test",
  origin: "https://presentail.wl-etag-test",
  basePath: "",
};

describe("ETag on hero product within wishlist cache miss", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends If-None-Match for the hero product on a wishlist cache miss (product has ETag)", async () => {
    // After the wishlist cache expires the product entity also expires (same
    // 60 s TTL), but its raw entry remains in the Map with the stored ETag.
    // fetchEntityForSeoCached therefore sends a conditional request for the
    // product even though both caches have expired.
    const pngBuf = makePngBuffer(900, 600);
    const imageUrl = "https://cdn.wl-etag-test/wl-etag-ifnonematch-unique.png";
    const productEtag = '"product-etag-v1-wl-etag-ifnonematch"';
    const capturedProductHeaders: Array<Record<string, string>> = [];

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/favorites/share/")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            favorites: [{ productSlug: "wl-etag-ifnonematch-product", countryCode: "LB" }],
          }),
        };
      }
      if (u.includes("/api/woo/product")) {
        const h = (init?.headers ?? {}) as Record<string, string>;
        capturedProductHeaders.push({ ...h });
        // Always return the product (simulate 200 so both calls succeed).
        return {
          ok: true,
          status: 200,
          headers: { get: (n: string) => (n.toLowerCase() === "etag" ? productEtag : null) },
          json: async () => ({
            ok: true,
            product: {
              name: "ETag Hero Product",
              description: "Product used to verify If-None-Match header.",
              image: { uri: imageUrl },
              priceValue: 70,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const shareToken = "wl-etag-ifnonematch-tok01";

    // First call: product freshly fetched, ETag stored in product entity cache.
    await injectSeoTagsAsync(WISHLIST_ETAG_HTML, `/favorites/share/${shareToken}`, WISHLIST_ETAG_OPTS);
    expect(capturedProductHeaders).toHaveLength(1);
    expect(capturedProductHeaders[0]?.["If-None-Match"]).toBeUndefined();

    // Advance past the entity TTL so both the wishlist and product caches expire.
    vi.setSystemTime(new Date(Date.now() + 61_000));

    // Second call: wishlist cache miss → wishlist re-fetched → product fetch
    // via fetchEntityForSeoCached. The product raw entry (expired but present)
    // carries the ETag, so If-None-Match MUST be sent on this second request.
    await injectSeoTagsAsync(WISHLIST_ETAG_HTML, `/favorites/share/${shareToken}`, WISHLIST_ETAG_OPTS);
    expect(capturedProductHeaders).toHaveLength(2);
    expect(capturedProductHeaders[1]?.["If-None-Match"]).toBe(productEtag);
  });

  it("does NOT re-fetch image dims when the hero product responds 304 on a wishlist cache miss", async () => {
    // Optimised behaviour: the wishlist path only calls evictImageDims(imageUrl)
    // when the hero product was freshly fetched (200 response). When the product
    // responds 304 (unchanged), the cached dims remain accurate and the wasteful
    // CDN Range-request is skipped.
    const pngBuf = makePngBuffer(900, 600);
    const imageUrl = "https://cdn.wl-etag-test/wl-etag-dims-recheck-unique.png";
    const productEtag = '"product-etag-v1-wl-etag-dims-recheck"';
    let wishlistFetchCount = 0;
    let productFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/favorites/share/")) {
        wishlistFetchCount++;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            favorites: [{ productSlug: "wl-etag-dims-recheck-product", countryCode: "LB" }],
          }),
        };
      }
      if (u.includes("/api/woo/product")) {
        productFetchCount++;
        const h = (init?.headers ?? {}) as Record<string, string>;
        if (h["If-None-Match"] === productEtag) {
          // Product unchanged — 304 Not Modified.
          return { ok: false, status: 304, headers: { get: () => null } };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: (n: string) => (n.toLowerCase() === "etag" ? productEtag : null) },
          json: async () => ({
            ok: true,
            product: {
              name: "ETag Dims Recheck Product",
              description: "Verify dims are NOT re-fetched on 304.",
              image: { uri: imageUrl },
              priceValue: 80,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const shareToken = "wl-etag-dims-recheck-tok02";

    // First call: all three freshly fetched.
    await injectSeoTagsAsync(WISHLIST_ETAG_HTML, `/favorites/share/${shareToken}`, WISHLIST_ETAG_OPTS);
    expect(wishlistFetchCount).toBe(1);
    expect(productFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Advance past the 60 s entity TTL.
    vi.setSystemTime(new Date(Date.now() + 61_000));

    // Second call: wishlist cache miss → wishlist re-fetched → product sends
    // If-None-Match → product responds 304 (unchanged). Because the product
    // was NOT freshly fetched, evictImageDims is NOT called and dims are
    // served from cache — no CDN Range-request on this path.
    await injectSeoTagsAsync(WISHLIST_ETAG_HTML, `/favorites/share/${shareToken}`, WISHLIST_ETAG_OPTS);
    expect(wishlistFetchCount).toBe(2);
    expect(productFetchCount).toBe(2);   // conditional request sent
    expect(dimsFetchCount).toBe(1);      // dims NOT evicted → served from cache
  });

  it("does NOT re-fetch image dims on wishlist cache HIT even when the hero product has an ETag", async () => {
    // When the wishlist cache is still valid, the wishlist path serves the
    // cached result directly — no product fetch, no dims eviction.
    const pngBuf = makePngBuffer(900, 600);
    const imageUrl = "https://cdn.wl-etag-test/wl-etag-cachehit-unique.png";
    const productEtag = '"product-etag-v1-wl-etag-cachehit"';
    let wishlistFetchCount = 0;
    let productFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/favorites/share/")) {
        wishlistFetchCount++;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            favorites: [{ productSlug: "wl-etag-cachehit-product", countryCode: "LB" }],
          }),
        };
      }
      if (u.includes("/api/woo/product")) {
        productFetchCount++;
        const h = (init?.headers ?? {}) as Record<string, string>;
        if (h["If-None-Match"] === productEtag) {
          return { ok: false, status: 304, headers: { get: () => null } };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: (n: string) => (n.toLowerCase() === "etag" ? productEtag : null) },
          json: async () => ({
            ok: true,
            product: {
              name: "ETag Cache-hit Product",
              description: "Dims must be reused on wishlist cache hit.",
              image: { uri: imageUrl },
              priceValue: 65,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const shareToken = "wl-etag-cachehit-tok03";

    // First call: wishlist + product + dims freshly fetched.
    await injectSeoTagsAsync(WISHLIST_ETAG_HTML, `/favorites/share/${shareToken}`, WISHLIST_ETAG_OPTS);
    expect(wishlistFetchCount).toBe(1);
    expect(productFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Second call immediately — wishlist cache still valid → served from cache.
    // No wishlist fetch, no product fetch, no dims eviction, no dims re-fetch.
    await injectSeoTagsAsync(WISHLIST_ETAG_HTML, `/favorites/share/${shareToken}`, WISHLIST_ETAG_OPTS);
    expect(wishlistFetchCount).toBe(1);
    expect(productFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// seo_entity_fetch_failed analytics event emission
//
// When fetchEntityForSeo encounters any failure (HTTP error, ok=false body,
// network error / timeout), it must fire a fire-and-forget POST to
// /api/analytics/events so ops can detect systematic SEO preview outages
// via the analytics_events table before social previews silently degrade.
// ---------------------------------------------------------------------------

describe("seo_entity_fetch_failed analytics event — emitted on entity lookup failure", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeAnalyticsMock(entityResponse: { ok: boolean; body?: unknown }) {
    const fn = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/analytics/events")) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return {
        ok: entityResponse.ok,
        json: async () => entityResponse.body ?? {},
      };
    });
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("fires seo_entity_fetch_failed when a product HTTP 404 occurs", async () => {
    const fetchMock = makeAnalyticsMock({ ok: false });
    await injectSeoTagsAsync(HTML, "/en-ae/dubai/product/missing-slug", OPTS);
    const analyticsCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/analytics/events"),
    );
    expect(analyticsCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(analyticsCalls[0][1].body);
    expect(body.name).toBe("seo_entity_fetch_failed");
    expect(body.platform).toBe("web");
    expect(body.errorCode).toBe("product");
  });

  it("fires seo_entity_fetch_failed when the product API returns ok=false in the body", async () => {
    const fetchMock = makeAnalyticsMock({ ok: true, body: { ok: false, error: "not_found" } });
    await injectSeoTagsAsync(HTML, "/en-ae/dubai/product/bad-body-slug", OPTS);
    const analyticsCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/analytics/events"),
    );
    expect(analyticsCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(analyticsCalls[0][1].body);
    expect(body.name).toBe("seo_entity_fetch_failed");
    expect(body.errorCode).toBe("product");
  });

  it("fires seo_entity_fetch_failed when a network error occurs on a product fetch", async () => {
    const fn = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/analytics/events")) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      throw new Error("ECONNREFUSED");
    });
    vi.stubGlobal("fetch", fn);
    await injectSeoTagsAsync(HTML, "/en-ae/dubai/product/unreachable", OPTS);
    const analyticsCalls = fn.mock.calls.filter((c) =>
      String(c[0]).includes("/api/analytics/events"),
    );
    expect(analyticsCalls.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(analyticsCalls[0][1].body).name).toBe("seo_entity_fetch_failed");
  });

  it("fires seo_entity_fetch_failed with errorCode=brand when a brand fetch fails", async () => {
    const fetchMock = makeAnalyticsMock({ ok: false });
    await injectSeoTagsAsync(HTML, "/en-ae/dubai/brand/missing-brand", OPTS);
    const analyticsCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/analytics/events"),
    );
    expect(analyticsCalls.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(analyticsCalls[0][1].body).errorCode).toBe("brand");
  });

  it("fires seo_entity_fetch_failed with errorCode=category when a category fetch fails", async () => {
    const fetchMock = makeAnalyticsMock({ ok: false });
    await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", { ...OPTS, search: "?n=missing-cat" });
    const analyticsCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/analytics/events"),
    );
    expect(analyticsCalls.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(analyticsCalls[0][1].body).errorCode).toBe("category");
  });

  it("does NOT fire seo_entity_fetch_failed when the entity fetch succeeds", async () => {
    const fn = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/analytics/events")) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Happy Path",
              description: "All good.",
              image: null,
              priceValue: 50,
            },
          }),
        };
      }
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
    });
    vi.stubGlobal("fetch", fn);
    await injectSeoTagsAsync(HTML, "/en-ae/dubai/product/happy-path", OPTS);
    const analyticsCalls = fn.mock.calls.filter((c) =>
      String(c[0]).includes("/api/analytics/events"),
    );
    expect(analyticsCalls.length).toBe(0);
  });

  it("still returns the generic fallback HTML when seo_entity_fetch_failed fires", async () => {
    makeAnalyticsMock({ ok: false });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/product/any-slug",
      OPTS,
    );
    expect(out).toContain("<title>Gift Delivery in Dubai | Presentail</title>");
    expect(out).not.toContain('property="product:price:amount"');
  });
});

// ---------------------------------------------------------------------------
// ETag / Last-Modified conditional request support
//
// When fetchEntityForSeoCached re-fetches an entity after its TTL expires, it
// sends If-None-Match / If-Modified-Since headers if the previous response
// provided an ETag or Last-Modified value. The upstream can then respond with
// 304 Not Modified to indicate that the entity — and therefore its image URLs
// — have not changed. In that case the cached entity is restored with a fresh
// TTL and image-dims are NOT re-fetched (they are still accurate). A 200
// response means the entity changed; dims ARE evicted and re-probed.
//
// Tests use vi.useFakeTimers({ toFake: ['Date'] }) so only Date.now() is faked;
// real setTimeout keeps the AbortController timer in fetchImageDimensions working.
// ---------------------------------------------------------------------------

const ETAG_HTML = `<!doctype html><html lang="en"><head><title>Old</title></head><body></body></html>`;
const ETAG_OPTS = {
  apiBaseUrl: "https://api.etag-test",
  origin: "",
  basePath: "",
};

function makeFakeHeaders(map: Record<string, string | null>) {
  return {
    get: (name: string) => map[name.toLowerCase()] ?? null,
  };
}

describe("ETag conditional requests — 304 branch (no dims eviction)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does NOT re-fetch image dims on a 304 response within cache TTL (product)", async () => {
    // When the upstream returns an ETag on the first fetch, a second request
    // WITHIN the 60s entity TTL must still send If-None-Match and skip dims
    // eviction when the server confirms the entity is unchanged (304).
    const pngBuf = makePngBuffer(800, 600);
    const imageUrl = "https://cdn.etag-test/product-etag-304-withinttl-unique.png";
    const entityEtag = '"etag-v1-within-ttl-product-304"';
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/product")) {
        entityFetchCount++;
        const ifNoneMatch = (init?.headers as Record<string, string> | undefined)?.["If-None-Match"];
        if (ifNoneMatch === entityEtag) {
          // Conditional request within TTL → entity unchanged → 304.
          return { ok: false, status: 304, headers: makeFakeHeaders({}) };
        }
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ etag: entityEtag }),
          json: async () => ({
            ok: true,
            product: {
              name: "ETag 304 Within TTL Product",
              description: "Conditional within-TTL test.",
              image: { uri: imageUrl },
              priceValue: 75,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity + dims freshly fetched; ETag stored in entity cache.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-304-withinttl-product", ETAG_OPTS);
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Second call immediately (WITHIN TTL): because we stored an ETag, a
    // conditional request must be sent even though the TTL has not expired.
    // The server returns 304 → entity served from cache, dims NOT re-probed.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-304-withinttl-product", ETAG_OPTS);
    expect(entityFetchCount).toBe(2); // conditional request sent within TTL
    expect(dimsFetchCount).toBe(1);   // 304 → no dims eviction
  });

  it("does NOT re-fetch image dims on a 304 response within cache TTL (brand)", async () => {
    const pngBuf = makePngBuffer(600, 400);
    const imageUrl = "https://cdn.etag-test/brand-etag-304-withinttl-unique.png";
    const entityEtag = '"etag-v1-within-ttl-brand-304"';
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/brand-products")) {
        // product-count fetch — not an entity fetch
        return { ok: true, json: async () => ({ ok: true, count: 5 }) };
      }
      if (u.includes("/api/woo/brand")) {
        entityFetchCount++;
        const ifNoneMatch = (init?.headers as Record<string, string> | undefined)?.["If-None-Match"];
        if (ifNoneMatch === entityEtag) {
          return { ok: false, status: 304, headers: makeFakeHeaders({}) };
        }
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ etag: entityEtag }),
          json: async () => ({
            ok: true,
            brand: { name: "ETag Within-TTL Brand", description: "Brand within-TTL test.", image: imageUrl },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/brand/etag-304-withinttl-brand", ETAG_OPTS);
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Second call within TTL: conditional request → 304 → no dims re-fetch.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/brand/etag-304-withinttl-brand", ETAG_OPTS);
    expect(entityFetchCount).toBe(2);
    expect(dimsFetchCount).toBe(1);
  });

  it("does NOT re-fetch image dims on a 304 response within cache TTL (occasion)", async () => {
    const pngBuf = makePngBuffer(600, 400);
    const imageUrl = "https://cdn.etag-test/occasion-etag-304-withinttl-unique.png";
    const entityEtag = '"etag-v1-within-ttl-occasion-304"';
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/occasion-products")) {
        // SEO listing fetch — not counted as an entity or dims fetch.
        return { ok: true, json: async () => ({ ok: true, groups: [] }) };
      }
      if (u.includes("/api/woo/occasion")) {
        entityFetchCount++;
        const ifNoneMatch = (init?.headers as Record<string, string> | undefined)?.["If-None-Match"];
        if (ifNoneMatch === entityEtag) {
          return { ok: false, status: 304, headers: makeFakeHeaders({}) };
        }
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ etag: entityEtag }),
          json: async () => ({
            ok: true,
            occasion: { name: "ETag Within-TTL Occasion", description: "Occasion within-TTL test.", image: imageUrl },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const occasionOpts = { ...ETAG_OPTS, search: "?occasion=etag-304-withinttl-occasion-unique" };

    // First call: entity + dims freshly fetched; ETag stored in entity cache.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/shop", occasionOpts);
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Second call within TTL: conditional request with If-None-Match → 304 → no dims re-fetch.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/shop", occasionOpts);
    expect(entityFetchCount).toBe(2);
    expect(dimsFetchCount).toBe(1);
  });

  it("does NOT re-fetch image dims on a 304 response within cache TTL (brands-filter occasion)", async () => {
    const pngBuf = makePngBuffer(600, 400);
    const imageUrl = "https://cdn.etag-test/brands-occ-etag-304-withinttl-unique.png";
    const entityEtag = '"etag-v1-within-ttl-brands-occ-304"';
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/occasion")) {
        entityFetchCount++;
        const ifNoneMatch = (init?.headers as Record<string, string> | undefined)?.["If-None-Match"];
        if (ifNoneMatch === entityEtag) {
          return { ok: false, status: 304, headers: makeFakeHeaders({}) };
        }
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ etag: entityEtag }),
          json: async () => ({
            ok: true,
            occasion: { name: "ETag Within-TTL Brands Occasion", description: "Brands-filter occasion within-TTL test.", image: imageUrl },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const brandsOccasionOpts = { ...ETAG_OPTS, search: "?occasion=etag-304-withinttl-brands-occ-unique" };

    // First call: entity + dims freshly fetched; ETag stored in entity cache.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/brands", brandsOccasionOpts);
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Second call within TTL: conditional request with If-None-Match → 304 → no dims re-fetch.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/brands", brandsOccasionOpts);
    expect(entityFetchCount).toBe(2);
    expect(dimsFetchCount).toBe(1);
  });

  it("does NOT re-fetch image dims on a 304 response within cache TTL (brands-filter category)", async () => {
    const pngBuf = makePngBuffer(600, 400);
    const imageUrl = "https://cdn.etag-test/brands-cat-etag-304-withinttl-unique.png";
    const entityEtag = '"etag-v1-within-ttl-brands-cat-304"';
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/category")) {
        entityFetchCount++;
        const ifNoneMatch = (init?.headers as Record<string, string> | undefined)?.["If-None-Match"];
        if (ifNoneMatch === entityEtag) {
          return { ok: false, status: 304, headers: makeFakeHeaders({}) };
        }
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ etag: entityEtag }),
          json: async () => ({
            ok: true,
            category: { name: "ETag Within-TTL Brands Category", description: "Brands-filter category within-TTL test.", image: imageUrl },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    const brandsCategoryOpts = { ...ETAG_OPTS, search: "?category=etag-304-withinttl-brands-cat-unique" };

    // First call: entity + dims freshly fetched; ETag stored in entity cache.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/brands", brandsCategoryOpts);
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Second call within TTL: conditional request with If-None-Match → 304 → no dims re-fetch.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/brands", brandsCategoryOpts);
    expect(entityFetchCount).toBe(2);
    expect(dimsFetchCount).toBe(1);
  });

  it("sends If-None-Match on the second request within TTL (not just after expiry)", async () => {
    const imageUrl = "https://cdn.etag-test/product-etag-hdrcheck-withinttl-unique.png";
    const entityEtag = '"etag-hdrcheck-within-ttl-v1"';
    const capturedHeaders: Array<Record<string, string>> = [];

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/product")) {
        const h = (init?.headers ?? {}) as Record<string, string>;
        capturedHeaders.push({ ...h });
        if (h["If-None-Match"] === entityEtag) {
          return { ok: false, status: 304, headers: makeFakeHeaders({}) };
        }
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ etag: entityEtag }),
          json: async () => ({
            ok: true,
            product: {
              name: "Header Check Within TTL",
              description: "Verifies If-None-Match is sent within TTL.",
              image: { uri: imageUrl },
              priceValue: 50,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBuffer(800, 600) };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: no conditional headers yet.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-hdrcheck-withinttl-product", ETAG_OPTS);
    // Second call immediately (within TTL): should carry If-None-Match.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-hdrcheck-withinttl-product", ETAG_OPTS);

    expect(capturedHeaders[0]?.["If-None-Match"]).toBeUndefined();
    expect(capturedHeaders[1]?.["If-None-Match"]).toBe(entityEtag);
  });

  it("falls back to cached entity when the conditional request fails within TTL", async () => {
    // Network error on the conditional request → cached entity must be served
    // instead of falling back to the generic SEO template.
    const imageUrl = "https://cdn.etag-test/product-etag-304-errf-withinttl-unique.png";
    const entityEtag = '"etag-errf-within-ttl-v1"';
    let entityFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/product")) {
        entityFetchCount++;
        const h = (init?.headers ?? {}) as Record<string, string>;
        if (h["If-None-Match"] === entityEtag) {
          // Conditional request within TTL fails.
          throw new Error("ETIMEDOUT");
        }
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ etag: entityEtag }),
          json: async () => ({
            ok: true,
            product: {
              name: "Fallback Product",
              description: "Should be served from cache on conditional error.",
              image: { uri: imageUrl },
              priceValue: 70,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBuffer(800, 600) };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity cached.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-errf-withinttl-product", ETAG_OPTS);

    // Second call within TTL: conditional request fails → should still serve
    // the cached entity (not the generic fallback).
    const out = await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-errf-withinttl-product", ETAG_OPTS);
    expect(out).toContain("<title>Fallback Product — Dubai | Presentail</title>");
    expect(entityFetchCount).toBe(2); // conditional attempt was made
  });
});

describe("ETag conditional requests — 200 branch (dims evicted on entity change)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("evicts and re-fetches dims when upstream returns 200 on a conditional request within TTL", async () => {
    const pngBuf = makePngBuffer(1200, 630);
    const imageUrl = "https://cdn.etag-test/product-etag-200-withinttl-unique.png";
    const entityEtag = '"etag-v1-within-ttl-200-changed"';
    const entityEtagV2 = '"etag-v2-within-ttl-200-changed"';
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/product")) {
        entityFetchCount++;
        const ifNoneMatch = (init?.headers as Record<string, string> | undefined)?.["If-None-Match"];
        // Second request carries the old ETag → server says content changed (200).
        const responseEtag = ifNoneMatch === entityEtag ? entityEtagV2 : entityEtag;
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ etag: responseEtag }),
          json: async () => ({
            ok: true,
            product: {
              name: "ETag 200 Changed Within TTL",
              description: "Entity changed, dims must be re-fetched.",
              image: { uri: imageUrl },
              priceValue: 85,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity + dims fetched.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-200-withinttl-product", ETAG_OPTS);
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);

    // Second call within TTL: conditional request → upstream returns 200 (entity
    // changed) → dims must be evicted and re-fetched immediately.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/etag-200-withinttl-product", ETAG_OPTS);
    expect(entityFetchCount).toBe(2);
    expect(dimsFetchCount).toBe(2); // dims re-probed because entity changed
  });

  it("uses Last-Modified for conditional request within TTL when no ETag is present", async () => {
    const pngBuf = makePngBuffer(640, 480);
    const imageUrl = "https://cdn.etag-test/product-lm-withinttl-unique.png";
    const lastModifiedValue = "Sat, 31 May 2026 10:00:00 GMT";
    const capturedHeaders: Array<Record<string, string>> = [];
    let entityFetchCount = 0;
    let dimsFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/woo/product")) {
        entityFetchCount++;
        const h = (init?.headers ?? {}) as Record<string, string>;
        capturedHeaders.push({ ...h });
        const ifModifiedSince = h["If-Modified-Since"];
        if (ifModifiedSince === lastModifiedValue) {
          return { ok: false, status: 304, headers: makeFakeHeaders({}) };
        }
        return {
          ok: true,
          status: 200,
          headers: makeFakeHeaders({ "last-modified": lastModifiedValue }),
          json: async () => ({
            ok: true,
            product: {
              name: "LM Within TTL Product",
              description: "Last-Modified within-TTL test.",
              image: { uri: imageUrl },
              priceValue: 60,
            },
          }),
        };
      }
      dimsFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => pngBuf };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity fetched, Last-Modified stored.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/lm-withinttl-product", ETAG_OPTS);
    expect(entityFetchCount).toBe(1);
    expect(dimsFetchCount).toBe(1);
    expect(capturedHeaders[0]?.["If-Modified-Since"]).toBeUndefined();

    // Second call within TTL: If-Modified-Since sent; 304 returned; dims NOT re-fetched.
    await injectSeoTagsAsync(ETAG_HTML, "/en-ae/dubai/product/lm-withinttl-product", ETAG_OPTS);
    expect(entityFetchCount).toBe(2);
    expect(capturedHeaders[1]?.["If-Modified-Since"]).toBe(lastModifiedValue);
    expect(dimsFetchCount).toBe(1); // 304 → no dims eviction
  });
});

// ---------------------------------------------------------------------------
// Image dims L2 cache — initImageDimsDb adapter tests
//
// These tests inject a mock L2 adapter and verify that:
//   1. An L2 hit is returned on L1 miss (no network image fetch).
//   2. A fresh fetch is stored in L2 via adapter.set().
//   3. An L2 null entry (no parseable dims) is returned without a network fetch.
//   4. evictImageDims (triggered by entity cache miss) does NOT call adapter.del()
//      because L2 staleness is handled by its 24 h TTL.
//   5. L2 errors are non-fatal — the fetch still proceeds normally.
//
// Each test uses a URL unique to its scenario to avoid L1 cache cross-talk.
// initImageDimsDb(null) is called in afterEach to restore the default (L1-only)
// mode for all other tests in this file.
// ---------------------------------------------------------------------------

function makePngBufferSimple(w: number, h: number): ArrayBuffer {
  const b = new Uint8Array(24);
  b[0] = 0x89; b[1] = 0x50; b[2] = 0x4e; b[3] = 0x47; // PNG sig
  b[16] = (w >> 24) & 0xff; b[17] = (w >> 16) & 0xff;
  b[18] = (w >> 8) & 0xff; b[19] = w & 0xff;
  b[20] = (h >> 24) & 0xff; b[21] = (h >> 16) & 0xff;
  b[22] = (h >> 8) & 0xff; b[23] = h & 0xff;
  return b.buffer;
}

const L2_HTML = `<!doctype html><html lang="en"><head><title>Old</title></head><body></body></html>`;
const L2_OPTS = {
  apiBaseUrl: "https://api.l2-test",
  origin: "",
  basePath: "",
};

describe("image dims L2 cache — initImageDimsDb adapter", () => {
  afterEach(() => {
    initImageDimsDb(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("serves dims from L2 on L1 miss without a network image fetch", async () => {
    const imageUrl = "https://cdn.l2-test/l2-hit-unique.png";
    const l2Store: Map<string, { width: number; height: number } | null> = new Map();
    l2Store.set(imageUrl, { width: 1200, height: 630 });

    initImageDimsDb({
      async get(url: string) { return l2Store.get(url); },
      async set(_url: string, _dims: unknown) {},
      async del(_url: string) {},
    });

    let imageFetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "L2 Hit Product",
              description: "Dims from L2.",
              image: { uri: imageUrl },
              priceValue: 70,
            },
          }),
        };
      }
      // Any fetch to the image CDN should NOT happen (L2 hit).
      imageFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(999, 999) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      L2_HTML,
      "/en-ae/dubai/product/l2-hit-product",
      L2_OPTS,
    );

    expect(imageFetchCount).toBe(0);
    expect(out).toContain('<meta property="og:image:width" content="1200"');
    expect(out).toContain('<meta property="og:image:height" content="630"');
  });

  it("writes freshly fetched dims to L2 via adapter.set()", async () => {
    const imageUrl = "https://cdn.l2-test/l2-write-unique.png";
    const l2Writes: Array<{ url: string; dims: unknown }> = [];

    initImageDimsDb({
      async get(_url: string) { return undefined; }, // always miss
      async set(url: string, dims: unknown) { l2Writes.push({ url, dims }); },
      async del(_url: string) {},
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "L2 Write Product",
              description: "Dims written to L2.",
              image: { uri: imageUrl },
              priceValue: 55,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(800, 600) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await injectSeoTagsAsync(
      L2_HTML,
      "/en-ae/dubai/product/l2-write-product",
      L2_OPTS,
    );

    expect(l2Writes).toHaveLength(1);
    expect(l2Writes[0].url).toBe(imageUrl);
    expect(l2Writes[0].dims).toEqual({ width: 800, height: 600 });
  });

  it("serves a null entry from L2 (cached no-dims) without a network image fetch", async () => {
    const imageUrl = "https://cdn.l2-test/l2-null-unique.png";
    const l2Store: Map<string, null> = new Map();
    l2Store.set(imageUrl, null);

    initImageDimsDb({
      async get(url: string) { return l2Store.get(url) === undefined ? undefined : l2Store.get(url); },
      async set(_url: string, _dims: unknown) {},
      async del(_url: string) {},
    });

    let imageFetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "L2 Null Product",
              description: "No dims in L2.",
              image: { uri: imageUrl },
              priceValue: 40,
            },
          }),
        };
      }
      imageFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(700, 500) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      L2_HTML,
      "/en-ae/dubai/product/l2-null-product",
      L2_OPTS,
    );

    // L2 returned null (no parseable dims) → no image fetch, no width/height tags.
    expect(imageFetchCount).toBe(0);
    expect(out).not.toContain('property="og:image:width"');
    expect(out).not.toContain('property="og:image:height"');
  });

  it("evictImageDims (entity cache miss) does NOT call adapter.del() — L2 preserves dims across restarts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const imageUrl = "https://cdn.l2-test/l2-preservation-unique.png";
    const l2Dels: string[] = [];

    initImageDimsDb({
      async get(_url: string) { return undefined; },
      async set(_url: string, _dims: unknown) {},
      async del(url: string) { l2Dels.push(url); },
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "L2 Preservation Product",
              description: "Eviction test.",
              image: { uri: imageUrl },
              priceValue: 60,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(1200, 628) };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity freshly fetched → evictImageDims evicts L1 only (not L2).
    await injectSeoTagsAsync(L2_HTML, "/en-ae/dubai/product/l2-preservation-product", L2_OPTS);
    // L2 must NOT be deleted: evictImageDims only touches L1 so dims survive restarts.
    expect(l2Dels).toHaveLength(0);

    // Advance past entity TTL so the entity cache expires.
    vi.setSystemTime(new Date(Date.now() + 61_000));

    // Second call: entity cache miss → fresh entity fetch → evictImageDims (L1 only).
    await injectSeoTagsAsync(L2_HTML, "/en-ae/dubai/product/l2-preservation-product", L2_OPTS);
    // L2 still must not be deleted across the full lifecycle.
    expect(l2Dels).toHaveLength(0);

    vi.useRealTimers();
  });

  it("serves dims from L2 when entity cache is cold (restart simulation) — no CDN fetch", async () => {
    // This test simulates a server restart: L1 is empty (in-process Map cleared),
    // L2 has persisted dims from before the restart, entity cache is also cold.
    // Expected: first crawl after restart uses L2 dims, no CDN Range-fetch fires.
    const imageUrl = "https://cdn.l2-test/l2-restart-sim-unique.png";
    let imageFetchCount = 0;

    initImageDimsDb({
      // L2 already has dims (persisted before the simulated restart).
      async get(url: string) {
        if (url === imageUrl) return { width: 1200, height: 628 };
        return undefined;
      },
      async set(_url: string, _dims: unknown) {},
      async del(_url: string) {},
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Restart Sim Product",
              description: "Dims must come from L2.",
              image: { uri: imageUrl },
              priceValue: 75,
            },
          }),
        };
      }
      // Any CDN Range-fetch would be a test failure.
      imageFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(999, 999) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      L2_HTML,
      "/en-ae/dubai/product/restart-sim-product",
      L2_OPTS,
    );

    // L2 provided dims → no CDN Range-fetch.
    expect(imageFetchCount).toBe(0);
    // Correct dims from L2 are emitted in the HTML.
    expect(out).toContain('<meta property="og:image:width" content="1200"');
    expect(out).toContain('<meta property="og:image:height" content="628"');
  });

  it("continues normally when the L2 adapter throws on get()", async () => {
    const imageUrl = "https://cdn.l2-test/l2-error-unique.png";

    initImageDimsDb({
      async get(_url: string) { throw new Error("DB connection refused"); },
      async set(_url: string, _dims: unknown) {},
      async del(_url: string) {},
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "L2 Error Product",
              description: "L2 throws but fetch continues.",
              image: { uri: imageUrl },
              priceValue: 50,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(640, 480) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      L2_HTML,
      "/en-ae/dubai/product/l2-error-product",
      L2_OPTS,
    );

    // Despite L2 throwing, the network fetch still ran and dims are present.
    expect(out).toContain('<meta property="og:image:width" content="640"');
    expect(out).toContain('<meta property="og:image:height" content="480"');
  });

  it("populates L1 from L2 hit so a second call is served without L2 round-trip", async () => {
    const imageUrl = "https://cdn.l2-test/l2-warm-l1-unique.png";
    let l2GetCount = 0;

    initImageDimsDb({
      async get(_url: string) {
        l2GetCount++;
        return { width: 400, height: 300 };
      },
      async set(_url: string, _dims: unknown) {},
      async del(_url: string) {},
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/product")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "L2 Warm L1 Product",
              description: "L1 warmed from L2.",
              image: { uri: imageUrl },
              priceValue: 65,
            },
          }),
        };
      }
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(400, 300) };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: L1 miss → L2 hit → L1 warmed.
    await injectSeoTagsAsync(L2_HTML, "/en-ae/dubai/product/l2-warm-l1-product", L2_OPTS);
    expect(l2GetCount).toBe(1);

    // Second call: L1 is now warm → L2 not consulted.
    await injectSeoTagsAsync(L2_HTML, "/en-ae/dubai/product/l2-warm-l1-product", L2_OPTS);
    expect(l2GetCount).toBe(1); // still 1 — L1 served the second request
  });

  // -------------------------------------------------------------------------
  // Occasion entity — L2 read and write paths
  //
  // Occasions carry `entity.image` as a plain string (not `{ uri }`) so they
  // exercise the second branch of `extractEntityImageUrls`. These tests confirm
  // that the L2 adapter is consulted and written to for occasion entities, not
  // just for products.
  // -------------------------------------------------------------------------

  it("serves occasion image dims from L2 on L1 miss without a CDN fetch", async () => {
    const imageUrl = "https://cdn.l2-test/l2-occasion-hit-unique.png";
    const l2Store: Map<string, { width: number; height: number } | null> = new Map();
    l2Store.set(imageUrl, { width: 1200, height: 630 });

    initImageDimsDb({
      async get(url: string) { return l2Store.get(url); },
      async set(_url: string, _dims: unknown) {},
      async del(_url: string) {},
    });

    let imageFetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/occasion")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            ok: true,
            occasion: {
              name: "L2 Hit Occasion",
              description: "Dims must come from L2, not a CDN fetch.",
              image: imageUrl,
            },
          }),
        };
      }
      // Any fetch to the image CDN must NOT happen (L2 hit).
      imageFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(999, 999) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      L2_HTML,
      "/en-ae/dubai/shop",
      { ...L2_OPTS, search: "?occasion=l2-occasion-hit-unique-slug" },
    );

    // L2 supplied dims → no CDN Range-fetch.
    expect(imageFetchCount).toBe(0);
    // Correct dims from L2 appear in the output.
    expect(out).toContain('<meta property="og:image:width" content="1200"');
    expect(out).toContain('<meta property="og:image:height" content="630"');
  });

  it("writes freshly fetched occasion image dims to L2 via adapter.set()", async () => {
    const imageUrl = "https://cdn.l2-test/l2-occasion-write-unique.png";
    const l2Writes: Array<{ url: string; dims: unknown }> = [];

    initImageDimsDb({
      async get(_url: string) { return undefined; }, // L2 miss — fall through to CDN fetch
      async set(url: string, dims: unknown) { l2Writes.push({ url, dims }); },
      async del(_url: string) {},
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/occasion")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            ok: true,
            occasion: {
              name: "L2 Write Occasion",
              description: "Freshly fetched dims must be written to L2.",
              image: imageUrl,
            },
          }),
        };
      }
      // CDN Range-fetch: return a valid PNG with known dims.
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(900, 450) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await injectSeoTagsAsync(
      L2_HTML,
      "/en-ae/dubai/shop",
      { ...L2_OPTS, search: "?occasion=l2-occasion-write-unique-slug" },
    );

    // Dims were measured from the CDN and must have been written to L2.
    expect(l2Writes).toHaveLength(1);
    expect(l2Writes[0].url).toBe(imageUrl);
    expect(l2Writes[0].dims).toEqual({ width: 900, height: 450 });
  });

  // -------------------------------------------------------------------------
  // Brands-filter page — occasion slug path (/brands?occasion=<slug>)
  //
  // The `brandsFilter` branch in `injectSeoTagsAsync` is reached when the
  // pathname ends in "/brands" and the search contains `?occasion=<slug>`.
  // It calls `fetchEntityForSeoCached` with kind "occasion" which in turn
  // calls `fetchImageDimensions` — the same L2 adapter path exercised by the
  // product and occasion tests above. These two tests verify that the L2
  // adapter is consulted (hit) and written to (write) for this specific entry
  // point, which had no L2 coverage before.
  // -------------------------------------------------------------------------

  it("serves brands-filter occasion image dims from L2 on L1 miss without a CDN fetch", async () => {
    const imageUrl = "https://cdn.l2-test/l2-brands-filter-hit-unique.png";
    const l2Store: Map<string, { width: number; height: number } | null> = new Map();
    l2Store.set(imageUrl, { width: 1200, height: 630 });

    initImageDimsDb({
      async get(url: string) { return l2Store.get(url); },
      async set(_url: string, _dims: unknown) {},
      async del(_url: string) {},
    });

    let imageFetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/occasion")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            ok: true,
            occasion: {
              name: "Birthday",
              description: "Brands filtered by birthday occasion.",
              image: imageUrl,
            },
          }),
        };
      }
      // Any fetch to the image CDN must NOT happen (L2 hit).
      imageFetchCount++;
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(999, 999) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await injectSeoTagsAsync(
      L2_HTML,
      "/en-ae/dubai/brands",
      { ...L2_OPTS, search: "?occasion=l2-brands-filter-occasion-hit-slug" },
    );

    // L2 supplied dims → no CDN Range-fetch.
    expect(imageFetchCount).toBe(0);
    // Correct dims from L2 appear in the output.
    expect(out).toContain('<meta property="og:image:width" content="1200"');
    expect(out).toContain('<meta property="og:image:height" content="630"');
  });

  it("writes freshly fetched brands-filter occasion image dims to L2 via adapter.set()", async () => {
    const imageUrl = "https://cdn.l2-test/l2-brands-filter-write-unique.png";
    const l2Writes: Array<{ url: string; dims: unknown }> = [];

    initImageDimsDb({
      async get(_url: string) { return undefined; }, // L2 miss — fall through to CDN fetch
      async set(url: string, dims: unknown) { l2Writes.push({ url, dims }); },
      async del(_url: string) {},
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/woo/occasion")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            ok: true,
            occasion: {
              name: "Anniversary",
              description: "Brands filtered by anniversary occasion.",
              image: imageUrl,
            },
          }),
        };
      }
      // CDN Range-fetch: return a valid PNG with known dims.
      return { ok: true, status: 206, arrayBuffer: async () => makePngBufferSimple(1100, 550) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await injectSeoTagsAsync(
      L2_HTML,
      "/en-ae/dubai/brands",
      { ...L2_OPTS, search: "?occasion=l2-brands-filter-occasion-write-slug" },
    );

    // Dims were measured from the CDN and must have been written to L2.
    expect(l2Writes).toHaveLength(1);
    expect(l2Writes[0].url).toBe(imageUrl);
    expect(l2Writes[0].dims).toEqual({ width: 1100, height: 550 });
  });
});

// ---------------------------------------------------------------------------
// Shared-link preview cache — entity cache hit, null-not-cached, and
// analytics-not-on-cache-hit
//
// The `fetchEntityForSeoCached` wrapper caches successful entity lookups in an
// in-process LRU+TTL map so that aggressive social-crawler retries (WhatsApp,
// iMessage, Slack) are served without hitting the upstream on every request.
//
// Key invariants:
//   1. A cached hit skips the upstream fetch entirely.
//   2. A null (failed) result is NOT cached — the next crawler hit retries.
//   3. The `seo_entity_fetch_failed` analytics event fires only on a live
//      fetch failure, never when the entity is served from the in-process cache.
// ---------------------------------------------------------------------------

const PREVIEW_HTML = `<!doctype html><html lang="en"><head><title>Old</title></head><body></body></html>`;
// Use a unique domain so these tests' cache entries never collide with other
// describe blocks in this file.
const PREVIEW_OPTS = {
  apiBaseUrl: "https://api.preview-cache-test",
  origin: "https://presentail.preview-cache-test",
  basePath: "",
};

describe("shared-link preview cache — cache-hit skips upstream (product)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not call the product endpoint a second time within TTL when no ETag is stored", async () => {
    let entityFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/product")) {
        entityFetchCount++;
        // Return no ETag/Last-Modified so the pure TTL cache path is exercised.
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Cached Preview Product",
              description: "Should be served from cache on second call.",
              image: null,
              priceValue: 60,
            },
          }),
        };
      }
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: cache miss — upstream is hit.
    const out1 = await injectSeoTagsAsync(
      PREVIEW_HTML,
      "/en-ae/dubai/product/preview-cache-hit-product-unique",
      PREVIEW_OPTS,
    );
    expect(entityFetchCount).toBe(1);
    expect(out1).toContain("<title>Cached Preview Product — Dubai | Presentail</title>");

    // Second call immediately within TTL: entity must be served from the
    // in-process cache — the upstream must NOT be called again.
    const out2 = await injectSeoTagsAsync(
      PREVIEW_HTML,
      "/en-ae/dubai/product/preview-cache-hit-product-unique",
      PREVIEW_OPTS,
    );
    expect(entityFetchCount).toBe(1); // still 1 — served from cache
    expect(out2).toContain("<title>Cached Preview Product — Dubai | Presentail</title>");
  });
});

describe("shared-link preview cache — cache-hit skips upstream (brand)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not call the brand endpoint a second time within TTL when no ETag is stored", async () => {
    let entityFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/brand-products")) {
        // product-count fetch — not an entity fetch
        return { ok: true, json: async () => ({ ok: true, count: 3 }) };
      }
      if (u.includes("/api/woo/brand")) {
        entityFetchCount++;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            brand: {
              name: "Cached Preview Brand",
              description: "Brand served from cache.",
              image: null,
            },
          }),
        };
      }
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out1 = await injectSeoTagsAsync(
      PREVIEW_HTML,
      "/en-ae/dubai/brand/preview-cache-hit-brand-unique",
      PREVIEW_OPTS,
    );
    expect(entityFetchCount).toBe(1);
    expect(out1).toContain("<title>Cached Preview Brand | Presentail</title>");

    const out2 = await injectSeoTagsAsync(
      PREVIEW_HTML,
      "/en-ae/dubai/brand/preview-cache-hit-brand-unique",
      PREVIEW_OPTS,
    );
    expect(entityFetchCount).toBe(1); // still 1 — served from cache
    expect(out2).toContain("<title>Cached Preview Brand | Presentail</title>");
  });
});

describe("shared-link preview cache — null result is NOT cached", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries the upstream on the next call when the first product fetch returned null (HTTP error)", async () => {
    let entityFetchCount = 0;

    // First response: HTTP error → fetchEntityForSeo returns null → NOT cached.
    // Second response: success → entity is fetched live and cached.
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/product")) {
        entityFetchCount++;
        if (entityFetchCount === 1) {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Retry Product",
              description: "Fetched on the retry after null was not cached.",
              image: null,
              priceValue: 55,
            },
          }),
        };
      }
      // analytics/events
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: entity fetch fails → generic fallback HTML.
    const out1 = await injectSeoTagsAsync(
      PREVIEW_HTML,
      "/en-ae/dubai/product/preview-null-not-cached-unique",
      PREVIEW_OPTS,
    );
    expect(entityFetchCount).toBe(1);
    // Null result → generic title, not the product name.
    expect(out1).toContain("<title>Gift Delivery in Dubai | Presentail</title>");

    // Second call: because null was NOT cached, the upstream must be retried.
    const out2 = await injectSeoTagsAsync(
      PREVIEW_HTML,
      "/en-ae/dubai/product/preview-null-not-cached-unique",
      PREVIEW_OPTS,
    );
    expect(entityFetchCount).toBe(2); // upstream called again (null not cached)
    // This time the fetch succeeds → product-specific title is rendered.
    expect(out2).toContain("<title>Retry Product — Dubai | Presentail</title>");
  });

  it("retries the upstream on the next call when the first brand fetch threw a network error", async () => {
    let entityFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/brand-products")) {
        // product-count fetch — not an entity fetch
        return { ok: true, json: async () => ({ ok: true, count: 2 }) };
      }
      if (u.includes("/api/woo/brand")) {
        entityFetchCount++;
        if (entityFetchCount === 1) {
          throw new Error("ECONNREFUSED");
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            brand: {
              name: "Recovered Brand",
              description: "Fetched after the network error was not cached.",
              image: null,
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    // First call: network error → null (not cached) → generic fallback.
    await injectSeoTagsAsync(
      PREVIEW_HTML,
      "/en-ae/dubai/brand/preview-null-not-cached-brand-unique",
      PREVIEW_OPTS,
    );
    expect(entityFetchCount).toBe(1);

    // Second call: upstream must be retried because null was not cached.
    const out2 = await injectSeoTagsAsync(
      PREVIEW_HTML,
      "/en-ae/dubai/brand/preview-null-not-cached-brand-unique",
      PREVIEW_OPTS,
    );
    expect(entityFetchCount).toBe(2);
    expect(out2).toContain("<title>Recovered Brand | Presentail</title>");
  });
});

describe("shared-link preview cache — analytics event fired on live failure but not on cache hit", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fires seo_entity_fetch_failed on the live failure but NOT when the entity is served from cache", async () => {
    // Scenario:
    //   Call 1: product fetch succeeds → entity cached, no analytics event.
    //   Call 2: served from cache → upstream never called → no analytics event.
    //   Call 3 (separate slug): product fetch fails → analytics event fires.
    //
    // This confirms the event is a live-fetch signal, not a cache-layer signal.

    const successSlug = "preview-analytics-cache-hit-unique";
    const failSlug    = "preview-analytics-live-fail-unique";
    const analyticsCalls: string[] = [];
    let successFetchCount = 0;
    let failFetchCount = 0;

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);

      if (u.includes("/api/analytics/events")) {
        // Capture the POST body so we can assert on event names below.
        analyticsCalls.push(u);
        return { ok: true, json: async () => ({ ok: true }) };
      }

      if (u.includes(`slug=${successSlug}`)) {
        successFetchCount++;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            product: {
              name: "Analytics Cache Hit Product",
              description: "Success — no analytics event expected.",
              image: null,
              priceValue: 50,
            },
          }),
        };
      }

      if (u.includes(`slug=${failSlug}`)) {
        failFetchCount++;
        return { ok: false, status: 404, json: async () => ({}) };
      }

      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
    });
    vi.stubGlobal("fetch", fetchMock);

    // --- Successful entity: first call ---
    analyticsCalls.length = 0;
    await injectSeoTagsAsync(
      PREVIEW_HTML,
      `/en-ae/dubai/product/${successSlug}`,
      PREVIEW_OPTS,
    );
    expect(successFetchCount).toBe(1);
    expect(analyticsCalls).toHaveLength(0); // no event on success

    // --- Successful entity: second call (served from cache) ---
    analyticsCalls.length = 0;
    const out2 = await injectSeoTagsAsync(
      PREVIEW_HTML,
      `/en-ae/dubai/product/${successSlug}`,
      PREVIEW_OPTS,
    );
    expect(successFetchCount).toBe(1); // upstream skipped — cache hit
    expect(analyticsCalls).toHaveLength(0); // no event on cache hit
    expect(out2).toContain("<title>Analytics Cache Hit Product — Dubai | Presentail</title>");

    // --- Failed entity: live failure fires the event ---
    analyticsCalls.length = 0;
    await injectSeoTagsAsync(
      PREVIEW_HTML,
      `/en-ae/dubai/product/${failSlug}`,
      PREVIEW_OPTS,
    );
    expect(failFetchCount).toBe(1);
    expect(analyticsCalls.length).toBeGreaterThanOrEqual(1); // event fired on live failure
  });
});

// ---------------------------------------------------------------------------
// Bare /product/<slug> locale resolution (no locale prefix in path)
// Covers the bareProductSlug branch of injectSeoTagsAsync (~line 1700 in
// seo-inject.mjs): language is derived from hintLang → ?lang= → Accept-Language
// → "en" fallback so Arabic and French share previews work for mobile-app shares
// and external integrations that use the un-prefixed /product/<slug> URL form.
// ---------------------------------------------------------------------------

const BARE_HTML = `<!doctype html><html lang="en"><head><title>Old</title></head><body></body></html>`;
const BARE_OPTS = {
  apiBaseUrl: "https://api.bare-locale-test",
  origin: "https://presentail.bare-locale-test",
  basePath: "",
};

function makeBareProductFetch(overrides: {
  name?: string;
  description?: string;
  image?: { uri: string } | null;
  priceValue?: number;
} = {}) {
  const product = {
    name: "Velvet Rose Bouquet",
    description: "A dozen long-stem roses.",
    image: null,
    priceValue: 75,
    ...overrides,
  };
  return vi.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({ ok: true, product }),
  });
}

describe("injectSeoTagsAsync — /product/<slug> bare path — locale resolution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("produces Arabic OG tags when Accept-Language header is 'ar'", async () => {
    vi.stubGlobal("fetch", makeBareProductFetch({ name: "ورد مخملي" }));
    const out = await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-ar-accept-language-unique",
      { ...BARE_OPTS, acceptLanguage: "ar" },
    );
    expect(out).toContain('<html lang="ar" dir="rtl">');
    expect(out).toContain('<meta property="og:locale" content="ar_AE"');
  });

  it("passes lang=ar to the product API when Accept-Language is 'ar'", async () => {
    const fetchMock = makeBareProductFetch({ name: "ورد مخملي" });
    vi.stubGlobal("fetch", fetchMock);
    await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-ar-api-lang-unique",
      { ...BARE_OPTS, acceptLanguage: "ar" },
    );
    const productCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/woo/product"),
    );
    expect(productCall).toBeDefined();
    expect(String(productCall![0])).toContain("lang=ar");
  });

  it("uses the Arabic fallback description when the product has no description and Accept-Language is 'ar'", async () => {
    vi.stubGlobal("fetch", makeBareProductFetch({ description: "" }));
    const out = await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-ar-fallback-desc-unique",
      { ...BARE_OPTS, acceptLanguage: "ar" },
    );
    // entityFallbackDescription("ar", "product", name) templates the product name.
    expect(out).toContain("اطلب Velvet Rose Bouquet أونلاين");
  });

  it("produces French OG tags when ?lang=fr is in the query string", async () => {
    vi.stubGlobal("fetch", makeBareProductFetch({ name: "Bouquet de Roses" }));
    const out = await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-fr-query-param-unique",
      { ...BARE_OPTS, search: "?lang=fr" },
    );
    expect(out).toContain('<html lang="fr" dir="ltr">');
    expect(out).toContain('<meta property="og:locale" content="fr_FR"');
  });

  it("passes lang=fr to the product API when ?lang=fr is present", async () => {
    const fetchMock = makeBareProductFetch({ name: "Bouquet de Roses" });
    vi.stubGlobal("fetch", fetchMock);
    await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-fr-api-lang-unique",
      { ...BARE_OPTS, search: "?lang=fr" },
    );
    const productCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/woo/product"),
    );
    expect(productCall).toBeDefined();
    expect(String(productCall![0])).toContain("lang=fr");
  });

  it("uses the French fallback description when the product has no description and ?lang=fr", async () => {
    vi.stubGlobal("fetch", makeBareProductFetch({ description: "" }));
    const out = await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-fr-fallback-desc-unique",
      { ...BARE_OPTS, search: "?lang=fr" },
    );
    // entityFallbackDescription("fr", "product", name) templates the product name.
    expect(out).toContain("Commandez Velvet Rose Bouquet en ligne");
  });

  it("falls back to English when no lang hint is provided", async () => {
    vi.stubGlobal("fetch", makeBareProductFetch({ name: "Tulip Bunch" }));
    const out = await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-en-no-hint-unique",
      { ...BARE_OPTS },
    );
    expect(out).toContain('<html lang="en" dir="ltr">');
    expect(out).toContain('<meta property="og:locale" content="en_US"');
  });

  it("falls back to English for an unrecognised Accept-Language value", async () => {
    vi.stubGlobal("fetch", makeBareProductFetch({ name: "Tulip Bunch" }));
    const out = await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-en-unknown-lang-unique",
      { ...BARE_OPTS, acceptLanguage: "zh-CN" },
    );
    expect(out).toContain('<html lang="en" dir="ltr">');
    expect(out).toContain('<meta property="og:locale" content="en_US"');
  });

  it("uses the English fallback description when the product has no description and no lang hint", async () => {
    vi.stubGlobal("fetch", makeBareProductFetch({ description: "" }));
    const out = await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-en-fallback-desc-unique",
      { ...BARE_OPTS },
    );
    // entityFallbackDescription("en", "product", name) templates the product name.
    expect(out).toContain("Order Velvet Rose Bouquet online");
  });

  it("prefers ?lang= query param over Accept-Language header", async () => {
    vi.stubGlobal("fetch", makeBareProductFetch({ name: "Orchid Vase" }));
    const out = await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-lang-priority-query-unique",
      { ...BARE_OPTS, search: "?lang=fr", acceptLanguage: "ar" },
    );
    // ?lang=fr wins over Accept-Language: ar
    expect(out).toContain('<html lang="fr" dir="ltr">');
    expect(out).toContain('<meta property="og:locale" content="fr_FR"');
  });

  it("prefers hintLang over ?lang= query param and Accept-Language", async () => {
    vi.stubGlobal("fetch", makeBareProductFetch({ name: "Orchid Vase" }));
    const out = await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-lang-priority-hint-unique",
      { ...BARE_OPTS, hintLang: "ar", search: "?lang=fr", acceptLanguage: "en" },
    );
    // hintLang=ar wins over ?lang=fr and Accept-Language: en
    expect(out).toContain('<html lang="ar" dir="rtl">');
    expect(out).toContain('<meta property="og:locale" content="ar_AE"');
  });

  it("always uses countryCode=LB and cityId=lb-beirut for the bare product API call", async () => {
    const fetchMock = makeBareProductFetch({ name: "Rose" });
    vi.stubGlobal("fetch", fetchMock);
    await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-country-city-unique",
      { ...BARE_OPTS },
    );
    const productCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/woo/product"),
    );
    expect(productCall).toBeDefined();
    expect(String(productCall![0])).toContain("countryCode=LB");
    expect(String(productCall![0])).toContain("cityId=lb-beirut");
  });

  it("ignores an invalid ?lang= value and falls back to Accept-Language", async () => {
    vi.stubGlobal("fetch", makeBareProductFetch({ name: "Rose" }));
    const out = await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-invalid-query-lang-unique",
      { ...BARE_OPTS, search: "?lang=xx", acceptLanguage: "ar" },
    );
    // "xx" is not in SUPPORTED_LANGS → falls through to Accept-Language: ar
    expect(out).toContain('<html lang="ar" dir="rtl">');
  });

  it("falls back to generic preview when the product API returns ok=false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false }) }),
    );
    const out = await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-not-found-unique",
      { ...BARE_OPTS, acceptLanguage: "ar" },
    );
    // No product name in title — falls back to generic landing head.
    expect(out).not.toContain("bare-not-found-unique | Presentail");
    expect(out).not.toContain('property="product:price:amount"');
  });

  it("renders the product name and price in the head for a successful bare product fetch", async () => {
    vi.stubGlobal(
      "fetch",
      makeBareProductFetch({
        name: "Bare Rose Bouquet",
        description: "Fresh roses.",
        priceValue: 65,
      }),
    );
    const out = await injectSeoTagsAsync(
      BARE_HTML,
      "/product/bare-success-full-unique",
      { ...BARE_OPTS },
    );
    expect(out).toContain("<title>Bare Rose Bouquet | Presentail</title>");
    expect(out).toContain('content="Fresh roses."');
    expect(out).toContain('<meta property="product:price:amount" content="65.00"');
    expect(out).toContain('<meta property="product:price:currency" content="USD"');
  });
});

describe("genericSeoCache — cache-hit, TTL expiry, and FIFO eviction", () => {
  beforeEach(() => {
    genericSeoCache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the cached object on a second call within TTL (no recomputation)", () => {
    const opts = { origin: "https://presentail.test", basePath: "" };
    const first = buildSeoHead("/en-lb/beirut/shop", opts);
    const second = buildSeoHead("/en-lb/beirut/shop", opts);
    expect(second).toBe(first);
  });

  it("recomputes after the 60 s TTL has elapsed", () => {
    vi.useFakeTimers();
    const opts = { origin: "https://presentail.test", basePath: "" };
    const first = buildSeoHead("/en-ae/dubai", opts);
    vi.advanceTimersByTime(61_000);
    const second = buildSeoHead("/en-ae/dubai", opts);
    expect(second).not.toBe(first);
    expect(second.titleTag).toEqual(first.titleTag);
  });

  it("evicts the oldest entry when the 500-entry limit is reached", () => {
    const LIMIT = 500;
    const oldestKey = "oldest-entry\x00\x00";
    setCachedGenericSeo(oldestKey, { headSnippet: "oldest", titleTag: "oldest" });

    for (let i = 1; i < LIMIT; i++) {
      setCachedGenericSeo(`filler-${i}\x00\x00`, { headSnippet: `filler-${i}`, titleTag: "" });
    }
    expect(genericSeoCache.size).toBe(LIMIT);
    expect(genericSeoCache.has(oldestKey)).toBe(true);

    setCachedGenericSeo("newest-entry\x00\x00", { headSnippet: "newest", titleTag: "newest" });

    expect(genericSeoCache.size).toBe(LIMIT);
    expect(genericSeoCache.has(oldestKey)).toBe(false);
    expect(getCachedGenericSeo("newest-entry\x00\x00")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// JSON-LD structured data (schema.org) — rich results
//
// These assert that the server-injected HTML carries valid, well-formed
// schema.org JSON-LD so Google can render Product, BreadcrumbList,
// Organization/WebSite/Florist (Store) and FAQPage rich results. Every block
// must parse as JSON (no trailing junk, no broken escaping).
// ---------------------------------------------------------------------------

/** Extract and JSON.parse every <script type="application/ld+json"> block. */
function extractJsonLd(html: string): any[] {
  const re =
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const out: any[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    // Reverse the </script> escaping applied by jsonLdTag before parsing.
    const raw = m[1].replace(/<\\\/script>/gi, "</script>");
    const parsed = JSON.parse(raw);
    // Flatten @graph blocks so byType() can find nodes grouped into a single
    // <script> (the seo-inject pipeline groups multi-schema pages this way).
    if (parsed && Array.isArray(parsed["@graph"])) {
      for (const node of parsed["@graph"]) out.push(node);
    } else {
      out.push(parsed);
    }
  }
  return out;
}

const byType = (blocks: any[], type: string) =>
  blocks.find((b) => b && b["@type"] === type);

describe("JSON-LD — Product rich result on /product/<slug>", () => {
  it("emits a valid Product schema with name, image, brand and an in-stock offer", async () => {
    // Uses a slug not shared with other tests to avoid module-level cache
    // contamination: earlier tests cache "velvet-rose-bouquet" without brand.
    mockFetchOnce({
      ok: true,
      product: {
        name: "Velvet Rose Bouquet",
        description: "A dozen long-stem velvet roses, hand-tied.",
        image: { uri: "https://cdn.test/velvet.jpg" },
        priceValue: 89.5,
        inStock: true,
        brand: { name: "Presentail" },
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/product/branded-rose-collection",
      OPTS,
    );
    const blocks = extractJsonLd(out);
    const product = byType(blocks, "Product");
    expect(product).toBeTruthy();
    expect(product["@type"]).toBe("Product");
    expect(product.name).toBe("Velvet Rose Bouquet");
    expect(product.image).toBe("https://cdn.test/velvet.jpg");
    expect(product.brand).toEqual({ "@type": "Brand", name: "Presentail" });
    expect(product.url).toBe(
      "https://presentail.test/en-ae/dubai/product/branded-rose-collection",
    );
    // Offer carries shippingDetails + hasMerchantReturnPolicy so the listing
    // qualifies for Google's enhanced/free merchant results.
    // AE market: price is converted from USD to AED (3.6725 peg): 89.5 × 3.6725 = 328.69.
    // The original USD priceValue 89.50 is just below the AE free-delivery threshold
    // so the shippingDetails shows the AE standard delivery surcharge (4.90 USD).
    expect(product.offers).toEqual({
      "@type": "Offer",
      price: "328.69",
      priceCurrency: "AED",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      url: "https://presentail.test/en-ae/dubai/product/branded-rose-collection",
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: "4.90",
          currency: "USD",
        },
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: "AE",
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "AE",
        returnPolicyCategory:
          "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 7,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
      },
    });
  });

  it("emits free shipping in shippingDetails when the price clears the free-delivery threshold (LB)", async () => {
    mockFetchOnce({
      ok: true,
      product: {
        name: "Grand Luxe Hamper",
        description: "An opulent gift hamper.",
        image: { uri: "https://cdn.test/hamper.jpg" },
        priceValue: 150,
        inStock: true,
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-lb/beirut/product/grand-luxe-hamper",
      OPTS,
    );
    const product = byType(extractJsonLd(out), "Product");
    expect(product.offers.shippingDetails).toEqual({
      "@type": "OfferShippingDetails",
      shippingRate: {
        "@type": "MonetaryAmount",
        value: "0.00",
        currency: "USD",
      },
      shippingDestination: {
        "@type": "DefinedRegion",
        addressCountry: "LB",
      },
    });
    // Below-threshold LB products fall back to the LB standard surcharge (15).
    expect(product.offers.hasMerchantReturnPolicy.applicableCountry).toBe("LB");
  });

  it("shows the LB standard delivery surcharge for below-threshold products", async () => {
    mockFetchOnce({
      ok: true,
      product: {
        name: "Single Stem Rose",
        description: "A single long-stem rose.",
        image: { uri: "https://cdn.test/rose.jpg" },
        priceValue: 25,
        inStock: true,
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-lb/beirut/product/single-stem-rose",
      OPTS,
    );
    const product = byType(extractJsonLd(out), "Product");
    expect(product.offers.shippingDetails.shippingRate).toEqual({
      "@type": "MonetaryAmount",
      value: "15.00",
      currency: "USD",
    });
  });

  it("emits a Home > City > Product BreadcrumbList alongside the Product", async () => {
    mockFetchOnce({
      ok: true,
      product: {
        name: "Velvet Rose Bouquet",
        description: "A dozen long-stem velvet roses, hand-tied.",
        image: { uri: "https://cdn.test/velvet.jpg" },
        priceValue: 89.5,
        inStock: true,
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/product/velvet-rose-bouquet",
      OPTS,
    );
    const crumb = byType(extractJsonLd(out), "BreadcrumbList");
    expect(crumb).toBeTruthy();
    // No category on this product fixture, so the trail is Home > City > Product.
    expect(crumb.itemListElement.map((i: any) => i.name)).toEqual([
      "Home",
      "Dubai",
      "Velvet Rose Bouquet",
    ]);
    // Positions are 1-based and the leading crumbs carry an absolute item URL.
    expect(crumb.itemListElement[0]).toMatchObject({
      position: 1,
      item: "https://presentail.test",
    });
    expect(crumb.itemListElement[1]).toMatchObject({
      position: 2,
      item: "https://presentail.test/en-ae/dubai",
    });
    // The current page (last crumb) omits the item URL per schema.org guidance.
    expect(crumb.itemListElement[2].item).toBeUndefined();
  });
});

describe("JSON-LD — BreadcrumbList on brand / category / occasion pages", () => {
  it("emits Home > City > Brands > Brand on a brand page", async () => {
    mockFetchOnce({
      ok: true,
      brand: { name: "Acme Florals", description: "Hand-tied bouquets.", image: "https://cdn.test/acme.jpg" },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/brand/acme-florals", OPTS);
    const crumb = byType(extractJsonLd(out), "BreadcrumbList");
    expect(crumb).toBeTruthy();
    expect(crumb.itemListElement.map((i: any) => i.name)).toEqual([
      "Home",
      "Dubai",
      "Brands",
      "Acme Florals",
    ]);
  });

  it("emits Home > City > Category and an ItemList on a category page", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/category-products")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            count: 2,
            products: [{ name: "Red Roses" }, { name: "White Roses" }],
          }),
        };
      }
      if (u.includes("/api/woo/category")) {
        return { ok: true, json: async () => ({ ok: true, category: { name: "Roses", description: "Fresh roses." } }) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/category/roses-jsonld-fixture", OPTS);
    const blocks = extractJsonLd(out);
    const crumb = byType(blocks, "BreadcrumbList");
    expect(crumb.itemListElement.map((i: any) => i.name)).toEqual([
      "Home",
      "Dubai",
      "Roses",
    ]);
    const list = byType(blocks, "ItemList");
    expect(list).toBeTruthy();
    expect(list.numberOfItems).toBe(2);
    expect(list.itemListElement.map((i: any) => i.name)).toEqual([
      "Red Roses",
      "White Roses",
    ]);
  });

  it("emits Home > City > Occasions > Occasion on an occasion page", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/occasion")) {
        return { ok: true, json: async () => ({ ok: true, occasion: { name: "Birthday", description: "Birthday gifts." } }) };
      }
      if (u.includes("/api/woo/products")) {
        return { ok: true, json: async () => ({ ok: true, products: [{ name: "Balloon Set" }] }) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/occasion/birthday-jsonld-fixture", OPTS);
    const crumb = byType(extractJsonLd(out), "BreadcrumbList");
    expect(crumb.itemListElement.map((i: any) => i.name)).toEqual([
      "Home",
      "Dubai",
      "Occasions",
      "Birthday",
    ]);
    // The "Occasions" URL should be the occasions listing page.
    const occasionsCrumb = crumb.itemListElement.find((i: any) => i.name === "Occasions");
    expect(occasionsCrumb.item).toContain("/occasions");
  });
});

describe("JSON-LD — Product.sku and Product.brand", () => {
  it("uses osNumericId as the Product.sku when available", async () => {
    mockFetchOnce({
      ok: true,
      product: {
        name: "Sku Test Bouquet",
        description: "Hand-tied roses.",
        image: { uri: "https://cdn.test/sku-test.jpg" },
        priceValue: 89.5,
        inStock: true,
        osNumericId: 9001,
        wcId: 4242,
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/product/sku-test-bouquet-9001", OPTS);
    const product = byType(extractJsonLd(out), "Product");
    expect(product).toBeTruthy();
    // osNumericId takes precedence over wcId.
    expect(product.sku).toBe("9001");
  });

  it("falls back to wcId as Product.sku when osNumericId is absent", async () => {
    mockFetchOnce({
      ok: true,
      product: {
        name: "Sku Fallback Bouquet",
        description: "Hand-tied roses.",
        image: { uri: "https://cdn.test/sku-fallback.jpg" },
        priceValue: 89.5,
        inStock: true,
        wcId: 4242,
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/product/sku-fallback-bouquet-4242", OPTS);
    const product = byType(extractJsonLd(out), "Product");
    expect(product.sku).toBe("4242");
  });

  it("uses product.brand.name for Product.brand when available", async () => {
    mockFetchOnce({
      ok: true,
      product: {
        name: "Acme Roses",
        description: "Premium roses.",
        image: { uri: "https://cdn.test/acme.jpg" },
        priceValue: 60,
        inStock: true,
        brand: { name: "Acme Florals" },
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/product/acme-roses", OPTS);
    const product = byType(extractJsonLd(out), "Product");
    expect(product).toBeTruthy();
    expect(product.brand).toMatchObject({ "@type": "Brand", name: "Acme Florals" });
  });

  it("falls back to product.brands[0].name for Product.brand when brand is absent", async () => {
    mockFetchOnce({
      ok: true,
      product: {
        name: "Bloom Roses",
        description: "Premium roses.",
        image: { uri: "https://cdn.test/bloom.jpg" },
        priceValue: 55,
        inStock: true,
        brands: [{ name: "Bloom Studio" }, { name: "Other Brand" }],
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/product/bloom-roses", OPTS);
    const product = byType(extractJsonLd(out), "Product");
    expect(product.brand).toMatchObject({ "@type": "Brand", name: "Bloom Studio" });
  });

  it("omits Product.brand when neither brand nor brands is present", async () => {
    mockFetchOnce({
      ok: true,
      product: {
        name: "Generic Flowers",
        description: "A bunch of flowers.",
        image: { uri: "https://cdn.test/generic.jpg" },
        priceValue: 30,
        inStock: true,
      },
    });
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/product/generic-flowers", OPTS);
    const product = byType(extractJsonLd(out), "Product");
    expect(product.brand).toBeUndefined();
  });
});

describe("JSON-LD — FAQPage on category and occasion listing pages", () => {
  it("emits a FAQPage with 3 EN Question/Answer pairs substituted with name and city on a category page", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/category-products")) {
        return { ok: true, json: async () => ({ ok: true, count: 5, products: [] }) };
      }
      if (u.includes("/api/woo/category")) {
        return { ok: true, json: async () => ({ ok: true, category: { name: "Hand Bouquets", description: "Fresh hand bouquets." } }) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/category/hand-bouquets-faq-fixture", OPTS);
    const faq = byType(extractJsonLd(out), "FAQPage");
    expect(faq).toBeTruthy();
    expect(Array.isArray(faq.mainEntity)).toBe(true);
    expect(faq.mainEntity).toHaveLength(3);
    const first = faq.mainEntity[0];
    expect(first["@type"]).toBe("Question");
    expect(first.name).toContain("Hand Bouquets");
    expect(first.name).toContain("Dubai");
    expect(first.acceptedAnswer["@type"]).toBe("Answer");
    expect(typeof first.acceptedAnswer.text).toBe("string");
    expect(first.acceptedAnswer.text.length).toBeGreaterThan(10);
  });

  it("emits a FAQPage with 3 EN Question/Answer pairs substituted with name and city on an occasion page", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      // occasion-products must be checked BEFORE occasion to avoid false match
      if (u.includes("/api/woo/occasion-products")) {
        return { ok: true, json: async () => ({ ok: true, total: 2, groups: [{ count: 2, products: [{ name: "Birthday Bouquet", id: "birthday-bouquet" }] }] }) };
      }
      if (u.includes("/api/woo/occasion")) {
        return { ok: true, json: async () => ({ ok: true, occasion: { name: "Birthday", description: "Birthday gifts." } }) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/occasion/birthday-faq-fixture", OPTS);
    const faq = byType(extractJsonLd(out), "FAQPage");
    expect(faq).toBeTruthy();
    expect(faq.mainEntity).toHaveLength(3);
    const first = faq.mainEntity[0];
    expect(first.name).toContain("Birthday");
    expect(first.name).toContain("Dubai");
    expect(first.acceptedAnswer["@type"]).toBe("Answer");
  });

  it("emits Arabic FAQ copy when lang is ar on a category page", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/category-products")) {
        return { ok: true, json: async () => ({ ok: true, count: 2, products: [] }) };
      }
      if (u.includes("/api/woo/category")) {
        return { ok: true, json: async () => ({ ok: true, category: { name: "باقات يدوية", description: "" } }) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(HTML, "/ar-ae/dubai/category/hand-bouquets-ar-faq-fixture", OPTS);
    const faq = byType(extractJsonLd(out), "FAQPage");
    expect(faq).toBeTruthy();
    expect(faq.mainEntity).toHaveLength(3);
    expect(faq.mainEntity[0].name).toContain("باقات يدوية");
  });

  it("does not emit a FAQPage when the entity has no name", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/category-products")) {
        return { ok: true, json: async () => ({ ok: true, count: 0, products: [] }) };
      }
      if (u.includes("/api/woo/category")) {
        return { ok: true, json: async () => ({ ok: true, category: { name: "", description: "" } }) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/category/noname-faq-fixture", OPTS);
    const faq = byType(extractJsonLd(out), "FAQPage");
    expect(faq).toBeFalsy();
  });

  it("emits FAQPage for the legacy /shop?category=<slug> query-param route", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/category-products")) {
        return { ok: true, json: async () => ({ ok: true, count: 3, products: [] }) };
      }
      if (u.includes("/api/woo/category")) {
        return { ok: true, json: async () => ({ ok: true, category: { name: "Flower Boxes", description: "Beautiful flower boxes." } }) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "?category=flower-boxes",
    });
    const faq = byType(extractJsonLd(out), "FAQPage");
    expect(faq).toBeTruthy();
    expect(faq.mainEntity).toHaveLength(3);
    expect(faq.mainEntity[0].name).toContain("Flower Boxes");
  });

  it("emits FAQPage for the legacy /shop?occasion=<slug> query-param route", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      // occasion-products must be checked BEFORE occasion to avoid false match
      if (u.includes("/api/woo/occasion-products")) {
        return { ok: true, json: async () => ({ ok: true, total: 3, groups: [{ count: 3, products: [{ name: "Anniversary Bouquet", id: "anniversary-bouquet" }] }] }) };
      }
      if (u.includes("/api/woo/occasion")) {
        return { ok: true, json: async () => ({ ok: true, occasion: { name: "Anniversary", description: "Anniversary gifts." } }) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "?occasion=anniversary",
    });
    const faq = byType(extractJsonLd(out), "FAQPage");
    expect(faq).toBeTruthy();
    expect(faq.mainEntity).toHaveLength(3);
    expect(faq.mainEntity[0].name).toContain("Anniversary");
    expect(faq.mainEntity[0].name).toContain("Dubai");
  });
});

describe("JSON-LD — Organization / WebSite / Store on the homepage", () => {
  it("emits Organization and WebSite on a locale homepage", () => {
    const { headSnippet } = buildSeoHead("/en-ae/dubai", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const blocks = extractJsonLd(`<head>${headSnippet}</head>`);
    const org = byType(blocks, "Organization");
    expect(org).toBeTruthy();
    expect(org.name).toBe("Presentail");
    expect(org.url).toBe("https://presentail.test");
    expect(Array.isArray(org.sameAs)).toBe(true);
    // Logo should be the square app icon, not the OG banner image.
    expect(org.logo).toContain("android-chrome-512x512.png");
    expect(org.logo).not.toContain("opengraph.jpg");
    const site = byType(blocks, "WebSite");
    expect(site).toBeTruthy();
    // No SearchAction: the storefront has no crawlable /search results page,
    // only a client-side search overlay, so a sitelinks search box would point
    // at a non-existent URL.
    expect(site.potentialAction).toBeUndefined();
  });

  it("emits a Florist (LocalBusiness/Store) and a Home > City breadcrumb on a city homepage", () => {
    const { headSnippet } = buildSeoHead("/en-lb/beirut", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const blocks = extractJsonLd(`<head>${headSnippet}</head>`);
    const florist = byType(blocks, "Florist");
    expect(florist).toBeTruthy();
    expect(florist.name).toBe("Presentail");
    expect(florist.address["@type"]).toBe("PostalAddress");
    expect(florist.address.addressLocality).toBe("Beirut");
    // Logo and image should be the square app icon, not the OG banner image.
    expect(florist.logo).toContain("android-chrome-512x512.png");
    expect(florist.logo).not.toContain("opengraph.jpg");
    expect(florist.image).toContain("android-chrome-512x512.png");
    // LB accepts USD and LBP; paymentAccepted must be a non-empty string.
    expect(florist.currenciesAccepted).toBe("USD, LBP");
    expect(typeof florist.paymentAccepted).toBe("string");
    expect(florist.paymentAccepted.length).toBeGreaterThan(0);
    const crumb = byType(blocks, "BreadcrumbList");
    expect(crumb).toBeTruthy();
    expect(crumb.itemListElement.map((i: any) => i.name)).toEqual([
      "Home",
      "Beirut",
    ]);
    expect(crumb.itemListElement[0].item).toBe("https://presentail.test");
    // The current page (last crumb) omits the item URL per schema.org guidance.
    expect(crumb.itemListElement[1].item).toBeUndefined();
  });

  it("emits currenciesAccepted=AED on an AE city homepage", () => {
    const { headSnippet } = buildSeoHead("/en-ae/dubai", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const florist = byType(extractJsonLd(`<head>${headSnippet}</head>`), "Florist");
    expect(florist).toBeTruthy();
    expect(florist.currenciesAccepted).toBe("AED");
  });

  it("emits currenciesAccepted=EUR on a CY city homepage", () => {
    const { headSnippet } = buildSeoHead("/en-cy/nicosia", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const florist = byType(extractJsonLd(`<head>${headSnippet}</head>`), "Florist");
    expect(florist).toBeTruthy();
    expect(florist.currenciesAccepted).toBe("EUR");
  });

  it("emits Organization but no WebSite on a non-home content page", () => {
    const { headSnippet } = buildSeoHead("/en-ae/dubai/shop", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const blocks = extractJsonLd(`<head>${headSnippet}</head>`);
    expect(byType(blocks, "Organization")).toBeTruthy();
    // WebSite belongs only on the homepage, not on every content page.
    expect(byType(blocks, "WebSite")).toBeUndefined();
  });
});

describe("JSON-LD — excluded on cart / checkout / order-confirmed", () => {
  it.each(["cart", "checkout", "order-confirmed"])(
    "emits no JSON-LD on /%s",
    (route) => {
      const { headSnippet } = buildSeoHead(`/en-ae/dubai/${route}`, {
        origin: "https://presentail.test",
        basePath: "",
      });
      expect(extractJsonLd(`<head>${headSnippet}</head>`)).toHaveLength(0);
    },
  );
});

describe("JSON-LD — BreadcrumbList on static navigable pages", () => {
  it.each(["shop", "brands", "occasions", "faqs", "terms", "privacy", "contact"])(
    "emits a BreadcrumbList with Home > City > Page on /%s",
    (route) => {
      const { headSnippet } = buildSeoHead(`/en-ae/dubai/${route}`, {
        origin: "https://presentail.test",
        basePath: "",
      });
      const crumb = byType(extractJsonLd(`<head>${headSnippet}</head>`), "BreadcrumbList");
      expect(crumb, `BreadcrumbList missing on /${route}`).toBeTruthy();
      const names = crumb.itemListElement.map((i: any) => i.name);
      expect(names[0]).toBe("Home");
      expect(names[1]).toBe("Dubai");
      // Last crumb is the page itself and must not carry an item URL (current page).
      expect(crumb.itemListElement[crumb.itemListElement.length - 1].item).toBeUndefined();
    },
  );
});

describe("JSON-LD — WebPage / ContactPage on static pages", () => {
  it("emits a WebPage on /terms and /privacy", () => {
    for (const route of ["terms", "privacy"]) {
      const { headSnippet } = buildSeoHead(`/en-ae/dubai/${route}`, {
        origin: "https://presentail.test",
        basePath: "",
      });
      const blocks = extractJsonLd(`<head>${headSnippet}</head>`);
      const page = byType(blocks, "WebPage");
      expect(page, route).toBeTruthy();
      expect(typeof page.name).toBe("string");
      expect(page.url).toBe(`https://presentail.test/en-ae/dubai/${route}`);
      expect(page.isPartOf["@type"]).toBe("WebSite");
    }
  });

  it("emits a ContactPage on /contact", () => {
    const { headSnippet } = buildSeoHead("/en-ae/dubai/contact", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const page = byType(extractJsonLd(`<head>${headSnippet}</head>`), "ContactPage");
    expect(page).toBeTruthy();
    expect(page.url).toBe("https://presentail.test/en-ae/dubai/contact");
    expect(page.isPartOf["@type"]).toBe("WebSite");
  });
});

describe("JSON-LD — FAQPage on /brands listing page", () => {
  it("emits a FAQPage with 3 EN Question/Answer pairs with city substituted", () => {
    const { headSnippet } = buildSeoHead("/en-ae/dubai/brands", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const faq = byType(extractJsonLd(`<head>${headSnippet}</head>`), "FAQPage");
    expect(faq).toBeTruthy();
    expect(Array.isArray(faq.mainEntity)).toBe(true);
    expect(faq.mainEntity).toHaveLength(3);
    const first = faq.mainEntity[0];
    expect(first["@type"]).toBe("Question");
    expect(first.name).toBe("Which gift brands deliver in Dubai?");
    expect(first.acceptedAnswer["@type"]).toBe("Answer");
    expect(first.acceptedAnswer.text).toContain("Dubai");
    const third = faq.mainEntity[2];
    expect(third.name).toBe("Do all brands offer same-day delivery in Dubai?");
    expect(third.acceptedAnswer.text).toContain("Dubai");
  });

  it("emits a FAQPage in Arabic for an ar-locale /brands page", () => {
    const { headSnippet } = buildSeoHead("/ar-ae/dubai/brands", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const faq = byType(extractJsonLd(`<head>${headSnippet}</head>`), "FAQPage");
    expect(faq).toBeTruthy();
    expect(faq.mainEntity).toHaveLength(3);
    expect(faq.mainEntity[0].name).toContain("دبي");
  });

  it("emits a FAQPage in French for a fr-locale /brands page", () => {
    const { headSnippet } = buildSeoHead("/fr-ae/dubai/brands", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const faq = byType(extractJsonLd(`<head>${headSnippet}</head>`), "FAQPage");
    expect(faq).toBeTruthy();
    expect(faq.mainEntity).toHaveLength(3);
    expect(faq.mainEntity[0].name).toContain("Dubaï");
    expect(faq.mainEntity[0].name).toContain("livrent");
  });

  it("does not emit a FAQPage on /brands?category=<slug> filter pages (those use buildBrandsFilterHead)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, category: { name: "Tulips", image: null } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/brands", {
      ...OPTS,
      search: "?category=tulips",
    });
    const blocks = extractJsonLd(out);
    const faq = byType(blocks, "FAQPage");
    expect(faq).toBeUndefined();
  });
});

describe("JSON-LD — FAQPage on /faqs", () => {
  it("emits a FAQPage with Question/Answer pairs", () => {
    const { headSnippet } = buildSeoHead("/en-ae/dubai/faqs", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const faq = byType(extractJsonLd(`<head>${headSnippet}</head>`), "FAQPage");
    expect(faq).toBeTruthy();
    expect(Array.isArray(faq.mainEntity)).toBe(true);
    expect(faq.mainEntity.length).toBeGreaterThan(0);
    const first = faq.mainEntity[0];
    expect(first["@type"]).toBe("Question");
    expect(typeof first.name).toBe("string");
    expect(first.acceptedAnswer["@type"]).toBe("Answer");
    expect(typeof first.acceptedAnswer.text).toBe("string");
  });
});

describe("JSON-LD — every emitted block is valid JSON", () => {
  it("parses cleanly on a product page (no broken escaping)", async () => {
    mockFetchOnce({
      ok: true,
      product: {
        name: "Velvet Rose Bouquet",
        description: "A dozen long-stem velvet roses, hand-tied.",
        image: { uri: "https://cdn.test/velvet.jpg" },
        priceValue: 89.5,
        inStock: true,
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/product/velvet-rose-bouquet",
      OPTS,
    );
    // extractJsonLd throws if any block is not valid JSON. Product + Breadcrumb
    // are now grouped into one @graph block; extractJsonLd flattens it, and the
    // per-node @context is stripped (it lives once at the @graph root), so each
    // flattened node is asserted to carry a valid @type instead.
    const blocks = extractJsonLd(out);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const b of blocks) expect(typeof b["@type"]).toBe("string");
  });
});

describe("Product Offer JSON-LD — Google Merchant Listing required fields", () => {
  it("every product fixture emits an Offer with all required fields (CI guard)", async () => {
    // @ts-expect-error - mjs import without types; plain JS module.
    const mod = await import("../../scripts/check-product-jsonld-schema.mjs");
    // runCheck() builds each fixture's real product head and validates the
    // emitted Offer JSON-LD against Google's required Merchant Listing fields.
    // It returns 0 (pass) / 1 (fail) — same logic the CI step runs.
    expect(mod.runCheck()).toBe(0);
  });

  it("the validator fails loudly when a required shipping/return field is missing", async () => {
    // @ts-expect-error - mjs import without types; plain JS module.
    const mod = await import("../../scripts/check-product-jsonld-schema.mjs");
    const broken = {
      "@type": "Product",
      offers: {
        "@type": "Offer",
        price: "10.00",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        shippingDetails: {
          "@type": "OfferShippingDetails",
          // shippingRate.currency intentionally omitted.
          shippingRate: { "@type": "MonetaryAmount", value: "0.00" },
          shippingDestination: { "@type": "DefinedRegion", addressCountry: "LB" },
        },
        hasMerchantReturnPolicy: {
          "@type": "MerchantReturnPolicy",
          applicableCountry: "LB",
          returnPolicyCategory:
            "https://schema.org/MerchantReturnFiniteReturnWindow",
          merchantReturnDays: 7,
          returnMethod: "https://schema.org/ReturnByMail",
          // returnFees intentionally omitted.
        },
      },
    };
    const errors = mod.validateProductOffer(broken);
    expect(errors).toContain(
      "offers.shippingDetails.shippingRate.currency must be a non-empty string (got undefined)",
    );
    expect(errors).toContain(
      "offers.hasMerchantReturnPolicy.returnFees must be a schema.org URL (got undefined)",
    );
  });

  it("the validator rejects a product with no offers block at all", async () => {
    // @ts-expect-error - mjs import without types; plain JS module.
    const mod = await import("../../scripts/check-product-jsonld-schema.mjs");
    const errors = mod.validateProductOffer({ "@type": "Product" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("extractProductSchema pulls the Product node out of a @graph head snippet", async () => {
    // @ts-expect-error - mjs import without types; plain JS module.
    const mod = await import("../../scripts/check-product-jsonld-schema.mjs");
    // @ts-expect-error - mjs import without types; the module is plain JS.
    const headMod = await import("../../seo-inject.mjs");
    const { headSnippet } = headMod.buildProductHead({
      product: {
        name: "Velvet Rose Bouquet",
        description: "A dozen long-stem velvet roses.",
        image: { uri: "https://cdn.test/velvet.jpg" },
        priceValue: 89.5,
        wcId: 4242,
        inStock: true,
        categories: ["roses"],
      },
      imageDimensions: { width: 1200, height: 800 },
      lang: "en",
      basePath: "",
      origin: "https://presentail.test",
      pathname: "/en-ae/dubai/product/velvet-rose-bouquet",
      cityLabel: "Dubai",
      countryLabel: "United Arab Emirates",
      countryCode: "AE",
    });
    const product = mod.extractProductSchema(headSnippet);
    expect(product).toBeTruthy();
    expect(product["@type"]).toBe("Product");
    expect(mod.validateProductOffer(product)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// JSON-LD — required-field guardrail across a representative set of routes
//
// The dev/test-only validateJsonLd() in seo-inject.mjs only emits console.warn
// for missing required fields — it never fails a build or test, so a regression
// (a product losing its price, a breadcrumb shipping empty, a FAQPage with no
// mainEntity) would silently warn and still ship invalid schema that Google
// rejects. This suite turns that guardrail into a real safety net: it renders
// the actual server HTML for a representative set of routes, extracts EVERY
// emitted JSON-LD block (flattening @graph wrappers), and asserts that
// collectJsonLdProblems() — the single source of truth shared with the warning
// path — finds no missing required fields on any block.
//
// Covered @types: Organization/WebSite/WebPage/ContactPage (name+url),
// Product offers (price/currency/availability), BreadcrumbList/ItemList
// (itemListElement), Florist (name+url), and FAQPage (mainEntity).
// ---------------------------------------------------------------------------

/**
 * Extract every JSON-LD block from `html`, run collectJsonLdProblems() on each
 * node, and fail with a readable message naming the route + @type + missing
 * field if any block is invalid. Returns the blocks so callers can make extra
 * per-route assertions (e.g. that an expected @type was actually present).
 */
function assertAllJsonLdValid(html: string, label: string): any[] {
  const blocks = extractJsonLd(html);
  for (const block of blocks) {
    const problems = collectJsonLdProblems(block) as string[];
    expect(
      problems,
      `${label}: ${block?.["@type"] ?? "(no @type)"} JSON-LD ${problems.join("; ")}`,
    ).toEqual([]);
  }
  return blocks;
}

describe("JSON-LD — required-field guardrail over representative routes", () => {
  it("homepage / emits Organization + WebSite with all required fields", () => {
    const { headSnippet } = buildSeoHead("/", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const blocks = assertAllJsonLdValid(
      `<head>${headSnippet}</head>`,
      "homepage /",
    );
    expect(byType(blocks, "Organization")).toBeTruthy();
    expect(byType(blocks, "WebSite")).toBeTruthy();
  });

  it("city homepage /en-lb/beirut emits Organization + WebSite + Florist + BreadcrumbList with all required fields", () => {
    const { headSnippet } = buildSeoHead("/en-lb/beirut", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const blocks = assertAllJsonLdValid(
      `<head>${headSnippet}</head>`,
      "city home /en-lb/beirut",
    );
    expect(byType(blocks, "Florist")).toBeTruthy();
    expect(byType(blocks, "BreadcrumbList")).toBeTruthy();
  });

  it("product page emits a Product (with priced Offer) + BreadcrumbList with all required fields", async () => {
    mockFetchOnce({
      ok: true,
      product: {
        name: "Velvet Rose Bouquet",
        description: "A dozen long-stem velvet roses, hand-tied.",
        image: { uri: "https://cdn.test/velvet.jpg" },
        priceValue: 89.5,
        inStock: true,
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/product/velvet-rose-bouquet",
      OPTS,
    );
    const blocks = assertAllJsonLdValid(out, "product page");
    const product = byType(blocks, "Product");
    expect(product).toBeTruthy();
    // AE market: price is converted from USD to AED (3.6725 peg): 89.5 × 3.6725 = 328.69
    expect(product.offers.price).toBe("328.69");
    expect(byType(blocks, "BreadcrumbList")).toBeTruthy();
  });

  it("category page emits BreadcrumbList + ItemList with all required fields", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/category-products")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            count: 2,
            products: [{ name: "Red Roses" }, { name: "White Roses" }],
          }),
        };
      }
      if (u.includes("/api/woo/category")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            category: { name: "Roses", description: "Fresh roses." },
          }),
        };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/category/roses-guardrail-fixture",
      OPTS,
    );
    const blocks = assertAllJsonLdValid(out, "category page");
    expect(byType(blocks, "BreadcrumbList")).toBeTruthy();
    expect(byType(blocks, "ItemList")).toBeTruthy();
  });

  it("occasion page emits BreadcrumbList (+ ItemList) with all required fields", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/occasion")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            occasion: { name: "Birthday", description: "Birthday gifts." },
          }),
        };
      }
      if (u.includes("/api/woo/products")) {
        return {
          ok: true,
          json: async () => ({ ok: true, products: [{ name: "Balloon Set" }] }),
        };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/occasion/birthday-guardrail-fixture",
      OPTS,
    );
    const blocks = assertAllJsonLdValid(out, "occasion page");
    expect(byType(blocks, "BreadcrumbList")).toBeTruthy();
  });

  it.each(["terms", "privacy"])(
    "%s page emits a WebPage with all required fields",
    (route) => {
      const { headSnippet } = buildSeoHead(`/en-ae/dubai/${route}`, {
        origin: "https://presentail.test",
        basePath: "",
      });
      const blocks = assertAllJsonLdValid(
        `<head>${headSnippet}</head>`,
        `${route} page`,
      );
      expect(byType(blocks, "WebPage")).toBeTruthy();
    },
  );

  it("contact page emits a ContactPage with all required fields", () => {
    const { headSnippet } = buildSeoHead("/en-ae/dubai/contact", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const blocks = assertAllJsonLdValid(
      `<head>${headSnippet}</head>`,
      "contact page",
    );
    expect(byType(blocks, "ContactPage")).toBeTruthy();
  });

  it("faqs page emits a FAQPage with all required fields", () => {
    const { headSnippet } = buildSeoHead("/en-ae/dubai/faqs", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const blocks = assertAllJsonLdValid(
      `<head>${headSnippet}</head>`,
      "faqs page",
    );
    expect(byType(blocks, "FAQPage")).toBeTruthy();
  });

  it("brand page emits a BreadcrumbList with all required fields", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/woo/brand")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            brand: {
              name: "Bloom Studio",
              description: "Handcrafted floral arrangements.",
              image: "https://cdn.test/bloom-studio.jpg",
            },
          }),
        };
      }
      // Image dimensions fetch.
      return { ok: true, status: 206, arrayBuffer: async () => makePngBuffer(800, 600) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/brand/bloom-studio-guardrail",
      OPTS,
    );
    const blocks = assertAllJsonLdValid(out, "brand page");
    expect(byType(blocks, "BreadcrumbList")).toBeTruthy();
  });

  it("blog post page emits an Article + BreadcrumbList with all required fields", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // Blog posts resolve from the shared BLOG_POSTS source of truth — no fetch needed.
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/blog/inside-spring-sourcing-trip",
      OPTS,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const blocks = assertAllJsonLdValid(out, "blog post page");
    const article = byType(blocks, "Article");
    expect(article).toBeTruthy();
    expect(article.headline).toBeTruthy();
    expect(article.image).toBeTruthy();
    expect(article.datePublished).toBeTruthy();
    expect(article.url).toBeTruthy();
    expect(byType(blocks, "BreadcrumbList")).toBeTruthy();
  });

  // Negative tests: the guardrail must actually FAIL (not just warn) when a
  // required field is missing — otherwise the assertions above prove nothing.
  it("collectJsonLdProblems flags an Article missing image, datePublished, or url", () => {
    expect(
      collectJsonLdProblems({
        "@type": "Article",
        headline: "A great story",
        datePublished: "2025-03-15",
        url: "https://presentail.test/en-ae/dubai/blog/a-great-story",
        // image intentionally omitted
      }) as string[],
    ).toEqual(['missing required field "image"']);

    expect(
      collectJsonLdProblems({
        "@type": "Article",
        headline: "A great story",
        image: "https://presentail.test/blog/hero.webp",
        url: "https://presentail.test/en-ae/dubai/blog/a-great-story",
        // datePublished intentionally omitted
      }) as string[],
    ).toEqual(['missing required field "datePublished"']);

    expect(
      collectJsonLdProblems({
        "@type": "Article",
        headline: "A great story",
        image: "https://presentail.test/blog/hero.webp",
        datePublished: "2025-03-15",
        // url intentionally omitted
      }) as string[],
    ).toEqual(['missing required field "url"']);
  });

  it("collectJsonLdProblems flags a Product whose offer lost its price/currency/availability", () => {
    expect(
      collectJsonLdProblems({
        "@type": "Product",
        name: "Broken Bouquet",
        offers: { "@type": "Offer" },
      }) as string[],
    ).toEqual([
      'offer missing "price"',
      'offer missing "priceCurrency"',
      'offer missing "availability"',
    ]);
  });

  it("collectJsonLdProblems flags an empty BreadcrumbList / ItemList / FAQPage", () => {
    expect(
      collectJsonLdProblems({ "@type": "BreadcrumbList", itemListElement: [] }),
    ).toEqual(['missing required field "itemListElement"']);
    expect(
      collectJsonLdProblems({ "@type": "ItemList", itemListElement: [] }),
    ).toEqual(['missing required field "itemListElement"']);
    expect(
      collectJsonLdProblems({ "@type": "FAQPage", mainEntity: [] }),
    ).toEqual(['missing required field "mainEntity"']);
  });

  it("collectJsonLdProblems flags Organization/WebSite/WebPage/ContactPage missing name or url", () => {
    expect(
      collectJsonLdProblems({ "@type": "Organization", url: "https://x.test" }),
    ).toEqual(['missing required field "name"']);
    expect(
      collectJsonLdProblems({ "@type": "WebSite", name: "Presentail" }),
    ).toEqual(['missing required field "url"']);
    expect(
      collectJsonLdProblems({ "@type": "WebPage", name: "", url: "" }),
    ).toEqual([
      'missing required field "name"',
      'missing required field "url"',
    ]);
    expect(
      collectJsonLdProblems({ "@type": "ContactPage", url: "https://x.test" }),
    ).toEqual(['missing required field "name"']);
  });

  it("collectJsonLdProblems returns no problems for an unknown @type or a @graph wrapper", () => {
    expect(collectJsonLdProblems({ "@type": "SomethingElse" })).toEqual([]);
    expect(collectJsonLdProblems({ "@graph": [] })).toEqual([]);
    expect(collectJsonLdProblems(null)).toEqual([]);
  });
});

describe("Client-side SEO builders — return shape (title, ogTitle, twitterTitle)", () => {
  it("buildProductSeo returns entity-specific title for EN with city and name", () => {
    const seo = buildProductSeo({ lang: "en", productName: "15 Red Roses", city: "Beirut", country: "Lebanon" });
    expect(seo.title).toBe("15 Red Roses — Beirut | Presentail");
    expect(seo.ogTitle).toBe("15 Red Roses — Beirut | Presentail");
    expect(seo.twitterTitle).toBe("15 Red Roses — Beirut | Presentail");
    expect(typeof seo.description).toBe("string");
    expect(seo.description.length).toBeGreaterThan(0);
  });

  it("buildProductSeo returns entity-specific title for AR with city and name", () => {
    const seo = buildProductSeo({ lang: "ar", productName: "باقة الورد", city: "بيروت", country: "لبنان" });
    expect(seo.title).toContain("باقة الورد");
    expect(seo.title).toContain("بيروت");
    expect(seo.title).toContain("Presentail");
    expect(seo.ogTitle).toBe(seo.title);
    expect(seo.twitterTitle).toBe(seo.title);
  });

  it("buildProductSeo returns entity-specific title for FR with city and name", () => {
    const seo = buildProductSeo({ lang: "fr", productName: "Bouquet de Roses", city: "Beyrouth", country: "Liban" });
    expect(seo.title).toContain("Bouquet de Roses");
    expect(seo.title).toContain("Beyrouth");
    expect(seo.title).toContain("Presentail");
    expect(seo.ogTitle).toBe(seo.title);
    expect(seo.twitterTitle).toBe(seo.title);
  });

  it("buildProductSeo uses shortDescription as description when it fits within 160 chars", () => {
    const short = "A beautiful bouquet of fresh roses.";
    const seo = buildProductSeo({ lang: "en", productName: "Roses", city: "Dubai", country: "the UAE", shortDescription: short });
    expect(seo.description).toBe(short);
  });

  it("buildProductSeo falls back to template description when shortDescription is too long", () => {
    const long = "x".repeat(161);
    const seo = buildProductSeo({ lang: "en", productName: "Roses", city: "Dubai", country: "the UAE", shortDescription: long });
    expect(seo.description).not.toBe(long);
    expect(seo.description.length).toBeGreaterThan(0);
  });

  it("buildCategorySeo returns entity-specific title for EN with city and name", () => {
    const seo = buildCategorySeo({ lang: "en", categoryName: "Plants", city: "Beirut", country: "Lebanon" });
    expect(seo.title).toBe("Plants Delivery in Beirut | Presentail");
    expect(seo.ogTitle).toBe("Plants Delivery in Beirut | Presentail");
    expect(seo.twitterTitle).toBe("Plants Delivery in Beirut | Presentail");
    expect(typeof seo.description).toBe("string");
    expect(seo.description.length).toBeGreaterThan(0);
  });

  it("buildCategorySeo returns entity-specific title for AR", () => {
    const seo = buildCategorySeo({ lang: "ar", categoryName: "نباتات", city: "بيروت", country: "لبنان" });
    expect(seo.title).toContain("نباتات");
    expect(seo.title).toContain("Presentail");
    expect(seo.ogTitle).toBe(seo.title);
    expect(seo.twitterTitle).toBe(seo.title);
  });

  it("buildCategorySeo returns entity-specific title for FR", () => {
    const seo = buildCategorySeo({ lang: "fr", categoryName: "Plantes", city: "Beyrouth", country: "Liban" });
    expect(seo.title).toContain("Plantes");
    expect(seo.title).toContain("Beyrouth");
    expect(seo.title).toContain("Presentail");
    expect(seo.ogTitle).toBe(seo.title);
    expect(seo.twitterTitle).toBe(seo.title);
  });

  it("buildOccasionSeo returns entity-specific title for EN with city and name", () => {
    const seo = buildOccasionSeo({ lang: "en", occasionName: "Birthday", city: "Beirut", country: "Lebanon" });
    expect(seo.title).toBe("Birthday Flowers & Gifts in Beirut | Presentail");
    expect(seo.ogTitle).toBe("Birthday Flowers & Gifts in Beirut | Presentail");
    expect(seo.twitterTitle).toBe("Birthday Flowers & Gifts in Beirut | Presentail");
    expect(typeof seo.description).toBe("string");
    expect(seo.description.length).toBeGreaterThan(0);
  });

  it("buildOccasionSeo returns entity-specific title for AR", () => {
    const seo = buildOccasionSeo({ lang: "ar", occasionName: "عيد الميلاد", city: "بيروت", country: "لبنان" });
    expect(seo.title).toContain("عيد الميلاد");
    expect(seo.title).toContain("Presentail");
    expect(seo.ogTitle).toBe(seo.title);
    expect(seo.twitterTitle).toBe(seo.title);
  });

  it("buildOccasionSeo returns entity-specific title for FR", () => {
    const seo = buildOccasionSeo({ lang: "fr", occasionName: "Anniversaire", city: "Beyrouth", country: "Liban" });
    expect(seo.title).toContain("Anniversaire");
    expect(seo.title).toContain("Beyrouth");
    expect(seo.title).toContain("Presentail");
    expect(seo.ogTitle).toBe(seo.title);
    expect(seo.twitterTitle).toBe(seo.title);
  });

  it("buildBrandSeo returns brand-specific title with city for EN", () => {
    const seo = buildBrandSeo({ lang: "en", brandName: "Acme Florals", city: "Beirut", country: "Lebanon" });
    expect(seo.title).toBe("Acme Florals Delivery in Beirut | Presentail");
    expect(seo.ogTitle).toBe("Acme Florals Delivery in Beirut | Presentail");
    expect(seo.twitterTitle).toBe("Acme Florals Delivery in Beirut | Presentail");
    expect(seo.description).toBe("Shop Acme Florals gifts online in Beirut. Send curated Acme Florals products with reliable delivery from Presentail.");
  });

  it("buildBrandSeo falls back to brand-name-only title when no city is provided", () => {
    const seo = buildBrandSeo({ lang: "en", brandName: "Acme Florals", city: "", country: "Lebanon" });
    expect(seo.title).toBe("Acme Florals | Presentail");
    expect(seo.description).toBe("Shop Acme Florals gifts online. Send curated Acme Florals products with reliable delivery from Presentail.");
  });

  it("buildBrandSeo returns brand-specific title with city for AR", () => {
    const seo = buildBrandSeo({ lang: "ar", brandName: "علامة رائعة", city: "بيروت", country: "لبنان" });
    expect(seo.title).toBe("توصيل علامة رائعة في بيروت | Presentail");
    expect(seo.ogTitle).toBe("توصيل علامة رائعة في بيروت | Presentail");
    expect(seo.twitterTitle).toBe("توصيل علامة رائعة في بيروت | Presentail");
  });

  it("buildBrandSeo returns brand-specific title with city for FR", () => {
    const seo = buildBrandSeo({ lang: "fr", brandName: "Marque Luxe", city: "Beyrouth", country: "Liban" });
    expect(seo.title).toBe("Livraison Marque Luxe à Beyrouth | Presentail");
    expect(seo.ogTitle).toBe("Livraison Marque Luxe à Beyrouth | Presentail");
    expect(seo.twitterTitle).toBe("Livraison Marque Luxe à Beyrouth | Presentail");
  });
});

describe("Non-product JSON-LD — Breadcrumb/FAQ/Org/Article rich-result required fields", () => {
  it("every non-product fixture emits valid rich-result JSON-LD (CI guard)", async () => {
    // @ts-expect-error - mjs import without types; plain JS module.
    const mod = await import("../../scripts/check-nonproduct-jsonld-schema.mjs");
    // runCheck() builds each fixture's real head via the same builders serve.mjs
    // uses, validates every emitted JSON-LD node against its required field set,
    // and asserts every expected @type is present. Returns 0 (pass) / 1 (fail) —
    // same logic the CI step runs.
    expect(mod.runCheck()).toBe(0);
  });

  it("flags an Organization missing its url", async () => {
    // @ts-expect-error - mjs import without types; plain JS module.
    const mod = await import("../../scripts/check-nonproduct-jsonld-schema.mjs");
    const errors = mod.validateNode({ "@type": "Organization", name: "Presentail" });
    expect(errors).toContain("Organization.url must be an http(s) URL (got undefined)");
  });

  it("flags an Article missing datePublished", async () => {
    // @ts-expect-error - mjs import without types; plain JS module.
    const mod = await import("../../scripts/check-nonproduct-jsonld-schema.mjs");
    const errors = mod.validateNode({ "@type": "Article", headline: "Hello" });
    expect(errors).toContain("Article.datePublished must be a non-empty string (got undefined)");
  });

  it("flags a FAQPage whose answer has no text", async () => {
    // @ts-expect-error - mjs import without types; plain JS module.
    const mod = await import("../../scripts/check-nonproduct-jsonld-schema.mjs");
    const errors = mod.validateNode({
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer" } }],
    });
    expect(errors).toContain("FAQPage.mainEntity[0].acceptedAnswer.text must be a non-empty string");
  });

  it("flags a BreadcrumbList ListItem missing its position", async () => {
    // @ts-expect-error - mjs import without types; plain JS module.
    const mod = await import("../../scripts/check-nonproduct-jsonld-schema.mjs");
    const errors = mod.validateNode({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", name: "Home", item: "https://presentail.test" },
        { "@type": "ListItem", position: 2, name: "Leaf" },
      ],
    });
    expect(errors).toContain(
      "BreadcrumbList.itemListElement[0].position must be a positive integer (got undefined)",
    );
  });

  it("requires the item URL on every breadcrumb crumb except the last", async () => {
    // @ts-expect-error - mjs import without types; plain JS module.
    const mod = await import("../../scripts/check-nonproduct-jsonld-schema.mjs");
    const errors = mod.validateNode({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home" }, // missing item — not last
        { "@type": "ListItem", position: 2, name: "Leaf" }, // last — item optional
      ],
    });
    expect(
      errors.some((e: string) => e.includes("itemListElement[0].item must be an http(s) URL")),
    ).toBe(true);
  });

  it("extractAllJsonLd flattens a @graph head snippet into individual nodes", async () => {
    // @ts-expect-error - mjs import without types; plain JS module.
    const mod = await import("../../scripts/check-nonproduct-jsonld-schema.mjs");
    // @ts-expect-error - mjs import without types; the module is plain JS.
    const headMod = await import("../../seo-inject.mjs");
    const { headSnippet } = headMod.buildSeoHead("/en-lb/beirut", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const nodes = mod.extractAllJsonLd(`<head>${headSnippet}</head>`);
    const types = nodes.map((n: { "@type": string }) => n["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("Florist");
    expect(types).toContain("BreadcrumbList");
    for (const node of nodes) expect(mod.validateNode(node)).toEqual([]);
  });
});

describe("Group B static pages — noindex on city-prefixed URLs", () => {
  const GROUP_B = ["careers", "privacy", "terms", "partner", "blog"] as const;

  it.each(GROUP_B)(
    "%s emits noindex even when accessed via a city-prefixed URL",
    (route) => {
      const { headSnippet } = buildSeoHead(`/en-lb/beirut/${route}`, {
        origin: "https://presentail.test",
        basePath: "",
      });
      expect(headSnippet).toContain('name="robots"');
      expect(headSnippet).toContain("noindex");
    },
  );

  it.each(GROUP_B)(
    "%s still emits WebPage JSON-LD (public content; noindex does not strip schema)",
    (route) => {
      const { headSnippet } = buildSeoHead(`/en-lb/beirut/${route}`, {
        origin: "https://presentail.test",
        basePath: "",
      });
      expect(headSnippet).toContain("application/ld+json");
    },
  );
});

describe("Group A static pages — city-aware title and description", () => {
  const GROUP_A = ["faqs", "contact", "corporate", "weddings"] as const;
  const opts = { origin: "https://presentail.test", basePath: "" };

  it.each(GROUP_A)(
    "%s title contains a city name when a city is in the URL",
    (route) => {
      const result = buildSeoHead(`/en-lb/beirut/${route}`, opts);
      expect(result.title).toContain("Beirut");
      expect(result.title).not.toContain("{city}");
    },
  );

  it.each(GROUP_A)(
    "%s description contains a city name when a city is in the URL",
    (route) => {
      const { headSnippet } = buildSeoHead(`/en-lb/beirut/${route}`, opts);
      expect(headSnippet).not.toContain("{city}");
      const descMatch = headSnippet.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
      );
      expect(descMatch).not.toBeNull();
      expect(descMatch![1]).toContain("Beirut");
    },
  );

  it.each(GROUP_A)(
    "%s does NOT emit noindex",
    (route) => {
      const { headSnippet } = buildSeoHead(`/en-lb/beirut/${route}`, opts);
      expect(headSnippet).not.toContain("noindex");
    },
  );

  it.each(GROUP_A)(
    "%s city name differs between Beirut and Dubai URLs",
    (route) => {
      const beirutTitle = buildSeoHead(`/en-lb/beirut/${route}`, opts).title;
      const dubaiTitle = buildSeoHead(`/en-ae/dubai/${route}`, opts).title;
      expect(beirutTitle).toContain("Beirut");
      expect(dubaiTitle).toContain("Dubai");
      expect(beirutTitle).not.toBe(dubaiTitle);
    },
  );
});

describe("Canonical tag — trailing-slash stripping", () => {
  it("canonical does not have a trailing slash even when the path ends with /", () => {
    const { headSnippet } = buildSeoHead("/en-lb/beirut/faqs", {
      origin: "https://presentail.test",
      basePath: "",
    });
    const canonicalMatch = headSnippet.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i,
    );
    expect(canonicalMatch).not.toBeNull();
    const href = canonicalMatch![1];
    expect(href).not.toMatch(/\/$/);
  });
});

describe("STATIC_PAGE_GROUP exports", () => {
  it("Group A contains exactly contact, faqs, corporate, weddings", async () => {
    const { STATIC_PAGE_GROUP } = await import("../../src/lib/seo.mjs");
    expect(STATIC_PAGE_GROUP.A.has("contact")).toBe(true);
    expect(STATIC_PAGE_GROUP.A.has("faqs")).toBe(true);
    expect(STATIC_PAGE_GROUP.A.has("corporate")).toBe(true);
    expect(STATIC_PAGE_GROUP.A.has("weddings")).toBe(true);
    expect(STATIC_PAGE_GROUP.A.size).toBe(4);
  });

  it("Group B contains exactly privacy, terms, careers, partner, blog", async () => {
    const { STATIC_PAGE_GROUP } = await import("../../src/lib/seo.mjs");
    expect(STATIC_PAGE_GROUP.B.has("privacy")).toBe(true);
    expect(STATIC_PAGE_GROUP.B.has("terms")).toBe(true);
    expect(STATIC_PAGE_GROUP.B.has("careers")).toBe(true);
    expect(STATIC_PAGE_GROUP.B.has("partner")).toBe(true);
    expect(STATIC_PAGE_GROUP.B.has("blog")).toBe(true);
    expect(STATIC_PAGE_GROUP.B.size).toBe(5);
  });

  it("NONINDEX_ROUTE_KEYS includes all Group B keys", async () => {
    const { NONINDEX_ROUTE_KEYS, STATIC_PAGE_GROUP } = await import("../../src/lib/seo.mjs");
    for (const key of STATIC_PAGE_GROUP.B) {
      expect(NONINDEX_ROUTE_KEYS.has(key)).toBe(true);
    }
  });
});

describe("buildContactSeo — title-length guardrail", () => {
  // All real city × lang combinations that appear in the web storefront.
  const CITY_KEYS = [
    "ae-dubai", "ae-abu-dhabi", "ae-sharjah", "ae-ajman",
    "ae-ras-al-khaimah", "ae-fujairah", "ae-umm-al-quwain",
    "lb-beirut", "lb-jounieh", "lb-tripoli", "lb-saida", "lb-tyre",
    "lb-zahle", "lb-byblos", "lb-baalbek",
    "cy-nicosia", "cy-limassol", "cy-larnaca", "cy-paphos",
  ];

  it("all 19 real city × 3 lang combinations produce titles between 30 and 65 chars", async () => {
    const { buildContactSeo, CITY_NAMES } = await import("../../src/lib/seo.mjs");
    const langs = ["en", "ar", "fr"];
    for (const lang of langs) {
      for (const cityKey of CITY_KEYS) {
        const country = cityKey.split("-")[0];
        const cityLabel = CITY_NAMES[lang as "en" | "ar" | "fr"]?.[cityKey] ?? CITY_NAMES.en[cityKey] ?? cityKey;
        const result = buildContactSeo({ lang, city: cityLabel, country });
        expect(
          result.title.length,
          `[${lang}] city="${cityKey}" → "${result.title}" (${result.title.length} chars)`,
        ).toBeGreaterThanOrEqual(30);
        expect(
          result.title.length,
          `[${lang}] city="${cityKey}" → "${result.title}" (${result.title.length} chars)`,
        ).toBeLessThanOrEqual(65);
      }
    }
  });

  it("the longest French city name (Oumm al Qaïwaïn) fits the preferred template and stays within bounds", async () => {
    const { buildContactSeo } = await import("../../src/lib/seo.mjs");
    const result = buildContactSeo({ lang: "fr", city: "Oumm al Qaïwaïn", country: "ae" });
    // "Contacter Presentail à Oumm al Qaïwaïn | Aide livraison" = 55 chars ≤ 65,
    // so the preferred template IS used.
    expect(result.title).toBe("Contacter Presentail à Oumm al Qaïwaïn | Aide livraison");
    expect(result.title.length).toBeGreaterThanOrEqual(30);
    expect(result.title.length).toBeLessThanOrEqual(65);
  });

  it("the long French city name Ras el Khaïmah falls back to the short template and still passes", async () => {
    const { buildContactSeo } = await import("../../src/lib/seo.mjs");
    const result = buildContactSeo({ lang: "fr", city: "Ras el Khaïmah", country: "ae" });
    expect(result.title.length).toBeGreaterThanOrEqual(30);
    expect(result.title.length).toBeLessThanOrEqual(65);
  });

  it("a very short city name (e.g. 'Al') uses the preferred template since it fits within 65 chars", async () => {
    const { buildContactSeo } = await import("../../src/lib/seo.mjs");
    // "Contact Presentail in Al | Gift Delivery Help" = 45 chars ≤ 65,
    // so the preferred template is used (not medium).
    // Medium is a defensive tier for edge cases where preferred >65 AND fallback <30 simultaneously,
    // which cannot arise with the current templates and any real city name.
    const result = buildContactSeo({ lang: "en", city: "Al", country: "ae" });
    expect(result.title).toBe("Contact Presentail in Al | Gift Delivery Help");
    expect(result.title.length).toBeGreaterThanOrEqual(30);
    expect(result.title.length).toBeLessThanOrEqual(65);
  });

  it("a normal EN city (Dubai) uses the preferred template", async () => {
    const { buildContactSeo } = await import("../../src/lib/seo.mjs");
    const result = buildContactSeo({ lang: "en", city: "Dubai", country: "ae" });
    expect(result.title).toBe("Contact Presentail in Dubai | Gift Delivery Help");
    expect(result.title.length).toBeGreaterThanOrEqual(35);
    expect(result.title.length).toBeLessThanOrEqual(60);
  });

  it("a normal AR city (بيروت) uses the preferred template and stays within bounds", async () => {
    const { buildContactSeo } = await import("../../src/lib/seo.mjs");
    const result = buildContactSeo({ lang: "ar", city: "بيروت", country: "lb" });
    expect(result.title).toContain("دعم التوصيل");
    expect(result.title.length).toBeGreaterThanOrEqual(30);
    expect(result.title.length).toBeLessThanOrEqual(65);
  });

  it("non-contact buildStaticSeo calls are not affected", async () => {
    const { buildStaticSeo } = await import("../../src/lib/seo.mjs");
    const home = buildStaticSeo({ lang: "en", routeKey: "home", city: "Dubai", country: "ae" });
    expect(home.title).toBe("Flower & Gift Delivery in Dubai | Presentail");
    const weddings = buildStaticSeo({ lang: "en", routeKey: "weddings", city: "Beirut", country: "lb" });
    expect(weddings.title).toBe("Wedding Flowers in Beirut | Presentail");
    const faqs = buildStaticSeo({ lang: "en", routeKey: "faqs", city: "Dubai", country: "ae" });
    expect(faqs.title).toBe("Flower Delivery FAQs in Dubai | Presentail");
  });

  it("injectSeoTagsAsync uses the contact guardrail title for the /contact route", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/contact",
      OPTS,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toContain(
      "<title>Contact Presentail in Dubai | Gift Delivery Help</title>",
    );
  });

  it("injectSeoTagsAsync contact route for French long city stays ≤65 chars", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(
      HTML,
      "/fr-ae/umm-al-quwain/contact",
      OPTS,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const match = out.match(/<title>(.*?)<\/title>/);
    expect(match).not.toBeNull();
    const titleLen = match![1].length;
    expect(titleLen).toBeLessThanOrEqual(65);
    expect(titleLen).toBeGreaterThanOrEqual(30);
  });

  it("no city — EN title is 'Contact Presentail | Gift Delivery Help' (no trailing 'in')", async () => {
    const { buildContactSeo } = await import("../../src/lib/seo.mjs");
    const result = buildContactSeo({});
    expect(result.title).toBe("Contact Presentail | Gift Delivery Help");
    expect(result.title).not.toMatch(/\bin\s*$/);
  });

  it("no city — explicit empty string produces city-less title", async () => {
    const { buildContactSeo } = await import("../../src/lib/seo.mjs");
    const result = buildContactSeo({ lang: "en", city: "", country: "ae" });
    expect(result.title).toBe("Contact Presentail | Gift Delivery Help");
    expect(result.title).not.toMatch(/\bin\s*$/);
  });

  it("no city — whitespace-only city produces city-less title", async () => {
    const { buildContactSeo } = await import("../../src/lib/seo.mjs");
    const result = buildContactSeo({ lang: "en", city: "   ", country: "ae" });
    expect(result.title).toBe("Contact Presentail | Gift Delivery Help");
    expect(result.title).not.toMatch(/\bin\s*$/);
  });

  it("no city — AR title has no dangling في", async () => {
    const { buildContactSeo } = await import("../../src/lib/seo.mjs");
    const result = buildContactSeo({ lang: "ar" });
    expect(result.title).toBe("تواصل مع Presentail | دعم التوصيل");
    expect(result.title).not.toMatch(/في\s*$/);
  });

  it("no city — FR title has no dangling à", async () => {
    const { buildContactSeo } = await import("../../src/lib/seo.mjs");
    const result = buildContactSeo({ lang: "fr" });
    expect(result.title).toBe("Contacter Presentail | Aide livraison");
    expect(result.title).not.toMatch(/à\s*$/);
  });

  it("with a city — EN title still includes the city and preposition", async () => {
    const { buildContactSeo } = await import("../../src/lib/seo.mjs");
    const result = buildContactSeo({ lang: "en", city: "Dubai", country: "ae" });
    expect(result.title).toBe("Contact Presentail in Dubai | Gift Delivery Help");
  });
});

describe("buildFaqsSeo — title-length guardrail", () => {
  // All real city × lang combinations that appear in the web storefront.
  const CITY_KEYS = [
    "ae-dubai", "ae-abu-dhabi", "ae-sharjah", "ae-ajman",
    "ae-ras-al-khaimah", "ae-fujairah", "ae-umm-al-quwain",
    "lb-beirut", "lb-jounieh", "lb-tripoli", "lb-saida", "lb-tyre",
    "lb-zahle", "lb-byblos", "lb-baalbek",
    "cy-nicosia", "cy-limassol", "cy-larnaca", "cy-paphos",
  ];

  it("all 19 real city × 3 lang combinations produce titles between 30 and 65 chars", async () => {
    const { buildFaqsSeo, CITY_NAMES } = await import("../../src/lib/seo.mjs");
    const langs = ["en", "ar", "fr"];
    for (const lang of langs) {
      for (const cityKey of CITY_KEYS) {
        const country = cityKey.split("-")[0];
        const cityLabel = CITY_NAMES[lang as "en"|"ar"|"fr"]?.[cityKey] ?? CITY_NAMES.en[cityKey] ?? cityKey;
        const result = buildFaqsSeo({ lang, city: cityLabel, country });
        expect(
          result.title.length,
          `[${lang}] city="${cityKey}" → "${result.title}" (${result.title.length} chars)`,
        ).toBeGreaterThanOrEqual(30);
        expect(
          result.title.length,
          `[${lang}] city="${cityKey}" → "${result.title}" (${result.title.length} chars)`,
        ).toBeLessThanOrEqual(65);
      }
    }
  });

  it("the longest French city name (Oumm al Qaïwaïn) fits the preferred template", async () => {
    const { buildFaqsSeo } = await import("../../src/lib/seo.mjs");
    const result = buildFaqsSeo({ lang: "fr", city: "Oumm al Qaïwaïn", country: "ae" });
    // "FAQ livraison de fleurs à Oumm al Qaïwaïn | Presentail" = 54 chars ≤ 65
    expect(result.title).toBe("FAQ livraison de fleurs à Oumm al Qaïwaïn | Presentail");
    expect(result.title.length).toBeGreaterThanOrEqual(30);
    expect(result.title.length).toBeLessThanOrEqual(65);
  });

  it("a normal EN city (Dubai) uses the preferred template", async () => {
    const { buildFaqsSeo } = await import("../../src/lib/seo.mjs");
    const result = buildFaqsSeo({ lang: "en", city: "Dubai", country: "ae" });
    expect(result.title).toBe("Flower Delivery FAQs in Dubai | Presentail");
    expect(result.title.length).toBeGreaterThanOrEqual(30);
    expect(result.title.length).toBeLessThanOrEqual(65);
  });

  it("a normal AR city (بيروت) uses the preferred template and stays within bounds", async () => {
    const { buildFaqsSeo } = await import("../../src/lib/seo.mjs");
    const result = buildFaqsSeo({ lang: "ar", city: "بيروت", country: "lb" });
    expect(result.title).toBe("أسئلة توصيل الزهور في بيروت | Presentail");
    expect(result.title.length).toBeGreaterThanOrEqual(30);
    expect(result.title.length).toBeLessThanOrEqual(65);
  });

  it("a very short city name uses the medium tier (preferred fits ≤65 so preferred wins)", async () => {
    const { buildFaqsSeo } = await import("../../src/lib/seo.mjs");
    // Even a tiny city fits in the preferred template (44 base chars << 65)
    const result = buildFaqsSeo({ lang: "en", city: "Al", country: "ae" });
    expect(result.title).toBe("Flower Delivery FAQs in Al | Presentail");
    expect(result.title.length).toBeGreaterThanOrEqual(30);
    expect(result.title.length).toBeLessThanOrEqual(65);
  });

  it("non-faqs buildStaticSeo calls are not affected", async () => {
    const { buildStaticSeo } = await import("../../src/lib/seo.mjs");
    const home = buildStaticSeo({ lang: "en", routeKey: "home", city: "Dubai", country: "ae" });
    expect(home.title).toBe("Flower & Gift Delivery in Dubai | Presentail");
    const contact = buildStaticSeo({ lang: "en", routeKey: "contact", city: "Beirut", country: "lb" });
    expect(contact.title).toBe("Contact Presentail in Beirut | Gift Delivery Help");
  });

  it("injectSeoTagsAsync uses the faqs guardrail title for the /faqs route", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/faqs",
      OPTS,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toContain(
      "<title>Flower Delivery FAQs in Dubai | Presentail</title>",
    );
  });

  it("injectSeoTagsAsync faqs route for French long city stays ≤65 chars", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(
      HTML,
      "/fr-ae/umm-al-quwain/faqs",
      OPTS,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const match = out.match(/<title>(.*?)<\/title>/);
    expect(match).not.toBeNull();
    const titleLen = match![1].length;
    expect(titleLen).toBeLessThanOrEqual(65);
    expect(titleLen).toBeGreaterThanOrEqual(30);
  });
});

// ---------------------------------------------------------------------------
// Banner LCP preload — imagesrcset / imagesizes injection
// ---------------------------------------------------------------------------
describe("injectSeoTagsAsync — banner LCP preload tag", () => {
  const OS_BANNER_URL =
    "https://os.presentail.com/api/storage/banners/hero.jpg";
  // Unsplash URL with a `&` — escapeAttr encodes it as &amp; in the HTML attr.
  const NON_OS_BANNER_URL =
    "https://images.unsplash.com/photo-123?w=1280&q=80";

  beforeEach(() => {
    // Clear the generic SEO cache so tests using the same path (e.g. /) don't
    // inherit a cached head snippet that includes a banner preload from a
    // previous test in the suite.
    genericSeoCache.clear();
  });

  it("emits imagesrcset + imagesizes for an OS storage banner on bare /", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const out = await injectSeoTagsAsync(HTML, "/", {
      ...OPTS,
      firstBannerImageUrl: OS_BANNER_URL,
    });
    expect(out).toContain('rel="preload"');
    expect(out).toContain('as="image"');
    expect(out).toContain('fetchpriority="high"');
    expect(out).toContain("imagesrcset=");
    expect(out).toContain("imagesizes=");
    // All three srcset widths must be present.
    expect(out).toContain("w=400");
    expect(out).toContain("w=800");
    expect(out).toContain("w=1200");
    // Must reference the proxy endpoint with the encoded URL.
    expect(out).toContain("/api/img/proxy?url=");
    expect(out).toContain(encodeURIComponent(OS_BANNER_URL));
    // sizes value must match HeroBannerSlide.
    expect(out).toContain("(max-width: 1280px) 100vw, 1280px");
    // Must NOT emit a plain href= preload (would cause a double-fetch).
    expect(out).not.toContain(`href="${OS_BANNER_URL}"`);
  });

  it("emits imagesrcset + imagesizes for an OS storage banner on locale homepage", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const out = await injectSeoTagsAsync(HTML, "/en-lb/beirut", {
      ...OPTS,
      firstBannerImageUrl: OS_BANNER_URL,
    });
    expect(out).toContain("imagesrcset=");
    expect(out).toContain("imagesizes=");
    expect(out).toContain("w=400");
  });

  it("falls back to plain href preload for a non-OS banner URL", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const out = await injectSeoTagsAsync(HTML, "/en-lb/beirut", {
      ...OPTS,
      firstBannerImageUrl: NON_OS_BANNER_URL,
    });
    expect(out).toContain('rel="preload"');
    // escapeAttr encodes & as &amp; inside HTML attributes.
    expect(out).toContain(
      'href="https://images.unsplash.com/photo-123?w=1280&amp;q=80"',
    );
    // Should NOT emit imagesrcset for a non-OS URL.
    expect(out).not.toContain("imagesrcset=");
  });

  it("does NOT inject any preload on a non-homepage route", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const out = await injectSeoTagsAsync(HTML, "/en-lb/beirut/shop", {
      ...OPTS,
      firstBannerImageUrl: OS_BANNER_URL,
    });
    expect(out).not.toContain('rel="preload" as="image"');
  });

  it("does NOT inject any preload when firstBannerImageUrl is absent", async () => {
    vi.stubGlobal("fetch", vi.fn());
    // Use bare / with no firstBannerImageUrl. Cache cleared in beforeEach so
    // no stale preload tag from a prior test leaks in.
    const out = await injectSeoTagsAsync(HTML, "/", OPTS);
    expect(out).not.toContain('rel="preload" as="image"');
  });
});

describe("stripTrackingParams", () => {
  it("removes srsltid and utm_source from a query string", () => {
    expect(stripTrackingParams("?srsltid=abc&utm_source=google")).toBe("");
  });

  it("removes all known tracking params while preserving unknown ones", () => {
    const result = stripTrackingParams(
      "?srsltid=abc&utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=flowers&utm_content=ad1&utm_id=123&gclid=Cj0&gbraid=x&wbraid=y&fbclid=fb&msclkid=ms&gad_source=1&gad_campaignid=2&ttclid=tt&twclid=tw&li_fat_id=li&mc_cid=mc&mc_eid=me&ref=homepage",
    );
    expect(result).toBe("?ref=homepage");
  });

  it("returns empty string when all params are tracking params", () => {
    expect(stripTrackingParams("?gclid=abc&fbclid=xyz")).toBe("");
  });

  it("returns empty string for an empty input", () => {
    expect(stripTrackingParams("")).toBe("");
  });

  it("preserves a query string with no tracking params unchanged", () => {
    expect(stripTrackingParams("?ref=email&foo=bar")).toBe("?ref=email&foo=bar");
  });
});

describe("injectSeoTagsAsync — canonical strips tracking params on entity pages", () => {
  it("emits a canonical href without srsltid and utm_source on a product page", async () => {
    mockFetchOnce({
      ok: true,
      product: {
        name: "Rose Bouquet",
        description: "Beautiful roses.",
        image: { uri: "https://cdn.test/roses.jpg" },
        priceValue: 50,
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/product/rose-bouquet",
      { ...OPTS, search: "?srsltid=abc&utm_source=google" },
    );
    expect(out).toContain(
      'rel="canonical" href="https://presentail.test/en-ae/dubai/product/rose-bouquet"',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-ae/dubai/product/rose-bouquet"',
    );
    expect(out).not.toContain("srsltid");
    expect(out).not.toContain("utm_source");
  });

  it("preserves non-tracking params while stripping tracking ones on the brands filter page", async () => {
    mockFetchOnce({
      ok: true,
      category: {
        name: "Roses",
        description: "Long-stem roses.",
        image: null,
      },
    });
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/brands",
      { ...OPTS, search: "?category=roses&gclid=abc&fbclid=xyz" },
    );
    expect(out).toContain(
      'rel="canonical" href="https://presentail.test/en-ae/dubai/brands?category=roses"',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-ae/dubai/brands?category=roses"',
    );
    expect(out).not.toContain("gclid");
    expect(out).not.toContain("fbclid");
  });
});

// ---------------------------------------------------------------------------
// Homepage LCP preload tag
// ---------------------------------------------------------------------------

describe("injectSeoTagsAsync — homepage LCP preload tag", () => {
  const OS_IMAGE_URL =
    "https://os.presentail.com/api/storage/banners/hero-1.jpg";

  beforeEach(() => {
    genericSeoCache.clear();
  });

  it("emits <link rel=preload as=image> on the root homepage when firstBannerImageUrl is an OS storage URL", async () => {
    const out = await injectSeoTagsAsync(HTML, "/", {
      ...OPTS,
      firstBannerImageUrl: OS_IMAGE_URL,
    });
    expect(out).toContain('<link rel="preload" as="image"');
  });

  it("preload href points to /api/img/proxy with w=800 and f=webp", async () => {
    const out = await injectSeoTagsAsync(HTML, "/", {
      ...OPTS,
      firstBannerImageUrl: OS_IMAGE_URL,
    });
    const match = out.match(/<link rel="preload" as="image"[^>]*href="([^"]+)"/);
    expect(match).not.toBeNull();
    const href = match![1];
    expect(href).toContain("/api/img/proxy?");
    expect(href).toContain("w=800");
    expect(href).toContain("f=webp");
  });

  it("preload tag has imagesrcset attribute with 400w, 800w, and 1200w entries", async () => {
    const out = await injectSeoTagsAsync(HTML, "/", {
      ...OPTS,
      firstBannerImageUrl: OS_IMAGE_URL,
    });
    const match = out.match(/imagesrcset="([^"]+)"/);
    expect(match).not.toBeNull();
    const srcset = match![1];
    expect(srcset).toContain("w=400");
    expect(srcset).toContain("w=800");
    expect(srcset).toContain("w=1200");
  });

  it("preload tag has imagesizes attribute", async () => {
    const out = await injectSeoTagsAsync(HTML, "/", {
      ...OPTS,
      firstBannerImageUrl: OS_IMAGE_URL,
    });
    expect(out).toContain("imagesizes=");
  });

  it("emits preload tag on a locale-prefixed homepage (/en-lb/beirut)", async () => {
    const out = await injectSeoTagsAsync(HTML, "/en-lb/beirut", {
      ...OPTS,
      firstBannerImageUrl: OS_IMAGE_URL,
    });
    expect(out).toContain('<link rel="preload" as="image"');
    const match = out.match(/<link rel="preload" as="image"[^>]*href="([^"]+)"/);
    expect(match![1]).toContain("/api/img/proxy?");
    expect(match![1]).toContain("w=800");
  });

  it("does NOT emit a preload tag on a non-homepage route (/en-lb/beirut/product/rose)", async () => {
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-lb/beirut/product/rose",
      { ...OPTS, firstBannerImageUrl: OS_IMAGE_URL },
    );
    expect(out).not.toContain('<link rel="preload" as="image"');
  });

  it("emits a plain href preload (no imagesrcset) for a non-OS banner URL", async () => {
    const unsplashUrl = "https://images.unsplash.com/photo-123?w=800";
    const out = await injectSeoTagsAsync(HTML, "/", {
      ...OPTS,
      firstBannerImageUrl: unsplashUrl,
    });
    expect(out).toContain('<link rel="preload" as="image"');
    expect(out).toContain(`href="${unsplashUrl}"`);
    expect(out).not.toContain("imagesrcset=");
  });

  it("does NOT emit a preload tag when firstBannerImageUrl is absent", async () => {
    const out = await injectSeoTagsAsync(HTML, "/", { ...OPTS });
    expect(out).not.toContain('<link rel="preload" as="image"');
  });
});
