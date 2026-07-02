#!/usr/bin/env node
/**
 * check-font-files-emitted.mjs
 *
 * Verifies that the four Inter font files (inter-400.woff2, inter-500.woff2,
 * inter-600.woff2, inter-700.woff2) were emitted as separate hashed .woff2
 * files in dist/public/assets/.  If a build-config change accidentally
 * excludes them (e.g. the files are moved or renamed in src/fonts/), the CSS
 * would reference broken URLs and the app would silently fall back to system
 * fonts with no CI failure.
 *
 * What it checks:
 *   - At least four .woff2 files exist in the assets directory.
 *   - Each of the four expected weight names (400, 500, 600, 700) is
 *     represented by exactly one emitted file.
 *
 * Exits 0 on PASS, 1 on FAIL.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-font-files-emitted.mjs [distDir]
 *
 * distDir defaults to <script-dir>/../dist/public
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../dist/public");

const assetsDir = path.join(distDir, "assets");

if (!fs.existsSync(assetsDir)) {
  console.error(
    `check-font-files-emitted: assets directory not found at ${assetsDir}\n` +
      `  Make sure the build has run before running this check.`
  );
  process.exit(1);
}

const EXPECTED_WEIGHTS = ["400", "500", "600", "700"];

const woff2Files = fs
  .readdirSync(assetsDir)
  .filter((f) => f.endsWith(".woff2"));

console.log(`\nfont-files-emitted check  (scanning ${assetsDir})`);
console.log("─".repeat(72));

let failures = 0;

for (const weight of EXPECTED_WEIGHTS) {
  const matches = woff2Files.filter((f) => f.includes(`inter-${weight}`));
  if (matches.length === 1) {
    console.log(`  ✓  inter-${weight}.woff2 → ${matches[0]}`);
  } else if (matches.length === 0) {
    console.error(
      `  ❌ inter-${weight}.woff2 is missing from ${assetsDir}\n` +
        `       Expected a hashed file matching inter-${weight}*.woff2.\n` +
        `       Root cause: the source file src/fonts/inter-${weight}.woff2\n` +
        `       may have been moved, renamed, or accidentally removed from\n` +
        `       the Vite build input.`
    );
    failures++;
  } else {
    console.error(
      `  ❌ inter-${weight}.woff2 matched ${matches.length} files: ${matches.join(", ")}\n` +
        `       Expected exactly one hashed file per weight.`
    );
    failures++;
  }
}

console.log("─".repeat(72));
console.log(`\n  Total .woff2 files found: ${woff2Files.length}`);
console.log(`  Expected weights checked: ${EXPECTED_WEIGHTS.join(", ")}`);

if (failures > 0) {
  console.error(
    `\nFAIL  ${failures} Inter font weight(s) are missing from the build output.\n` +
      `      Missing fonts cause the app to silently fall back to system fonts.\n` +
      `      Check that src/fonts/inter-{400,500,600,700}.woff2 exist and are\n` +
      `      imported (directly or via CSS @font-face) so Vite includes them.`
  );
  process.exit(1);
}

console.log(
  `\nPASS  All four Inter font weights are present as separate hashed .woff2 files.`
);
process.exit(0);
