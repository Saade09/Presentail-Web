#!/usr/bin/env node
/**
 * check-public-font-budget.mjs
 *
 * Every woff2 file under src/fonts/ is processed by Vite at build time and
 * served as a content-hashed asset.  A bloated font file silently adds KBs
 * to every page load.  This script enforces per-font size budgets so a new
 * font weight or an oversized subset is caught in CI before it ships.
 *
 * Budget tiers (calibrated to sit above each font's current size with ~30 %
 * headroom so existing files pass while clear regressions fail):
 *   - Latin-subset fonts (Inter, Playfair Display, Roboto italic): ≤ 30 kB
 *   - Roboto regular (wider glyph coverage):                       ≤ 50 kB
 *   - Arabic-script fonts (Noto Naskh Arabic):                     ≤ 60 kB
 *
 * Exits 0 on PASS, 1 on FAIL.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-public-font-budget.mjs [fontsDir]
 *
 * fontsDir defaults to <script-dir>/../src/fonts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Default budget in kB applied to every woff2 file unless overridden below.
 * Sized for Latin-subset fonts (Inter, Playfair Display, Roboto italic).
 */
const DEFAULT_BUDGET_KB = 30;

/**
 * Per-filename-prefix overrides (matched against the bare filename, without
 * directory).  Keys are lowercased; matching is prefix-based so
 * "noto-naskh-arabic" catches both weights.
 */
const PREFIX_BUDGET_KB = {
  "noto-naskh-arabic": 60,
  "roboto-400.woff2": 50,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../src/fonts");

if (!fs.existsSync(fontsDir)) {
  console.error(
    `check-public-font-budget: fonts directory not found at ${fontsDir}`
  );
  process.exit(1);
}

/** @type {string[]} absolute woff2 paths under fontsDir */
const files = fs
  .readdirSync(fontsDir, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".woff2"))
  .map((e) => path.join(fontsDir, e.name))
  .sort();

if (files.length === 0) {
  console.log(
    `\nfont-budget: no woff2 files under ${fontsDir} — nothing to check.\n`
  );
  process.exit(0);
}

/**
 * Resolve the budget for a given filename by checking PREFIX_BUDGET_KB
 * entries in insertion order, returning DEFAULT_BUDGET_KB if none match.
 * @param {string} name  bare filename (e.g. "noto-naskh-arabic-400.woff2")
 * @returns {number} budget in kB
 */
const budgetFor = (name) => {
  const lower = name.toLowerCase();
  for (const [prefix, kb] of Object.entries(PREFIX_BUDGET_KB)) {
    if (lower.startsWith(prefix) || lower === prefix) return kb;
  }
  return DEFAULT_BUDGET_KB;
};

const COL_NAME = 40;
const fmt = (bytes) => `${(bytes / 1024).toFixed(1).padStart(7)} kB`;
const budgetSummary = `latin ≤${DEFAULT_BUDGET_KB} kB, roboto-400 ≤50 kB, arabic ≤60 kB`;

const header = `${"file".padEnd(COL_NAME)}${"size".padStart(10)}  ${"budget".padStart(9)}  status`;
console.log(`\nfont-budget report  (${budgetSummary})`);
console.log("─".repeat(header.length + 4));
console.log(header);
console.log("─".repeat(header.length + 4));

/** @type {Array<{ name: string, reason: string }>} */
const violations = [];

for (const abs of files) {
  const name = path.basename(abs);
  const bytes = fs.statSync(abs).size;
  const budgetKb = budgetFor(name);
  const budgetBytes = budgetKb * 1024;
  const over = bytes > budgetBytes;

  const col = name.padEnd(COL_NAME).slice(0, COL_NAME);
  const size = fmt(bytes);
  const budget = `≤${budgetKb} kB`.padStart(9);
  const status = over
    ? `  ❌ exceeds ${budgetKb} kB budget`
    : "  ✓";
  console.log(`${col}${size}  ${budget}${status}`);

  if (over) {
    violations.push({
      name,
      reason: `${(bytes / 1024).toFixed(1)} kB exceeds ${budgetKb} kB budget`,
    });
  }
}

console.log("─".repeat(header.length + 4));

if (violations.length > 0) {
  console.error(
    `\nFAIL  ${violations.length} font file(s) violate the budget:\n` +
      violations.map((v) => `  ❌  ${v.name} — ${v.reason}`).join("\n") +
      `\n\n      Oversized fonts slow every page load.  Subset the font with pyftsubset\n` +
      `      or fonttools, or request a narrower unicode-range from Google Fonts:\n` +
      `        pyftsubset font.woff2 --unicodes="U+0000-00FF" --flavor=woff2 \\\n` +
      `          --output-file=font-subset.woff2\n` +
      `      If the size is justified (e.g. a new script range), raise the matching\n` +
      `      PREFIX_BUDGET_KB entry in this script and document the reason.\n`
  );
  process.exit(1);
}

console.log(
  `\nPASS  All ${files.length} font file(s) are within their per-font budget.\n`
);
process.exit(0);
