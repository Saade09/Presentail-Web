#!/usr/bin/env node
/**
 * check-seo-regression.mjs
 *
 * Automated SEO regression tests for presentail.com.
 * Implements 31 checks across 7 sub-check modules in seo-checks/.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-seo-regression.mjs [base-url]
 *   node artifacts/presentail-web/scripts/check-seo-regression.mjs --base-url https://presentail.com
 *   node artifacts/presentail-web/scripts/check-seo-regression.mjs --dry-run
 *
 * Exits 0 when all checks pass, 1 when any check fails.
 * --dry-run fetches URLs and prints results but does not exit non-zero.
 *
 * Sub-check modules (artifacts/presentail-web/scripts/seo-checks/):
 *   http-status.mjs  — checks 1–5:   HTTP 200 on indexable pages + required files
 *   html-attrs.mjs   — checks 6–9:   <html lang>, <html dir>, <h1> count, h1 entity name
 *   hreflang.mjs     — check  10:    hreflang completeness (FIX: case-insensitive)
 *   meta-tags.mjs    — checks 11–19: meta description, canonical, og tags, robots, title
 *   jsonld.mjs       — checks 20–24: JSON-LD structured data
 *   sitemap.mjs      — checks 25–26: sitemap content checks
 *   redirects.mjs    — checks 27–29: www, trailing-slash, legacy product redirect
 *   llms.mjs         — checks 30–31: llms.txt content-type (FIX), summary paragraph
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

// ── CLI argument parsing ───────────────────────────────────────────────────────

const _baseUrlFlagEq = process.argv.find((a) => a.startsWith("--base-url="))?.slice("--base-url=".length);
const _baseUrlFlagIdx = process.argv.indexOf("--base-url");
const _baseUrlFlagSpace = _baseUrlFlagIdx !== -1 ? process.argv[_baseUrlFlagIdx + 1] : undefined;
const BASE =
  _baseUrlFlagEq ??
  _baseUrlFlagSpace ??
  process.argv.find((a) => a.startsWith("http")) ??
  "https://presentail.com";
const DRY_RUN = process.argv.includes("--dry-run");

// ── Result recorder ───────────────────────────────────────────────────────────

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon}  ${name}`);
  if (detail) console.log(`         ${detail}`);
}

// ── Import sub-check modules ──────────────────────────────────────────────────

const checks = join(__dir, "seo-checks");

const {
  checkHttpStatus,
  checkRobotsTxt,
  checkSitemapHttp,
  checkLlmsTxtHttp,
  checkLlmsFullTxtHttp,
} = await import(join(checks, "http-status.mjs"));

const {
  checkHtmlLang,
  checkHtmlDir,
  checkH1Count,
  checkH1EntityName,
  checkH1TitleCollisions,
} = await import(join(checks, "html-attrs.mjs"));

const { checkHreflangCompleteness } = await import(join(checks, "hreflang.mjs"));

const {
  checkMetaDescription,
  checkCanonical,
  checkOgNonEmpty,
  checkOgTitleEqualsTitle,
  checkOgDescriptionEqualsMetaDesc,
  checkTitleContainsEntityName,
  checkNoindexPrivate,
  checkNoNoindexOnCollections,
  checkProductCanonical,
} = await import(join(checks, "meta-tags.mjs"));

const {
  checkJsonLdPresent,
  checkJsonLdOrganization,
  checkJsonLdBreadcrumb,
  checkJsonLdProduct,
  checkNoFabricatedRating,
} = await import(join(checks, "jsonld.mjs"));

const {
  checkSitemapExcludesPrivate,
  checkSitemapHreflangCoverage,
} = await import(join(checks, "sitemap.mjs"));

const {
  checkWwwRedirect,
  checkTrailingSlashRedirect,
  checkLegacyProductRedirect,
} = await import(join(checks, "redirects.mjs"));

const {
  checkLlmsTxtContentType,
  checkLlmsTxtSummary,
} = await import(join(checks, "llms.mjs"));

// ── Run all 31 checks ─────────────────────────────────────────────────────────

console.log(`\nSEO Regression — ${BASE}`);
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log(`Dry-run: ${DRY_RUN}`);
console.log("─".repeat(72));
console.log();

// ── Group 1: HTTP status (checks 1–5) ─────────────────────────────────────────
console.log("── HTTP Status ─────────────────────────────────────────────────────────");
await checkHttpStatus(BASE, record);        // 1
await checkRobotsTxt(BASE, record);         // 2
await checkSitemapHttp(BASE, record);       // 3
await checkLlmsTxtHttp(BASE, record);       // 4
await checkLlmsFullTxtHttp(BASE, record);   // 5

// ── Group 2: HTML attributes (checks 6–9) ─────────────────────────────────────
console.log("\n── HTML Attributes ─────────────────────────────────────────────────────");
await checkHtmlLang(BASE, record);          // 6
await checkHtmlDir(BASE, record);           // 7
await checkH1Count(BASE, record);           // 8
await checkH1EntityName(BASE, record);      // 9  NEW
await checkH1TitleCollisions(BASE, record); // 10

// ── Group 3: Hreflang (check 10) ──────────────────────────────────────────────
console.log("\n── Hreflang ────────────────────────────────────────────────────────────");
await checkHreflangCompleteness(BASE, record); // 10  FIXED (hreflang-count)

// ── Group 4: Meta tags & OG (checks 11–19) ────────────────────────────────────
console.log("\n── Meta Tags & OG ──────────────────────────────────────────────────────");
await checkMetaDescription(BASE, record);               // 11
await checkCanonical(BASE, record);                     // 12
await checkOgNonEmpty(BASE, record);                    // 13
await checkOgTitleEqualsTitle(BASE, record);            // 14  NEW  (og-title-equals-title)
await checkOgDescriptionEqualsMetaDesc(BASE, record);   // 15  NEW
await checkTitleContainsEntityName(BASE, record);       // 16  NEW
await checkNoindexPrivate(BASE, record);                // 17
await checkNoNoindexOnCollections(BASE, record);        // 18
await checkProductCanonical(BASE, record);              // 19

// ── Group 5: JSON-LD (checks 20–24) ───────────────────────────────────────────
console.log("\n── JSON-LD ─────────────────────────────────────────────────────────────");
await checkJsonLdPresent(BASE, record);        // 20
await checkJsonLdOrganization(BASE, record);   // 21
await checkJsonLdBreadcrumb(BASE, record);     // 22  FIXED (jsonld-breadcrumb)
await checkJsonLdProduct(BASE, record);        // 23  NEW
await checkNoFabricatedRating(BASE, record);   // 24

// ── Group 6: Sitemap (checks 25–26) ───────────────────────────────────────────
console.log("\n── Sitemap ─────────────────────────────────────────────────────────────");
await checkSitemapExcludesPrivate(BASE, record);    // 25
await checkSitemapHreflangCoverage(BASE, record);   // 26

// ── Group 7: Redirects (checks 27–29) ─────────────────────────────────────────
console.log("\n── Redirects ───────────────────────────────────────────────────────────");
await checkWwwRedirect(BASE, record);              // 27
await checkTrailingSlashRedirect(BASE, record);    // 28
await checkLegacyProductRedirect(BASE, record);    // 29  NEW

// ── Group 8: llms.txt (checks 30–31) ──────────────────────────────────────────
console.log("\n── llms.txt ────────────────────────────────────────────────────────────");
await checkLlmsTxtContentType(BASE, record);   // 30  FIXED (llms-txt-content-type)
await checkLlmsTxtSummary(BASE, record);       // 31

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(72));
console.log("CHECK RESULTS SUMMARY");
console.log("═".repeat(72));

let passed = 0;
let failed = 0;
for (const r of results) {
  const icon = r.passed ? "✅" : "❌";
  const status = r.passed ? "PASS" : "FAIL";
  console.log(`${icon} ${status.padEnd(4)}  ${r.name}`);
  if (!r.passed && r.detail) console.log(`             ${r.detail}`);
  if (r.passed) passed++;
  else failed++;
}

console.log("\n" + "─".repeat(72));
console.log(`TOTAL: ${passed} passed, ${failed} failed, ${results.length} total`);
if (failed > 0) {
  console.log(`\nFailed checks:`);
  for (const r of results.filter((r) => !r.passed)) {
    console.log(`  ❌ ${r.name}`);
    if (r.detail) console.log(`     ${r.detail}`);
  }
}
console.log("─".repeat(72) + "\n");

if (!DRY_RUN && failed > 0) {
  process.exit(1);
}
