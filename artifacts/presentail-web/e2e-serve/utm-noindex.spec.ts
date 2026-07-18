/**
 * UTM duplicate-content — x-robots-tag: noindex regression tests (serve.mjs)
 *
 * Marketing UTM links (utm_source, utm_campaign, etc.) are widely distributed
 * in emails and social ads. If a crawler follows a shared UTM link it would
 * see a 200 response identical to the canonical URL — a duplicate-content
 * risk that can dilute PageRank and confuse Google Search Console.
 *
 * serve.mjs emits `x-robots-tag: noindex` on every HTML response whose query
 * string contains a UTM or Google click-ID parameter (gclid / gbraid / wbraid).
 * This is a belt-and-suspenders guard alongside the robots.txt Disallow rules
 * verified in e2e/utm-noindex.spec.ts.
 *
 * Coverage:
 *   1. UTM page URL (/en-lb/beirut?utm_source=test) → x-robots-tag: noindex.
 *   2. Multi-param UTM product URL → x-robots-tag: noindex.
 *   3. gclid-only URL → x-robots-tag: noindex.
 *   4. Clean city homepage (no UTM) → x-robots-tag is NOT noindex (baseline).
 *   5. Clean product URL (no UTM) → x-robots-tag is NOT noindex (baseline).
 *
 * Must run against the production Node server (serve.mjs), not the Vite dev
 * server. The "Web serve checks" workflow builds the app and points
 * PLAYWRIGHT_BASE_URL at the serve.mjs instance before executing this suite.
 * Run locally: build the app, start serve.mjs on a free port, then:
 *   PLAYWRIGHT_BASE_URL=http://localhost:<PORT> pnpm --filter @workspace/presentail-web run test:e2e:serve
 *
 * All tests use Playwright's APIRequestContext (`request.get()`) — fast HTTP
 * checks against raw responses, exactly what Googlebot receives.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// 1 & 2. x-robots-tag: noindex on UTM-parameterised pages
// ---------------------------------------------------------------------------

test.describe("x-robots-tag: noindex — utm_source parameter", () => {
  test("city homepage with utm_source returns noindex", async ({ request }) => {
    const response = await request.get("/en-lb/beirut?utm_source=test");
    expect(response.status(), "UTM URL must return 200 (not a redirect)").toBe(200);
    const robotsTag = response.headers()["x-robots-tag"];
    expect(
      robotsTag,
      "x-robots-tag header must be present on a UTM-parameterised response",
    ).toBeDefined();
    expect(
      robotsTag,
      "x-robots-tag must be 'noindex' for a UTM-parameterised URL",
    ).toBe("noindex");
  });

  test("product URL with utm_campaign + utm_source returns noindex", async ({
    request,
  }) => {
    const response = await request.get(
      "/en-lb/beirut/product/rose-bouquet?utm_campaign=valentines&utm_source=email",
    );
    expect(response.status()).toBe(200);
    const robotsTag = response.headers()["x-robots-tag"];
    expect(
      robotsTag,
      "x-robots-tag header must be present when any UTM param is present",
    ).toBeDefined();
    expect(robotsTag).toBe("noindex");
  });
});

// ---------------------------------------------------------------------------
// 3. x-robots-tag: noindex on Google click-ID URLs
// ---------------------------------------------------------------------------

test.describe("x-robots-tag: noindex — gclid parameter", () => {
  test("city homepage with gclid returns noindex", async ({ request }) => {
    const response = await request.get("/en-lb/beirut?gclid=abc123");
    expect(response.status(), "gclid URL must return 200 (not a redirect)").toBe(200);
    const robotsTag = response.headers()["x-robots-tag"];
    expect(
      robotsTag,
      "x-robots-tag header must be present on a gclid-parameterised response",
    ).toBeDefined();
    expect(
      robotsTag,
      "x-robots-tag must be 'noindex' for a gclid-parameterised URL",
    ).toBe("noindex");
  });
});

// ---------------------------------------------------------------------------
// 4 & 5. Baseline — clean public URLs must NOT receive noindex
// ---------------------------------------------------------------------------

test.describe("x-robots-tag — clean public URL (baseline)", () => {
  test("clean city homepage does not receive noindex", async ({ request }) => {
    const response = await request.get("/en-lb/beirut");
    expect(response.status()).toBe(200);
    const robotsTag = response.headers()["x-robots-tag"];
    // On Replit preview domains the header may be omitted. On production
    // domains it should be "index, follow". Either way must NOT be "noindex".
    if (robotsTag !== undefined) {
      expect(
        robotsTag,
        "clean public URL must not receive a noindex x-robots-tag",
      ).not.toBe("noindex");
    }
  });

  test("clean product URL does not receive noindex", async ({ request }) => {
    const response = await request.get("/en-lb/beirut/product/rose-bouquet");
    expect(response.status()).toBe(200);
    const robotsTag = response.headers()["x-robots-tag"];
    if (robotsTag !== undefined) {
      expect(
        robotsTag,
        "clean product URL must not receive a noindex x-robots-tag",
      ).not.toBe("noindex");
    }
  });
});
