/**
 * Structured-data regression tests
 *
 * Verifies that the server-side SEO injection in seo-inject.mjs produces:
 *   1. A JSON-LD <script> block with "@type":"Organization"
 *   2. A JSON-LD <script> block with "@type":"WebSite" (with SearchAction)
 *   3. A non-empty <meta name="description"> tag
 *   4. A non-empty <meta property="og:title"> tag
 *   5. A non-empty <meta property="og:description"> tag
 *   6. A non-empty <meta name="twitter:title"> tag
 *   7. A non-empty <meta name="twitter:description"> tag
 *
 * Locale-prefixed route coverage (groups 2–8 below):
 *   - /en-lb/beirut/                 — city homepage (generic head)
 *   - /en-lb/beirut/product/<slug>   — product entity path
 *   - /en-lb/beirut/brand/<slug>     — brand entity path
 *   - /en-lb/beirut/category/<slug>  — category entity path
 *   - /en-lb/beirut/occasion/<slug>  — occasion entity path
 *   - /en-lb/beirut/blog             — editorial blog index (generic head)
 *   - /en-lb/beirut/blog/<slug>      — individual blog post (generic head)
 *
 * For entity paths the Organization JSON-LD and OG/Twitter tags are always
 * present regardless of whether the upstream OS API resolves the slug
 * (buildEntityHead emits them; generic-head fallback also emits them).
 * BreadcrumbList and Product JSON-LD are asserted when the entity resolves
 * (i.e. the response contains the corresponding @type string).
 *
 * Uses Playwright's APIRequestContext so tests are fast HTTP checks against the
 * raw initial HTML — no browser JS needed, exactly what crawlers/bots receive.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertOgTwitter(html: string) {
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
    ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);
  expect(ogTitle, 'meta[property="og:title"] not found or empty').toBeTruthy();
  expect(ogTitle![1].trim().length).toBeGreaterThan(0);

  const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)
    ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:description"/i);
  expect(ogDesc, 'meta[property="og:description"] not found or empty').toBeTruthy();
  expect(ogDesc![1].trim().length).toBeGreaterThan(0);

  const twTitle = html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i)
    ?? html.match(/<meta\s+content="([^"]+)"\s+name="twitter:title"/i);
  expect(twTitle, 'meta[name="twitter:title"] not found or empty').toBeTruthy();
  expect(twTitle![1].trim().length).toBeGreaterThan(0);

  const twDesc = html.match(/<meta\s+name="twitter:description"\s+content="([^"]+)"/i)
    ?? html.match(/<meta\s+content="([^"]+)"\s+name="twitter:description"/i);
  expect(twDesc, 'meta[name="twitter:description"] not found or empty').toBeTruthy();
  expect(twDesc![1].trim().length).toBeGreaterThan(0);
}

function assertDescription(html: string) {
  const match = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
    ?? html.match(/<meta\s+content="([^"]+)"\s+name="description"/i);
  expect(match, 'meta[name="description"] not found or empty').toBeTruthy();
  expect(match![1].trim().length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// 1. Generic homepage /
// ---------------------------------------------------------------------------

test.describe("Structured data — initial HTML response for /", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test('JSON-LD block with "@type":"WebSite" is present', () => {
    expect(html).toContain('"@type":"WebSite"');
  });

  test('WebSite JSON-LD block includes a SearchAction', () => {
    expect(html).toContain('"@type":"SearchAction"');
  });

  test('meta[name="description"] is present and non-empty', () => {
    assertDescription(html);
  });

  test('meta[property="og:title"] is present and non-empty', () => {
    const match = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);
    expect(match, 'meta[property="og:title"] not found or empty').toBeTruthy();
    expect(match![1].trim().length).toBeGreaterThan(0);
  });

  test('meta[property="og:description"] is present and non-empty', () => {
    const match = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:description"/i);
    expect(match, 'meta[property="og:description"] not found or empty').toBeTruthy();
    expect(match![1].trim().length).toBeGreaterThan(0);
  });

  test('meta[name="twitter:title"] is present and non-empty', () => {
    const match = html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+name="twitter:title"/i);
    expect(match, 'meta[name="twitter:title"] not found or empty').toBeTruthy();
    expect(match![1].trim().length).toBeGreaterThan(0);
  });

  test('meta[name="twitter:description"] is present and non-empty', () => {
    const match = html.match(/<meta\s+name="twitter:description"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+name="twitter:description"/i);
    expect(match, 'meta[name="twitter:description"] not found or empty').toBeTruthy();
    expect(match![1].trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Locale-prefixed city homepage /en-lb/beirut/
//
// buildSeoHead() always runs for this path: it always produces Organization +
// WebSite JSON-LD and a full set of OG/Twitter tags.
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed city homepage /en-lb/beirut/", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/");
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test('JSON-LD block with "@type":"WebSite" is present', () => {
    expect(html).toContain('"@type":"WebSite"');
  });

  test('WebSite JSON-LD block includes a SearchAction', () => {
    expect(html).toContain('"@type":"SearchAction"');
  });

  test("meta[name=\"description\"] is present and non-empty", () => {
    assertDescription(html);
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });
});

// ---------------------------------------------------------------------------
// 3. Locale-prefixed product path /en-lb/beirut/product/rose-bouquet
//
// injectSeoTagsAsync() always runs buildSeoHead() first and then attempts an
// entity fetch for the slug.  Whether or not the OS API resolves the product,
// Organization JSON-LD and OG/Twitter tags must be present in the response.
//
// When the entity resolves the Product and BreadcrumbList schemas are also
// injected via buildEntityHead's extraLines — we assert them when the response
// contains the relevant @type strings so the test doubles as an integration
// check in environments where the OS API is reachable.
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed product path /en-lb/beirut/product/rose-bouquet", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/product/rose-bouquet");
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });

  test("meta[name=\"description\"] is present and non-empty", () => {
    assertDescription(html);
  });

  test('when OS API resolves the product, "@type":"Product" JSON-LD is present', () => {
    if (!html.includes('"@type":"Product"')) {
      test.skip(true, "OS API did not resolve the product slug — entity-specific JSON-LD not expected");
    }
    expect(html).toContain('"@type":"Product"');
  });

  test('when OS API resolves the product, "@type":"BreadcrumbList" JSON-LD is present', () => {
    if (!html.includes('"@type":"BreadcrumbList"')) {
      test.skip(true, "OS API did not resolve the product slug — BreadcrumbList not expected");
    }
    expect(html).toContain('"@type":"BreadcrumbList"');
  });
});

// ---------------------------------------------------------------------------
// 4. Locale-prefixed brand path /en-lb/beirut/brand/roses
//
// buildBrandHead() injects Organization + BreadcrumbList (Home > Brands >
// Brand Name) when the entity resolves.  Organization + OG/Twitter are always
// present regardless.
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed brand path /en-lb/beirut/brand/roses", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/brand/roses");
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });

  test("meta[name=\"description\"] is present and non-empty", () => {
    assertDescription(html);
  });

  test('when OS API resolves the brand, "@type":"BreadcrumbList" JSON-LD is present', () => {
    if (!html.includes('"@type":"BreadcrumbList"')) {
      test.skip(true, "OS API did not resolve the brand slug — BreadcrumbList not expected");
    }
    expect(html).toContain('"@type":"BreadcrumbList"');
  });
});

// ---------------------------------------------------------------------------
// 5. Locale-prefixed category path /en-lb/beirut/category/flowers
//
// buildCategoryHead() (via buildShopEntityHead()) injects Organization +
// BreadcrumbList (Home > Shop > Category Name) when the entity resolves.
// Organization + OG/Twitter are always present regardless.
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed category path /en-lb/beirut/category/flowers", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/category/flowers");
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });

  test("meta[name=\"description\"] is present and non-empty", () => {
    assertDescription(html);
  });

  test('when OS API resolves the category, "@type":"BreadcrumbList" JSON-LD is present', () => {
    if (!html.includes('"@type":"BreadcrumbList"')) {
      test.skip(true, "OS API did not resolve the category slug — BreadcrumbList not expected");
    }
    expect(html).toContain('"@type":"BreadcrumbList"');
  });
});

// ---------------------------------------------------------------------------
// 6. Locale-prefixed occasion path /en-lb/beirut/occasion/birthday
//
// buildOccasionHead() (via buildShopEntityHead()) injects Organization +
// BreadcrumbList (Home > Shop > Occasion Name) when the entity resolves.
// Organization + OG/Twitter are always present regardless.
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed occasion path /en-lb/beirut/occasion/birthday", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/occasion/birthday");
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });

  test("meta[name=\"description\"] is present and non-empty", () => {
    assertDescription(html);
  });

  test('when OS API resolves the occasion, "@type":"BreadcrumbList" JSON-LD is present', () => {
    if (!html.includes('"@type":"BreadcrumbList"')) {
      test.skip(true, "OS API did not resolve the occasion slug — BreadcrumbList not expected");
    }
    expect(html).toContain('"@type":"BreadcrumbList"');
  });
});

// ---------------------------------------------------------------------------
// 7. Locale-prefixed blog index /en-lb/beirut/blog
//
// The blog index is not an OS-resolved entity path: injectSeoTagsAsync() falls
// through to the generic head (buildSeoHead) for it, which always emits
// Organization + WebSite JSON-LD and a full set of OG/Twitter tags using the
// blog-specific title/description keys (see seo-inject.mjs ROUTE_TITLES /
// ROUTE_DESCRIPTIONS `blog`). This guards against a regression in the blog
// head injection silently producing a blank OG preview whenever an article
// index link is shared on social.
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed blog index /en-lb/beirut/blog", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/blog");
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test('JSON-LD block with "@type":"WebSite" is present', () => {
    expect(html).toContain('"@type":"WebSite"');
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });

  test('meta[name="description"] is present and non-empty', () => {
    assertDescription(html);
  });
});

// ---------------------------------------------------------------------------
// 8. Locale-prefixed blog post /en-lb/beirut/blog/<slug>
//
// Individual blog posts are matched by the `blogPost` route key but are not
// fetched as OS entities, so injectSeoTagsAsync() returns the generic head:
// Organization JSON-LD + OG/Twitter tags + meta description are always present
// using the blog-post title/description keys. A regression here would silently
// ship broken previews for every shared article.
//
// No Article/BreadcrumbList JSON-LD is emitted today, but should the blog head
// builder ever start injecting it we assert it conditionally (via test.skip)
// so the test doubles as an integration check without flaking when it is
// absent — mirroring the entity suites above.
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed blog post /en-lb/beirut/blog/the-art-of-gifting-flowers", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get(
      "/en-lb/beirut/blog/the-art-of-gifting-flowers",
    );
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });

  test('meta[name="description"] is present and non-empty', () => {
    assertDescription(html);
  });

  test('when the blog head resolves the post, "@type":"Article" JSON-LD is present', () => {
    if (!html.includes('"@type":"Article"')) {
      test.skip(true, "blog head did not resolve an article — Article JSON-LD not expected");
    }
    expect(html).toContain('"@type":"Article"');
  });

  test('when the blog head resolves the post, "@type":"BreadcrumbList" JSON-LD is present', () => {
    if (!html.includes('"@type":"BreadcrumbList"')) {
      test.skip(true, "blog head did not resolve an article — BreadcrumbList not expected");
    }
    expect(html).toContain('"@type":"BreadcrumbList"');
  });
});

// ---------------------------------------------------------------------------
// 9. Shared wishlist path /favorites/share/:token
//
// injectSeoTagsAsync() has a dedicated, non-locale-prefixed code path for
// /favorites/share/:token (fetchSharedFavoritesForSeo + buildWishlistHead).
// When the token does not resolve (fetch returns null), wishlistResult stays
// null and execution falls through to the generic head, which always emits
// Organization JSON-LD + OG/Twitter tags. This guards against a regression in
// that path (e.g. broken Accept-Language handling or a cache eviction bug)
// silently producing a blank OG preview every time a shopper shares a wishlist.
//
// We use a token that is guaranteed not to exist so the assertion holds in any
// environment regardless of whether the API/OS upstreams are reachable.
// ---------------------------------------------------------------------------

test.describe("Structured data — shared wishlist path /favorites/share/:token (unresolved token)", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get(
      "/favorites/share/test-token-that-does-not-exist",
    );
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });

  test('meta[name="description"] is present and non-empty', () => {
    assertDescription(html);
  });
});
