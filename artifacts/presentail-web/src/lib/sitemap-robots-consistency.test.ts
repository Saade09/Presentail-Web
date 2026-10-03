/**
 * Sitemap ↔ robots consistency.
 *
 * Covers the /shop sitemap entries, the narrowed /account robots.txt rules
 * that keep /account-deletion crawlable, and the
 * scripts/check-sitemap-robots-consistency.mjs guard that fails whenever a
 * submitted sitemap URL is Disallowed by robots.txt or served noindex.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import {
  buildSitemapXml,
  SITEMAP_CITIES,
  SITEMAP_LANGS,
// @ts-expect-error - mjs module without type declarations.
} from "../../sitemap.mjs";
// @ts-expect-error - mjs module without type declarations.
import { hreflangLangsForCountry } from "./hreflang.mjs";
import {
  ROBOTS_TXT_PATH,
  collectSitemapLocs,
  findSitemapRobotsConflicts,
  parseDisallowPatterns,
  robotsPatternMatches,
// @ts-expect-error - script module without type declarations.
} from "../../scripts/check-sitemap-robots-consistency.mjs";

const ORIGIN = "https://presentail.com";
const ROBOTS_TXT = readFileSync(ROBOTS_TXT_PATH, "utf8");
const DISALLOWS: string[] = parseDisallowPatterns(ROBOTS_TXT);

const CITIES = SITEMAP_CITIES as Record<string, string[]>;
const LANGS = SITEMAP_LANGS as string[];

function locsOf(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1]);
}

const STATIC_XML_BY_LOCALE: Record<string, string> = Object.fromEntries(
  LANGS.map((locale) => [locale, buildSitemapXml({ origin: ORIGIN, basePath: "/", locale })]),
);

// Expected number of /{locale}/{city}/shop entries per locale file: one per
// city of every country whose hreflang cluster includes that language.
function expectedShopCount(locale: string): number {
  return Object.entries(CITIES)
    .filter(([country]) => (hreflangLangsForCountry(country) as string[]).includes(locale))
    .reduce((n, [, cities]) => n + cities.length, 0);
}

describe("sitemap /shop entries", () => {
  for (const locale of LANGS) {
    it(`sitemap-${locale}.xml lists /shop for every ${locale} locale × city`, () => {
      const xml = STATIC_XML_BY_LOCALE[locale];
      const locs = new Set(locsOf(xml));
      for (const [country, cities] of Object.entries(CITIES)) {
        const langs = hreflangLangsForCountry(country) as string[];
        for (const city of cities) {
          const loc = `${ORIGIN}/${locale}-${country}/${city}/shop`;
          if (!langs.includes(locale)) {
            expect(locs.has(loc), `${loc} must not be emitted`).toBe(false);
            continue;
          }
          expect(locs.has(loc), `${loc} missing`).toBe(true);
          for (const alt of langs) {
            expect(xml).toContain(
              `hreflang="${alt}-${country.toUpperCase()}" href="${ORIGIN}/${alt}-${country}/${city}/shop"`,
            );
          }
        }
      }
    });
  }

  it("does not list legacy /shop?category= or /shop?occasion= variants", () => {
    for (const xml of Object.values(STATIC_XML_BY_LOCALE)) {
      expect(xml).not.toMatch(/\/shop\?/);
    }
  });
});

describe("sitemap loc counts", () => {
  // Catalog-free (static fallback) counts on main before /shop was added.
  const BEFORE: Record<string, number> = { en: 288, ar: 276, fr: 278, el: 31 };

  it("adds exactly one /shop loc per locale × city and nothing else", () => {
    for (const locale of LANGS) {
      const count = locsOf(STATIC_XML_BY_LOCALE[locale]).length;
      expect(count, `sitemap-${locale}.xml`).toBe(BEFORE[locale] + expectedShopCount(locale));
    }
    expect(expectedShopCount("en")).toBe(37);
    expect(expectedShopCount("el")).toBe(4);
  });

  it("all locs are unique and absolute across every locale file", () => {
    const all = Object.values(collectSitemapLocs() as Record<string, string[]>).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const loc of all) {
      expect(loc.startsWith(`${ORIGIN}/`), loc).toBe(true);
    }
  });
});

describe("noindex pages stay out of the sitemap", () => {
  // /{lang}/blog and /{locale}/{city}/privacy|terms are served noindex
  // (NONINDEX_ROUTE_KEYS / resolveXRobotsTag), so submitting them would only
  // trade one Search Console error for another.
  it("does not list blog indexes, privacy or terms (locale+city or apex)", () => {
    for (const xml of Object.values(STATIC_XML_BY_LOCALE)) {
      const paths = locsOf(xml).map((loc) => new URL(loc).pathname);
      for (const p of paths) {
        expect(p).not.toMatch(/^\/[a-z]{2}\/blog\/?$/);
        expect(p).not.toMatch(/\/(?:privacy|terms)$/);
      }
    }
  });
});

describe("robots.txt /account rules", () => {
  it("keeps private /account URLs blocked", () => {
    const blocked = (p: string) => DISALLOWS.some((pattern) => robotsPatternMatches(pattern, p));
    expect(blocked("/account")).toBe(true);
    expect(blocked("/account/orders")).toBe(true);
    expect(blocked("/en-lb/beirut/account")).toBe(true);
    expect(blocked("/en-lb/beirut/account/")).toBe(true);
    expect(blocked("/ar-ae/dubai/account/settings")).toBe(true);
  });

  it("no longer uses the bare prefix rules that caught /account-deletion", () => {
    expect(DISALLOWS).not.toContain("/account");
    expect(DISALLOWS).not.toContain("/*/account");
  });

  it("keeps account-deletion in the sitemap and crawlable", () => {
    const deletionLocs = Object.values(collectSitemapLocs() as Record<string, string[]>)
      .flat()
      .filter((loc) => loc.endsWith("/account-deletion"));
    expect(deletionLocs).toHaveLength(10);
    for (const loc of deletionLocs) {
      const { pathname } = new URL(loc);
      const matching = DISALLOWS.filter((pattern) => robotsPatternMatches(pattern, pathname));
      expect(matching, `${loc} Disallowed by ${matching.join(", ")}`).toHaveLength(0);
    }
  });
});

describe("robotsPatternMatches", () => {
  it("implements Google wildcard and end-anchor semantics", () => {
    expect(robotsPatternMatches("/cart", "/cart/items")).toBe(true);
    expect(robotsPatternMatches("/*/account", "/en-lb/beirut/account-deletion")).toBe(true);
    expect(robotsPatternMatches("/*/account$", "/en-lb/beirut/account-deletion")).toBe(false);
    expect(robotsPatternMatches("/*/account$", "/en-lb/beirut/account")).toBe(true);
    expect(robotsPatternMatches("/*?utm_source=", "/en-lb/beirut/shop?utm_source=x")).toBe(true);
    expect(robotsPatternMatches("/*?utm_source=", "/en-lb/beirut/shop")).toBe(false);
  });
});

describe("check-sitemap-robots-consistency guard", () => {
  it("reports no conflicts for the current sitemap and robots.txt", () => {
    const conflicts = findSitemapRobotsConflicts({
      robotsTxt: ROBOTS_TXT,
      locsByLocale: collectSitemapLocs(),
    });
    expect(conflicts).toEqual([]);
  });

  it("flags account-deletion under the old over-broad /*/account rule", () => {
    const conflicts = findSitemapRobotsConflicts({
      robotsTxt: "User-agent: *\nDisallow: /*/account\n",
      locsByLocale: collectSitemapLocs(),
    }) as Array<{ loc: string }>;
    expect(conflicts).toHaveLength(10);
    expect(conflicts.every((c) => c.loc.endsWith("/account-deletion"))).toBe(true);
  });

  it("flags sitemap URLs that are served noindex", () => {
    const conflicts = findSitemapRobotsConflicts({
      robotsTxt: "",
      locsByLocale: { en: [`${ORIGIN}/en-lb/beirut/privacy`, `${ORIGIN}/en/blog`, `${ORIGIN}/en-lb/beirut/shop`] },
    }) as Array<{ loc: string; reason: string }>;
    expect(conflicts.map((c) => c.loc)).toEqual([
      `${ORIGIN}/en-lb/beirut/privacy`,
      `${ORIGIN}/en/blog`,
    ]);
  });
});
