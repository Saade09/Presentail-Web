/**
 * City FAQ schema end-to-end regression tests
 *
 * Guards against a silent regression in `buildCityFaqSchema` or
 * `buildLocalBusinessSchema` (seo-inject.mjs) that would drop the FAQPage or
 * LocalBusiness JSON-LD from the server-rendered HTML served to browsers and
 * bots — invisible until a manual Google Search Console rich-results inspection.
 *
 * Uses Playwright's APIRequestContext to fetch the raw initial HTML, exactly
 * what Googlebot / GSC rich-results bot receives (no browser JS execution).
 *
 * Route covered: /en-lb/beirut (Beirut city homepage, Lebanon locale)
 *
 * Assertions:
 *   FAQPage JSON-LD
 *     1. A `"@type":"FAQPage"` JSON-LD block is present in the HTML.
 *     2. `mainEntity` is a non-empty array of `@type:"Question"` entries.
 *     3. Each entry has a non-empty `name` string and a well-formed
 *        `acceptedAnswer { @type:"Answer", text: non-empty string }`.
 *
 *   LocalBusiness (Florist) JSON-LD
 *     4. A `"@type":"Florist"` JSON-LD block is present.
 *     5. `telephone` is a non-empty string.
 *     6. `areaServed` is present and non-empty (string or non-empty array).
 *     7. `hasMap` is a non-empty string (Google Maps URL).
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract every JSON-LD block from raw HTML and return them as parsed objects.
 * Handles both standalone <script type="application/ld+json">…</script> blocks
 * and @graph wrappers (used when multiple schema nodes are emitted together).
 */
function extractJsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]) as Record<string, unknown>;
      if (Array.isArray(parsed["@graph"])) {
        for (const n of parsed["@graph"] as Record<string, unknown>[]) {
          nodes.push(n);
        }
      } else {
        nodes.push(parsed);
      }
    } catch {
      // malformed block — skip
    }
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Test suite — /en-lb/beirut city homepage
// ---------------------------------------------------------------------------

test.describe("City FAQ schema — /en-lb/beirut (Beirut city homepage)", () => {
  let html: string;
  let nodes: Record<string, unknown>[];

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/en-lb/beirut");
    expect(response.status()).toBe(200);
    html = await response.text();
    nodes = extractJsonLdNodes(html);
  });

  // -------------------------------------------------------------------------
  // FAQPage JSON-LD assertions
  // -------------------------------------------------------------------------

  test('FAQPage JSON-LD block is present in the server-rendered HTML', () => {
    expect(
      html,
      'Expected "@type":"FAQPage" in the server-rendered HTML — city FAQ schema may have been dropped from seo-inject.mjs',
    ).toContain('"@type":"FAQPage"');
  });

  test('FAQPage JSON-LD contains at least one "@type":"Question" entry', () => {
    expect(
      html,
      'Expected "@type":"Question" in the FAQPage JSON-LD — buildCityFaqSchema may have returned an empty array',
    ).toContain('"@type":"Question"');
  });

  test('FAQPage mainEntity is a non-empty array of well-formed Question entries', () => {
    const faqNode = nodes.find((n) => n["@type"] === "FAQPage");
    expect(faqNode, 'FAQPage JSON-LD node not found in parsed JSON-LD blocks').toBeTruthy();

    const mainEntity = faqNode!.mainEntity as Array<Record<string, unknown>>;
    expect(Array.isArray(mainEntity), 'FAQPage.mainEntity should be an array').toBe(true);
    expect(
      mainEntity.length,
      'FAQPage.mainEntity should contain at least one Question entry',
    ).toBeGreaterThan(0);

    for (const entry of mainEntity) {
      expect(entry["@type"]).toBe("Question");
      expect(
        typeof entry.name === "string" && (entry.name as string).trim().length > 0,
        'Question.name should be a non-empty string',
      ).toBe(true);

      const answer = entry.acceptedAnswer as Record<string, unknown> | undefined;
      expect(answer, 'Question.acceptedAnswer should be present').toBeTruthy();
      expect(answer!["@type"]).toBe("Answer");
      expect(
        typeof answer!.text === "string" && (answer!.text as string).trim().length > 0,
        'Answer.text should be a non-empty string',
      ).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // LocalBusiness (Florist) JSON-LD assertions
  // -------------------------------------------------------------------------

  test('LocalBusiness (Florist) JSON-LD block is present in the server-rendered HTML', () => {
    expect(
      html,
      'Expected "@type":"Florist" in the server-rendered HTML — LocalBusiness schema may have been dropped from seo-inject.mjs',
    ).toContain('"@type":"Florist"');
  });

  test('LocalBusiness JSON-LD includes a non-empty telephone field', () => {
    const floristNode = nodes.find((n) => n["@type"] === "Florist");
    expect(floristNode, 'LocalBusiness (Florist) JSON-LD node not found').toBeTruthy();

    const telephone = floristNode!.telephone;
    expect(
      typeof telephone === "string" && (telephone as string).trim().length > 0,
      'LocalBusiness.telephone should be a non-empty string — LOCATION_DATA may be missing a phone entry for "lb"',
    ).toBe(true);
  });

  test('LocalBusiness JSON-LD includes a non-empty areaServed field', () => {
    const floristNode = nodes.find((n) => n["@type"] === "Florist");
    expect(floristNode, 'LocalBusiness (Florist) JSON-LD node not found').toBeTruthy();

    const areaServed = floristNode!.areaServed;
    expect(areaServed, 'LocalBusiness.areaServed should be present').toBeTruthy();

    if (Array.isArray(areaServed)) {
      expect(
        (areaServed as unknown[]).length,
        'LocalBusiness.areaServed array should be non-empty',
      ).toBeGreaterThan(0);
    } else {
      expect(
        typeof areaServed === "string" && (areaServed as string).trim().length > 0,
        'LocalBusiness.areaServed should be a non-empty string when not an array',
      ).toBe(true);
    }
  });

  test('LocalBusiness JSON-LD includes a non-empty hasMap field', () => {
    const floristNode = nodes.find((n) => n["@type"] === "Florist");
    expect(floristNode, 'LocalBusiness (Florist) JSON-LD node not found').toBeTruthy();

    const hasMap = floristNode!.hasMap;
    expect(
      typeof hasMap === "string" && (hasMap as string).trim().length > 0,
      'LocalBusiness.hasMap should be a non-empty string (Google Maps URL) — LOCATION_DATA may be missing a mapUrl entry for "lb"',
    ).toBe(true);
  });
});
