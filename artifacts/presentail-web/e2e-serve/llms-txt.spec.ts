/**
 * /llms.txt and /agents.md Agent Ready scan
 *
 * Verifies that:
 *   1. HTML page responses carry a `Link: <…/llms.txt>; rel="describedby"` header
 *      so AI crawlers can auto-discover the machine-readable site index.
 *   2. HTML page responses carry a `Link: <…/llms-full.txt>; rel="describedby"` header.
 *   3. HTML page responses carry a `Link: <…/sitemap.md>; rel="describedby"` header.
 *   4. HTML page responses carry a `Link: <…/agents.md>; rel="describedby"` header.
 *   5. GET /llms.txt returns HTTP 200 with Content-Type: text/plain and a non-empty body.
 *   6. GET /llms.txt body contains the summary paragraph before the ## Pages section.
 *   7. GET /llms-full.txt returns HTTP 200 with Content-Type: text/plain and a non-empty body.
 *   8. GET /sitemap.md returns HTTP 200 with Content-Type: text/plain and a body containing "# Presentail".
 *   9. GET /agents.md returns HTTP 200 with Content-Type: text/plain and a non-empty body.
 *
 * Checks (1)–(4) run against both the root path ("/") and a locale-prefixed
 * non-root path ("/en-lb/beirut/"). These exercise the two distinct Link-header
 * emission sites in serve.mjs (the static-file branch for "/" and the SPA
 * fallback branch for locale routes), so a regression that only affects
 * non-root HTML pages is caught.
 *
 * These tests use Playwright's built-in APIRequestContext so they exercise the
 * real HTTP layer (serve.mjs) without a browser page, making them fast and
 * immune to JS-runtime issues.
 *
 * IMPORTANT: the asserted behaviour (Link header + /llms.txt + /agents.md routes)
 * exists ONLY in the production Node server (serve.mjs) — the Vite dev server
 * has no such middleware. So this spec lives in ./e2e-serve (run via
 * playwright.serve.config.ts) and MUST be pointed at a built serve.mjs instance
 * via PLAYWRIGHT_BASE_URL. The "Web serve checks" CI workflow builds + starts
 * serve.mjs and runs it there. It is deliberately excluded from the ./e2e suite
 * (Vite dev server) where it would fail the Link-header checks and pass the
 * route checks for the wrong reason.
 */

import { test, expect } from "@playwright/test";

// HTML paths to verify the Link header on. The root path ("/") is served by the
// static-file branch in serve.mjs; the locale-prefixed path is served by the SPA
// fallback branch — both emit the same Link header, so a regression in either
// site is caught.
const HTML_PATHS = ["/", "/en-lb/beirut/"];

// First sentence of LLMS_INTRO in llms-content.mjs — assert this appears in
// the /llms.txt body before the ## Pages section so a future edit that
// accidentally deletes the summary paragraph is caught in CI.
const LLMS_INTRO_FRAGMENT =
  "Presentail is a luxury flower and gift delivery platform serving Lebanon";

test.describe("/llms.txt and /agents.md — Agent Ready scan", () => {
  // -------------------------------------------------------------------------
  // Link header checks on HTML page responses
  // -------------------------------------------------------------------------
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

    test(`HTML page response (${htmlPath}) includes Link header pointing to /sitemap.md`, async ({
      request,
    }) => {
      const response = await request.get(htmlPath);
      expect(response.status()).toBe(200);

      const linkHeader = response.headers()["link"] ?? "";
      expect(linkHeader).toMatch(/sitemap\.md.*rel="describedby"/);
    });

    test(`HTML page response (${htmlPath}) includes Link header pointing to /agents.md`, async ({
      request,
    }) => {
      const response = await request.get(htmlPath);
      expect(response.status()).toBe(200);

      const linkHeader = response.headers()["link"] ?? "";
      expect(linkHeader).toMatch(/agents\.md.*rel="describedby"/);
    });
  }

  // -------------------------------------------------------------------------
  // /llms.txt route checks
  // -------------------------------------------------------------------------
  test("GET /llms.txt returns 200 with Content-Type: text/plain", async ({ request }) => {
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toContain("text/plain");
  });

  test("GET /llms.txt returns a non-empty body", async ({ request }) => {
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body.trim().length).toBeGreaterThan(0);
  });

  test("GET /llms.txt body contains the summary paragraph before ## Pages", async ({
    request,
  }) => {
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(200);

    const body = await response.text();
    const pagesIdx = body.indexOf("## Pages");
    // The file must contain both the summary fragment and a ## Pages section,
    // and the summary must appear before ## Pages.
    expect(pagesIdx).toBeGreaterThan(0);
    const beforePages = body.slice(0, pagesIdx);
    expect(beforePages).toContain(LLMS_INTRO_FRAGMENT);
  });

  // -------------------------------------------------------------------------
  // /llms-full.txt route checks
  // -------------------------------------------------------------------------
  test("GET /llms-full.txt returns 200 with Content-Type: text/plain", async ({
    request,
  }) => {
    const response = await request.get("/llms-full.txt");
    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toContain("text/plain");
  });

  test("GET /llms-full.txt returns a non-empty body", async ({
    request,
  }) => {
    const response = await request.get("/llms-full.txt");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body.trim().length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // /sitemap.md route checks
  // -------------------------------------------------------------------------
  test("GET /sitemap.md returns 200 with Content-Type: text/plain", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.md");
    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toContain("text/plain");
  });

  test("GET /sitemap.md body contains a recognisable heading", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.md");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("# Presentail");
  });

  // -------------------------------------------------------------------------
  // /agents.md route checks
  // -------------------------------------------------------------------------
  test("GET /agents.md returns 200 with Content-Type: text/plain", async ({
    request,
  }) => {
    const response = await request.get("/agents.md");
    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toContain("text/plain");
  });

  test("GET /agents.md returns a non-empty body", async ({ request }) => {
    const response = await request.get("/agents.md");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body.trim().length).toBeGreaterThan(0);
  });
});
