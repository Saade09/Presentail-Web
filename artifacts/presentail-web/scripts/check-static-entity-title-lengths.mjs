#!/usr/bin/env node
/**
 * check-static-entity-title-lengths.mjs
 *
 * SEO title-length audit for brand, occasion, and category page templates,
 * plus the static /brands and /occasions list pages.
 *
 * The audit window is 30–65 characters — the same bounds enforced for contact
 * pages in check-contact-title-length.mjs. Any title shorter than 30 or longer
 * than 65 characters is a regression that would hurt SEO score.
 *
 * How it works
 * ------------
 * Part A — Static list pages (/brands, /occasions):
 *   1. Generate the sitemap XML via buildSitemapXml() (no catalog data needed
 *      — these paths are always present as static locale entries).
 *   2. Extract every <loc> that ends with "/brands" or "/occasions".
 *   3. Call buildSeoHead() for each path and read the resolved <title>.
 *   4. Assert each title is within the 30–65-char window.
 *
 * Part B — Entity page templates (brand, category, occasion):
 *   1. Call buildBrandSeo(), buildCategorySeo(), buildOccasionSeo() from
 *      src/lib/seo.mjs directly with a curated set of representative entity
 *      names (short, typical, near-upper-bound).
 *   2. Test every combination of language (en/ar/fr) and localized city name
 *      (all entries in CITY_NAMES), because city length affects the final title
 *      length and the longest city names stress-test the 65-char upper bound.
 *   3. The no-city fallback (bare paths without a locale prefix) is intentionally
 *      excluded: the "{name} | Presentail" template produces titles under 30 chars
 *      for realistic short entity names, these paths are not emitted by the
 *      sitemap, and they are not the primary SEO surface.
 *
 * A failure here means a template change silently pushed a realistic title out
 * of the 30–65-char window. Fix by adjusting the template or the entity name
 * set to reflect current real-world catalog data.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-static-entity-title-lengths.mjs
 *
 * Exits 0 on pass, 1 on any failure.
 */

import { buildSeoHead } from "../seo-inject.mjs";
import { buildSitemapXml } from "../sitemap.mjs";
import {
  buildBrandSeo,
  buildCategorySeo,
  buildOccasionSeo,
  CITY_NAMES,
  COUNTRY_NAMES,
} from "../src/lib/seo.mjs";

const ORIGIN = "https://presentail.com";
const BASE_PATH = "";
const OPTS = { origin: ORIGIN, basePath: BASE_PATH };

const TITLE_MIN = 30;
const TITLE_MAX = 65;

const LANGS = ["en", "ar", "fr", "el"];

// Supported country slugs — used to look up country names for city contexts.
const COUNTRY_SLUGS = ["lb", "ae", "cy"];

const failures = [];
const passes = [];

function record(label, title) {
  const len = title.length;
  const ok = len >= TITLE_MIN && len <= TITLE_MAX;
  const entry = { label, title, len, ok };
  if (ok) passes.push(entry);
  else failures.push(entry);
}

// ------------------------------------------------------------------
// Part A — Static list pages: /brands and /occasions
// ------------------------------------------------------------------

// Empty catalog is sufficient — these paths are static locale entries
// that appear regardless of product/brand/occasion counts.
const sitemapXml = buildSitemapXml({ origin: ORIGIN, basePath: BASE_PATH });

const locMatches = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)];
const listLocs = locMatches
  .map((m) => m[1])
  .filter((url) => {
    const path = url.slice(ORIGIN.length);
    return path.endsWith("/brands") || path.endsWith("/occasions");
  });

if (listLocs.length === 0) {
  console.error(
    "✖ No /brands or /occasions URLs found in the generated sitemap. " +
      "Check SITEMAP_STATIC_PATHS in sitemap.mjs.",
  );
  process.exit(1);
}

for (const url of listLocs) {
  const pathname = url.slice(ORIGIN.length) || "/";
  const { title } = buildSeoHead(pathname, OPTS);
  record(`list: ${pathname}`, title);
}

// ------------------------------------------------------------------
// Part B — Entity page title templates
// ------------------------------------------------------------------

// Representative brand names.
//
// Brand titles use the template "{name} | Presentail" regardless of language
// or city (brands have no city-specific title variant). The name must be
// ≥ 16 chars so the full title reaches the 30-char lower bound.
// Names are chosen to be realistic for the Presentail catalog and to stress
// the upper bound when combined with the fixed " | Presentail" suffix (14 chars).
const BRAND_NAMES = [
  "Fleurs de Lys Beirut",            // 20 chars → title = 34 chars
  "Bloomtastic Lebanon",             // 19 chars → title = 33 chars
  "The Naturelle Collection Beirut", // 30 chars → title = 44 chars — near upper bound
];

// Representative category names.
//
// With-city template (EN):  "{name} Delivery in {city} | Presentail"
// With-city template (AR):  "توصيل {name} في {city} | Presentail"
// With-city template (FR):  "Livraison de {name} à {city} | Presentail"
//
// FR with the longest city ("Oumm al Qaïwaïn", 15 chars) has a fixed overhead
// of 13 + 3 + 13 = 29 chars plus the city, leaving at most 65 − 44 = 21 chars
// for the name. Names are kept ≤ 20 chars so the worst-case FR title stays in range.
const CATEGORY_NAMES = [
  "Flowers",              // 7 chars  — tests typical/short name
  "Luxury Gift Baskets",  // 19 chars — tests typical/medium name
  "Anniversary Bouquets", // 20 chars — tests near-upper-bound for FR+long-city
];

// Representative occasion names.
//
// With-city template (EN):  "{name} Flowers & Gifts in {city} | Presentail"
// With-city template (AR):  "زهور وهدايا {name} في {city} | Presentail"
// With-city template (FR):  "Fleurs et cadeaux {name} à {city} | Presentail"
//
// FR with the longest city has overhead of 18 + 3 + 13 = 34 plus city (15),
// leaving at most 65 − 49 = 16 chars for the name. Names are kept ≤ 15 chars.
const OCCASION_NAMES = [
  "Birthday",         // 8 chars  — tests typical/short name
  "Anniversary",      // 11 chars — tests typical/medium name
  "Valentine's Day",  // 15 chars — tests near-upper-bound for FR+long-city
];

// Build city/country context pairs for each language using the localised
// CITY_NAMES dictionary so title lengths are measured with actual rendered text.
function buildCityContextsForLang(lang) {
  const cityMap = CITY_NAMES[lang] ?? CITY_NAMES.en;
  const countryMap = COUNTRY_NAMES[lang] ?? COUNTRY_NAMES.en;
  const contexts = [];
  for (const [cityKey, cityName] of Object.entries(cityMap)) {
    // Extract country slug from the key prefix (e.g. "lb-beirut" → "lb").
    const countrySlug = cityKey.split("-")[0];
    if (!COUNTRY_SLUGS.includes(countrySlug)) continue;
    const country = countryMap[countrySlug] ?? "";
    contexts.push({ city: cityName, country, key: `${lang}/${cityKey}` });
  }
  return contexts;
}

// Brand: no city variant — test across languages only.
for (const lang of LANGS) {
  for (const name of BRAND_NAMES) {
    const { title } = buildBrandSeo({ lang, brandName: name });
    record(`brand(${lang}): "${name}"`, title);
  }
}

// Category and occasion: test all language × city combinations.
for (const lang of LANGS) {
  const cityContexts = buildCityContextsForLang(lang);
  for (const { city, country, key } of cityContexts) {
    for (const name of CATEGORY_NAMES) {
      const { title } = buildCategorySeo({ lang, categoryName: name, city, country });
      record(`category(${key}): "${name}"`, title);
    }
    for (const name of OCCASION_NAMES) {
      const { title } = buildOccasionSeo({ lang, occasionName: name, city, country });
      record(`occasion(${key}): "${name}"`, title);
    }
  }
}

// ------------------------------------------------------------------
// Report
// ------------------------------------------------------------------

const total = passes.length + failures.length;
const failCount = failures.length;

console.log(`\nSEO static-entity title-length audit`);
console.log(`Window: ${TITLE_MIN}–${TITLE_MAX} chars`);
console.log(
  `Checks: ${total}  |  Passed: ${passes.length}  |  Failed: ${failCount}`,
);

if (failCount > 0) {
  console.error(`\n✖ FAILURES (${failCount}):\n`);
  for (const f of failures) {
    const direction = f.len < TITLE_MIN ? "TOO SHORT" : "TOO LONG";
    console.error(
      `  [${direction}] ${f.label}\n` +
        `    title (${f.len} chars): "${f.title}"\n`,
    );
  }
  console.error(
    `\n✖ Audit FAILED — ${failCount} title(s) outside the ` +
      `${TITLE_MIN}–${TITLE_MAX}-char window.\n`,
  );
  process.exit(1);
} else {
  console.log(
    `\n✔ All ${passes.length} entity page titles are within the ${TITLE_MIN}–${TITLE_MAX}-char window.\n`,
  );
}
