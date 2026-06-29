#!/usr/bin/env node
/**
 * check-seo-title-length.mjs
 *
 * SEO title-length audit for every static page in the sitemap.
 *
 * The audit window is 30–65 characters — the Google truncation threshold.
 * Any title shorter than 30 or longer than 65 characters is a regression
 * that would hurt SEO visibility.
 *
 * How it works
 * ------------
 * Iterates the full SITEMAP_CITIES × SITEMAP_LANGS × SITEMAP_STATIC_PATHS
 * matrix to build every locale-prefixed pathname (/{lang}-{country}/{city},
 * /{lang}-{country}/{city}/brands, …), calls buildSeoHead() — the same code
 * path serve.mjs uses per request — and asserts each resolved <title> is
 * within 30–65 chars.
 *
 * A coverage assertion verifies the number of audited pages matches the
 * expected count so a future change to the matrix cannot silently shrink
 * coverage.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-seo-title-length.mjs
 *
 * Exits 0 on pass, 1 on any failure.
 */

import { buildSeoHead } from "../seo-inject.mjs";
import {
  SITEMAP_CITIES,
  SITEMAP_LANGS,
  SITEMAP_STATIC_PATHS,
} from "../sitemap.mjs";

const ORIGIN = "https://presentail.com";
const BASE_PATH = "";
const OPTS = { origin: ORIGIN, basePath: BASE_PATH };

const TITLE_MIN = 30;
const TITLE_MAX = 65;

// ------------------------------------------------------------------
// 1. Build the full pathname matrix
// ------------------------------------------------------------------

const pathnames = [];
for (const [country, cities] of Object.entries(SITEMAP_CITIES)) {
  for (const city of cities) {
    for (const lang of SITEMAP_LANGS) {
      for (const staticPath of SITEMAP_STATIC_PATHS) {
        // "/" → "/{lang}-{country}/{city}"  (home, no trailing slash)
        // "/brands" → "/{lang}-{country}/{city}/brands"
        const rest = staticPath === "/" ? "" : staticPath;
        pathnames.push(`/${lang}-${country}/${city}${rest}`);
      }
    }
  }
}

// Coverage assertion: must equal sum(cities) × langs × static-paths.
const totalCities = Object.values(SITEMAP_CITIES).reduce(
  (acc, arr) => acc + arr.length,
  0,
);
const expectedCount =
  totalCities * SITEMAP_LANGS.length * SITEMAP_STATIC_PATHS.length;

if (pathnames.length !== expectedCount) {
  console.error(
    `✖ Coverage mismatch: expected ${expectedCount} paths, got ${pathnames.length}. ` +
      "Update check-seo-title-length.mjs to match SITEMAP_CITIES/LANGS/STATIC_PATHS.",
  );
  process.exit(1);
}

// ------------------------------------------------------------------
// 2. Audit each pathname
// ------------------------------------------------------------------

const failures = [];
const passes = [];

for (const pathname of pathnames) {
  const { title } = buildSeoHead(pathname, OPTS);
  const len = title.length;
  const ok = len >= TITLE_MIN && len <= TITLE_MAX;

  // Decompose for reporting: /{lang}-{country}/{city}[/rest]
  const parts = pathname.split("/"); // ["", "{lang}-{country}", "{city}", ...rest]
  const langCountry = parts[1]; // "en-lb"
  const lang = langCountry.split("-")[0];
  const rest = parts.length <= 3 ? "/" : "/" + parts.slice(3).join("/");

  const record = { pathname, lang, pageType: rest, title, len, ok };
  if (ok) passes.push(record);
  else failures.push(record);
}

// ------------------------------------------------------------------
// 3. Report
// ------------------------------------------------------------------

const total = passes.length + failures.length;
const failCount = failures.length;

console.log(`\nSEO static-page title-length audit`);
console.log(`Window: ${TITLE_MIN}–${TITLE_MAX} chars`);
console.log(`Static paths checked: ${SITEMAP_STATIC_PATHS.join(", ")}`);
console.log(`Languages: ${SITEMAP_LANGS.join(", ")}`);
console.log(
  `Total pages audited: ${total}  |  Passed: ${passes.length}  |  Failed: ${failCount}`,
);

if (failCount > 0) {
  console.error(`\n✖ FAILURES (${failCount}):\n`);
  for (const f of failures) {
    const direction = f.len < TITLE_MIN ? "TOO SHORT" : "TOO LONG";
    console.error(
      `  [${direction}] [${f.lang}] ${f.pageType} — ${f.pathname}\n` +
        `    title (${f.len} chars): "${f.title}"\n`,
    );
  }
  console.error(
    `\n✖ Audit FAILED — ${failCount} page(s) have titles outside the ` +
      `${TITLE_MIN}–${TITLE_MAX}-char window.\n`,
  );
  process.exit(1);
} else {
  // Compact pass summary: pass counts by (page type, lang).
  console.log(`\nPassed by page type and language:`);
  const summary = {};
  for (const p of passes) {
    const key = p.pageType;
    if (!summary[key]) summary[key] = {};
    summary[key][p.lang] = (summary[key][p.lang] ?? 0) + 1;
  }
  for (const [pageType, langCounts] of Object.entries(summary).sort()) {
    const langSummary = SITEMAP_LANGS.map(
      (l) => `${l}:${langCounts[l] ?? 0}`,
    ).join("  ");
    console.log(`  ${pageType.padEnd(12)} ${langSummary}`);
  }
  console.log(
    `\n✔ All ${passes.length} static page titles are within the ${TITLE_MIN}–${TITLE_MAX}-char window.\n`,
  );
}
