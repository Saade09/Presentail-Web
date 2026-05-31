import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-expect-error - mjs import without types; the module is plain JS.
import { injectSeoTagsAsync, buildSeoHead } from "../../seo-inject.mjs";

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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/woo/product?");
    expect(fetchMock.mock.calls[0][0]).toContain("slug=velvet-rose-bouquet");
    expect(fetchMock.mock.calls[0][0]).toContain("countryCode=AE");
    expect(fetchMock.mock.calls[0][0]).toContain("cityId=ae-dubai");
    expect(out).toContain("<title>Velvet Rose Bouquet | Presentail</title>");
    expect(out).toContain(
      'content="A dozen long-stem velvet roses, hand-tied."',
    );
    expect(out).toContain(
      '<meta property="og:image" content="https://cdn.test/velvet.jpg"',
    );
    expect(out).toContain('<meta property="og:type" content="product"');
    expect(out).toContain(
      '<meta property="product:price:amount" content="89.50"',
    );
    expect(out).toContain(
      '<meta property="product:price:currency" content="USD"',
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
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(
      HTML,
      "/en-ae/dubai/product/anything",
      OPTS,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/woo/category?");
    expect(fetchMock.mock.calls[0][0]).toContain("slug=birthday-cakes");
    expect(out).toContain("<title>Birthday Cakes | Presentail</title>");
    expect(out).toContain('content="Same-day cake delivery."');
    expect(out).toContain(
      '<meta property="og:image" content="https://cdn.test/cakes.jpg"',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-ae/dubai/shop?n=birthday-cakes"',
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("slug=roses");
    expect(out).toContain("<title>Roses | Presentail</title>");
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image"');
    // When the entity has no image the code falls back to opengraph.jpg.
    expect(out).toContain('property="og:image" content="https://presentail.test/opengraph.jpg"');
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/woo/occasion?");
    expect(fetchMock.mock.calls[0][0]).toContain("slug=birthday");
    expect(out).toContain("<title>Birthday Gifts | Presentail</title>");
    expect(out).toContain('content="Make every birthday memorable."');
    expect(out).toContain(
      '<meta property="og:image" content="https://cdn.test/birthday.jpg"',
    );
    expect(out).toContain(
      '<meta property="og:url" content="https://presentail.test/en-ae/dubai/shop?occasion=birthday"',
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
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("ETIMEDOUT"));
    vi.stubGlobal("fetch", fetchMock);
    const out = await injectSeoTagsAsync(HTML, "/en-ae/dubai/shop", {
      ...OPTS,
      search: "?occasion=anniversary",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/woo/category?");
    expect(fetchMock.mock.calls[0][0]).not.toContain("/api/woo/occasion");
    expect(out).toContain("<title>Roses | Presentail</title>");
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    // No image supplied → falls back to summary_large_image with opengraph.jpg.
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
      search: "?occasion=birthday",
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

  it("emits og:image:width = 1200 on a generic locale page", () => {
    const { headSnippet } = buildSeoHead("/en-lb/beirut", {
      origin: "https://presentail.test",
      basePath: "",
    });
    expect(headSnippet).toContain('<meta property="og:image:width" content="1200"');
  });

  it("emits og:image:height = 630 on a generic locale page", () => {
    const { headSnippet } = buildSeoHead("/en-lb/beirut", {
      origin: "https://presentail.test",
      basePath: "",
    });
    expect(headSnippet).toContain('<meta property="og:image:height" content="630"');
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
    expect(headSnippet).toContain('<meta property="og:image:width" content="1200"');
    expect(headSnippet).toContain('<meta property="og:image:height" content="630"');
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
    expect(out).not.toContain('property="og:image:width"');
    expect(out).not.toContain('property="og:image:height"');
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

describe("injectSeoTagsAsync — entity pages with no image: /opengraph.jpg fallback with 1200×630", () => {
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
    expect(out).toContain(
      'property="og:image" content="https://presentail.test/opengraph.jpg"',
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
    expect(out).toContain('<meta property="og:image:width" content="1200"');
    expect(out).toContain('<meta property="og:image:height" content="630"');
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
    expect(out).toContain('<meta property="og:image:width" content="1200"');
    expect(out).toContain('<meta property="og:image:height" content="630"');
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
    expect(out).toContain('<meta property="og:image:width" content="1200"');
    expect(out).toContain('<meta property="og:image:height" content="630"');
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
