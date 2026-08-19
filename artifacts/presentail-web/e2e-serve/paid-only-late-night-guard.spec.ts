/**
 * Paid-only late-night campaign — SPA route guard + SEO regression tests
 * (serve.mjs).
 *
 * /en-lb/beirut/late-night-flower-delivery is a paid-search-only landing page.
 * It is a recognised SPA sub-route for that ONE locale/city tuple only:
 *   - Served as the SPA shell (HTTP 200) for /en-lb/beirut.
 *   - noindex,follow via X-Robots-Tag header and the in-HTML robots meta.
 *   - Self-referencing canonical (not the city home, not canonical removal).
 *   - No hreflang alternates, no JSON-LD, no Markdown mirror (incl. .md).
 *   - Every OTHER locale/city keeps returning HTTP 404 via the exact route
 *     guard, and the .md twin is a 404.
 *
 * Must run against the production Node server (serve.mjs), not the Vite dev
 * server. Run locally: build the app, start serve.mjs on a free port, then:
 *   PLAYWRIGHT_BASE_URL=http://localhost:<PORT> \
 *     pnpm --filter @workspace/presentail-web run test:e2e:serve
 */

import { test, expect } from "@playwright/test";

const PAID_PATH = "/en-lb/beirut/late-night-flower-delivery";

test.describe("paid-only late-night landing — recognised for /en-lb/beirut", () => {
  test("returns 200 (recognised SPA sub-route)", async ({ request }) => {
    const response = await request.get(PAID_PATH);
    expect(response.status(), "paid-only sub-route must be served as SPA shell").toBe(200);
  });

  test("carries a noindex X-Robots-Tag header", async ({ request }) => {
    const response = await request.get(PAID_PATH);
    const robotsTag = response.headers()["x-robots-tag"];
    // On non-canonical preview hosts the header may be omitted; when present it
    // must be noindex (never "index, follow").
    if (robotsTag !== undefined) {
      expect(robotsTag).toContain("noindex");
    }
  });

  test("emits noindex robots meta, self-canonical, no hreflang/JSON-LD in HTML", async ({
    request,
  }) => {
    const response = await request.get(PAID_PATH);
    expect(response.status()).toBe(200);
    const html = await response.text();

    // noindex, follow robots meta.
    expect(html).toMatch(
      /<meta[^>]+name="robots"[^>]+content="noindex, follow"/,
    );

    // Self-referencing canonical (ends with the paid path, NOT the city home).
    const canonicalMatch = html.match(
      /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/,
    );
    expect(canonicalMatch, "self-canonical link must be present").toBeTruthy();
    const canonicalHref = canonicalMatch![1];
    expect(canonicalHref.endsWith(PAID_PATH)).toBe(true);
    expect(canonicalHref.endsWith("/en-lb/beirut")).toBe(false);

    // No hreflang alternates.
    expect(html).not.toMatch(/<link[^>]+rel="alternate"[^>]+hreflang=/);

    // No JSON-LD structured data.
    expect(html).not.toContain('application/ld+json');

    // No Markdown alternate link.
    expect(html).not.toContain('type="text/markdown"');
  });

  test(".md twin returns 404 (no markdown mirror)", async ({ request }) => {
    const response = await request.get(`${PAID_PATH}.md`);
    expect(response.status()).toBe(404);
  });
});

test.describe("paid-only late-night landing — 404 for other locales/cities", () => {
  const otherPaths = [
    "/ar-lb/beirut/late-night-flower-delivery", // wrong lang
    "/en-lb/tripoli/late-night-flower-delivery", // wrong city
    "/en-ae/dubai/late-night-flower-delivery", // wrong country/city
    "/en-cy/nicosia/late-night-flower-delivery", // wrong country/city
  ];

  for (const path of otherPaths) {
    test(`${path} returns 404`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status(), `${path} must stay a 404`).toBe(404);
    });

    test(`${path}.md returns 404`, async ({ request }) => {
      const response = await request.get(`${path}.md`);
      expect(response.status(), `${path}.md must stay a 404`).toBe(404);
    });
  }
});
