#!/usr/bin/env node
/**
 * check-public-image-budget.mjs
 *
 * Every image under public/ is shipped verbatim and served as a static asset
 * (logos, favicons/app icons, the OG default, catalog thumbnails, blog heroes,
 * marketing images).  A single oversized file slows page loads or — for images
 * embedded in share-link previews (Open Graph / WhatsApp / iMessage / Slack) —
 * makes every preview slow to fetch.  The chunk-budget check guards JS; this is
 * the equivalent guard for static images.
 *
 * It generalises the old check-blog-image-budget.mjs (which only scanned
 * public/blog/) to the whole public/ tree, with a PER-FORMAT byte budget so a
 * photographic catalog image is held to a different ceiling than a tiny icon.
 *
 * Rules:
 *   - FAIL if any image exceeds the budget for its format (see FORMAT_BUDGET_KB).
 *   - FAIL if any file under public/blog/ is a disallowed raster format
 *     (PNG/BMP/TIFF) — blog heroes are embedded in share previews and must be
 *     WebP (much smaller for photographic content).  This is the stricter
 *     blog-only subset folded in from the previous dedicated check.
 *   - Files in ALLOWLIST are reported but never fail the build (documented
 *     legacy exceptions).
 *
 * Non-image files are ignored.  SVGs (vector) are subject only to the size
 * budget, not the blog raster-format rule.
 *
 * Exits 0 on PASS, 1 on FAIL.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-public-image-budget.mjs [publicDir]
 *
 * publicDir defaults to <script-dir>/../public
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Per-format size budgets in kB.  Calibrated to sit above the current largest
 * file of each format so existing assets pass, while still catching a clear
 * regression (e.g. an unoptimised 1 MB+ export).  Photographic formats
 * (webp/avif/jpg) get a higher ceiling than icons (png/ico/gif/svg).
 */
const FORMAT_BUDGET_KB = {
  ".webp": 700,
  ".avif": 700,
  ".jpg": 300,
  ".jpeg": 300,
  ".png": 256,
  ".gif": 256,
  ".svg": 64,
  ".ico": 64,
  ".bmp": 256,
  ".tiff": 256,
  ".tif": 256,
};

/** All extensions we treat as images (everything else under public/ is ignored). */
const IMAGE_EXTS = new Set(Object.keys(FORMAT_BUDGET_KB));

/** Stricter budget (kB) for blog hero/OG images embedded in share previews. */
const BLOG_BUDGET_KB = 300;

/** Raster formats too heavy for photographic blog hero/OG images. */
const BLOG_DISALLOWED_RASTER_EXTS = new Set([".png", ".bmp", ".tiff", ".tif"]);

/**
 * Documented exceptions — reported but never fail the build.  Paths are
 * relative to publicDir and use forward slashes.
 *
 * hero-bouquet*.png are legacy, currently-unreferenced hero exports left over
 * from an earlier homepage design (no `hero-bouquet` reference exists anywhere
 * in src/).  They should be deleted or re-encoded to WebP rather than kept;
 * until then they are allowlisted so this guard can stay strict for everything
 * else.
 */
const ALLOWLIST = new Set([
  "hero-bouquet.png",
  "hero-bouquet-nobg.png",
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../public");

if (!fs.existsSync(publicDir)) {
  console.error(
    `check-public-image-budget: public directory not found at ${publicDir}`
  );
  process.exit(1);
}

/** @type {string[]} absolute image file paths under publicDir (recursive) */
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs);
    else if (entry.isFile() && IMAGE_EXTS.has(path.extname(abs).toLowerCase())) {
      files.push(abs);
    }
  }
};
walk(publicDir);

if (files.length === 0) {
  console.log(`\npublic-image-budget: no images under ${publicDir} — nothing to check.\n`);
  process.exit(0);
}

const toRel = (abs) => path.relative(publicDir, abs).split(path.sep).join("/");
const isBlog = (rel) => rel === "blog" || rel.startsWith("blog/");

const COL_NAME = 56;
const fmt = (bytes) => `${(bytes / 1024).toFixed(1).padStart(7)} kB`;

const header = `${"file".padEnd(COL_NAME)}${"size".padStart(10)}  status`;
console.log(
  `\npublic-image-budget report  (per-format budgets: ` +
    Object.entries(FORMAT_BUDGET_KB)
      .filter(([ext]) => [".webp", ".avif", ".jpg", ".png", ".svg", ".ico"].includes(ext))
      .map(([ext, kb]) => `${ext}≤${kb}kB`)
      .join(", ") +
    `; blog≤${BLOG_BUDGET_KB}kB WebP-only)`
);
console.log("─".repeat(header.length + 8));
console.log(header);
console.log("─".repeat(header.length + 8));

/** @type {Array<{ rel: string, reason: string }>} */
const violations = [];

files.sort((a, b) => toRel(a).localeCompare(toRel(b)));
for (const abs of files) {
  const rel = toRel(abs);
  const bytes = fs.statSync(abs).size;
  const ext = path.extname(abs).toLowerCase();
  const blog = isBlog(rel);
  const allowlisted = ALLOWLIST.has(rel);

  const budgetKb = blog
    ? Math.min(FORMAT_BUDGET_KB[ext] ?? Infinity, BLOG_BUDGET_KB)
    : FORMAT_BUDGET_KB[ext] ?? Infinity;
  const budgetBytes = budgetKb * 1024;

  const problems = [];
  if (blog && BLOG_DISALLOWED_RASTER_EXTS.has(ext)) {
    problems.push(`${ext} not allowed for blog images — re-encode as .webp`);
  }
  if (bytes > budgetBytes) {
    problems.push(`exceeds ${budgetKb} kB budget for ${ext}`);
  }

  const name = rel.padEnd(COL_NAME).slice(0, COL_NAME);
  const size = fmt(bytes).padStart(10);
  let status;
  if (problems.length === 0) {
    status = "  ✓";
  } else if (allowlisted) {
    status = `  ⚠ allowlisted (${problems.join("; ")})`;
  } else {
    status = `  ❌ ${problems.join("; ")}`;
  }
  console.log(`${name}${size}${status}`);

  if (problems.length > 0 && !allowlisted) {
    violations.push({ rel, reason: problems.join("; ") });
  }
}

console.log("─".repeat(header.length + 8));

if (violations.length > 0) {
  console.error(
    `\nFAIL  ${violations.length} public image(s) violate the budget:\n` +
      violations.map((v) => `  ❌  ${v.rel} — ${v.reason}`).join("\n") +
      `\n\n      Static images under public/ must stay within their per-format budget so page\n` +
      `      loads and share-link previews stay fast.  Re-encode the offending file(s) to a\n` +
      `      lighter format/size, e.g.:\n` +
      `        cwebp -q 80 image.png -o image.webp\n` +
      `      If a file is a genuine, justified exception, add it to ALLOWLIST in this script\n` +
      `      with a comment explaining why.\n`
  );
  process.exit(1);
}

console.log(
  `\nPASS  All ${files.length} public image(s) are within their per-format budget.\n`
);
process.exit(0);
