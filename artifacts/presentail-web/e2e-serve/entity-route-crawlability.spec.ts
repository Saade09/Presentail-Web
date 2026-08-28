/**
 * Public entity route crawlability regression tests (serve.mjs).
 *
 * The React router accepts exactly one slug segment for these entity pages.
 * The production server must reject every longer variant before SEO injection,
 * otherwise crawlers receive an indexable branded 200 that hydrates to Not
 * Found. Legacy pagination forms remain recognised only where serve.mjs
 * immediately consolidates them to the working base route.
 */

import { test, expect } from "@playwright/test";

const ENTITY_PREFIXES = [
  "product",
  "brand",
  "category",
  "occasion",
  "blog",
] as const;

test.describe("entity routes with extra path segments", () => {
  for (const prefix of ENTITY_PREFIXES) {
    test(`/${prefix}/:slug/anything returns a noindex HTTP 404`, async ({ request }) => {
      const response = await request.get(
        `/en-lb/beirut/${prefix}/rose/anything`,
        { maxRedirects: 0 },
      );

      expect(response.status()).toBe(404);
      expect(response.headers()["x-robots-tag"]).toContain("noindex");
      expect(response.headers()["content-type"]).toContain("text/html");
      expect(await response.text()).toContain("Page Not Found");
    });
  }
});

test.describe("explicit legacy entity pagination forms", () => {
  const redirectCases = [
    {
      path: "/en-lb/beirut/category/flowers/page/2",
      location: "/en-lb/beirut/category/flowers",
    },
    {
      path: "/en-lb/beirut/occasion/birthday/page/2",
      location: "/en-lb/beirut/occasion/birthday",
    },
    {
      path: "/en-lb/beirut/brand/acme/page/1",
      location: "/en-lb/beirut/brand/acme",
    },
  ] as const;

  for (const { path, location } of redirectCases) {
    test(`${path} is consolidated to its usable base route`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(response.status()).toBe(301);
      expect(response.headers().location).toBe(location);
    });
  }

  test("unsupported brand pagination is a noindex HTTP 404", async ({ request }) => {
    const response = await request.get(
      "/en-lb/beirut/brand/acme/page/2",
      { maxRedirects: 0 },
    );

    expect(response.status()).toBe(404);
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  });
});