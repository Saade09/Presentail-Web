#!/usr/bin/env node
/**
 * check-contact-title-length.mjs
 *
 * SEO title-length audit for every /contact page in the sitemap.
 *
 * The audit window is 30–65 characters — the same bounds enforced by
 * buildContactSeo() in src/lib/seo.mjs. Any title shorter than 30 or longer
 * than 65 characters is a regression that would hurt SEO score.
 *
 * How it works
 * ------------
 * 1. Generate the sitemap XML via buildSitemapXml() — the same function
 *    serve.mjs delegates to, so the URL set is authoritative. No catalog data
 *    is needed: contact pages are static locale-city entries that appear
 *    regardless of product/brand/occasion counts.
 * 2. Extract every <loc> entry from the XML that ends with "/contact".
 * 3. Strip the origin prefix to obtain a server pathname, then call
 *    buildSeoHead() — the same code path serve.mjs uses per request — and
 *    read back the resolved <title>.
 * 4. Assert each title is within the 30–65-char window. Exit 0 on full pass,
 *    exit 1 with a detailed failure report if any title is out of range.
 *
 * Running against sitemap output (rather than SITEMAP_CITIES arrays directly)
 * means the check automatically inherits any future changes to sitemap
 * filtering (e.g. cities removed, slug changes, path format changes) so the
 * audit surface stays in sync with what crawlers actually discover.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-contact-title-length.mjs
 *
 * Exits 0 on pass, 1 on any failure.
 */

import { buildSeoHead } from "../seo-inject.mjs";
import { buildSitemapXml } from "../sitemap.mjs";

const ORIGIN = "https://presentail.com";
const BASE_PATH = "";
const OPTS = { origin: ORIGIN, basePath: BASE_PATH };

const TITLE_MIN = 30;
const TITLE_MAX = 65;

// ------------------------------------------------------------------
// 1. Generate the sitemap and extract contact-page <loc> entries
// ------------------------------------------------------------------

// Empty catalog is sufficient: /contact entries are static locale-city paths.
const sitemapXml = buildSitemapXml({ origin: ORIGIN, basePath: BASE_PATH });

// Extract every <loc>…</loc> value.
const locMatches = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)];
const contactLocs = locMatches
  .map((m) => m[1])
  .filter((url) => url.endsWith("/contact"));

if (contactLocs.length === 0) {
  console.error(
    "✖ No /contact URLs found in the generated sitemap. " +
      "Check SITEMAP_STATIC_PATHS in sitemap.mjs.",
  );
  process.exit(1);
}

// ------------------------------------------------------------------
// 2. Audit each contact URL
// ------------------------------------------------------------------

const failures = [];
const passes = [];

for (const url of contactLocs) {
  // Strip origin+basePath prefix to get the pathname (/en-lb/beirut/contact).
  const pathname = url.slice((ORIGIN + BASE_PATH).length) || "/";
  const { title } = buildSeoHead(pathname, OPTS);
  const len = title.length;
  const ok = len >= TITLE_MIN && len <= TITLE_MAX;
  const record = { url, pathname, title, len, ok };
  if (ok) passes.push(record);
  else failures.push(record);
}

// ------------------------------------------------------------------
// 3. Report
// ------------------------------------------------------------------

const total = passes.length + failures.length;
const failCount = failures.length;

console.log(`\nSEO contact-page title-length audit`);
console.log(`Window: ${TITLE_MIN}–${TITLE_MAX} chars`);
console.log(
  `Sitemap contact URLs: ${total}  |  Passed: ${passes.length}  |  Failed: ${failCount}`,
);

if (failCount > 0) {
  console.error(`\n✖ FAILURES (${failCount}):\n`);
  for (const f of failures) {
    const direction = f.len < TITLE_MIN ? "TOO SHORT" : "TOO LONG";
    console.error(
      `  [${direction}] ${f.pathname}\n` +
        `    title (${f.len} chars): "${f.title}"\n`,
    );
  }
  console.error(
    `\n✖ Audit FAILED — ${failCount} page(s) have titles outside the ` +
      `${TITLE_MIN}–${TITLE_MAX}-char window.\n`,
  );
  process.exit(1);
} else {
  console.log(
    `\n✔ All ${passes.length} contact page titles are within the ${TITLE_MIN}–${TITLE_MAX}-char window.\n`,
  );
}
