/**
 * Production SEO injection regression tests (serve.mjs only)
 *
 * The web storefront injects per-request SEO tags — an absolute canonical URL
 * built from the real request origin, plus per-entity Open Graph / Twitter
 * tags — ONLY in the production Node server (serve.mjs), which re-runs the
 * injector per request with the real request origin.
 *
 * The Vite dev server's `seoInjectPlugin` (used by the ./e2e suite via
 * playwright.config.ts) cannot reproduce this: at build time it has no real
 * request context, so it would bake a relative `href="/"` canonical and stale
 * generic title into the static index.html (see the comment in vite.config.ts).
 * That means a regression that only affects production SEO output — a wrong or
 * relative canonical, a missing OG image, or a duplicate canonical tag — would
 * NOT be caught by the dev-server spec, and WhatsApp / iMessage / Slack rich
 * previews would silently break.
 *
 * So this spec lives in ./e2e-serve (run via playwright.serve.config.ts) and
 * MUST be pointed at a built serve.mjs instance via PLAYWRIGHT_BASE_URL. The
 * "Web serve checks" CI workflow builds + starts serve.mjs and runs it there.
 *
 * It asserts:
 *   1. Exactly one absolute <link rel="canonical"> pointing at the request
 *      origin on the root path ("/").
 *   2. Exactly one absolute <link rel="canonical"> pointing at the request
 *      origin on a locale-prefixed path ("/en-lb/beirut/").
 *   3. og:title / og:image / twitter:card are present and non-empty on an
 *      entity page (a locale-prefixed product path).
 *
 * Uses Playwright's APIRequestContext so the tests exercise the real HTTP layer
 * (serve.mjs) without a browser — exactly the initial HTML crawlers receive.
 *
 * NOTE on the request-origin assertion for "/": serve.mjs lets CANONICAL_ORIGIN
 * override the request origin for the bare landing path. The "Web serve checks"
 * workflow does NOT set CANONICAL_ORIGIN, so the canonical origin equals the
 * request origin there. To stay robust if that ever changes, the root-path test
 * accepts either the request origin or the configured CANONICAL_ORIGIN, while
 * still always requiring the canonical to be absolute and unique. The
 * locale-prefixed path is never subject to that override, so it asserts an exact
 * request-origin match.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract every <link rel="canonical" href="..."> href from a raw HTML string,
 * tolerating either attribute order (rel-then-href or href-then-rel).
 */
function findCanonicalHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const relFirst = /<link\s+rel="canonical"\s+href="([^"]*)"/gi;
  const hrefFirst = /<link\s+href="([^"]*)"\s+rel="canonical"/gi;
  let m: RegExpExecArray | null;
  while ((m = relFirst.exec(html)) !== null) hrefs.push(m[1]);
  while ((m = hrefFirst.exec(html)) !== null) hrefs.push(m[1]);
  return hrefs;
}

/**
 * Extract a meta tag's content by property/name, tolerating attribute order.
 */
function findMetaContent(
  html: string,
  attr: "property" | "name",
  key: string,
): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keyFirst = new RegExp(
    `<meta\\s+${attr}="${esc}"\\s+content="([^"]*)"`,
    "i",
  );
  const contentFirst = new RegExp(
    `<meta\\s+content="([^"]*)"\\s+${attr}="${esc}"`,
    "i",
  );
  const m = html.match(keyFirst) ?? html.match(contentFirst);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// 1. Absolute canonical on the root path "/"
// ---------------------------------------------------------------------------

test.describe("Production SEO — absolute canonical on /", () => {
  let html: string;
  let origin: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    origin = new URL(response.url()).origin;
    html = await response.text();
  });

  test("exactly one <link rel=\"canonical\"> is present", () => {
    const hrefs = findCanonicalHrefs(html);
    expect(
      hrefs.length,
      `expected exactly one canonical tag, found ${hrefs.length}: ${JSON.stringify(hrefs)}`,
    ).toBe(1);
  });

  test("the canonical is absolute and points at the request origin", () => {
    const hrefs = findCanonicalHrefs(html);
    expect(hrefs.length).toBe(1);
    const href = hrefs[0];
    // Must be absolute (production never emits a relative canonical).
    expect(href, `canonical must be absolute, got "${href}"`).toMatch(
      /^https?:\/\//,
    );
    // The bare landing path may have its origin overridden by CANONICAL_ORIGIN;
    // the serve check workflow does not set it, so the request origin is used.
    const canonicalOrigin = new URL(href).origin;
    const allowed = [origin];
    const configured = process.env.CANONICAL_ORIGIN?.replace(/\/$/, "");
    if (configured) allowed.push(new URL(configured).origin);
    expect(
      allowed,
      `canonical origin "${canonicalOrigin}" should be one of ${JSON.stringify(allowed)}`,
    ).toContain(canonicalOrigin);
  });
});

// ---------------------------------------------------------------------------
// 2. Absolute canonical on a locale-prefixed path "/en-lb/beirut/"
//
// Locale-prefixed paths are never subject to the CANONICAL_ORIGIN override, so
// the canonical must always be the request origin + the locale path.
// ---------------------------------------------------------------------------

test.describe("Production SEO — absolute canonical on /en-lb/beirut/", () => {
  let html: string;
  let origin: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/");
    expect(response.status()).toBe(200);
    origin = new URL(response.url()).origin;
    html = await response.text();
  });

  test("exactly one <link rel=\"canonical\"> is present", () => {
    const hrefs = findCanonicalHrefs(html);
    expect(
      hrefs.length,
      `expected exactly one canonical tag, found ${hrefs.length}: ${JSON.stringify(hrefs)}`,
    ).toBe(1);
  });

  test("the canonical is absolute and uses the request origin", () => {
    const hrefs = findCanonicalHrefs(html);
    expect(hrefs.length).toBe(1);
    const href = hrefs[0];
    expect(href, `canonical must be absolute, got "${href}"`).toMatch(
      /^https?:\/\//,
    );
    expect(new URL(href).origin).toBe(origin);
    // Sanity: the canonical reflects the locale path, not a bare "/".
    expect(href).toContain("/en-lb/beirut");
  });
});

// ---------------------------------------------------------------------------
// 3. OG / Twitter tags on an entity page
//
// injectSeoTagsAsync() always emits a full set of share tags for an entity
// path (product / brand / category / occasion) regardless of whether the OS
// API resolves the slug — the generic-head fallback emits them too. A missing
// og:image or twitter:card here means every shared product link would render a
// blank rich preview.
// ---------------------------------------------------------------------------

test.describe("Production SEO — OG/Twitter tags on a product entity page", () => {
  let html: string;
  let origin: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/product/rose-bouquet");
    expect(response.status()).toBe(200);
    origin = new URL(response.url()).origin;
    html = await response.text();
  });

  test('og:title is present and non-empty', () => {
    const content = findMetaContent(html, "property", "og:title");
    expect(content, 'meta[property="og:title"] not found').toBeTruthy();
    expect(content!.trim().length).toBeGreaterThan(0);
  });

  test('og:image is present and is an absolute URL', () => {
    const content = findMetaContent(html, "property", "og:image");
    expect(content, 'meta[property="og:image"] not found').toBeTruthy();
    expect(content!.trim().length).toBeGreaterThan(0);
    // Crawlers reject relative OG images — it must be absolute.
    expect(content, `og:image must be absolute, got "${content}"`).toMatch(
      /^https?:\/\//,
    );
  });

  test('twitter:card is present and non-empty', () => {
    const content = findMetaContent(html, "name", "twitter:card");
    expect(content, 'meta[name="twitter:card"] not found').toBeTruthy();
    expect(content!.trim().length).toBeGreaterThan(0);
  });
});
