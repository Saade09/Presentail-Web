#!/usr/bin/env node
/**
 * check-sitemap-robots-consistency.mjs
 *
 * Builds every locale sitemap with sitemap.mjs (catalog-free static entries
 * plus a small representative mock catalog) and asserts that no submitted
 * <loc> is contradicted by a crawl directive:
 *
 *   1. No <loc> path is matched by any `Disallow:` pattern in public/robots.txt
 *      (any user-agent group). Google treats `*` as a wildcard and a trailing
 *      `$` as an end anchor; everything else is a prefix match.
 *   2. No <loc> resolves to a noindex X-Robots-Tag on the canonical host
 *      (resolveXRobotsTag in serve-robots.mjs).
 *
 * Either contradiction makes Search Console report "Submitted URL blocked by
 * robots.txt" / "Submitted URL marked 'noindex'".
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-sitemap-robots-consistency.mjs
 *
 * Exits 0 when all checks pass, 1 when any check fails.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSitemapXml, SITEMAP_LANGS } from "../sitemap.mjs";
import { resolveXRobotsTag, CANONICAL_PRODUCTION_HOST } from "../serve-robots.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROBOTS_TXT_PATH = path.resolve(__dirname, "../public/robots.txt");

const ORIGIN = `https://${CANONICAL_PRODUCTION_HOST}`;

// Representative catalog so entity URL shapes (product/brand/occasion/
// category) are exercised alongside the static entries.
const MOCK_CATALOG = {
  products: [{ slug: "red-roses", name: "Red Roses", imageUrl: `${ORIGIN}/img/red-roses.jpg` }],
  brands: [{ slug: "acme-flowers", count: 20 }],
  occasions: [{ id: "birthday", count: 12 }],
  categories: [{ id: "hand-bouquets", count: 12 }],
  totalProductCount: 30,
};

/**
 * Collect every Disallow pattern in robots.txt across all user-agent groups.
 * Empty `Disallow:` lines (which allow everything) are skipped.
 *
 * @param {string} robotsTxt
 * @returns {string[]}
 */
export function parseDisallowPatterns(robotsTxt) {
  const patterns = [];
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const match = line.match(/^disallow\s*:\s*(\S*)/i);
    if (match && match[1]) patterns.push(match[1]);
  }
  return patterns;
}

/**
 * Google robots.txt path matching: `*` matches any character sequence, a
 * trailing `$` anchors the end, otherwise the pattern is a prefix match.
 *
 * @param {string} pattern - Disallow value, e.g. "/*\/account$"
 * @param {string} urlPath - path plus query, e.g. "/en-lb/beirut/shop"
 * @returns {boolean}
 */
export function robotsPatternMatches(pattern, urlPath) {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(urlPath);
}

/**
 * Build all locale sitemaps and return their <loc> values keyed by locale.
 *
 * @returns {Record<string, string[]>}
 */
export function collectSitemapLocs() {
  const byLocale = {};
  for (const locale of SITEMAP_LANGS) {
    const xml = buildSitemapXml({ origin: ORIGIN, basePath: "/", locale, ...MOCK_CATALOG });
    byLocale[locale] = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (m) =>
      m[1].replace(/&amp;/g, "&"),
    );
  }
  return byLocale;
}

/**
 * Return every sitemap <loc> contradicted by robots.txt or a noindex header.
 *
 * @param {object} args
 * @param {string} args.robotsTxt
 * @param {Record<string, string[]>} args.locsByLocale
 * @returns {Array<{ locale: string, loc: string, reason: string }>}
 */
export function findSitemapRobotsConflicts({ robotsTxt, locsByLocale }) {
  const disallows = parseDisallowPatterns(robotsTxt);
  const conflicts = [];
  for (const [locale, locs] of Object.entries(locsByLocale)) {
    for (const loc of locs) {
      const url = new URL(loc);
      const urlPath = url.pathname + url.search;
      for (const pattern of disallows) {
        if (robotsPatternMatches(pattern, urlPath)) {
          conflicts.push({ locale, loc, reason: `robots.txt Disallow: ${pattern}` });
        }
      }
      const xRobots = resolveXRobotsTag(CANONICAL_PRODUCTION_HOST, url.pathname, url.search);
      if (xRobots && /noindex/i.test(xRobots)) {
        conflicts.push({ locale, loc, reason: `X-Robots-Tag: ${xRobots}` });
      }
    }
  }
  return conflicts;
}

const _isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (_isMain) {
  const robotsTxt = readFileSync(ROBOTS_TXT_PATH, "utf8");
  const locsByLocale = collectSitemapLocs();
  const conflicts = findSitemapRobotsConflicts({ robotsTxt, locsByLocale });
  const total = Object.values(locsByLocale).reduce((n, locs) => n + locs.length, 0);

  if (conflicts.length > 0) {
    for (const { locale, loc, reason } of conflicts) {
      console.log(`FAIL  sitemap-${locale}.xml ${loc} — ${reason}`);
    }
    console.log(`\n${conflicts.length} sitemap URL(s) contradicted by robots directives (${total} checked).`);
    process.exit(1);
  }
  console.log(`PASS  ${total} sitemap URL(s) checked; none Disallowed by robots.txt or marked noindex.`);
  process.exit(0);
}
