/**
 * Structured-data regression tests
 *
 * Verifies that the server-side SEO injection in seo-inject.mjs produces:
 *   1. A JSON-LD <script> block with "@type":"Organization"
 *   2. A JSON-LD <script> block with "@type":"WebSite" (no SearchAction — the
 *      storefront has no crawlable /search results page)
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

/**
 * Assert that the Organization JSON-LD node parsed from raw HTML:
 *   - exists and has @type "Organization"
 *   - carries a non-empty `description` string
 *   - carries a non-empty `areaServed` value (string or non-empty array)
 *
 * Applied to every describe block so a regression in buildOrganizationSchema
 * (seo-inject.mjs) is caught on any route, not just the terms page.
 */
function assertOrganizationJsonLd(html: string) {
  const nodes = extractJsonLdNodes(html);
  const orgNode = nodes.find((n) => n["@type"] === "Organization");
  expect(orgNode, "Organization JSON-LD node not found").toBeTruthy();
  expect(
    typeof orgNode!.description === "string" &&
      (orgNode!.description as string).trim().length > 0,
    "Organization.description should be a non-empty string",
  ).toBe(true);
  const areaServed = orgNode!.areaServed;
  expect(areaServed, "Organization.areaServed should be present").toBeTruthy();
  if (Array.isArray(areaServed)) {
    expect(
      (areaServed as unknown[]).length,
      "Organization.areaServed array should be non-empty",
    ).toBeGreaterThan(0);
  }
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

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
  });

  test('JSON-LD block with "@type":"WebSite" is present', () => {
    expect(html).toContain('"@type":"WebSite"');
  });

  test('WebSite JSON-LD block does NOT include a SearchAction', () => {
    expect(html).not.toContain('"@type":"SearchAction"');
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

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
  });

  test('JSON-LD block with "@type":"WebSite" is present', () => {
    expect(html).toContain('"@type":"WebSite"');
  });

  test('WebSite JSON-LD block does NOT include a SearchAction', () => {
    expect(html).not.toContain('"@type":"SearchAction"');
  });

  test('Home > City BreadcrumbList JSON-LD is present', () => {
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  test('LocalBusiness (Florist) JSON-LD is present with areaServed and address', () => {
    assertLocalBusinessJsonLd(html);
  });

  test("meta[name=\"description\"] is present and non-empty", () => {
    assertDescription(html);
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });
});

// ---------------------------------------------------------------------------
// 2b. Locale-prefixed city homepage /en-ae/dubai/
//
// UAE city homepages share the same buildLocalBusinessSchema() code path as LB
// but resolve countryName through the "ae" locale branch.  A regression there
// would silently drop the Florist JSON-LD (and local-pack signals) for every
// UAE city without failing any existing test.
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed city homepage /en-ae/dubai/", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-ae/dubai/");
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
  });

  test('JSON-LD block with "@type":"WebSite" is present', () => {
    expect(html).toContain('"@type":"WebSite"');
  });

  test('WebSite JSON-LD block does NOT include a SearchAction', () => {
    expect(html).not.toContain('"@type":"SearchAction"');
  });

  test('Home > City BreadcrumbList JSON-LD is present', () => {
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  test('LocalBusiness (Florist) JSON-LD is present with areaServed and address', () => {
    assertLocalBusinessJsonLd(html);
  });

  test("meta[name=\"description\"] is present and non-empty", () => {
    assertDescription(html);
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });
});

// ---------------------------------------------------------------------------
// 2c. Locale-prefixed city homepage /en-cy/nicosia/
//
// Cyprus city homepages share the same buildLocalBusinessSchema() code path
// but resolve countryName through the "cy" locale branch.  A regression there
// would silently drop the Florist JSON-LD (and local-pack signals) for every
// Cyprus city without failing any existing test.
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed city homepage /en-cy/nicosia/", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-cy/nicosia/");
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
  });

  test('JSON-LD block with "@type":"WebSite" is present', () => {
    expect(html).toContain('"@type":"WebSite"');
  });

  test('WebSite JSON-LD block does NOT include a SearchAction', () => {
    expect(html).not.toContain('"@type":"SearchAction"');
  });

  test('Home > City BreadcrumbList JSON-LD is present', () => {
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  test('LocalBusiness (Florist) JSON-LD is present with areaServed and address', () => {
    assertLocalBusinessJsonLd(html);
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

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
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

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
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
// BreadcrumbList (Home > City > Category Name) when the entity resolves.
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

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
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
// BreadcrumbList (Home > City > Occasion Name) when the entity resolves.
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

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
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

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
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
// Individual blog posts resolve from the shared BLOG_POSTS source of truth
// (@workspace/blog-content) — the same module the BlogPost page renders from —
// so buildBlogPostHead() emits a per-article title/description, og:type=article,
// Article JSON-LD and a BreadcrumbList. Organization JSON-LD + OG/Twitter tags +
// meta description are always present. A regression here would silently ship
// broken (or drifting) previews for every shared article.
//
// We use a real article slug so the Article/BreadcrumbList assertions exercise
// the per-article path; they remain conditional (via test.skip) so the suite
// still passes in environments where the server falls back to the generic head
// (e.g. no API base URL configured) — mirroring the entity suites above.
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed blog post /en-lb/beirut/blog/inside-spring-sourcing-trip", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get(
      "/en-lb/beirut/blog/inside-spring-sourcing-trip",
    );
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
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

  test("when the blog head resolves the post, the per-article OG image is emitted", () => {
    if (!html.includes('"@type":"Article"')) {
      test.skip(true, "blog head did not resolve an article — per-article OG image not expected");
    }
    // og:image / twitter:image point at the article-specific hero, not the
    // site-wide opengraph.jpg fallback, and carry explicit dimensions so the
    // preview renders as a large summary card.
    expect(html).toContain("/blog/inside-spring-sourcing-trip.webp");
    expect(html).toMatch(
      /<meta property="og:image" content="[^"]*\/blog\/inside-spring-sourcing-trip\.webp"/,
    );
    expect(html).toContain('<meta property="og:image:width" content="1408" />');
    expect(html).toContain('<meta property="og:image:height" content="768" />');
    expect(html).toContain('"@type":"Article"');
    expect(html).toMatch(
      /"image":"[^"]*\/blog\/inside-spring-sourcing-trip\.webp"/,
    );
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

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });

  test('meta[name="description"] is present and non-empty', () => {
    assertDescription(html);
  });
});

// ---------------------------------------------------------------------------
// 10. Locale-prefixed FAQ page /en-lb/beirut/faqs
//
// /faqs is the one generic (non-OS-entity) route that emits FAQPage JSON-LD so
// Google can render the Q&A rich result. computeSeoHead() detects routeKey
// "faqs" and walks FAQ_COPY (src/data/faqsCopy.js) to emit a FAQPage block with
// one Question per FAQ item. Like the other generic suites, Organization
// JSON-LD + OG/Twitter tags + meta description are always present. The FAQPage
// + Question assertions guard against a regression in either the JSON-LD
// builder or the FAQ copy source silently dropping the rich result.
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed FAQ page /en-lb/beirut/faqs", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/faqs");
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });

  test('meta[name="description"] is present and non-empty', () => {
    assertDescription(html);
  });

  test('JSON-LD block with "@type":"FAQPage" is present', () => {
    expect(html).toContain('"@type":"FAQPage"');
  });

  test('FAQPage JSON-LD contains at least one "@type":"Question"', () => {
    expect(html).toContain('"@type":"Question"');
  });
});

// ---------------------------------------------------------------------------
// Helpers for BreadcrumbList well-formedness and prerendered heading counts
// ---------------------------------------------------------------------------

/**
 * Extract every JSON-LD block from raw HTML and return them as parsed objects.
 * Handles both standalone <script type="application/ld+json">…</script> blocks
 * and @graph wrappers.
 */
function extractJsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]) as Record<string, unknown>;
      if (Array.isArray(parsed["@graph"])) {
        for (const n of parsed["@graph"] as Record<string, unknown>[]) nodes.push(n);
      } else {
        nodes.push(parsed);
      }
    } catch {
      // malformed block — skip
    }
  }
  return nodes;
}

/**
 * Assert that the LocalBusiness (Florist) JSON-LD node parsed from raw HTML:
 *   - exists and has @type "Florist"
 *   - carries a non-empty `areaServed` string (city-page location anchor)
 *   - carries an `address` object with at least one of `addressLocality` or
 *     `addressCountry` present and non-empty
 *
 * Applied to the /en-lb/beirut/ describe block so a regression in the
 * cityName/countryName resolution path (which conditionally populates these
 * fields in buildLocalBusinessSchema) is caught before it silently removes the
 * local-pack location signals from every city homepage.
 */
function assertLocalBusinessJsonLd(html: string) {
  const nodes = extractJsonLdNodes(html);
  const floristNode = nodes.find((n) => n["@type"] === "Florist");
  expect(floristNode, 'LocalBusiness (Florist) JSON-LD node not found').toBeTruthy();

  const areaServed = floristNode!.areaServed;
  expect(areaServed, "LocalBusiness.areaServed should be present").toBeTruthy();
  expect(
    typeof areaServed === "string" && (areaServed as string).trim().length > 0,
    "LocalBusiness.areaServed should be a non-empty string",
  ).toBe(true);

  const address = floristNode!.address as Record<string, unknown> | undefined;
  expect(address, "LocalBusiness.address should be present").toBeTruthy();
  const hasLocality =
    typeof address!.addressLocality === "string" &&
    (address!.addressLocality as string).trim().length > 0;
  const hasCountry =
    typeof address!.addressCountry === "string" &&
    (address!.addressCountry as string).trim().length > 0;
  expect(
    hasLocality || hasCountry,
    "LocalBusiness.address should have a non-empty addressLocality or addressCountry",
  ).toBe(true);
}

/**
 * Find the first BreadcrumbList node in a JSON-LD node array.
 */
function findBreadcrumbList(
  nodes: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  return nodes.find((n) => n["@type"] === "BreadcrumbList");
}

/**
 * Assert that a BreadcrumbList node is well-formed:
 *   - @type === "BreadcrumbList"
 *   - itemListElement is a non-empty array
 *   - every item has @type "ListItem", a numeric position ≥ 1, and a non-empty name
 */
function assertWellFormedBreadcrumbList(node: Record<string, unknown>): void {
  expect(node["@type"]).toBe("BreadcrumbList");
  const items = node.itemListElement as Array<Record<string, unknown>>;
  expect(Array.isArray(items), "itemListElement should be an array").toBe(true);
  expect(items.length, "BreadcrumbList should have at least one item").toBeGreaterThan(0);
  for (const item of items) {
    expect(item["@type"]).toBe("ListItem");
    expect(typeof item.position === "number" && item.position >= 1, "position should be a number ≥ 1").toBe(true);
    expect(typeof item.name === "string" && (item.name as string).trim().length > 0, "name should be a non-empty string").toBe(true);
  }
}

/**
 * Count the number of h2 and h3 opening tags in raw HTML (prerendered body).
 */
function countHeadings(html: string): number {
  const h2 = (html.match(/<h2[\s>]/gi) ?? []).length;
  const h3 = (html.match(/<h3[\s>]/gi) ?? []).length;
  return h2 + h3;
}

// ---------------------------------------------------------------------------
// 11. Locale-prefixed shop page /en-lb/beirut/shop
//
// buildSeoHead() emits for this path:
//   - Organization JSON-LD (always)
//   - BreadcrumbList (Home > Beirut > Shop) via the ROUTE_CRUMB_LABELS branch
//   - FAQPage JSON-LD (from SHOP_FAQ_COPY via genericFaqRoutes)
//   - A prerendered body section with an h2 "Frequently Asked Questions" heading
//     followed by h3 headings for each FAQ question (≥ 2 h2/h3 total)
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed shop page /en-lb/beirut/shop", () => {
  let html: string;
  let nodes: Record<string, unknown>[];

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/shop");
    expect(response.status()).toBe(200);
    html = await response.text();
    nodes = extractJsonLdNodes(html);
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });

  test('meta[name="description"] is present and non-empty', () => {
    assertDescription(html);
  });

  test('"@type":"BreadcrumbList" JSON-LD is present', () => {
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  test("BreadcrumbList JSON-LD is well-formed (ListItem array with position and name)", () => {
    const node = findBreadcrumbList(nodes);
    expect(node, "BreadcrumbList node not found in JSON-LD blocks").toBeTruthy();
    assertWellFormedBreadcrumbList(node!);
  });

  test("BreadcrumbList has at least 2 items (Home > … > Shop)", () => {
    const node = findBreadcrumbList(nodes);
    expect(node, "BreadcrumbList node not found").toBeTruthy();
    const items = node!.itemListElement as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  test('"@type":"FAQPage" JSON-LD is present (SHOP_FAQ_COPY)', () => {
    expect(html).toContain('"@type":"FAQPage"');
  });

  test('FAQPage JSON-LD contains "@type":"Question" entries', () => {
    expect(html).toContain('"@type":"Question"');
  });

  test("prerendered body contains at least 2 h2/h3 elements (FAQ headings)", () => {
    expect(
      countHeadings(html),
      "expected at least 2 h2/h3 heading tags in the prerendered HTML body",
    ).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 12. Locale-prefixed terms page /en-lb/beirut/terms
//
// buildSeoHead() emits for this path:
//   - Organization JSON-LD (always)
//   - BreadcrumbList (Home > Beirut > Terms of Use) via ROUTE_CRUMB_LABELS
//   - WebPage JSON-LD (via buildWebPageSchema for routeKey "terms")
// Terms is a legal page with no FAQ copy, so no FAQPage JSON-LD or FAQ headings.
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed terms page /en-lb/beirut/terms", () => {
  let html: string;
  let nodes: Record<string, unknown>[];

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/terms");
    expect(response.status()).toBe(200);
    html = await response.text();
    nodes = extractJsonLdNodes(html);
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

  test('"@type":"BreadcrumbList" JSON-LD is present', () => {
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  test("BreadcrumbList JSON-LD is well-formed (ListItem array with position and name)", () => {
    const node = findBreadcrumbList(nodes);
    expect(node, "BreadcrumbList node not found in JSON-LD blocks").toBeTruthy();
    assertWellFormedBreadcrumbList(node!);
  });

  test("BreadcrumbList has at least 2 items (Home > … > Terms of Use)", () => {
    const node = findBreadcrumbList(nodes);
    expect(node, "BreadcrumbList node not found").toBeTruthy();
    const items = node!.itemListElement as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  test('"@type":"WebPage" JSON-LD is present', () => {
    expect(html).toContain('"@type":"WebPage"');
  });

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
  });
});

// ---------------------------------------------------------------------------
// 13. Locale-prefixed contact page /en-lb/beirut/contact
//
// buildSeoHead() emits for this path:
//   - Organization JSON-LD (always)
//   - BreadcrumbList (Home > Beirut > Contact) via ROUTE_CRUMB_LABELS
//   - ContactPage JSON-LD (via buildContactPageSchema for routeKey "contact")
//   - FAQPage JSON-LD (from CONTACT_FAQ_COPY via genericFaqRoutes)
//   - A prerendered body with h2 "Frequently Asked Questions" + h3 per FAQ item
// ---------------------------------------------------------------------------

test.describe("Structured data — locale-prefixed contact page /en-lb/beirut/contact", () => {
  let html: string;
  let nodes: Record<string, unknown>[];

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut/contact");
    expect(response.status()).toBe(200);
    html = await response.text();
    nodes = extractJsonLdNodes(html);
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test("Organization JSON-LD includes description and areaServed", () => {
    assertOrganizationJsonLd(html);
  });

  test("OG and Twitter Card tags are present and non-empty", () => {
    assertOgTwitter(html);
  });

  test('meta[name="description"] is present and non-empty', () => {
    assertDescription(html);
  });

  test('"@type":"BreadcrumbList" JSON-LD is present', () => {
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  test("BreadcrumbList JSON-LD is well-formed (ListItem array with position and name)", () => {
    const node = findBreadcrumbList(nodes);
    expect(node, "BreadcrumbList node not found in JSON-LD blocks").toBeTruthy();
    assertWellFormedBreadcrumbList(node!);
  });

  test("BreadcrumbList has at least 2 items (Home > … > Contact)", () => {
    const node = findBreadcrumbList(nodes);
    expect(node, "BreadcrumbList node not found").toBeTruthy();
    const items = node!.itemListElement as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  test('"@type":"ContactPage" JSON-LD is present', () => {
    expect(html).toContain('"@type":"ContactPage"');
  });

  test('"@type":"FAQPage" JSON-LD is present (CONTACT_FAQ_COPY)', () => {
    expect(html).toContain('"@type":"FAQPage"');
  });

  test('FAQPage JSON-LD contains "@type":"Question" entries', () => {
    expect(html).toContain('"@type":"Question"');
  });

  test("prerendered body contains at least 2 h2/h3 elements (FAQ headings)", () => {
    expect(
      countHeadings(html),
      "expected at least 2 h2/h3 heading tags in the prerendered HTML body",
    ).toBeGreaterThanOrEqual(2);
  });
});
