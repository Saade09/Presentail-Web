/**
 * /llms.txt discoverability tests
 *
 * Verifies that:
 *   1. HTML page responses carry a `Link: <…/llms.txt>; rel="describedby"` header
 *      so AI crawlers can auto-discover the machine-readable site index.
 *   2. GET /llms.txt returns HTTP 200 with a non-empty body.
 *
 * These tests use Playwright's built-in APIRequestContext so they exercise the
 * real HTTP layer (serve.mjs) without a browser page, making them fast and
 * immune to JS-runtime issues.
 */

import { test, expect } from "@playwright/test";

test.describe("/llms.txt discoverability", () => {
  test("HTML page response includes Link header pointing to /llms.txt", async ({
    request,
  }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);

    const linkHeader = response.headers()["link"] ?? "";
    expect(linkHeader).toMatch(/llms\.txt.*rel="describedby"/);
  });

  test("GET /llms.txt returns 200 with non-empty body", async ({ request }) => {
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body.trim().length).toBeGreaterThan(0);
  });
});
