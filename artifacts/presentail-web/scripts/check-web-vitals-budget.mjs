#!/usr/bin/env node
/**
 * check-web-vitals-budget.mjs
 *
 * Audits the built dist/public/index.html for Core Web Vitals regressions:
 *
 *   1. Blocking external scripts: any <script src="..."> without async or
 *      defer (and not type="module", which is deferred by the HTML spec) is a
 *      render-blocking resource that delays LCP and INP. → FAIL
 *
 *   2. Inline CSS size: any <style> block larger than 10 kB in index.html
 *      is a warning — very large inlined CSS can delay first paint on slow
 *      connections. → WARN (not fail)
 *
 *   3. No build-time font preloads: font preload hints are injected
 *      per-request by serve.mjs (filtered by the active language, so Arabic
 *      fonts are only preloaded on /ar-* routes). Any <link rel="preload"
 *      as="font"> baked into the built index.html would be duplicated in
 *      every served response. → FAIL if present
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-web-vitals-budget.mjs [distDir]
 *
 * distDir defaults to <script-dir>/../dist/public
 * Exits 0 on PASS, 1 on FAIL.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../dist/public");

const htmlPath = path.join(distDir, "index.html");

if (!fs.existsSync(htmlPath)) {
  console.error(
    `check-web-vitals-budget: index.html not found at ${htmlPath}\n` +
      `  Make sure the Vite build has run before executing this check.`,
  );
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, "utf8");

const failures = [];
const warnings = [];
const passes = [];

// ---------------------------------------------------------------------------
// Check 1: No blocking external scripts
//
// A <script src="..."> without async, defer, or type="module" is a
// render-blocking resource. type="module" is implicitly deferred by the HTML
// spec. Inline <script> blocks (no src) cannot have defer; they are
// intentionally excluded because small inline blocks (e.g. gtag init, logo
// pruner) don't meaningfully delay rendering.
// ---------------------------------------------------------------------------

// Match all <script> tags that have a src= attribute (external scripts only).
const externalScriptRe = /<script\b([^>]*)>/gi;
let scriptMatch;
while ((scriptMatch = externalScriptRe.exec(html)) !== null) {
  const attrs = scriptMatch[1];

  // Only flag external scripts (those with src= attribute).
  if (!/\bsrc\s*=/.test(attrs)) continue;

  const hasAsync = /\basync\b/i.test(attrs);
  const hasDefer = /\bdefer\b/i.test(attrs);
  const isModule = /\btype\s*=\s*["']module["']/i.test(attrs);

  if (!hasAsync && !hasDefer && !isModule) {
    const tag = `<script${attrs}>`;
    failures.push(
      `  FAIL  Blocking external script found (no async/defer/type=module):\n` +
        `        ${tag.slice(0, 200)}${tag.length > 200 ? "…" : ""}\n` +
        `        Fix: add async or defer attribute, or load via dynamic import().`,
    );
  } else {
    const qualifier = isModule ? "type=module" : hasAsync ? "async" : "defer";
    passes.push(
      `  PASS  External script is non-blocking (${qualifier}): ${attrs.trim().slice(0, 80)}…`,
    );
  }
}

if (failures.length === 0 && passes.length === 0) {
  passes.push("  PASS  No external <script> tags found — no blocking resources.");
} else if (failures.length === 0) {
  passes.push(`  PASS  All ${passes.length} external script(s) are non-blocking.`);
}

// ---------------------------------------------------------------------------
// Check 2: Inline CSS size (warn only, not fail)
//
// Critters / criticalCssPlugin may inline critical CSS for first paint.
// Very large <style> blocks (> 10 kB) can slow down HTML parsing and delay
// first paint on slow connections. This is a warning, not a hard failure,
// because some inlining is desirable.
// ---------------------------------------------------------------------------

const INLINE_CSS_WARN_BYTES = 10 * 1024; // 10 kB
const styleTagRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
let styleMatch;
let totalInlineCssBytes = 0;
while ((styleMatch = styleTagRe.exec(html)) !== null) {
  const cssBytes = Buffer.byteLength(styleMatch[1], "utf8");
  totalInlineCssBytes += cssBytes;
  if (cssBytes > INLINE_CSS_WARN_BYTES) {
    warnings.push(
      `  WARN  Inline <style> block is ${(cssBytes / 1024).toFixed(1)} kB ` +
        `(threshold: ${INLINE_CSS_WARN_BYTES / 1024} kB). Consider reducing critical CSS size.`,
    );
  }
}
if (warnings.length === 0) {
  const kb = (totalInlineCssBytes / 1024).toFixed(1);
  passes.push(
    `  PASS  Inline CSS total: ${kb} kB (under ${INLINE_CSS_WARN_BYTES / 1024} kB threshold)`,
  );
}

// ---------------------------------------------------------------------------
// Check 3: No build-time font preloads
//
// Font preload hints are injected per-request by serve.mjs so the set can be
// filtered by the active language (Arabic woff2 only on /ar-* routes). Any
// font preload baked into the built index.html would appear a second time in
// every served response (duplicate hints) and would preload Arabic fonts on
// English pages. The built index.html must therefore contain none.
// ---------------------------------------------------------------------------

const fontPreloadRe = /<link\b[^>]*\brel\s*=\s*["']preload["'][^>]*\bas\s*=\s*["']font["'][^>]*>/i;
const altFontPreloadRe = /<link\b[^>]*\bas\s*=\s*["']font["'][^>]*\brel\s*=\s*["']preload["'][^>]*>/i;
const hasFontPreload = fontPreloadRe.test(html) || altFontPreloadRe.test(html);

if (hasFontPreload) {
  failures.push(
    `  FAIL  <link rel="preload" as="font"> found in built index.html.\n` +
      `        Font preloads must come only from serve.mjs (per-request,\n` +
      `        language-filtered). A build-time hint duplicates every font in\n` +
      `        the served <head> and preloads Arabic fonts on English pages.\n` +
      `        Fix: remove the build-time font preload injection from vite.config.ts.`,
  );
} else {
  passes.push(
    `  PASS  No build-time font preloads in index.html (injected per-request by serve.mjs).`,
  );
}

// ---------------------------------------------------------------------------
// Report results
// ---------------------------------------------------------------------------

console.log("check-web-vitals-budget results:");
console.log(`  Checked: ${htmlPath}`);
console.log("");

for (const msg of passes) console.log(msg);
for (const msg of warnings) console.warn(msg);

if (failures.length > 0) {
  console.error("\ncheck-web-vitals-budget: FAIL");
  for (const msg of failures) console.error(msg);
  process.exit(1);
}

if (warnings.length > 0) {
  console.log("\ncheck-web-vitals-budget: PASS (with warnings)");
} else {
  console.log("\ncheck-web-vitals-budget: PASS");
}
process.exit(0);
