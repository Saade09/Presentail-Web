/**
 * /llms.txt discoverability tests
 *
 * Verifies that:
 *   1. HTML page responses carry a `Link: <…/llms.txt>; rel="describedby"` header
 *      so AI crawlers can auto-discover the machine-readable site index.
 *   2. HTML page responses also carry a `Link: <…/llms-full.txt>; rel="describedby"`
 *      header so AI crawlers can discover the extended variant too.
 *   3. GET /llms.txt returns HTTP 200 with a non-empty body.
 *   4. GET /llms-full.txt returns HTTP 200 with a non-empty body.
 *
 * Checks (1) and (2) run against both the root path ("/") and a locale-prefixed
 * non-root path ("/en-lb/beirut/"). These exercise the two distinct Link-header
 * emission sites in serve.mjs (the static-file branch for "/" and the SPA
 * fallback branch for locale routes), so a regression that only affects
 * non-root HTML pages is caught.
 *
 * These tests use Playwright's built-in APIRequestContext so they exercise the
 * real HTTP layer (serve.mjs) without a browser page, making them fast and
 * immune to JS-runtime issues.
 *
 * IMPORTANT: the asserted behaviour (Link header + /llms.txt routes) exists ONLY
 * in the production Node server (serve.mjs) — the Vite dev server has no such
 * middleware. So this spec lives in ./e2e-serve (run via playwright.serve.config.ts)
 * and MUST be pointed at a built serve.mjs instance via PLAYWRIGHT_BASE_URL. The
 * "Web serve checks" CI workflow builds + starts serve.mjs and runs it there. It
 * is deliberately excluded from the ./e2e suite (Vite dev server) where it would
 * fail the Link-header checks and pass the route checks for the wrong reason.
 */

import { test, expect } from "@playwright/test";

// HTML paths to verify the Link header on. The root path ("/") is served by the
// static-file branch in serve.mjs; the locale-prefixed path is served by the SPA
// fallback branch — both emit the same Link header, so a regression in either
// site is caught.
const HTML_PATHS = ["/", "/en-lb/beirut/"];

test.describe("/llms.txt discoverability", () => {
  for (const htmlPath of HTML_PATHS) {
    test(`HTML page response (${htmlPath}) includes Link header pointing to /llms.txt`, async ({
      request,
    }) => {
      const response = await request.get(htmlPath);
      expect(response.status()).toBe(200);

      const linkHeader = response.headers()["link"] ?? "";
      expect(linkHeader).toMatch(/llms\.txt.*rel="describedby"/);
    });

    test(`HTML page response (${htmlPath}) includes Link header pointing to /llms-full.txt`, async ({
      request,
    }) => {
      const response = await request.get(htmlPath);
      expect(response.status()).toBe(200);

      const linkHeader = response.headers()["link"] ?? "";
      expect(linkHeader).toMatch(/llms-full\.txt.*rel="describedby"/);
    });
  }

  test("GET /llms.txt returns 200 with non-empty body", async ({ request }) => {
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body.trim().length).toBeGreaterThan(0);
  });

  test("GET /llms-full.txt returns 200 with non-empty body", async ({
    request,
  }) => {
    const response = await request.get("/llms-full.txt");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body.trim().length).toBeGreaterThan(0);
  });
});
