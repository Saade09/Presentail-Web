/**
 * Legacy WordPress / WooCommerce redirect smoke tests (serve.mjs)
 *
 * serve.mjs implements a block of WP/WC legacy-URL handling that runs before
 * any SPA fallback.  These tests assert the exact HTTP status code (and
 * `location` header for 301s) produced by serve.mjs so a future edit cannot
 * silently break a redirect without a CI failure.
 *
 * Source of truth for the redirect/410 logic:
 *   artifacts/presentail-web/serve.mjs — sections 1–7 of the legacy-WP block.
 *
 * Coverage:
 *   Section 1–3  WP infra paths, date archives, author archives → 410 Gone.
 *   Section 4    WC shop pagination (/shop/page/:n) → 301 /en-lb/beirut/shop.
 *   Section 5    /product-category/:slug → 301 /en-lb/beirut/category/:mapped.
 *   Section 6    /product-tag/:slug → 301 /en-lb/beirut/occasion/:mapped.
 *   Section 7    Vanity archive pages → 301 canonical equivalents.
 *
 * All tests use Playwright's APIRequestContext with `maxRedirects: 0` so we
 * see the raw 301 / 410 response instead of the final landed page.  This is
 * exactly what Googlebot receives on the first request.
 *
 * Must run against a built serve.mjs instance — the "Web serve checks"
 * workflow starts the server and sets PLAYWRIGHT_BASE_URL before executing
 * this suite via `pnpm --filter @workspace/presentail-web run test:e2e:serve`.
 *
 * Run locally:
 *   pnpm --filter @workspace/presentail-web run build
 *   PORT=19234 node artifacts/presentail-web/serve.mjs &
 *   PLAYWRIGHT_BASE_URL=http://localhost:19234 \
 *     pnpm --filter @workspace/presentail-web run test:e2e:serve \
 *     --grep "legacy-redirects"
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a URL without following redirects.
 * Returns the raw response (status + headers).
 */
async function getNoFollow(
  request: Parameters<typeof test>[1] extends infer T
    ? T extends { request: infer R }
      ? R
      : never
    : never,
  path: string,
) {
  return request.get(path, { maxRedirects: 0 });
}

// ---------------------------------------------------------------------------
// Section 1–3: WP infrastructure paths, date archives, author archives → 410
// ---------------------------------------------------------------------------

test.describe("410 Gone — WordPress infrastructure paths", () => {
  const gone410Paths = [
    // WP admin
    "/wp-admin/",
    "/wp-admin/options.php",
    // WP login
    "/wp-login.php",
    // WP REST API
    "/wp-json/",
    "/wp-json/wp/v2/posts",
    // WP content
    "/wp-content/",
    "/wp-content/uploads/2023/01/hero.jpg",
    "/wp-content/themes/astra/style.css",
    // WP includes
    "/wp-includes/",
    "/wp-includes/js/jquery/jquery.min.js",
  ];

  for (const path of gone410Paths) {
    test(`${path} → 410 Gone`, async ({ request }) => {
      const response = await getNoFollow(request, path);
      expect(
        response.status(),
        `${path} must return 410 Gone (WordPress infrastructure path)`,
      ).toBe(410);
    });
  }
});

test.describe("410 Gone — date archive paths", () => {
  const dateArchivePaths = [
    "/2023/",
    "/2022/",
    "/2021/11/",
    "/2020/06/15/",
    "/2019/",
    // No trailing slash variants
    "/2023",
    "/2021/11",
  ];

  for (const path of dateArchivePaths) {
    test(`${path} → 410 Gone`, async ({ request }) => {
      const response = await getNoFollow(request, path);
      expect(
        response.status(),
        `${path} must return 410 Gone (WP date archive path)`,
      ).toBe(410);
    });
  }
});

test.describe("410 Gone — author archive paths", () => {
  const authorPaths = [
    "/author/admin",
    "/author/john-doe",
    "/author/presentail-team",
    "/author/admin/",
  ];

  for (const path of authorPaths) {
    test(`${path} → 410 Gone`, async ({ request }) => {
      const response = await getNoFollow(request, path);
      expect(
        response.status(),
        `${path} must return 410 Gone (WP author archive path)`,
      ).toBe(410);
    });
  }
});

// ---------------------------------------------------------------------------
// Section 4: WC shop pagination → main shop (301)
// ---------------------------------------------------------------------------

test.describe("301 redirect — WooCommerce shop pagination", () => {
  const paginationCases = [
    { path: "/shop/page/2/", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/shop/page/3/", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/shop/page/10/", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/shop/page/2", expectedLocation: "/en-lb/beirut/shop" },
  ];

  for (const { path, expectedLocation } of paginationCases) {
    test(`${path} → 301 ${expectedLocation}`, async ({ request }) => {
      const response = await getNoFollow(request, path);
      expect(
        response.status(),
        `${path} must return 301 (WC shop pagination)`,
      ).toBe(301);
      const location = response.headers()["location"];
      expect(
        location,
        `${path} must redirect to ${expectedLocation}`,
      ).toBe(expectedLocation);
    });
  }
});

// ---------------------------------------------------------------------------
// Section 5: /product-category/:slug → /en-lb/beirut/category/:mapped (301)
// ---------------------------------------------------------------------------

test.describe("301 redirect — WooCommerce product-category (known slug)", () => {
  const knownCategoryMappings: Array<{
    wcSlug: string;
    presentailSlug: string;
  }> = [
    { wcSlug: "flowers", presentailSlug: "hand-bouquets" },
    { wcSlug: "flower-bouquets", presentailSlug: "hand-bouquets" },
    { wcSlug: "bouquets", presentailSlug: "hand-bouquets" },
    { wcSlug: "luxury-arrangements", presentailSlug: "lux-arrangements" },
    { wcSlug: "lux-arrangements", presentailSlug: "lux-arrangements" },
    { wcSlug: "chocolates", presentailSlug: "chocolate" },
    { wcSlug: "chocolate", presentailSlug: "chocolate" },
    { wcSlug: "gift-boxes", presentailSlug: "gift-boxes" },
    { wcSlug: "hampers", presentailSlug: "hampers" },
    { wcSlug: "gift-baskets", presentailSlug: "gift-baskets" },
    { wcSlug: "plants", presentailSlug: "plants" },
    { wcSlug: "cakes", presentailSlug: "cakes" },
    { wcSlug: "cakes-pastries", presentailSlug: "cakes" },
    { wcSlug: "balloons", presentailSlug: "balloons" },
    { wcSlug: "flower-boxes", presentailSlug: "flower-boxes" },
    { wcSlug: "flower-baskets", presentailSlug: "flower-baskets" },
    { wcSlug: "bundles", presentailSlug: "bundles" },
  ];

  for (const { wcSlug, presentailSlug } of knownCategoryMappings) {
    const path = `/product-category/${wcSlug}`;
    const expectedLocation = `/en-lb/beirut/category/${presentailSlug}`;

    test(`${path} → 301 ${expectedLocation}`, async ({ request }) => {
      const response = await getNoFollow(request, path);
      expect(
        response.status(),
        `${path} must return 301 (WC product-category known slug)`,
      ).toBe(301);
      const location = response.headers()["location"];
      expect(
        location,
        `${path} must redirect to ${expectedLocation}`,
      ).toBe(expectedLocation);
    });
  }
});

test.describe("301 redirect — WooCommerce product-category (unknown slug → shop)", () => {
  const unknownCategoryPaths = [
    "/product-category/unknown-category",
    "/product-category/cupcakes",
    "/product-category/perfumes",
  ];

  for (const path of unknownCategoryPaths) {
    test(`${path} → 301 /en-lb/beirut/shop (fallback)`, async ({
      request,
    }) => {
      const response = await getNoFollow(request, path);
      expect(
        response.status(),
        `${path} must return 301 (unknown WC product-category → shop fallback)`,
      ).toBe(301);
      const location = response.headers()["location"];
      expect(
        location,
        `${path} must redirect to /en-lb/beirut/shop when slug is unmapped`,
      ).toBe("/en-lb/beirut/shop");
    });
  }
});

test.describe("301 redirect — WooCommerce product-category with pagination suffix", () => {
  test("/product-category/flowers/page/2/ → 301 /en-lb/beirut/category/hand-bouquets", async ({
    request,
  }) => {
    const response = await getNoFollow(
      request,
      "/product-category/flowers/page/2/",
    );
    expect(response.status()).toBe(301);
    const location = response.headers()["location"];
    expect(location).toBe("/en-lb/beirut/category/hand-bouquets");
  });
});

// ---------------------------------------------------------------------------
// Section 6: /product-tag/:slug → /en-lb/beirut/occasion/:mapped (301)
// ---------------------------------------------------------------------------

test.describe("301 redirect — WooCommerce product-tag (known slug)", () => {
  const knownTagMappings: Array<{ wcTag: string; presentailOccasion: string }> =
    [
      { wcTag: "birthday", presentailOccasion: "birthday" },
      { wcTag: "love", presentailOccasion: "love-romance" },
      { wcTag: "romance", presentailOccasion: "love-romance" },
      { wcTag: "love-romance", presentailOccasion: "love-romance" },
      { wcTag: "housewarming", presentailOccasion: "housewarming" },
      { wcTag: "anniversary", presentailOccasion: "anniversary" },
      { wcTag: "new-job", presentailOccasion: "new-job" },
      { wcTag: "promotion", presentailOccasion: "promotion" },
      { wcTag: "graduation", presentailOccasion: "graduation" },
      { wcTag: "congratulations", presentailOccasion: "congratulations" },
      { wcTag: "thank-you", presentailOccasion: "thank-you" },
      { wcTag: "get-well-soon", presentailOccasion: "get-well-soon" },
      { wcTag: "newborn", presentailOccasion: "new-born" },
      { wcTag: "new-born", presentailOccasion: "new-born" },
      { wcTag: "eid", presentailOccasion: "eid" },
      { wcTag: "ramadan", presentailOccasion: "ramadan" },
      { wcTag: "wedding", presentailOccasion: "wedding" },
      { wcTag: "thinking-of-you", presentailOccasion: "thinking-of-you" },
      { wcTag: "farewell", presentailOccasion: "farewell" },
      { wcTag: "condolences", presentailOccasion: "condolences" },
      { wcTag: "colleague", presentailOccasion: "colleague" },
      { wcTag: "colleagues", presentailOccasion: "colleague" },
      { wcTag: "friend", presentailOccasion: "friend" },
      { wcTag: "im-sorry", presentailOccasion: "im-sorry" },
      { wcTag: "sorry", presentailOccasion: "im-sorry" },
      { wcTag: "children", presentailOccasion: "children" },
      { wcTag: "valentine", presentailOccasion: "valentine" },
      { wcTag: "mothers-day", presentailOccasion: "mothers-day" },
      { wcTag: "womens-day", presentailOccasion: "womens-day" },
      { wcTag: "fathers-day", presentailOccasion: "fathers-day" },
      { wcTag: "christmas", presentailOccasion: "christmas" },
      { wcTag: "katb-kitab", presentailOccasion: "katb-kitab" },
    ];

  for (const { wcTag, presentailOccasion } of knownTagMappings) {
    const path = `/product-tag/${wcTag}`;
    const expectedLocation = `/en-lb/beirut/occasion/${presentailOccasion}`;

    test(`${path} → 301 ${expectedLocation}`, async ({ request }) => {
      const response = await getNoFollow(request, path);
      expect(
        response.status(),
        `${path} must return 301 (WC product-tag known slug)`,
      ).toBe(301);
      const location = response.headers()["location"];
      expect(
        location,
        `${path} must redirect to ${expectedLocation}`,
      ).toBe(expectedLocation);
    });
  }
});

test.describe("301 redirect — WooCommerce product-tag (unknown slug → occasions)", () => {
  const unknownTagPaths = [
    "/product-tag/unknown-tag",
    "/product-tag/spring",
    "/product-tag/luxury",
  ];

  for (const path of unknownTagPaths) {
    test(`${path} → 301 /en-lb/beirut/occasions (fallback)`, async ({
      request,
    }) => {
      const response = await getNoFollow(request, path);
      expect(
        response.status(),
        `${path} must return 301 (unknown WC product-tag → occasions fallback)`,
      ).toBe(301);
      const location = response.headers()["location"];
      expect(
        location,
        `${path} must redirect to /en-lb/beirut/occasions when tag is unmapped`,
      ).toBe("/en-lb/beirut/occasions");
    });
  }
});

// ---------------------------------------------------------------------------
// Section 7: Vanity archive pages → canonical equivalents (301)
// ---------------------------------------------------------------------------

test.describe("301 redirect — vanity archive pages", () => {
  const vanityCases: Array<{ path: string; expectedLocation: string }> = [
    { path: "/offer", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/offer/", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/offers", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/offers/", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/sale", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/sale/", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/sales", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/sales/", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/best-sellers", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/best-sellers/", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/best-seller", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/best-seller/", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/new-arrivals", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/new-arrivals/", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/new-arrival", expectedLocation: "/en-lb/beirut/shop" },
    { path: "/new-arrival/", expectedLocation: "/en-lb/beirut/shop" },
    {
      path: "/all-flowers",
      expectedLocation: "/en-lb/beirut/category/hand-bouquets",
    },
    {
      path: "/all-flowers/",
      expectedLocation: "/en-lb/beirut/category/hand-bouquets",
    },
  ];

  for (const { path, expectedLocation } of vanityCases) {
    test(`${path} → 301 ${expectedLocation}`, async ({ request }) => {
      const response = await getNoFollow(request, path);
      expect(
        response.status(),
        `${path} must return 301 (vanity archive redirect)`,
      ).toBe(301);
      const location = response.headers()["location"];
      expect(
        location,
        `${path} must redirect to ${expectedLocation}`,
      ).toBe(expectedLocation);
    });
  }
});
