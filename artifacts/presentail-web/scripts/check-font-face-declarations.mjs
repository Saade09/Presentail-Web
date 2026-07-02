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
 *   - For each font family in EXPECTED_FONTS, every listed weight appears as
 *     a `font-weight` value inside at least one `@font-face` block whose
 *     `font-family` matches (case-insensitive).
 *
 *   Fonts and weights checked:
 *     Inter              400, 500, 600, 700
 *     Noto Naskh Arabic  400, 700
 *     Roboto             400, 500
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
 * Map of font-family (lowercase, as it appears in font-family declarations)
 * to the array of font-weight values that must each appear in at least one
 * @font-face block for that family.
 */
const EXPECTED_FONTS = {
  inter: ["400", "500", "600", "700"],
  "noto naskh arabic": ["400", "700"],
  roboto: ["400", "500"],
};

/** Display names for PASS/FAIL messages (preserves original capitalisation). */
const DISPLAY_NAME = {
  inter: "Inter",
  "noto naskh arabic": "Noto Naskh Arabic",
  roboto: "Roboto",
};

/** foundWeights["inter"]["400"] = true when that block was seen. */
const foundWeights = {};
for (const family of Object.keys(EXPECTED_FONTS)) {
  foundWeights[family] = {};
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
    if (family && weight && family in foundWeights) {
      foundWeights[family][weight] = true;
    }
  }
}

console.log(
  `\nfont-face-declarations check  (scanned ${totalCssFiles} CSS file(s), ${totalBlocks} @font-face block(s))`
);
console.log("─".repeat(72));

let failures = 0;

for (const [familyKey, expectedWeights] of Object.entries(EXPECTED_FONTS)) {
  const displayName = DISPLAY_NAME[familyKey];
  for (const weight of expectedWeights) {
    if (foundWeights[familyKey][weight]) {
      console.log(
        `  ✓  ${displayName} font-weight: ${weight} declared in @font-face`
      );
    } else {
      console.error(
        `  ❌ ${displayName} font-weight: ${weight} is missing from all @font-face blocks\n` +
          `       Expected a @font-face { font-family: '${displayName}'; font-weight: ${weight}; … }\n` +
          `       declaration somewhere in the built CSS.\n` +
          `       Root cause: the @font-face rule for ${displayName} weight ${weight} may have been\n` +
          `       removed from src/index.css, or stripped by a CSS processing step.\n` +
          `       The browser will never download the matching .woff2 file and will\n` +
          `       silently fall back to the system font for that weight.`
      );
      failures++;
    }
  }
}

console.log("─".repeat(72));

for (const [familyKey, expectedWeights] of Object.entries(EXPECTED_FONTS)) {
  const displayName = DISPLAY_NAME[familyKey];
  const found = Object.keys(foundWeights[familyKey]).sort().join(", ") || "(none)";
  console.log(
    `  ${displayName}: found weights [${found}]  expected [${expectedWeights.join(", ")}]`
  );
}

if (failures > 0) {
  console.error(
    `\nFAIL  ${failures} font-weight declaration(s) are missing from @font-face CSS blocks.\n` +
      `      The .woff2 file(s) may still exist in the build output, but without\n` +
      `      a matching @font-face rule the browser will never request them.\n` +
      `      Restore the missing rule(s) in src/index.css.`
  );
  process.exit(1);
}

console.log(
  `\nPASS  All expected font-face declarations found for Inter (400, 500, 600, 700),` +
    ` Noto Naskh Arabic (400, 700), and Roboto (400, 500).`
);
process.exit(0);
