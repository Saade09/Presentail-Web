#!/usr/bin/env node
/**
 * check-font-face-declarations.mjs
 *
 * Parses every CSS file in dist/public/assets/ and verifies that all
 * expected @font-face declarations are present for each font family.
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
 *   - For each font family in EXPECTED_FONTS, every listed (weight, style)
 *     variant appears as a matching @font-face block whose `font-family`
 *     matches (case-insensitive), `font-weight` matches, and `font-style`
 *     matches.  Tracking both dimensions catches silent browser synthesis of
 *     italic variants when only the italic @font-face rule is dropped while
 *     the .woff2 file still exists in the build output.
 *
 *   Fonts and variants checked (weight / style):
 *     Inter              400/normal, 500/normal, 600/normal, 700/normal
 *     Noto Naskh Arabic  400/normal, 700/normal
 *     Playfair Display   400/normal, 700/normal
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

/**
 * Return the font-style value from a @font-face block body.
 * Defaults to "normal" when the declaration is absent (matching browser
 * behaviour: omitting font-style is equivalent to font-style: normal).
 */
function getFontStyle(block) {
  const m = block.match(/font-style\s*:\s*([\w-]+)\s*[;}/]/);
  return m ? m[1].toLowerCase() : "normal";
}

/**
 * A variant is a { weight, style } pair that must appear as a @font-face
 * block for a given font family.
 *
 * Map of font-family (lowercase) → array of required variants.
 * style defaults to "normal"; only list "italic" where an explicit italic
 * @font-face rule exists in src/index.css (browser synthesis is not
 * acceptable for shipped fonts).
 */
const EXPECTED_FONTS = {
  inter: [
    { weight: "400", style: "normal" },
    { weight: "500", style: "normal" },
    { weight: "600", style: "normal" },
    { weight: "700", style: "normal" },
  ],
  "noto naskh arabic": [
    { weight: "400", style: "normal" },
    { weight: "700", style: "normal" },
  ],
  "playfair display": [
    { weight: "400", style: "normal" },
    { weight: "700", style: "normal" },
  ],
};

/** Display names for PASS/FAIL messages (preserves original capitalisation). */
const DISPLAY_NAME = {
  inter: "Inter",
  "noto naskh arabic": "Noto Naskh Arabic",
  "playfair display": "Playfair Display",
};

/**
 * foundVariants[family]["400|normal"] = true when that @font-face block was seen.
 * Key format: "<weight>|<style>"
 */
const foundVariants = {};
for (const family of Object.keys(EXPECTED_FONTS)) {
  foundVariants[family] = {};
}

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
    const style = getFontStyle(block);
    if (family && weight && family in foundVariants) {
      foundVariants[family][`${weight}|${style}`] = true;
    }
  }
}

console.log(
  `\nfont-face-declarations check  (scanned ${totalCssFiles} CSS file(s), ${totalBlocks} @font-face block(s))`
);
console.log("─".repeat(72));

let failures = 0;

for (const [familyKey, expectedVariants] of Object.entries(EXPECTED_FONTS)) {
  const displayName = DISPLAY_NAME[familyKey];
  for (const { weight, style } of expectedVariants) {
    const key = `${weight}|${style}`;
    if (foundVariants[familyKey][key]) {
      console.log(
        `  ✓  ${displayName} font-weight: ${weight}, font-style: ${style} declared in @font-face`
      );
    } else {
      console.error(
        `  ❌ ${displayName} font-weight: ${weight}, font-style: ${style} is missing from all @font-face blocks\n` +
          `       Expected a @font-face { font-family: '${displayName}'; font-weight: ${weight}; font-style: ${style}; … }\n` +
          `       declaration somewhere in the built CSS.\n` +
          `       Root cause: the @font-face rule for ${displayName} weight ${weight} ${style} may have been\n` +
          `       removed from src/index.css, or stripped by a CSS processing step.\n` +
          `       Without it the browser synthesises the ${style} variant from the normal weight,\n` +
          `       silently degrading rendering quality and never downloading the matching .woff2 file.`
      );
      failures++;
    }
  }
}

console.log("─".repeat(72));

for (const [familyKey, expectedVariants] of Object.entries(EXPECTED_FONTS)) {
  const displayName = DISPLAY_NAME[familyKey];
  const found = Object.keys(foundVariants[familyKey]).sort().join(", ") || "(none)";
  const expected = expectedVariants.map((v) => `${v.weight}/${v.style}`).join(", ");
  console.log(
    `  ${displayName}: found variants [${found}]  expected [${expected}]`
  );
}

if (failures > 0) {
  console.error(
    `\nFAIL  ${failures} font-face declaration(s) are missing.\n` +
      `      The .woff2 file(s) may still exist in the build output, but without\n` +
      `      a matching @font-face rule the browser will never request them\n` +
      `      (normal variants) or will silently synthesise them (italic variants).\n` +
      `      Restore the missing rule(s) in src/index.css.`
  );
  process.exit(1);
}

const summary = [
  "Inter (400–700 normal)",
  "Noto Naskh Arabic (400, 700 normal)",
  "Playfair Display (400, 700 normal)",
].join(", ");
console.log(`\nPASS  All expected font-face declarations found for ${summary}.`);
process.exit(0);
