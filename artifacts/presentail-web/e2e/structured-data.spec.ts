/**
 * Structured-data regression tests
 *
 * Verifies that the server-side SEO injection in seo-inject.mjs produces:
 *   1. A JSON-LD <script> block with "@type":"Organization"
 *   2. A JSON-LD <script> block with "@type":"WebSite" (with SearchAction)
 *   3. A non-empty <meta name="description"> tag
 *   4. A non-empty <meta property="og:title"> tag
 *   5. A non-empty <meta property="og:description"> tag
 *   6. A non-empty <meta name="twitter:title"> tag
 *   7. A non-empty <meta name="twitter:description"> tag
 *
 * Uses Playwright's APIRequestContext so tests are fast HTTP checks against the
 * raw initial HTML — no browser JS needed, exactly what crawlers/bots receive.
 */

import { test, expect } from "@playwright/test";

test.describe("Structured data — initial HTML response for /", () => {
  let html: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    html = await response.text();
  });

  test('JSON-LD block with "@type":"Organization" is present', () => {
    expect(html).toContain('"@type":"Organization"');
  });

  test('JSON-LD block with "@type":"WebSite" is present', () => {
    expect(html).toContain('"@type":"WebSite"');
  });

  test('WebSite JSON-LD block includes a SearchAction', () => {
    expect(html).toContain('"@type":"SearchAction"');
  });

  test('meta[name="description"] is present and non-empty', () => {
    const match = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+name="description"/i);
    expect(match, 'meta[name="description"] not found or empty').toBeTruthy();
    expect(match![1].trim().length).toBeGreaterThan(0);
  });

  test('meta[property="og:title"] is present and non-empty', () => {
    const match = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);
    expect(match, 'meta[property="og:title"] not found or empty').toBeTruthy();
    expect(match![1].trim().length).toBeGreaterThan(0);
  });

  test('meta[property="og:description"] is present and non-empty', () => {
    const match = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:description"/i);
    expect(match, 'meta[property="og:description"] not found or empty').toBeTruthy();
    expect(match![1].trim().length).toBeGreaterThan(0);
  });

  test('meta[name="twitter:title"] is present and non-empty', () => {
    const match = html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+name="twitter:title"/i);
    expect(match, 'meta[name="twitter:title"] not found or empty').toBeTruthy();
    expect(match![1].trim().length).toBeGreaterThan(0);
  });

  test('meta[name="twitter:description"] is present and non-empty', () => {
    const match = html.match(/<meta\s+name="twitter:description"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+name="twitter:description"/i);
    expect(match, 'meta[name="twitter:description"] not found or empty').toBeTruthy();
    expect(match![1].trim().length).toBeGreaterThan(0);
  });
});
