import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-expect-error - mjs import without types; the module is plain JS.
import { injectSeoTagsAsync, buildSeoHead, parseDimsFromBuffer } from "../../seo-inject.mjs";

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
    expect(fetchMock).toHaveBeenCalledTimes(2); // entity API + image dimension fetch
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
    expect(fetchMock).toHaveBeenCalledTimes(2); // entity API + image dimension fetch
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
    expect(fetchMock).toHaveBeenCalledTimes(2); // entity API + image dimension fetch
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
    expect(fetchMock).toHaveBeenCalledTimes(1); // no image URL → no second fetch
    expect(fetchMock.mock.calls[0][0]).toContain("slug=roses");
    expect(out).toContain("<title>Roses | Presentail</title>");
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
    expect(fetchMock).toHaveBeenCalledTimes(2); // entity API + image dimension fetch
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
  origin: "https://presentail.dims-test",
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

  it("emits the default 1200×630 dimensions when no product image is present (opengraph.jpg fallback)", async () => {
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

    expect(out).toContain('<meta property="og:image:width" content="1200"');
    expect(out).toContain('<meta property="og:image:height" content="630"');
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
  origin: "https://presentail.cache-inv-test",
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
      if (String(url).includes("/api/woo/brand")) {
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
