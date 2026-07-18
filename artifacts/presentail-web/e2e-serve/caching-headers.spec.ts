/**
 * Caching headers regression tests (serve.mjs)
 *
 * Verifies that serve.mjs sends the correct Cache-Control headers for the
 * four resource categories defined in the performance hardening spec:
 *
 *   1. Hashed JS assets (/assets/*.js) → public, max-age=31536000, immutable
 *      (browser and CDN can cache forever; content hash guarantees freshness)
 *
 *   2. Public HTML pages (/en-lb/beirut/) → public, s-maxage=300, ...
 *      (CDN caches for 5 minutes; browsers validate on every request)
 *
 *   3. Transactional HTML pages (/en-lb/beirut/checkout) → no-store
 *      (never cache payment/order state in any layer)
 *
 *   4. robots.txt → public, max-age=3600
 *      (no content hash in filename; short TTL so crawler rules stay fresh)
 *
 *   5. sitemap.xml → public, max-age=3600
 *      (dynamically generated; cache for 1 hour at the CDN layer)
 *
 * Must run against the production Node server (serve.mjs), not the Vite dev
 * server. The "Web serve checks" workflow builds the app and points
 * PLAYWRIGHT_BASE_URL at the serve.mjs instance before executing this suite.
 *
 * Run locally: build the app, start serve.mjs on a free port, then:
 *   PLAYWRIGHT_BASE_URL=http://localhost:<PORT> pnpm --filter @workspace/presentail-web run test:e2e:serve
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helper: extract a hashed JS asset path from the homepage HTML
// ---------------------------------------------------------------------------

async function resolveHashedJsAsset(request: ReturnType<typeof import("@playwright/test")["request"]["newContext"]> extends Promise<infer R> ? R : never): Promise<string | null> {
  const response = await request.get("/");
  if (!response.ok()) return null;
  const html = await response.text();
  // Find a modulepreload or script src pointing at a hashed JS asset
  const m =
    html.match(/href="(\/assets\/[^"]+\.js[^"]*)"/i) ??
    html.match(/src="(\/assets\/[^"]+\.js[^"]*)"/i);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// 1. Hashed JS assets: public, max-age=31536000, immutable
// ---------------------------------------------------------------------------

test.describe("Cache-Control — hashed JS assets (/assets/*.js)", () => {
  test("hashed JS asset has max-age=31536000 and immutable", async ({
    request,
  }) => {
    const assetPath = await resolveHashedJsAsset(request);
    expect(
      assetPath,
      "Could not find a hashed JS asset href in homepage HTML — check build output",
    ).not.toBeNull();

    const response = await request.get(assetPath!);
    expect(response.status()).toBe(200);

    const cc = response.headers()["cache-control"];
    expect(cc, "Cache-Control header must be present on JS assets").toBeDefined();
    expect(cc).toContain("max-age=31536000");
    expect(cc).toContain("immutable");
    expect(cc).toContain("public");
  });
});

// ---------------------------------------------------------------------------
// 2. Public HTML pages: s-maxage ≥ 60 (CDN cache)
// ---------------------------------------------------------------------------

test.describe("Cache-Control — public HTML pages (/en-lb/beirut/)", () => {
  test("city homepage has s-maxage ≥ 60 in Cache-Control", async ({
    request,
  }) => {
    const response = await request.get("/en-lb/beirut/");
    expect(response.status()).toBe(200);

    const cc = response.headers()["cache-control"];
    expect(cc, "Cache-Control header must be present on public HTML pages").toBeDefined();

    // Extract s-maxage value
    const sMaxAgeMatch = cc.match(/s-maxage\s*=\s*(\d+)/i);
    expect(
      sMaxAgeMatch,
      `Cache-Control '${cc}' must contain s-maxage for CDN caching`,
    ).not.toBeNull();
    const sMaxAge = parseInt(sMaxAgeMatch![1], 10);
    expect(
      sMaxAge,
      `s-maxage=${sMaxAge} must be ≥ 60 (at least 1 minute CDN cache)`,
    ).toBeGreaterThanOrEqual(60);
  });

  test("root homepage (/) also has s-maxage in Cache-Control", async ({
    request,
  }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);

    const cc = response.headers()["cache-control"];
    expect(cc).toBeDefined();
    const sMaxAgeMatch = cc.match(/s-maxage\s*=\s*(\d+)/i);
    expect(sMaxAgeMatch, `Cache-Control '${cc}' must contain s-maxage`).not.toBeNull();
    const sMaxAge = parseInt(sMaxAgeMatch![1], 10);
    expect(sMaxAge).toBeGreaterThanOrEqual(60);
  });
});

// ---------------------------------------------------------------------------
// 3. Transactional HTML pages: no-store (must not be cached)
// ---------------------------------------------------------------------------

test.describe("Cache-Control — transactional HTML pages (/checkout)", () => {
  test("checkout page has no-store Cache-Control", async ({ request }) => {
    const response = await request.get("/en-lb/beirut/checkout");
    // May be 200 (SPA shell) or a redirect — either way check cache header
    const cc = response.headers()["cache-control"];
    expect(cc, "Cache-Control must be present on transactional pages").toBeDefined();
    expect(
      cc,
      "Transactional pages (checkout) must have no-store to prevent caching of payment state",
    ).toContain("no-store");
  });
});

// ---------------------------------------------------------------------------
// 4. robots.txt: public, max-age=3600
// ---------------------------------------------------------------------------

test.describe("Cache-Control — robots.txt", () => {
  test("robots.txt has max-age=3600 Cache-Control", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);

    const cc = response.headers()["cache-control"];
    expect(cc, "Cache-Control must be present on robots.txt").toBeDefined();
    expect(cc).toContain("max-age=3600");
    expect(cc).toContain("public");
    // robots.txt must NOT have immutable — it has no content hash in its filename
    expect(
      cc,
      "robots.txt must not use immutable caching (no content hash in filename)",
    ).not.toContain("immutable");
  });
});

// ---------------------------------------------------------------------------
// 5. sitemap.xml: public, max-age=3600
// ---------------------------------------------------------------------------

test.describe("Cache-Control — sitemap.xml", () => {
  test("sitemap.xml has max-age=3600 Cache-Control", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);

    const cc = response.headers()["cache-control"];
    expect(cc, "Cache-Control must be present on sitemap.xml").toBeDefined();
    expect(cc).toContain("max-age=3600");
    expect(cc).toContain("public");
  });
});
