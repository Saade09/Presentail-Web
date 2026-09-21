/**
 * Caching headers regression tests (serve.mjs)
 *
 * Verifies that serve.mjs sends the correct Cache-Control headers for the
 * four resource categories defined in the performance hardening spec:
 *
 *   1. Hashed JS assets (/assets/*.js) → public, max-age=31536000, immutable
 *      (browser and CDN can cache forever; content hash guarantees freshness)
 *
 *   2. Anonymous HTML pages (/en-lb/beirut/) → private, no-store
 *      (the autoscale origin establishes affinity, so HTML is not shared)
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
// 2. Anonymous HTML pages remain private until a cookie-free origin exists
// ---------------------------------------------------------------------------

test.describe("Cache-Control — anonymous HTML pages (/en-lb/beirut/)", () => {
  test("city homepage is private and not shared", async ({
    request,
  }) => {
    const response = await request.get("/en-lb/beirut/");
    expect(response.status()).toBe(200);

    const cc = response.headers()["cache-control"];
    expect(cc, "Cache-Control header must be present on public HTML pages").toBeDefined();

    expect(cc).toContain("private");
    expect(cc).toContain("no-store");
    expect(response.headers()["cdn-cache-control"]).toBeUndefined();
    expect(response.headers()["surrogate-control"]).toBeUndefined();
    expect(response.headers()["server-timing"]).toMatch(/route;dur=.*seo;dur=.*total;dur=/);
  });

  test("root homepage (/) is also private", async ({
    request,
  }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);

    const cc = response.headers()["cache-control"];
    expect(cc).toBeDefined();
    expect(cc).toContain("private");
    expect(cc).toContain("no-store");
  });
});

test.describe("Compression — bare shared-link HTML routes", () => {
  test("legacy category HTML is compressed and varies by Accept-Encoding", async ({
    request,
  }) => {
    const response = await request.get("/category/balloons", {
      headers: { "Accept-Encoding": "gzip" },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-encoding"]).toBe("gzip");
    expect(response.headers()["vary"]).toContain("Accept-Encoding");
    expect(response.headers()["server-timing"]).toContain("compression;dur=");
  });

  test("honours q=0 and chooses the highest-quality supported encoding", async ({
    request,
  }) => {
    const gzip = await request.get("/category/balloons", {
      headers: { "Accept-Encoding": "br;q=0, gzip;q=0.8" },
    });
    expect(gzip.headers()["content-encoding"]).toBe("gzip");

    const br = await request.get("/category/balloons", {
      headers: { "Accept-Encoding": "gzip;q=0.2, br;q=0.9" },
    });
    expect(br.headers()["content-encoding"]).toBe("br");

    const identity = await request.get("/category/balloons", {
      headers: { "Accept-Encoding": "br;q=0, gzip;q=0, identity;q=1" },
    });
    expect(identity.headers()["content-encoding"]).toBeUndefined();

    const refused = await request.get("/category/balloons", {
      headers: { "Accept-Encoding": "br;q=0, gzip;q=0, identity;q=0" },
    });
    expect(refused.status()).toBe(406);
    expect(refused.headers()["cache-control"]).toContain("no-store");

    const wildcardRefused = await request.get("/category/balloons", {
      headers: { "Accept-Encoding": "*;q=0" },
    });
    expect(wildcardRefused.status()).toBe(406);
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

  test("faceted noindex HTML is private and has no shared-cache directives", async ({
    request,
  }) => {
    const response = await request.get(
      "/en-lb/beirut/category/flowers?sort=price-asc",
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["cdn-cache-control"]).toBeUndefined();
    expect(response.headers()["surrogate-control"]).toBeUndefined();
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
