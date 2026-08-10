#!/usr/bin/env node
/**
 * Diagnostic check: curl each Batroun category/occasion URL against the live
 * site and verify it returns HTTP 200 with a self-referencing canonical (i.e.
 * the page is indexable). Use this script to decide whether Batroun child pages
 * have grown enough to be linked from the landing page again.
 *
 * Background (Aug 2026)
 * ---------------------
 * All 8 Batroun category/occasion URLs returned HTTP 200 but carried a
 * "noindex, follow" robots meta tag — Batroun has too few products to pass the
 * isPageEligible threshold (≥4 products, ≥15% unique vs parent city). As a
 * result, both the city-specific "Popular Flower Types" block and the generic
 * "Shop by Occasion" occasion list were removed from seo-inject.mjs so the
 * landing page does not link to noindexed child pages.
 *
 * When to re-run
 * --------------
 * Run this script again once Batroun inventory has grown. If all URLs pass
 * (HTTP 200, self-referencing canonical, no noindex), re-add the occasion list
 * for lb-batroun in seo-inject.mjs and update the test in
 * src/lib/seo-inject.test.ts accordingly.
 *
 * Expected current result: FAIL (all URLs are noindexed — this is correct and
 * the links have already been removed from seo-inject.mjs).
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-batroun-links.mjs [base-url]
 *
 * Defaults to https://presentail.com
 * Exits 0 when all URLs return 200 with correct canonicals, 1 otherwise.
 */

const BASE_URL = (process.argv[2] ?? "https://presentail.com").replace(/\/$/, "");

// All Batroun category/occasion URLs that were formerly linked from indexed
// pages (landing page home extras, curated occasion/category SEO sections)
// before they were removed because all Batroun child pages are noindexed.
// When Batroun inventory grows, re-run this script and re-enable the links
// for any URL that now passes (HTTP 200 + self-referencing canonical, no noindex).
const BATROUN_PATHS = [
  // City home "Shop by Occasion" / "Popular Flower Types" (seo-inject.mjs)
  "/en-lb/batroun/category/hand-bouquets",
  "/en-lb/batroun/occasion/birthday",
  "/en-lb/batroun/occasion/anniversary",
  "/en-lb/batroun/occasion/wedding",
  "/en-lb/batroun/occasion/funeral",
  "/en-lb/batroun/occasion/new-born",
  "/en-lb/batroun/occasion/congratulations",
  "/en-lb/batroun/occasion/valentines-day",
  // Curated occasion SEO cross-city links (occasionSeoContent.mjs)
  "/en-lb/batroun/occasion/mothers-day",
  // Curated category SEO cross-city links — EN (categorySeoContent.mjs)
  "/en-lb/batroun/category/chocolate",
  "/en-lb/batroun/category/cakes",
  "/en-lb/batroun/category/balloons",
  // Curated category SEO cross-city links — AR
  "/ar-lb/batroun/category/chocolate",
  "/ar-lb/batroun/category/cakes",
  // Curated category SEO cross-city links — FR
  "/fr-lb/batroun/category/chocolate",
  "/fr-lb/batroun/category/cakes",
];

/**
 * Extract the href value of <link rel="canonical" href="…"> from raw HTML.
 * Returns null when no canonical is present.
 */
function extractCanonical(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return m ? m[1] : null;
}

async function checkUrl(path) {
  const url = `${BASE_URL}${path}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { "Accept": "text/html" },
      redirect: "follow",
    });
  } catch (err) {
    return { url, ok: false, reason: `fetch error: ${err.message}` };
  }

  if (res.status !== 200) {
    return { url, ok: false, reason: `HTTP ${res.status} (expected 200)` };
  }

  const html = await res.text();

  // Check for noindex
  const hasNoindex = /noindex/i.test(html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "");
  if (hasNoindex) {
    return { url, ok: false, reason: "page contains noindex directive" };
  }

  // Check canonical is self-referencing (matches the fetched URL or its base-stripped form)
  const canonical = extractCanonical(html);
  if (!canonical) {
    return { url, ok: false, reason: "no canonical tag found in <head>" };
  }

  // Canonical should end with the same path (allow for domain variation)
  const canonicalPath = canonical.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "");
  const expectedPath = path.replace(/\/$/, "");
  if (canonicalPath !== expectedPath) {
    return {
      url,
      ok: false,
      reason: `canonical mismatch: expected path "${expectedPath}", got canonical "${canonical}"`,
    };
  }

  return { url, ok: true, status: res.status, canonical };
}

async function main() {
  console.log(`Checking ${BATROUN_PATHS.length} Batroun URLs against ${BASE_URL}\n`);

  const results = await Promise.all(BATROUN_PATHS.map(checkUrl));

  let allPassed = true;
  for (const r of results) {
    if (r.ok) {
      console.log(`PASS  ${r.url}`);
      console.log(`      HTTP ${r.status} | canonical: ${r.canonical}`);
    } else {
      console.error(`FAIL  ${r.url}`);
      console.error(`      ${r.reason}`);
      allPassed = false;
    }
  }

  console.log();
  if (allPassed) {
    console.log("check-batroun-links: all URLs return 200 with correct self-referencing canonicals.");
    process.exit(0);
  } else {
    console.error("check-batroun-links: one or more URLs failed — review above and remove broken hrefs from seo-inject.mjs.");
    process.exit(1);
  }
}

main();
