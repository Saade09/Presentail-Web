/**
 * Production hreflang alternate-link regression tests (serve.mjs only)
 *
 * For locale-prefixed pages the web storefront injects a set of
 * `<link rel="alternate" hreflang="...">` tags — one per supported UI language
 * (en / ar / fr) for the page's country, plus exactly one `hreflang="x-default"`
 * pointing at the English variant. These tell Google which language/country
 * variant to serve to LB / AE / CY shoppers; if they regress, international
 * search rankings degrade silently with no error surfaced anywhere.
 *
 * Like the canonical tag (see seo-injection.spec.ts), these alternates are only
 * built with absolute URLs on the real request origin inside the production
 * Node server (serve.mjs), which re-runs the injector per request. The Vite dev
 * server's `seoInjectPlugin` has no real request context at build time, so it
 * would bake relative / origin-less hrefs into the static index.html — meaning a
 * production-only regression here would NOT be caught by the dev-server spec.
 *
 * So this spec lives in ./e2e-serve (run via playwright.serve.config.ts) and
 * MUST be pointed at a built serve.mjs instance via PLAYWRIGHT_BASE_URL. The
 * "Web serve checks" CI workflow builds + starts serve.mjs and runs it there.
 *
 * It asserts, for one locale-prefixed path per country (LB "/en-lb/beirut/",
 * AE "/en-ae/dubai/", CY "/en-cy/nicosia/"):
 *   1. Exactly one <link rel="alternate" hreflang="X-YY"> for each supported
 *      language (en / ar / fr) of that country — no more, no fewer.
 *   2. Exactly one <link rel="alternate" hreflang="x-default">.
 *   3. Every alternate href is absolute and on the request origin.
 *   4. Every alternate href reflects the page's city, and the per-language
 *      alternates carry their own language prefix (x-default points at English).
 *
 * UAE and Cyprus are first-class markets: the country suffix in each hreflang is
 * derived from the request path, so a wrong-suffix or missing-variant regression
 * on AE/CY would slip past a Lebanon-only test.
 *
 * Uses Playwright's APIRequestContext so the tests exercise the real HTTP layer
 * (serve.mjs) without a browser — exactly the initial HTML crawlers receive.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AlternateLink {
  hreflang: string;
  href: string;
}

/**
 * Extract every <link rel="alternate" hreflang="..." href="..."> from a raw
 * HTML string, tolerating any attribute order among rel / hreflang / href.
 */
function findAlternateLinks(html: string): AlternateLink[] {
  const links: AlternateLink[] = [];
  // Match any <link ...> tag, then pull out its individual attributes. This is
  // order-independent and ignores tags that are not alternate links.
  const linkTag = /<link\b[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = linkTag.exec(html)) !== null) {
    const raw = tag[0];
    const rel = /\brel="([^"]*)"/i.exec(raw)?.[1];
    if (rel !== "alternate") continue;
    const hreflang = /\bhreflang="([^"]*)"/i.exec(raw)?.[1];
    const href = /\bhref="([^"]*)"/i.exec(raw)?.[1];
    if (hreflang && href) links.push({ hreflang, href });
  }
  return links;
}

// ---------------------------------------------------------------------------
// Locale-prefixed hreflang alternates per country
//
// LB, AE, and CY are all first-class markets. The country code in each
// `hreflang="X-YY"` is derived from the request path, so an AE or CY regression
// (wrong country suffix, missing language variant) would NOT be caught by a
// Lebanon-only test. Run the identical guard against one page per country.
// ---------------------------------------------------------------------------

interface CountryCase {
  /** Two-letter country code as it appears (lowercase) in URL paths. */
  country: string;
  /** A supported city slug for that country. */
  city: string;
}

const COUNTRY_CASES: CountryCase[] = [
  { country: "lb", city: "beirut" },
  { country: "ae", city: "dubai" },
  { country: "cy", city: "nicosia" },
];

for (const { country, city } of COUNTRY_CASES) {
  const path = `/en-${country}/${city}/`;
  const CC = country.toUpperCase();
  const expectedCodes = [`ar-${CC}`, `en-${CC}`, `fr-${CC}`];

  test.describe(`Production SEO — hreflang alternates on ${path}`, () => {
    let html: string;
    let origin: string;

    test.beforeAll(async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      origin = new URL(response.url()).origin;
      html = await response.text();
    });

    test("emits exactly one alternate per supported language for the country", () => {
      const links = findAlternateLinks(html);
      const byLang = links.filter((l) => l.hreflang !== "x-default");
      const codes = byLang.map((l) => l.hreflang).sort();
      expect(
        codes,
        `expected exactly ${expectedCodes.join(", ")} once each, got ${JSON.stringify(codes)}`,
      ).toEqual(expectedCodes);
    });

    test("emits exactly one x-default alternate", () => {
      const links = findAlternateLinks(html);
      const xDefaults = links.filter((l) => l.hreflang === "x-default");
      expect(
        xDefaults.length,
        `expected exactly one x-default, found ${xDefaults.length}: ${JSON.stringify(
          xDefaults,
        )}`,
      ).toBe(1);
    });

    test("every alternate href is absolute and on the request origin", () => {
      const links = findAlternateLinks(html);
      expect(links.length).toBeGreaterThan(0);
      for (const { hreflang, href } of links) {
        expect(href, `${hreflang} href must be absolute, got "${href}"`).toMatch(
          /^https?:\/\//,
        );
        expect(
          new URL(href).origin,
          `${hreflang} href origin must equal the request origin`,
        ).toBe(origin);
      }
    });

    test("each alternate href reflects the page city and its own language", () => {
      const links = findAlternateLinks(html);
      const byCode = new Map(links.map((l) => [l.hreflang, l.href]));

      // Per-language alternates must carry their own language prefix + the city.
      expect(new URL(byCode.get(`en-${CC}`)!).pathname).toContain(
        `/en-${country}/${city}`,
      );
      expect(new URL(byCode.get(`ar-${CC}`)!).pathname).toContain(
        `/ar-${country}/${city}`,
      );
      expect(new URL(byCode.get(`fr-${CC}`)!).pathname).toContain(
        `/fr-${country}/${city}`,
      );

      // x-default must point at the English variant.
      expect(new URL(byCode.get("x-default")!).pathname).toContain(
        `/en-${country}/${city}`,
      );
    });
  });
}
