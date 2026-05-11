import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-expect-error - mjs import without types; the module is plain JS.
import { injectSeoTagsAsync } from "../../seo-inject.mjs";

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
    expect(out).toContain('<meta name="twitter:card" content="summary"');
    expect(out).not.toContain('property="og:image"');
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
