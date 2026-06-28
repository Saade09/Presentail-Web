#!/usr/bin/env node
/**
 * check-chunk-budget.mjs
 *
 * Reads the Vite build manifest and the pre-compressed Brotli sidecars to
 * produce a human-readable coverage report:
 *
 *   - Which JS chunks load INSTANTLY (statically reachable from the entry)
 *   - Which JS chunks load ON-DEMAND (only reachable via dynamic imports)
 *   - Raw size, Brotli-compressed size, and whether the chunk exceeds the budget
 *
 * Budget: no single JS chunk may exceed BUDGET_KB kB Brotli-compressed.
 *
 * Lazy-only guard: chunks listed in MUST_BE_LAZY must NOT appear in the
 * instant (statically-reachable) set.  A regression (e.g. accidentally
 * importing a lazy component statically) causes an immediate FAIL so CI
 * catches the ~42 kB regression before it ships.
 *
 * Exits 0 on PASS, 1 on FAIL (over-budget or lazy-guard violations found).
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-chunk-budget.mjs [distDir]
 *
 * distDir defaults to <script-dir>/../dist/public
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUDGET_KB = 200;

/**
 * Chunk names (manualChunks keys) that must NEVER appear in the instant
 * (statically-reachable) set.  Any chunk here is expected to be loaded only
 * via a dynamic import; a static-import path is a performance regression.
 *
 * vendor-phone: react-phone-number-input / libphonenumber-js
 *   lazily loaded via LazyWebPhoneField (React.lazy).  Ending up in the instant
 *   set would add ~42 kB Brotli to every first page load.
 *   (country-flag-icons is intentionally excluded from this chunk — CountryFlag.tsx
 *   is used by always-loaded components and belongs in the instant bundle.)
 */
const MUST_BE_LAZY = new Set(["vendor-phone"]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../dist/public");

const manifestPath = path.join(distDir, ".vite/manifest.json");

if (!fs.existsSync(manifestPath)) {
  console.error(
    `check-chunk-budget: manifest not found at ${manifestPath}\n` +
      `  Make sure "build.manifest: true" is set in vite.config.ts and the build has run.`
  );
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// ---------------------------------------------------------------------------
// Build the module graph from the manifest.
// Each manifest entry looks like:
//   { file, src?, isEntry?, isDynamicEntry?, imports?, dynamicImports?, css? }
// ---------------------------------------------------------------------------

/** @type {Map<string, string>} manifestKey → output filename (relative to distDir) */
const keyToFile = new Map();
/** @type {Map<string, string>} manifestKey → chunk name (manualChunks key) */
const keyToName = new Map();
/** @type {Map<string, string[]>} manifestKey → static-import manifest keys */
const staticImports = new Map();
/** @type {Map<string, string[]>} manifestKey → dynamic-import manifest keys */
const dynamicImports = new Map();
/** @type {Set<string>} manifest keys that are entry points */
const entryKeys = new Set();

for (const [key, entry] of Object.entries(manifest)) {
  keyToFile.set(key, entry.file);
  if (entry.name) keyToName.set(key, entry.name);
  staticImports.set(key, entry.imports ?? []);
  dynamicImports.set(key, entry.dynamicImports ?? []);
  if (entry.isEntry) entryKeys.add(key);
}

// ---------------------------------------------------------------------------
// BFS from entry points following only static imports → "instant" set.
// ---------------------------------------------------------------------------

/** @type {Set<string>} manifest keys reachable via static imports only */
const instantKeys = new Set();

const queue = [...entryKeys];
while (queue.length > 0) {
  const key = queue.shift();
  if (instantKeys.has(key)) continue;
  instantKeys.add(key);
  for (const dep of staticImports.get(key) ?? []) {
    if (!instantKeys.has(dep)) queue.push(dep);
  }
}

// ---------------------------------------------------------------------------
// Lazy-only guard: assert that MUST_BE_LAZY chunks are not in the instant set.
// ---------------------------------------------------------------------------

/** @type {Array<{ name: string, file: string }>} chunks that violated the guard */
const lazyViolations = [];

for (const key of instantKeys) {
  const name = keyToName.get(key);
  if (name && MUST_BE_LAZY.has(name)) {
    lazyViolations.push({ name, file: keyToFile.get(key) ?? key });
  }
}

if (lazyViolations.length > 0) {
  console.error("\nLAZY-ONLY GUARD VIOLATIONS:");
  for (const v of lazyViolations) {
    console.error(
      `  ❌  "${v.name}" (${v.file}) is statically reachable from the entry chunk.`
    );
    console.error(
      `      It must only be loaded via a dynamic import (React.lazy / import()).`
    );
    console.error(
      `      Check for a static import of the component that uses this chunk.`
    );
  }
  console.error(
    `\nFAIL  ${lazyViolations.length} chunk(s) that must be lazy are in the instant (eager) bundle.\n`
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Collect every JS chunk and measure sizes.
// ---------------------------------------------------------------------------

/** @type {Array<{ key, file, rawBytes, brBytes, instant }>} */
const chunks = [];

for (const [key, file] of keyToFile) {
  if (!file.endsWith(".js")) continue;
  const absPath = path.join(distDir, file);
  const brPath = absPath + ".br";

  if (!fs.existsSync(absPath)) continue;

  const rawBytes = fs.statSync(absPath).size;
  const brBytes = fs.existsSync(brPath) ? fs.statSync(brPath).size : null;

  chunks.push({
    key,
    file,
    rawBytes,
    brBytes,
    instant: instantKeys.has(key),
  });
}

if (chunks.length === 0) {
  console.error(
    "check-chunk-budget: no JS chunks found in manifest — was the build run?"
  );
  process.exit(1);
}

// Sort: instant first, then by brotli size descending.
chunks.sort((a, b) => {
  if (a.instant !== b.instant) return a.instant ? -1 : 1;
  return (b.brBytes ?? b.rawBytes) - (a.brBytes ?? a.rawBytes);
});

// ---------------------------------------------------------------------------
// Print the report.
// ---------------------------------------------------------------------------

const fmt = (bytes) =>
  bytes == null ? "  (no .br)" : `${(bytes / 1024).toFixed(1).padStart(7)} kB`;

const BUDGET_BYTES = BUDGET_KB * 1024;

const COL_NAME = 52;
const COL_RAW = 10;
const COL_BR = 10;

const header = [
  "chunk".padEnd(COL_NAME),
  "raw".padStart(COL_RAW),
  "brotli".padStart(COL_BR),
  "  load",
  "  status",
].join("");

console.log(`\nchunk-budget report  (budget: ${BUDGET_KB} kB brotli per JS chunk)`);
console.log("─".repeat(header.length));
console.log(header);
console.log("─".repeat(header.length));

let overBudget = 0;

for (const c of chunks) {
  const name = path.basename(c.file).padEnd(COL_NAME).slice(0, COL_NAME);
  const raw = fmt(c.rawBytes).padStart(COL_RAW);
  const br = fmt(c.brBytes).padStart(COL_BR);
  const load = c.instant ? "  instant" : "  on-demand";
  const over = c.brBytes != null && c.brBytes > BUDGET_BYTES;
  const status = over ? "  ❌ OVER BUDGET" : "  ✓";

  if (over) overBudget++;

  console.log(`${name}${raw}${br}${load}${status}`);
}

console.log("─".repeat(header.length));

const instantChunks = chunks.filter((c) => c.instant);
const onDemandChunks = chunks.filter((c) => !c.instant);
const totalInstantBr = instantChunks.reduce((s, c) => s + (c.brBytes ?? 0), 0);
const totalOnDemandBr = onDemandChunks.reduce(
  (s, c) => s + (c.brBytes ?? 0),
  0
);

console.log(
  `\nInstant  chunks: ${String(instantChunks.length).padStart(3)}   total brotli: ${(totalInstantBr / 1024).toFixed(1)} kB`
);
console.log(
  `On-demand chunks: ${String(onDemandChunks.length).padStart(3)}   total brotli: ${(totalOnDemandBr / 1024).toFixed(1)} kB`
);
console.log(
  `Coverage: ${((totalInstantBr / (totalInstantBr + totalOnDemandBr)) * 100).toFixed(1)}% of JS bytes load instantly\n`
);

if (overBudget > 0) {
  console.error(
    `FAIL  ${overBudget} chunk(s) exceed the ${BUDGET_KB} kB brotli budget.\n` +
      `      Split large chunks via manualChunks in vite.config.ts or use lazy imports.`
  );
  process.exit(1);
}

console.log(`PASS  All ${chunks.length} chunks are within the ${BUDGET_KB} kB brotli budget.`);
process.exit(0);
