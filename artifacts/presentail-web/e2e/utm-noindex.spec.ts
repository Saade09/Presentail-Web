/**
 * UTM duplicate-content — robots.txt regression tests
 *
 * Marketing UTM links (utm_source, utm_campaign, etc.) are widely distributed
 * in emails and social ads. If a crawler follows a shared UTM link it would
 * see a 200 response identical to the canonical URL — a duplicate-content
 * risk that can dilute PageRank and confuse Google Search Console.
 *
 * Two layers of protection are in place:
 *
 *   1. robots.txt — Disallow: /*?utm_source= (and other UTM / click-ID
 *      variants) so well-behaved crawlers skip UTM-parameterised URLs entirely.
 *      ← verified here.
 *
 *   2. x-robots-tag: noindex — every HTML response from serve.mjs whose query
 *      string contains a UTM or click-ID parameter receives this header as a
 *      belt-and-suspenders guard.
 *      ← verified in e2e-serve/utm-noindex.spec.ts (requires serve.mjs).
 *
 * This file covers layer 1 and is safe to run against the Vite dev server.
 * It fetches /robots.txt directly — no SPA rendering or serve.mjs needed.
 */

import { test, expect } from "@playwright/test";

const UTM_DISALLOW_PATTERNS = [
  "Disallow: /*?utm_source=",
  "Disallow: /*?utm_medium=",
  "Disallow: /*?utm_campaign=",
  "Disallow: /*?utm_id=",
  "Disallow: /*?utm_term=",
  "Disallow: /*?utm_content=",
  "Disallow: /*?gclid=",
  "Disallow: /*?gbraid=",
  "Disallow: /*?wbraid=",
];

test.describe("robots.txt — UTM Disallow rules", () => {
  let robotsTxt: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status(), "robots.txt must return 200").toBe(200);
    robotsTxt = await response.text();
  });

  for (const pattern of UTM_DISALLOW_PATTERNS) {
    test(`robots.txt contains "${pattern}"`, () => {
      expect(
        robotsTxt,
        `robots.txt is missing the UTM crawl guard: ${pattern}`,
      ).toContain(pattern);
    });
  }
});
