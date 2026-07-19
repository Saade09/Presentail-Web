/**
 * Mobile share URL redirect smoke tests (serve.mjs)
 *
 * The mobile app generates bare `/product/:slug` share links so recipients
 * without the app installed land on the correct storefront product page.
 * serve.mjs intercepts these at the `productRedirectMatch` block (before the
 * trailing-slash redirect) and issues a 301 to the canonical locale-prefixed
 * URL: `/en-lb/beirut/product/:slug`.
 *
 * A regression here would silently break every product share link generated
 * by the mobile app — Googlebot would follow them too, losing any SEO value.
 *
 * Coverage:
 *   Bare path   /product/:slug   → 301 /en-lb/beirut/product/:slug
 *   Trailing /  /product/:slug/  → 301 /en-lb/beirut/product/:slug
 *
 * All tests use Playwright's APIRequestContext with `maxRedirects: 0` so we
 * see the raw 301 response instead of the final landed page.
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
 *     --grep "mobile-share-redirects"
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
// /product/:slug → 301 /en-lb/beirut/product/:slug
// ---------------------------------------------------------------------------

test.describe("301 redirect — mobile app product share links", () => {
  const slugCases: Array<{ path: string; expectedLocation: string }> = [
    {
      path: "/product/red-roses-bouquet",
      expectedLocation: "/en-lb/beirut/product/red-roses-bouquet",
    },
    {
      path: "/product/luxury-hamper",
      expectedLocation: "/en-lb/beirut/product/luxury-hamper",
    },
    {
      path: "/product/birthday-cake",
      expectedLocation: "/en-lb/beirut/product/birthday-cake",
    },
    // Trailing-slash variant — must be caught before the generic trailing-slash
    // redirect strips the slash and loops back as a non-matching bare path.
    {
      path: "/product/red-roses-bouquet/",
      expectedLocation: "/en-lb/beirut/product/red-roses-bouquet",
    },
    {
      path: "/product/luxury-hamper/",
      expectedLocation: "/en-lb/beirut/product/luxury-hamper",
    },
  ];

  for (const { path, expectedLocation } of slugCases) {
    test(`${path} → 301 ${expectedLocation}`, async ({ request }) => {
      const response = await getNoFollow(request, path);
      expect(
        response.status(),
        `${path} must return 301 (mobile share link redirect)`,
      ).toBe(301);
      const location = response.headers()["location"];
      expect(
        location,
        `${path} must redirect to ${expectedLocation}`,
      ).toBe(expectedLocation);
    });
  }
});
