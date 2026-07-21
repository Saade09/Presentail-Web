/**
 * Canonical tag — tracking-param leak regression tests
 *
 * Unit tests in `seo-inject.test.ts` confirm that `stripTrackingParams` and the
 * brands-filter canonical are clean in isolation. These Playwright tests guard
 * against a real HTTP regression where a product or brand URL visited with a
 * tracking query string (e.g. `?srsltid=abc&utm_source=google`) still leaks
 * those params into the `<link rel="canonical">` tag emitted by the server —
 * the kind of silent regression that breaks Google Search Console.
 *
 * Coverage:
 *   1. Product URL with ?srsltid + ?utm_source → canonical href is clean.
 *   2. Brand URL with ?srsltid + ?utm_source → canonical href is clean.
 *   3. Canonical is present on a product URL without tracking params (baseline).
 *   4. Canonical is present on a brand URL without tracking params (baseline).
 *
 * Implementation notes:
 *   - All tests use Playwright's APIRequestContext (`request.get()`) so they
 *     are fast HTTP checks against the raw initial HTML — no browser JS is
 *     executed, exactly what Googlebot receives.
 *   - The canonical href is extracted via regex from the raw HTML string.
 *   - Tests are intentionally OS-API-agnostic: the canonical tag is injected by
 *     `seo-inject.mjs` at the server layer and is always present regardless of
 *     whether the upstream OS API resolves the slug.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the href value from the first `<link rel="canonical">` tag in the
 * given HTML string.  Returns null if no canonical tag is found.
 */
function extractCanonicalHref(html: string): string | null {
  // Match either attribute order: rel="canonical" href="..." or href="..." rel="canonical"
  const m =
    html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i) ??
    html.match(/<link\s+href="([^"]+)"\s+rel="canonical"/i);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// 1. Product URL with tracking params → canonical is clean
// ---------------------------------------------------------------------------

test.describe("Canonical tag — product URL with tracking params", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get(
      "/en-lb/beirut/product/rose-bouquet?srsltid=test&utm_source=test",
    );
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test("canonical tag is present in the server-rendered HTML", () => {
    const href = extractCanonicalHref(html);
    expect(
      href,
      '<link rel="canonical"> tag is missing from the product page response',
    ).not.toBeNull();
  });

  test("canonical href does not contain srsltid", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    expect(
      href,
      "canonical href must not contain srsltid tracking param",
    ).not.toContain("srsltid");
  });

  test("canonical href does not contain utm_source", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    expect(
      href,
      "canonical href must not contain utm_source tracking param",
    ).not.toContain("utm_source");
  });

  test("canonical href contains the clean product path without a query string", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    // The canonical must contain the product slug path segment.
    expect(href).toContain("/product/rose-bouquet");
    // No query string should survive at all.
    expect(href).not.toContain("?");
  });
});

// ---------------------------------------------------------------------------
// 2. Brand URL with tracking params → canonical is clean
// ---------------------------------------------------------------------------

test.describe("Canonical tag — brand URL with tracking params", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get(
      "/en-lb/beirut/brand/roses?srsltid=test&utm_source=test",
    );
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test("canonical tag is present in the server-rendered HTML", () => {
    const href = extractCanonicalHref(html);
    expect(
      href,
      '<link rel="canonical"> tag is missing from the brand page response',
    ).not.toBeNull();
  });

  test("canonical href does not contain srsltid", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    expect(
      href,
      "canonical href must not contain srsltid tracking param",
    ).not.toContain("srsltid");
  });

  test("canonical href does not contain utm_source", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    expect(
      href,
      "canonical href must not contain utm_source tracking param",
    ).not.toContain("utm_source");
  });

  test("canonical href contains the clean brand path without a query string", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    // The canonical must contain the brand slug path segment.
    expect(href).toContain("/brand/roses");
    // No query string should survive at all.
    expect(href).not.toContain("?");
  });
});

// ---------------------------------------------------------------------------
// 3. Homepage with tracking params → canonical and og:url are clean
// ---------------------------------------------------------------------------

test.describe("Canonical tag — homepage with tracking params", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get(
      "/en-lb/beirut?srsltid=test&utm_source=google",
    );
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test("HTTP 200 is returned for a homepage URL with tracking params", async ({ request }) => {
    const response = await request.get("/en-lb/beirut?srsltid=test&utm_source=google");
    expect(response.status()).toBe(200);
  });

  test("exactly one canonical tag is present in the server-rendered homepage HTML", () => {
    const canonicals = html.match(/<link\s+rel="canonical"/gi) ?? [];
    expect(canonicals, "expected exactly one <link rel=canonical>").toHaveLength(1);
  });

  test("canonical href does not contain srsltid on the homepage", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    expect(href, "canonical href must not contain srsltid").not.toContain("srsltid");
  });

  test("canonical href does not contain utm_source on the homepage", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    expect(href, "canonical href must not contain utm_source").not.toContain("utm_source");
  });

  test("og:url does not contain tracking params on the homepage", () => {
    const m = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:url"/i);
    expect(m, "og:url meta tag must be present").not.toBeNull();
    const ogUrl = m?.[1] ?? "";
    expect(ogUrl).not.toContain("srsltid");
    expect(ogUrl).not.toContain("utm_source");
  });

  test("no tracking param appears anywhere in the raw HTML head section", () => {
    const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
    const head = headMatch?.[0] ?? html;
    expect(head).not.toContain("srsltid=");
    expect(head).not.toContain("utm_source=");
  });
});

// ---------------------------------------------------------------------------
// 4. Arabic locale product URL with tracking params → canonical is clean
// ---------------------------------------------------------------------------

test.describe("Canonical tag — Arabic locale product URL with tracking params", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get(
      "/ar-lb/beirut/product/rose-bouquet?srsltid=test",
    );
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test("HTTP 200 is returned for the AR locale product URL with tracking params", async ({ request }) => {
    const response = await request.get("/ar-lb/beirut/product/rose-bouquet?srsltid=test");
    expect(response.status()).toBe(200);
  });

  test("exactly one canonical tag is present in the AR locale product HTML", () => {
    const canonicals = html.match(/<link\s+rel="canonical"/gi) ?? [];
    expect(canonicals, "expected exactly one <link rel=canonical>").toHaveLength(1);
  });

  test("canonical href does not contain srsltid on the AR locale product page", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    expect(href, "canonical href must not contain srsltid").not.toContain("srsltid");
  });

  test("canonical href contains the clean AR product path", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    expect(href).toContain("/ar-lb/");
    expect(href).toContain("/product/rose-bouquet");
    expect(href).not.toContain("?");
  });

  test("og:url does not contain tracking params on the AR product page", () => {
    const m = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:url"/i);
    expect(m, "og:url meta tag must be present").not.toBeNull();
    const ogUrl = m?.[1] ?? "";
    expect(ogUrl).not.toContain("srsltid");
    expect(ogUrl).not.toContain("gclid");
    expect(ogUrl).not.toContain("fbclid");
    expect(ogUrl).not.toContain("utm_");
  });

  test("no tracking param from any family appears in the raw HTML head section on AR locale product", () => {
    const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
    const head = headMatch?.[0] ?? html;
    expect(head).not.toContain("srsltid=");
    expect(head).not.toContain("gclid=");
    expect(head).not.toContain("fbclid=");
    expect(head).not.toContain("utm_source=");
  });
});

// ---------------------------------------------------------------------------
// 5. French locale product URL with tracking params → canonical is clean
// ---------------------------------------------------------------------------

test.describe("Canonical tag — French locale product URL with tracking params", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get(
      "/fr-lb/beirut/product/rose-bouquet?srsltid=test",
    );
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test("HTTP 200 is returned for the FR locale product URL with tracking params", async ({ request }) => {
    const response = await request.get("/fr-lb/beirut/product/rose-bouquet?srsltid=test");
    expect(response.status()).toBe(200);
  });

  test("exactly one canonical tag is present in the FR locale product HTML", () => {
    const canonicals = html.match(/<link\s+rel="canonical"/gi) ?? [];
    expect(canonicals, "expected exactly one <link rel=canonical>").toHaveLength(1);
  });

  test("canonical href does not contain srsltid on the FR locale product page", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    expect(href, "canonical href must not contain srsltid").not.toContain("srsltid");
  });

  test("canonical href contains the clean FR product path", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    expect(href).toContain("/fr-lb/");
    expect(href).toContain("/product/rose-bouquet");
    expect(href).not.toContain("?");
  });

  test("og:url does not contain tracking params on the FR product page", () => {
    const m = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:url"/i);
    expect(m, "og:url meta tag must be present").not.toBeNull();
    const ogUrl = m?.[1] ?? "";
    expect(ogUrl).not.toContain("srsltid");
    expect(ogUrl).not.toContain("gclid");
    expect(ogUrl).not.toContain("fbclid");
    expect(ogUrl).not.toContain("utm_");
  });

  test("no tracking param from any family appears in the raw HTML head section on FR locale product", () => {
    const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
    const head = headMatch?.[0] ?? html;
    expect(head).not.toContain("srsltid=");
    expect(head).not.toContain("gclid=");
    expect(head).not.toContain("fbclid=");
    expect(head).not.toContain("utm_source=");
  });
});

// ---------------------------------------------------------------------------
// 6. Baseline: canonical present on clean product URL (no tracking params)
// ---------------------------------------------------------------------------

test.describe("Canonical tag — baseline product URL without tracking params", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/product/rose-bouquet");
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test("canonical tag is present in the server-rendered HTML", () => {
    const href = extractCanonicalHref(html);
    expect(
      href,
      '<link rel="canonical"> tag is missing from the clean product URL response',
    ).not.toBeNull();
  });

  test("canonical href points to the product path", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    expect(href).toContain("/product/rose-bouquet");
  });
});

// ---------------------------------------------------------------------------
// 4. Baseline: canonical present on clean brand URL (no tracking params)
// ---------------------------------------------------------------------------

test.describe("Canonical tag — baseline brand URL without tracking params", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/brand/roses");
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test("canonical tag is present in the server-rendered HTML", () => {
    const href = extractCanonicalHref(html);
    expect(
      href,
      '<link rel="canonical"> tag is missing from the clean brand URL response',
    ).not.toBeNull();
  });

  test("canonical href points to the brand path", () => {
    const href = extractCanonicalHref(html);
    expect(href).not.toBeNull();
    expect(href).toContain("/brand/roses");
  });
});
