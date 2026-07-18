/**
 * Product SEO lifecycle regression tests (serve.mjs only)
 *
 * Verifies the HTTP-level behaviour that serve.mjs applies after seo-inject.mjs
 * resolves a product's lifecycle state:
 *
 *   ACTIVE                 → 200 + InStock schema + no "Coming Soon" suffix
 *   SOLD_OUT_TEMPORARILY   → 200 + OutOfStock schema + "Coming Soon" title suffix
 *   SEASONAL_UNAVAILABLE   → 200 + OutOfStock schema + "Coming Soon" title suffix
 *   DISCONTINUED + redirect→ 301 to replacement product URL (from PRODUCT_REDIRECTS)
 *   DISCONTINUED no redir  → 410 Gone
 *   Not found (404 from OS) → 410 Gone
 *
 * Requires a running serve.mjs instance (PLAYWRIGHT_BASE_URL) pointed at the
 * SEO entity fixture server (INTERNAL_API_BASE_URL → SEO_FIXTURE_PORT) — the
 * same setup used by seo-injection.spec.ts in the "Web serve checks" CI workflow.
 *
 * Uses Playwright's APIRequestContext so tests exercise the real HTTP layer
 * without launching a browser.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findMetaContent(
  html: string,
  attr: "property" | "name",
  key: string,
): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keyFirst = new RegExp(`<meta\\s+${attr}="${esc}"\\s+content="([^"]*)"`, "i");
  const contentFirst = new RegExp(`<meta\\s+content="([^"]*)"\\s+${attr}="${esc}"`, "i");
  return (
    html.match(keyFirst)?.[1] ??
    html.match(contentFirst)?.[1] ??
    null
  );
}

/** Extract all JSON-LD nodes (unwrapping @graph) from raw HTML. */
function extractJsonLd(html: string): Record<string, unknown>[] {
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  const nodes: Record<string, unknown>[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed["@graph"] && Array.isArray(parsed["@graph"])) {
        nodes.push(...(parsed["@graph"] as Record<string, unknown>[]));
      } else {
        nodes.push(parsed as Record<string, unknown>);
      }
    } catch {
      // skip malformed blocks
    }
  }
  return nodes;
}

function findSchema(
  html: string,
  type: string,
): Record<string, unknown> | undefined {
  return extractJsonLd(html).find((n) => n["@type"] === type);
}

// ---------------------------------------------------------------------------
// Locale prefix helpers
// ---------------------------------------------------------------------------
const LOCALE = "en-lb";
const CITY = "beirut";

function productPath(slug: string) {
  return `/${LOCALE}/${CITY}/product/${slug}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Product lifecycle — active product", () => {
  test("returns 200 for an active in-stock product", async ({ request }) => {
    const res = await request.get(productPath("rose-bouquet"), {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(200);
  });

  test("active product has InStock availability in schema", async ({ request }) => {
    const res = await request.get(productPath("rose-bouquet"));
    const html = await res.text();
    const product = findSchema(html, "Product");
    const offer = product?.offers as Record<string, unknown> | undefined;
    expect(offer?.availability).toBe("https://schema.org/InStock");
  });

  test("active product title does NOT contain 'Coming Soon'", async ({ request }) => {
    const res = await request.get(productPath("rose-bouquet"));
    const html = await res.text();
    const ogTitle = findMetaContent(html, "property", "og:title");
    expect(ogTitle).toBeTruthy();
    expect(ogTitle).not.toContain("Coming Soon");
  });

  test("active product schema has returnPolicy", async ({ request }) => {
    const res = await request.get(productPath("rose-bouquet"));
    const html = await res.text();
    const product = findSchema(html, "Product");
    expect(product?.returnPolicy).toBe(
      "https://presentail.com/en-lb/beirut/return-policy",
    );
  });
});

test.describe("Product lifecycle — sold-out product (SOLD_OUT_TEMPORARILY)", () => {
  test("returns 200 for a sold-out product", async ({ request }) => {
    const res = await request.get(productPath("sold-out-roses"), {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(200);
  });

  test("sold-out product has OutOfStock availability in schema", async ({ request }) => {
    const res = await request.get(productPath("sold-out-roses"));
    const html = await res.text();
    const product = findSchema(html, "Product");
    const offer = product?.offers as Record<string, unknown> | undefined;
    expect(offer?.availability).toBe("https://schema.org/OutOfStock");
  });

  test("sold-out product title contains 'Coming Soon' suffix", async ({ request }) => {
    const res = await request.get(productPath("sold-out-roses"));
    const html = await res.text();
    const ogTitle = findMetaContent(html, "property", "og:title");
    expect(ogTitle).toMatch(/–\s*Coming Soon/);
  });

  test("sold-out product schema has returnPolicy", async ({ request }) => {
    const res = await request.get(productPath("sold-out-roses"));
    const html = await res.text();
    const product = findSchema(html, "Product");
    expect(product?.returnPolicy).toBe(
      "https://presentail.com/en-lb/beirut/return-policy",
    );
  });
});

test.describe("Product lifecycle — seasonal product (SEASONAL_UNAVAILABLE)", () => {
  test("returns 200 for a seasonal product", async ({ request }) => {
    const res = await request.get(productPath("seasonal-poppies"), {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(200);
  });

  test("seasonal product has OutOfStock availability in schema", async ({ request }) => {
    const res = await request.get(productPath("seasonal-poppies"));
    const html = await res.text();
    const product = findSchema(html, "Product");
    const offer = product?.offers as Record<string, unknown> | undefined;
    expect(offer?.availability).toBe("https://schema.org/OutOfStock");
  });

  test("seasonal product title contains 'Coming Soon' suffix", async ({ request }) => {
    const res = await request.get(productPath("seasonal-poppies"));
    const html = await res.text();
    const ogTitle = findMetaContent(html, "property", "og:title");
    expect(ogTitle).toMatch(/–\s*Coming Soon/);
  });
});

test.describe("Product lifecycle — renamed product (DISCONTINUED + redirect)", () => {
  test("returns 301 for a discontinued product that has a redirect entry", async ({
    request,
  }) => {
    const res = await request.get(productPath("old-red-roses"), {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(301);
  });

  test("301 Location header points to the replacement product URL", async ({
    request,
  }) => {
    const res = await request.get(productPath("old-red-roses"), {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(301);
    const location = res.headers()["location"] ?? "";
    expect(location).toContain("/product/rose-bouquet");
    // The redirect must preserve the locale prefix.
    expect(location).toContain(`/${LOCALE}/${CITY}/`);
  });

  test("301 response carries cache-control: max-age=31536000", async ({
    request,
  }) => {
    const res = await request.get(productPath("old-red-roses"), {
      maxRedirects: 0,
    });
    const cc = res.headers()["cache-control"] ?? "";
    expect(cc).toContain("max-age=31536000");
  });

  test("301 response carries x-robots-tag: noindex", async ({ request }) => {
    const res = await request.get(productPath("old-red-roses"), {
      maxRedirects: 0,
    });
    const robotsTag = res.headers()["x-robots-tag"] ?? "";
    expect(robotsTag).toBe("noindex");
  });
});

test.describe("Product lifecycle — discontinued product (410 Gone)", () => {
  test("returns 410 for a discontinued product with no redirect entry", async ({
    request,
  }) => {
    const res = await request.get(productPath("discontinued-product"), {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(410);
  });

  test("410 response carries x-robots-tag: noindex", async ({ request }) => {
    const res = await request.get(productPath("discontinued-product"), {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(410);
    const robotsTag = res.headers()["x-robots-tag"] ?? "";
    expect(robotsTag).toBe("noindex");
  });

  test("410 response carries cache-control: max-age=86400", async ({ request }) => {
    const res = await request.get(productPath("discontinued-product"), {
      maxRedirects: 0,
    });
    const cc = res.headers()["cache-control"] ?? "";
    expect(cc).toContain("max-age=86400");
  });
});

test.describe("Product lifecycle — absent product (410 Gone)", () => {
  test("returns 410 for a slug not found in the OS catalog", async ({ request }) => {
    const res = await request.get(
      productPath("this-product-does-not-exist-xyz"),
      { maxRedirects: 0 },
    );
    expect(res.status()).toBe(410);
  });

  test("410 absent product carries x-robots-tag: noindex", async ({ request }) => {
    const res = await request.get(
      productPath("this-product-does-not-exist-xyz"),
      { maxRedirects: 0 },
    );
    const robotsTag = res.headers()["x-robots-tag"] ?? "";
    expect(robotsTag).toBe("noindex");
  });
});
