/**
 * Batroun SSR product links — HTTP 200 + canonical guard
 *
 * The city home page for /en-lb/batroun embeds a server-rendered product grid
 * (data-ssr-products="true") in the initial HTML so crawlers can follow product
 * links without executing JavaScript. If the slug derivation or delivery-zone
 * lookup is broken, those links would return 404 or 301 — silently harming
 * ranking for the Batroun landing page.
 *
 * Canonical remapping:
 *   Entity pages (product/brand/category/occasion) at non-hub cities
 *   canonicalize to the hub city — for LB that is Beirut (see HUB_CITY in
 *   src/lib/hreflang.mjs and remapPathnameToHubCity in seo-inject.mjs).
 *   So /en-lb/batroun/product/<slug> must:
 *     - Return HTTP 200 (the page IS served under the Batroun URL)
 *     - Emit a canonical that points at /en-lb/beirut/product/<slug>
 *   The canonical consolidates ranking signals to the hub city without
 *   preventing the Batroun URL from being crawled and followed.
 *
 * This spec:
 *   1. Fetches /en-lb/batroun via the real production serve.mjs build and
 *      asserts the response is HTTP 200.
 *   2. Extracts every product href embedded in the SSR grid section.
 *   3. Asserts at least one product link is present (guards against the SSR
 *      grid being silently empty, which would make steps 4–5 vacuously pass).
 *   4. Follows each href and asserts HTTP 200.
 *   5. Asserts that the canonical <link> in each product page's <head> points
 *      at the hub-city (Beirut) equivalent of the URL — a wrong or
 *      self-referencing canonical would fragment ranking signals.
 *
 * Runs against the production serve.mjs build via playwright.serve.config.ts
 * (the "Web serve checks" workflow / run-serve-e2e.sh).
 */

import { test, expect } from "@playwright/test";

const BATROUN_HOME = "/en-lb/batroun";

// Hub city for Lebanon — must match HUB_CITY["lb"] in src/lib/hreflang.mjs.
const LB_HUB_CITY = "beirut";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the href value of <link rel="canonical"> from a raw HTML string.
 * Returns null when no canonical tag is present.
 */
function extractCanonical(html: string): string | null {
  const linkRe = /<link\b[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = linkRe.exec(html)) !== null) {
    const raw = tag[0];
    const rel = /\brel="([^"]*)"/i.exec(raw)?.[1];
    if (rel !== "canonical") continue;
    const href = /\bhref="([^"]*)"/i.exec(raw)?.[1];
    if (href) return href;
  }
  return null;
}

/**
 * Extract all product hrefs from the SSR product grid section. The grid is
 * emitted as a <section data-ssr-products="true"> block; each card is an
 * <a href="/en-lb/batroun/product/<slug>">.
 *
 * Strategy: narrow the search to the SSR section first (avoids matching
 * navigation or footer links that happen to start with the same prefix), then
 * pull every href that starts with the Batroun product path.
 */
function extractSsrProductHrefs(html: string, localeBase: string): string[] {
  // Isolate the SSR section if present.
  const sectionStart = html.indexOf('data-ssr-products="true"');
  if (sectionStart === -1) return [];
  // Find the closing </section> after the marker.
  const sectionEnd = html.indexOf("</section>", sectionStart);
  const section =
    sectionEnd === -1 ? html.slice(sectionStart) : html.slice(sectionStart, sectionEnd);

  const productPrefix = `${localeBase}/product/`;
  const hrefs: string[] = [];
  const hrefRe = /\bhref="([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(section)) !== null) {
    const href = m[1];
    if (href.startsWith(productPrefix)) {
      hrefs.push(href);
    }
  }
  // Deduplicate while preserving order.
  return [...new Set(hrefs)];
}

/**
 * Map a Batroun product href to the hub-city canonical path.
 *
 * /en-lb/batroun/product/<slug>  →  /en-lb/beirut/product/<slug>
 *
 * This mirrors remapPathnameToHubCity() in src/lib/hreflang.mjs which
 * serve.mjs uses to build the <link rel="canonical"> tag for satellite-city
 * entity pages.
 */
function toHubCityHref(batrounHref: string): string {
  return batrounHref.replace(
    /^(\/[a-z]{2}-[a-z]{2}\/)batroun\//,
    `$1${LB_HUB_CITY}/`,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Batroun SSR product links — HTTP 200 + canonical guard", () => {
  let batrounHtml: string;
  let origin: string;
  let productHrefs: string[];

  test.beforeAll(async ({ request }) => {
    // maxRedirects: 0 — the Batroun city home must be served directly (no
    // redirect). Following redirects would mask a 301 response.
    const res = await request.get(BATROUN_HOME, { maxRedirects: 0 });
    expect(
      res.status(),
      `GET ${BATROUN_HOME} must return 200`,
    ).toBe(200);
    batrounHtml = await res.text();
    origin = new URL(res.url()).origin;
    productHrefs = extractSsrProductHrefs(batrounHtml, BATROUN_HOME);
  });

  test("the Batroun city home contains at least one SSR product link", () => {
    expect(
      productHrefs.length,
      "Expected at least one /en-lb/batroun/product/<slug> href in the SSR grid. " +
        "If this fails the SSR grid may be silently empty (fixture server not returning products, " +
        "or fetchCityProducts timing out).",
    ).toBeGreaterThan(0);
  });

  test("every SSR product link returns HTTP 200 without redirect", async ({ request }) => {
    // maxRedirects: 0 is the critical guard here. Playwright's APIRequestContext
    // follows redirects by default, so without it a 301 Batroun→Beirut redirect
    // would silently satisfy the 200 assertion — exactly the regression this
    // test exists to catch. With maxRedirects: 0 a redirect returns its real
    // status (301/302), which fails the toBe(200) assertion.
    for (const href of productHrefs) {
      const res = await request.get(href, { maxRedirects: 0 });
      expect(
        res.status(),
        `GET ${href} must return 200 without redirect (got ${res.status()}). ` +
          "A 301 here means the Batroun product URL is being redirected to Beirut — " +
          "the SSR grid should link to a directly-served page, not a redirect chain.",
      ).toBe(200);
    }
  });

  test("every SSR product page has a canonical pointing at the hub-city (Beirut) URL", async ({ request }) => {
    // Entity pages on satellite cities (e.g. Batroun) canonicalize to the
    // hub city (Beirut) so ranking signals consolidate there. The Batroun URL
    // is still served with 200 — it is accessible to crawlers — but its
    // canonical must consolidate PageRank to /en-lb/beirut/product/<slug>.
    //
    // maxRedirects: 0 ensures we read the canonical from the actual Batroun
    // page, not from a redirect target. Together with the 200 test above, this
    // fully validates the expected pattern: 200 response + hub-city canonical.
    for (const href of productHrefs) {
      const res = await request.get(href, { maxRedirects: 0 });
      const html = await res.text();
      const canonical = extractCanonical(html);
      const expectedCanonical = `${origin}${toHubCityHref(href)}`;
      expect(
        canonical,
        `Product page ${href} must emit a <link rel="canonical"> tag`,
      ).not.toBeNull();
      expect(
        canonical,
        `Canonical for ${href} must point at the hub-city URL ${expectedCanonical} (got "${canonical}")`,
      ).toBe(expectedCanonical);
    }
  });
});
