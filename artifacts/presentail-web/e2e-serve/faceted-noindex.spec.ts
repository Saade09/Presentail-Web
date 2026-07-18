/**
 * Faceted-navigation noindex regression tests (serve.mjs)
 *
 * Filter/utility parameters (sort, currency, delivery, availability, price_min,
 * price_max, page, ref, from, scroll) never produce distinct landing pages.
 * serve.mjs must emit BOTH:
 *  - `x-robots-tag: noindex, follow` header, AND
 *  - `<meta name="robots" content="noindex, follow">` in the HTML body
 * on every response whose query string contains one of these parameters (unless
 * the path is a curated filter landing page — none are defined today).
 *
 * This is a belt-and-suspenders guard alongside the robots.txt Disallow rules
 * verified in scripts/src/robotsTxt.test.ts.
 *
 * Coverage:
 *  1. Category URL with sort param  → x-robots-tag header + meta robots noindex
 *  2. Category URL with no params   → no noindex (baseline)
 *  3. Shop URL with currency param  → x-robots-tag header noindex
 *  4. URL with page param           → x-robots-tag header noindex
 *  5. URL with delivery param       → x-robots-tag header noindex
 *  6. HTML body has <meta name="robots" content="noindex, follow"> for sort URL
 *  7. HTML canonical href on filter URL points at clean path (no filter params)
 *
 * Must run against the production Node server (serve.mjs), not the Vite dev
 * server. The "Web serve checks" workflow builds the app and points
 * PLAYWRIGHT_BASE_URL at the serve.mjs instance before executing this suite.
 *
 * Run locally: build the app, start serve.mjs on a free port, then:
 *   PLAYWRIGHT_BASE_URL=http://localhost:<PORT> pnpm --filter @workspace/presentail-web run test:e2e:serve
 */

import { test, expect } from "@playwright/test";

const NOINDEX_FOLLOW = "noindex, follow";

// ---------------------------------------------------------------------------
// 1. sort parameter → x-robots-tag + meta robots noindex
// ---------------------------------------------------------------------------

test.describe("x-robots-tag: noindex, follow — sort parameter", () => {
  test("category URL with sort=price-asc returns noindex, follow", async ({
    request,
  }) => {
    const response = await request.get(
      "/en-lb/beirut/category/flowers?sort=price-asc",
    );
    expect(
      response.status(),
      "filter URL must return 200 (not a redirect)",
    ).toBe(200);
    const robotsTag = response.headers()["x-robots-tag"];
    expect(
      robotsTag,
      "x-robots-tag header must be present on a filter-parameterised response",
    ).toBeDefined();
    expect(
      robotsTag,
      "x-robots-tag must be 'noindex, follow' for a sort-parameterised URL",
    ).toBe(NOINDEX_FOLLOW);
  });
});

// ---------------------------------------------------------------------------
// 2. Baseline — clean URL must NOT receive noindex
// ---------------------------------------------------------------------------

test.describe("x-robots-tag — clean category URL (baseline)", () => {
  test("clean category URL does not receive noindex", async ({ request }) => {
    const response = await request.get("/en-lb/beirut/category/flowers");
    expect(response.status()).toBe(200);
    const robotsTag = response.headers()["x-robots-tag"];
    // On Replit preview domains the header may be omitted entirely.
    // On the canonical production host it should be "index, follow".
    // Either way it must NOT be "noindex" or "noindex, follow".
    if (robotsTag !== undefined) {
      expect(
        robotsTag,
        "clean public URL must not receive a noindex x-robots-tag",
      ).not.toContain("noindex");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. currency parameter → x-robots-tag noindex
// ---------------------------------------------------------------------------

test.describe("x-robots-tag: noindex, follow — currency parameter", () => {
  test("shop URL with currency=usd returns noindex, follow", async ({
    request,
  }) => {
    const response = await request.get("/en-lb/beirut/shop?currency=usd");
    expect(response.status()).toBe(200);
    const robotsTag = response.headers()["x-robots-tag"];
    expect(
      robotsTag,
      "x-robots-tag must be present on a currency-parameterised response",
    ).toBeDefined();
    expect(robotsTag).toBe(NOINDEX_FOLLOW);
  });
});

// ---------------------------------------------------------------------------
// 4. page parameter → x-robots-tag noindex
// ---------------------------------------------------------------------------

test.describe("x-robots-tag: noindex, follow — page parameter", () => {
  test("category URL with page=2 returns noindex, follow", async ({
    request,
  }) => {
    const response = await request.get(
      "/en-lb/beirut/category/flowers?page=2",
    );
    expect(response.status()).toBe(200);
    const robotsTag = response.headers()["x-robots-tag"];
    expect(robotsTag).toBeDefined();
    expect(robotsTag).toBe(NOINDEX_FOLLOW);
  });
});

// ---------------------------------------------------------------------------
// 5. delivery parameter → x-robots-tag noindex
// ---------------------------------------------------------------------------

test.describe("x-robots-tag: noindex, follow — delivery parameter", () => {
  test("shop URL with delivery=today returns noindex, follow", async ({
    request,
  }) => {
    const response = await request.get("/en-lb/beirut/shop?delivery=today");
    expect(response.status()).toBe(200);
    const robotsTag = response.headers()["x-robots-tag"];
    expect(robotsTag).toBeDefined();
    expect(robotsTag).toBe(NOINDEX_FOLLOW);
  });
});

// ---------------------------------------------------------------------------
// 6. HTML body must include <meta name="robots" content="noindex, follow">
// ---------------------------------------------------------------------------

test.describe("HTML meta robots — filter params produce noindex meta in body", () => {
  test("sort-parameterised URL has noindex meta tag in HTML body", async ({
    request,
  }) => {
    const response = await request.get(
      "/en-lb/beirut/shop?sort=price-asc",
    );
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(
      body,
      'HTML body must contain <meta name="robots" content="noindex, follow" /> ' +
        "for a sort-parameterised URL",
    ).toContain(`<meta name="robots" content="noindex, follow"`);
  });

  test("clean shop URL does NOT have noindex meta tag in HTML body", async ({
    request,
  }) => {
    const response = await request.get("/en-lb/beirut/shop");
    expect(response.status()).toBe(200);
    const body = await response.text();
    // Non-private public pages must not contain a noindex meta robots tag
    // (private/transactional pages like /cart DO contain one, but /shop is public).
    expect(
      body,
      "clean public shop URL must not contain a noindex meta robots tag",
    ).not.toContain(`<meta name="robots" content="noindex`);
  });
});

// ---------------------------------------------------------------------------
// 7. Canonical href strips filter params from the HTML body
// ---------------------------------------------------------------------------

test.describe("HTML canonical href — filter params are stripped from canonical", () => {
  test("sort-parameterised category URL has clean canonical (no sort param)", async ({
    request,
  }) => {
    const response = await request.get(
      "/en-lb/beirut/category/flowers?sort=price-asc",
    );
    expect(response.status()).toBe(200);
    const body = await response.text();
    // Extract the canonical href from the HTML body.
    const match = body.match(/<link rel="canonical" href="([^"]+)"/);
    expect(
      match,
      "HTML body must contain a <link rel=\"canonical\"> tag",
    ).toBeTruthy();
    const canonicalHref = match![1];
    expect(
      canonicalHref,
      "canonical href must not include the sort query param",
    ).not.toContain("sort=");
    expect(
      canonicalHref,
      "canonical href must include the clean category path",
    ).toContain("/category/flowers");
  });
});
