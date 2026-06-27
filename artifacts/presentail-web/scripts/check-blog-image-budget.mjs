#!/usr/bin/env node
/**
 * check-blog-image-budget.mjs
 *
 * Blog hero / OG images are referenced from src/data/blogPostsCopy.js and
 * served as static files out of public/blog/.  They are embedded in share-link
 * previews (WhatsApp / iMessage / Slack / Open Graph), so a heavy hero makes
 * every preview slow to load.
 *
 * The image generator only emits PNG, so an unoptimised ~1.5 MB PNG hero can
 * sneak back into the directory the next time a blog post is added.  This check
 * guards against that regression the same way check-chunk-budget guards JS:
 *
 *   - FAIL if any file under public/blog/ exceeds BUDGET_KB kB.
 *   - FAIL if any raster hero is a PNG (heroes must be WebP — much smaller for
 *     photographic content and what the existing heroes were re-encoded to).
 *
 * SVGs (vector, tiny) are exempt from the PNG/format rule but still subject to
 * the size budget.
 *
 * Exits 0 on PASS, 1 on FAIL.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-blog-image-budget.mjs [blogDir]
 *
 * blogDir defaults to <script-dir>/../public/blog
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUDGET_KB = 300;
const BUDGET_BYTES = BUDGET_KB * 1024;

/** Raster image formats that are too heavy for photographic hero/OG images. */
const DISALLOWED_RASTER_EXTS = new Set([".png", ".bmp", ".tiff", ".tif"]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blogDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../public/blog");

if (!fs.existsSync(blogDir)) {
  console.error(
    `check-blog-image-budget: blog directory not found at ${blogDir}`
  );
  process.exit(1);
}

/** @type {string[]} absolute file paths under blogDir (recursive) */
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs);
    else if (entry.isFile()) files.push(abs);
  }
};
walk(blogDir);

if (files.length === 0) {
  console.log(`\nblog-image-budget: no files under ${blogDir} — nothing to check.\n`);
  process.exit(0);
}

const COL_NAME = 52;
const fmt = (bytes) => `${(bytes / 1024).toFixed(1).padStart(7)} kB`;

const header = `${"file".padEnd(COL_NAME)}${"size".padStart(10)}  status`;
console.log(`\nblog-image-budget report  (budget: ${BUDGET_KB} kB per file, no PNG/BMP/TIFF heroes)`);
console.log("─".repeat(header.length + 8));
console.log(header);
console.log("─".repeat(header.length + 8));

/** @type {Array<{ rel: string, reason: string }>} */
const violations = [];

files.sort();
for (const abs of files) {
  const rel = path.relative(blogDir, abs);
  const bytes = fs.statSync(abs).size;
  const ext = path.extname(abs).toLowerCase();

  const overBudget = bytes > BUDGET_BYTES;
  const disallowedFormat = DISALLOWED_RASTER_EXTS.has(ext);

  const problems = [];
  if (disallowedFormat) {
    problems.push(`${ext} not allowed — re-encode as .webp`);
  }
  if (overBudget) {
    problems.push(`exceeds ${BUDGET_KB} kB budget`);
  }

  const name = rel.padEnd(COL_NAME).slice(0, COL_NAME);
  const size = fmt(bytes).padStart(10);
  const status = problems.length > 0 ? `  ❌ ${problems.join("; ")}` : "  ✓";
  console.log(`${name}${size}${status}`);

  if (problems.length > 0) {
    violations.push({ rel, reason: problems.join("; ") });
  }
}

console.log("─".repeat(header.length + 8));

if (violations.length > 0) {
  console.error(
    `\nFAIL  ${violations.length} blog image(s) violate the budget:\n` +
      violations.map((v) => `  ❌  ${v.rel} — ${v.reason}`).join("\n") +
      `\n\n      Blog heroes must avoid heavy raster formats (use WebP) and stay under ${BUDGET_KB} kB so share-link\n` +
      `      previews load fast.  Re-encode the offending file(s), e.g.:\n` +
      `        cwebp -q 80 hero.png -o hero.webp\n`
  );
  process.exit(1);
}

console.log(
  `\nPASS  All ${files.length} blog image(s) are WebP and within the ${BUDGET_KB} kB budget.\n`
);
process.exit(0);
