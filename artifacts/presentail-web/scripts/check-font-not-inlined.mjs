#!/usr/bin/env node
/**
 * check-font-not-inlined.mjs
 *
 * Scans all CSS files in dist/public/assets/ for `data:font/` data URIs and
 * fails if any font has been inlined.  Inlined fonts bloat the CSS bundle,
 * bypass the browser font cache, and indicate that Vite's assetsInlineLimit
 * guard has been broken (e.g. by a misconfigured build option).
 *
 * What it checks:
 *   - Any `data:font/` occurrence in a built CSS file → immediate failure.
 *   - Reports the file name, which font MIME type was inlined, and the
 *     approximate size of the inlined data URI so the root cause is obvious.
 *
 * Exits 0 on PASS, 1 on FAIL.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-font-not-inlined.mjs [distDir]
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
    `check-font-not-inlined: assets directory not found at ${assetsDir}\n` +
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
    `check-font-not-inlined: no CSS files found in ${assetsDir}\n` +
      `  Make sure the Vite build has run.`
  );
  process.exit(1);
}

const DATA_FONT_RE = /data:font\/([a-z0-9+\-.]+);base64,([A-Za-z0-9+/=]+)/g;

let totalInlined = 0;

console.log(`\nfont-not-inlined check  (scanning ${cssFiles.length} CSS file(s))`);
console.log("─".repeat(72));

for (const filePath of cssFiles.sort()) {
  const fileName = path.basename(filePath);
  const css = fs.readFileSync(filePath, "utf8");
  const matches = [...css.matchAll(DATA_FONT_RE)];

  if (matches.length === 0) {
    console.log(`  ✓  ${fileName}`);
    continue;
  }

  for (const m of matches) {
    const mimeType = m[1];
    const b64Data = m[2];
    const approxBytes = Math.round((b64Data.length * 3) / 4);
    const approxKb = (approxBytes / 1024).toFixed(1);

    console.error(
      `  ❌ ${fileName}\n` +
        `       Inlined font detected: data:font/${mimeType};base64,…\n` +
        `       Approximate inlined size: ${approxKb} kB\n` +
        `       Root cause: Vite's assetsInlineLimit is too high, or the font\n` +
        `       file exceeds the configured limit in an unexpected way.\n` +
        `       Fix: ensure assetsInlineLimit in vite.config.ts is set to 0\n` +
        `       (or a value smaller than the smallest font file).`
    );
    totalInlined++;
  }
}

console.log("─".repeat(72));

if (totalInlined > 0) {
  console.error(
    `\nFAIL  ${totalInlined} font(s) are inlined as data URIs in the CSS bundle.\n` +
      `      Inlined fonts bloat the CSS, bypass the browser font cache, and\n` +
      `      push the CSS Brotli size well past the 80 kB budget.\n` +
      `      Check vite.config.ts: assetsInlineLimit must be 0 (or lower than\n` +
      `      the smallest font file in src/fonts/).`
  );
  process.exit(1);
}

console.log(
  `\nPASS  No inlined fonts found — all fonts are emitted as separate hashed files.`
);
process.exit(0);
