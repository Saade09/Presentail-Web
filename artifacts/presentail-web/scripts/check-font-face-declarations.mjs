#!/usr/bin/env node
/**
 * check-font-face-declarations.mjs
 *
 * Parses every CSS file in dist/public/assets/ and verifies that all four
 * Inter font weights (400, 500, 600, 700) appear as `font-weight` values
 * inside `@font-face` blocks.
 *
 * Why this is a separate check from check-font-files-emitted.mjs:
 *   The font-files check confirms the .woff2 files were emitted into the
 *   build output. This check closes a distinct failure mode: a @font-face
 *   rule could be dropped from the CSS (e.g. accidentally deleted in
 *   index.css or stripped by a PostCSS/Tailwind pass) while the .woff2 file
 *   still sits in the assets directory. The browser would never download that
 *   weight, silently falling back to the system font. Only this check catches
 *   that gap.
 *
 * What it checks:
 *   - At least one CSS file exists in the assets directory.
 *   - Each of the four Inter weights (400, 500, 600, 700) appears as a
 *     `font-weight` value inside at least one `@font-face` block whose
 *     `font-family` is "Inter" (case-insensitive).
 *
 * Exits 0 on PASS, 1 on FAIL.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-font-face-declarations.mjs [distDir]
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
    `check-font-face-declarations: assets directory not found at ${assetsDir}\n` +
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
    `check-font-face-declarations: no CSS files found in ${assetsDir}\n` +
      `  Make sure the Vite build has run.`
  );
  process.exit(1);
}

/**
 * Extract all @font-face blocks from a CSS string.
 * Returns an array of block body strings (the content between { and }).
 *
 * The regex handles multi-line blocks; each block is returned as a raw
 * substring so we can inspect individual declarations inside it.
 */
function extractFontFaceBlocks(css) {
  const blocks = [];
  const re = /@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

/**
 * Return the font-family value from a @font-face block body, or null if
 * the declaration is absent.  Matches both quoted and unquoted values.
 */
function getFontFamily(block) {
  const m = block.match(/font-family\s*:\s*['"]?([^'";]+?)['"]?\s*[;}/]/);
  return m ? m[1].trim().toLowerCase() : null;
}

/**
 * Return the font-weight value from a @font-face block body, or null if
 * absent.  Only matches single numeric values (not ranges like "400 700").
 */
function getFontWeight(block) {
  const m = block.match(/font-weight\s*:\s*(\d+)\s*[;}/]/);
  return m ? m[1] : null;
}

const EXPECTED_WEIGHTS = ["400", "500", "600", "700"];

const foundWeights = new Set();

let totalCssFiles = 0;
let totalBlocks = 0;

for (const filePath of cssFiles.sort()) {
  const css = fs.readFileSync(filePath, "utf8");
  const blocks = extractFontFaceBlocks(css);
  totalCssFiles++;
  totalBlocks += blocks.length;

  for (const block of blocks) {
    const family = getFontFamily(block);
    const weight = getFontWeight(block);
    if (family === "inter" && weight) {
      foundWeights.add(weight);
    }
  }
}

console.log(`\nfont-face-declarations check  (scanned ${totalCssFiles} CSS file(s), ${totalBlocks} @font-face block(s))`);
console.log("─".repeat(72));

let failures = 0;

for (const weight of EXPECTED_WEIGHTS) {
  if (foundWeights.has(weight)) {
    console.log(`  ✓  Inter font-weight: ${weight} declared in @font-face`);
  } else {
    console.error(
      `  ❌ Inter font-weight: ${weight} is missing from all @font-face blocks\n` +
        `       Expected a @font-face { font-family: 'Inter'; font-weight: ${weight}; … }\n` +
        `       declaration somewhere in the built CSS.\n` +
        `       Root cause: the @font-face rule for weight ${weight} may have been\n` +
        `       removed from src/index.css, or stripped by a CSS processing step.\n` +
        `       The browser will never download inter-${weight}.woff2 and will\n` +
        `       silently fall back to the system font for that weight.`
    );
    failures++;
  }
}

console.log("─".repeat(72));
console.log(`\n  Weights found in @font-face blocks: ${[...foundWeights].sort().join(", ") || "(none)"}`);
console.log(`  Expected weights: ${EXPECTED_WEIGHTS.join(", ")}`);

if (failures > 0) {
  console.error(
    `\nFAIL  ${failures} Inter font weight(s) are missing from @font-face CSS declarations.\n` +
      `      The .woff2 file(s) may still exist in the build output, but without\n` +
      `      a matching @font-face rule the browser will never request them.\n` +
      `      Restore the missing rule(s) in src/index.css.`
  );
  process.exit(1);
}

console.log(
  `\nPASS  All four Inter font weights (400, 500, 600, 700) are declared in @font-face blocks.`
);
process.exit(0);
