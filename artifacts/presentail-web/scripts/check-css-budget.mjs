#!/usr/bin/env node
/**
 * check-css-budget.mjs
 *
 * Finds all CSS chunks in dist/public/assets/ and checks their raw and
 * Brotli-compressed sizes against a size budget.
 *
 * Budget:
 *   RAW_BUDGET_KB  — max allowed raw size per CSS file (default 200 KB)
 *   BR_BUDGET_KB   — max allowed Brotli size per CSS file (default 80 KB)
 *
 * Brotli sidecars (.br files) are created by compress-assets.mjs as part of
 * the normal build pipeline.  If no sidecar is present the Brotli budget check
 * is skipped for that file (a warning is printed instead of a hard failure so
 * the check still works on a bare `vite build` without the compress step).
 *
 * Exits 0 on PASS, 1 on FAIL (any file over-budget).
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-css-budget.mjs [distDir]
 *
 * distDir defaults to <script-dir>/../dist/public
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAW_BUDGET_KB = 200;
const BR_BUDGET_KB = 80;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../dist/public");

const assetsDir = path.join(distDir, "assets");

if (!fs.existsSync(assetsDir)) {
  console.error(
    `check-css-budget: assets directory not found at ${assetsDir}\n` +
      `  Make sure the build has run before running this check.`
  );
  process.exit(1);
}

const cssFiles = fs
  .readdirSync(assetsDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => path.join(assetsDir, f));

if (cssFiles.length === 0) {
  console.error(
    `check-css-budget: no CSS files found in ${assetsDir}\n` +
      `  Make sure the Vite build has run.`
  );
  process.exit(1);
}

const RAW_BUDGET_BYTES = RAW_BUDGET_KB * 1024;
const BR_BUDGET_BYTES = BR_BUDGET_KB * 1024;

const fmt = (bytes) => `${(bytes / 1024).toFixed(1).padStart(7)} kB`;

const COL_NAME = 48;
const COL_RAW = 10;
const COL_BR = 10;

const header = [
  "file".padEnd(COL_NAME),
  "raw".padStart(COL_RAW),
  "brotli".padStart(COL_BR),
  "  status",
].join("");

console.log(
  `\ncss-budget report  (budget: ${RAW_BUDGET_KB} kB raw / ${BR_BUDGET_KB} kB brotli per CSS file)`
);
console.log("─".repeat(header.length));
console.log(header);
console.log("─".repeat(header.length));

let overBudget = 0;
let missingBr = 0;

for (const filePath of cssFiles.sort()) {
  const fileName = path.basename(filePath).padEnd(COL_NAME).slice(0, COL_NAME);
  const rawBytes = fs.statSync(filePath).size;
  const brPath = filePath + ".br";
  const brBytes = fs.existsSync(brPath) ? fs.statSync(brPath).size : null;

  const rawOver = rawBytes > RAW_BUDGET_BYTES;
  const brOver = brBytes != null && brBytes > BR_BUDGET_BYTES;
  const over = rawOver || brOver;

  if (over) overBudget++;
  if (brBytes == null) missingBr++;

  const brDisplay = brBytes != null ? fmt(brBytes) : "  (no .br)";
  const status = over
    ? `  ❌ OVER BUDGET${rawOver ? ` (raw ${(rawBytes / 1024).toFixed(1)} kB > ${RAW_BUDGET_KB} kB)` : ""}${brOver ? ` (brotli ${(brBytes / 1024).toFixed(1)} kB > ${BR_BUDGET_KB} kB)` : ""}`
    : "  ✓";

  console.log(
    `${fileName}${fmt(rawBytes).padStart(COL_RAW)}${brDisplay.padStart(COL_BR)}${status}`
  );
}

console.log("─".repeat(header.length));

if (missingBr > 0) {
  console.warn(
    `\nWARN  ${missingBr} CSS file(s) have no .br sidecar — Brotli budget skipped for those files.`
  );
  console.warn(
    `      Run "node compress-assets.mjs" (part of the build script) to generate sidecars.`
  );
}

if (overBudget > 0) {
  console.error(
    `\nFAIL  ${overBudget} CSS file(s) exceed the budget (${RAW_BUDGET_KB} kB raw / ${BR_BUDGET_KB} kB brotli).\n` +
      `      Audit with VITE_VISUALIZE=1 pnpm --filter @workspace/presentail-web run build\n` +
      `      or check which @import / @plugin directives are adding bulk to src/index.css.`
  );
  process.exit(1);
}

console.log(
  `\nPASS  All ${cssFiles.length} CSS file(s) are within the budget (${RAW_BUDGET_KB} kB raw / ${BR_BUDGET_KB} kB brotli).`
);
process.exit(0);
