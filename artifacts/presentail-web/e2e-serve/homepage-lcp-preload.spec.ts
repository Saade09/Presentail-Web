/**
 * Homepage LCP preload tag — cold-start regression test (serve.mjs only)
 *
 * serve.mjs calls refreshFirstBannerImageUrl() immediately at startup so that
 * the very first incoming request already carries a warmed firstBannerImageUrl
 * and emits a <link rel="preload" as="image"> for the hero banner — the LCP
 * element on the homepage.
 *
 * This spec uses Playwright's APIRequestContext (no browser) to fetch the raw
 * homepage HTML and asserts the preload tag shape without any pre-warm request.
 * By the time the fixture server and serve.mjs are both up (ensured by the
 * run-serve-e2e.sh wait-on steps), serve.mjs has already completed its startup
 * fetch against the fixture server's /api/homepage/banners endpoint, so
 * firstBannerImageUrl is set and the preload tag must be present on the first
 * HTTP response.
 *
 * The fixture server (seo-entity-fixture-server.mjs) handles
 * GET /api/homepage/banners and returns a single OS storage banner URL
 * (hostname os.presentail.com, path /api/storage/…).  That triggers the
 * responsive preload path in seo-inject.mjs, which builds the tag with:
 *   - href   = /api/img/proxy?url=<encoded>&w=800&f=webp
 *   - imagesrcset = …w=400…, …w=800…, …w=1200…
 *   - imagesizes  = "(max-width: 1280px) 100vw, 1280px"
 *
 * Assertions:
 *   1. <link rel="preload" as="image"> is present in the initial HTML
 *   2. href points at /api/img/proxy with w=800 and f=webp
 *   3. imagesrcset contains 400w, 800w, and 1200w entries
 *   4. imagesizes is present
 *
 * If the startup fetch is removed or firstBannerImageUrl is no longer
 * threaded through to injectSeoTagsAsync, assertion 1 fails.
 * If the href or srcset builder regresses, assertions 2–4 fail.
 */

import { test, expect } from "@playwright/test";

function findPreloadTag(html: string): string | null {
  const m = html.match(/<link\s[^>]*rel="preload"[^>]*as="image"[^>]*>/i);
  return m ? m[0] : null;
}

function attrValue(tag: string, attrName: string): string | null {
  const re = new RegExp(`${attrName}="([^"]*)"`, "i");
  const m = tag.match(re);
  return m ? m[1] : null;
}

test.describe("Homepage LCP preload tag (cold-start, serve.mjs)", () => {
  test("root homepage has a <link rel=preload as=image> in the initial HTML", async ({
    request,
  }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('<link');
    const tag = findPreloadTag(html);
    expect(
      tag,
      `Expected a <link rel="preload" as="image"> in the homepage HTML. ` +
        `This means serve.mjs did not warm firstBannerImageUrl before the first request.`,
    ).not.toBeNull();
  });

  test("preload href points to /api/img/proxy with w=800 and f=webp", async ({
    request,
  }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const html = await response.text();
    const tag = findPreloadTag(html);
    expect(tag).not.toBeNull();

    const href = attrValue(tag!, "href");
    expect(href, "preload href must not be null").not.toBeNull();
    expect(href).toContain("/api/img/proxy?");
    expect(href).toContain("w=800");
    expect(href).toContain("f=webp");
  });

  test("preload tag has imagesrcset with 400w, 800w, and 1200w entries", async ({
    request,
  }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const html = await response.text();
    const tag = findPreloadTag(html);
    expect(tag).not.toBeNull();

    const srcset = attrValue(tag!, "imagesrcset");
    expect(srcset, "imagesrcset attribute must be present").not.toBeNull();
    expect(srcset).toContain("w=400");
    expect(srcset).toContain("w=800");
    expect(srcset).toContain("w=1200");
  });

  test("preload tag has an imagesizes attribute", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const html = await response.text();
    const tag = findPreloadTag(html);
    expect(tag).not.toBeNull();

    const sizes = attrValue(tag!, "imagesizes");
    expect(sizes, "imagesizes attribute must be present").not.toBeNull();
    expect(sizes!.length).toBeGreaterThan(0);
  });

  test("locale-prefixed homepage (/en-lb/beirut) also has the preload tag", async ({
    request,
  }) => {
    const response = await request.get("/en-lb/beirut");
    expect(response.status()).toBe(200);
    const html = await response.text();
    const tag = findPreloadTag(html);
    expect(
      tag,
      "The locale-prefixed homepage should also get the LCP preload tag.",
    ).not.toBeNull();

    const href = attrValue(tag!, "href");
    expect(href).toContain("/api/img/proxy?");
    expect(href).toContain("w=800");
  });

  test("a non-homepage route (/en-lb/beirut/product/rose-bouquet) does NOT have the preload tag", async ({
    request,
  }) => {
    const response = await request.get(
      "/en-lb/beirut/product/rose-bouquet",
    );
    expect(response.status()).toBe(200);
    const html = await response.text();
    const tag = findPreloadTag(html);
    expect(
      tag,
      "A product page must NOT emit the homepage LCP preload tag.",
    ).toBeNull();
  });
});
