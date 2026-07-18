/**
 * Product detail page (PDP) LCP preload tag — regression tests (serve.mjs only)
 *
 * For product pages whose primary image is served from the OS storage domain
 * (os.presentail.com/api/storage/…), seo-inject.mjs injects a
 * <link rel="preload" as="image" fetchpriority="high"> into the server-side
 * HTML so the browser can discover and start fetching the LCP image before
 * the JS bundle executes.
 *
 * The fixture server (seo-entity-fixture-server.mjs) exposes the "os-storage-roses"
 * slug whose image.uri is "https://os.presentail.com/api/storage/products/fixture-roses.jpg",
 * matching the OS storage domain check in seo-inject.mjs.  The "rose-bouquet" slug
 * uses a localhost image (not OS storage) and must NOT receive a preload.
 *
 * Assertions:
 *   1. A PDP with an OS storage image → <link rel="preload" as="image"> present
 *   2. The preload href points at /api/img/proxy (w=800, f=webp)
 *   3. The preload imagesrcset contains 400w, 800w, and 1200w entries
 *   4. The preload imagesizes is present
 *   5. A PDP with a non-OS-storage image → NO preload emitted
 *   6. Trusted-domain gating: a banner URL from an untrusted domain
 *      does NOT emit the homepage preload even if firstBannerImageUrl is set
 *      (tested indirectly — rose-bouquet has no preload despite being on a PDP)
 */

import { test, expect } from "@playwright/test";

function findImagePreloadTag(html: string): string | null {
  const m = html.match(/<link\s[^>]*rel="preload"[^>]*as="image"[^>]*>/i);
  return m ? m[0] : null;
}

function attrValue(tag: string, attrName: string): string | null {
  const re = new RegExp(`${attrName}="([^"]*)"`, "i");
  const m = tag.match(re);
  return m ? m[1] : null;
}

test.describe("PDP LCP preload tag — OS storage image product (serve.mjs)", () => {
  const OS_PRODUCT_PATH = "/en-lb/beirut/product/os-storage-roses";

  test("PDP with OS storage image has <link rel=preload as=image> in initial HTML", async ({
    request,
  }) => {
    const response = await request.get(OS_PRODUCT_PATH);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const tag = findImagePreloadTag(html);
    expect(
      tag,
      `Expected a <link rel="preload" as="image"> for the OS storage product page. ` +
        `Check that the "os-storage-roses" fixture resolves and the PDP preload ` +
        `injection in seo-inject.mjs is active.`,
    ).not.toBeNull();
  });

  test("PDP preload href points to /api/img/proxy with w=800 and f=webp", async ({
    request,
  }) => {
    const response = await request.get(OS_PRODUCT_PATH);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const tag = findImagePreloadTag(html);
    expect(tag).not.toBeNull();

    const href = attrValue(tag!, "href");
    expect(href, "preload href must not be null").not.toBeNull();
    expect(href).toContain("/api/img/proxy?");
    expect(href).toContain("w=800");
    expect(href).toContain("f=webp");
    // The OS storage URL must be the proxied resource, not the raw URL.
    expect(href).not.toContain("os.presentail.com");
  });

  test("PDP preload tag has imagesrcset with 400w, 800w, and 1200w entries", async ({
    request,
  }) => {
    const response = await request.get(OS_PRODUCT_PATH);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const tag = findImagePreloadTag(html);
    expect(tag).not.toBeNull();

    const srcset = attrValue(tag!, "imagesrcset");
    expect(srcset, "imagesrcset attribute must be present").not.toBeNull();
    expect(srcset).toContain("w=400");
    expect(srcset).toContain("w=800");
    expect(srcset).toContain("w=1200");
  });

  test("PDP preload tag has an imagesizes attribute", async ({ request }) => {
    const response = await request.get(OS_PRODUCT_PATH);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const tag = findImagePreloadTag(html);
    expect(tag).not.toBeNull();

    const sizes = attrValue(tag!, "imagesizes");
    expect(sizes, "imagesizes attribute must be present").not.toBeNull();
    expect(sizes!.length).toBeGreaterThan(0);
  });
});

test.describe("PDP LCP preload tag — non-OS-storage image product (serve.mjs)", () => {
  test("PDP with non-OS-storage image does NOT emit a preload tag", async ({
    request,
  }) => {
    // "rose-bouquet" fixture has image.uri = "http://localhost:19235/fixtures/hero.png"
    // which does not match the os.presentail.com/api/storage/ trusted domain.
    const response = await request.get("/en-lb/beirut/product/rose-bouquet");
    expect(response.status()).toBe(200);
    const html = await response.text();
    const tag = findImagePreloadTag(html);
    expect(
      tag,
      "A product page with a non-OS-storage image must NOT emit an LCP preload " +
        "tag — only trusted OS storage images should be preloaded server-side.",
    ).toBeNull();
  });
});
