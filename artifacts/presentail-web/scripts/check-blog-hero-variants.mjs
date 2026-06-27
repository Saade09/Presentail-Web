#!/usr/bin/env node
/**
 * check-blog-hero-variants.mjs
 *
 * CI guard for the responsive blog-hero WebP variants. The `srcset` in
 * Blog.tsx / BlogPost.tsx references `<slug>-480.webp` / `<slug>-768.webp`
 * variants of each hero in public/blog/. If a hero is added or replaced but its
 * variants are not (re)generated and committed, the missing widths 404 and the
 * browser silently falls back to the full-resolution original — quietly undoing
 * the page-speed win. This check fails the build when that happens.
 *
 * Variants are produced by generate-blog-hero-variants.mjs and committed; this
 * check only verifies they are present and correctly sized — it needs no image
 * library, so it can run as a fast standalone CI step on the source tree.
 *
 * For every original hero it asserts that each expected variant (widths from
 * blog-hero-variants.mjs, skipping any width >= the original's intrinsic width)
 * exists and is actually that wide.
 *
 * Exits 0 on PASS, 1 on FAIL.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-blog-hero-variants.mjs [publicDir]
 *
 * publicDir defaults to <script-dir>/../public
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BLOG_HERO_VARIANT_WIDTHS,
  blogDir,
  listHeroSlugs,
  variantFileName,
} from "../blog-hero-variants.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "..", "public");

const dir = blogDir(publicDir);

/**
 * Read the pixel width of a WebP file by parsing its header — no image library
 * required. Supports the simple lossy (VP8 ), lossless (VP8L) and extended
 * (VP8X) WebP chunk layouts, which covers everything sharp/cwebp emits.
 * Returns null when the width cannot be determined.
 */
function readWebpWidth(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return null;
  }
  if (buf.length < 30) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const fourCC = buf.toString("ascii", 12, 16);
  if (fourCC === "VP8 ") {
    // Lossy: 16-bit width (14 bits used) at offset 26.
    return (buf.readUInt16LE(26) & 0x3fff);
  }
  if (fourCC === "VP8L") {
    // Lossless: 14-bit width-1 packed starting at offset 21.
    const bits = buf.readUInt32LE(21);
    return (bits & 0x3fff) + 1;
  }
  if (fourCC === "VP8X") {
    // Extended: 24-bit width-1 little-endian at offset 24.
    return ((buf[24] | (buf[25] << 8) | (buf[26] << 16)) & 0xffffff) + 1;
  }
  return null;
}

const errors = [];
const slugs = listHeroSlugs(dir);

for (const slug of slugs) {
  const original = path.join(dir, `${slug}.webp`);
  const intrinsicWidth = readWebpWidth(original) ?? Infinity;

  for (const width of BLOG_HERO_VARIANT_WIDTHS) {
    // Mirror buildSrcSet()/the generator: widths >= the original are not emitted.
    if (width >= intrinsicWidth) continue;

    const name = variantFileName(slug, width);
    const variant = path.join(dir, name);

    if (!fs.existsSync(variant)) {
      errors.push(
        `Missing variant: ${name} (referenced by srcset for "${slug}.webp"). ` +
          "Run `pnpm --filter @workspace/presentail-web run generate-blog-hero-variants` and commit the result.",
      );
      continue;
    }

    const actualWidth = readWebpWidth(variant);
    if (actualWidth !== null && actualWidth !== width) {
      errors.push(
        `Wrong size: ${name} is ${actualWidth}px wide but should be ${width}px. ` +
          "Re-run `pnpm --filter @workspace/presentail-web run generate-blog-hero-variants` and commit the result.",
      );
    }
  }
}

if (errors.length > 0) {
  console.error("BLOG HERO VARIANT CHECK FAILED:\n");
  for (const e of errors) console.error(`  - ${e}`);
  console.error(`\n${errors.length} problem(s) found in ${dir}.`);
  process.exit(1);
}

console.log(
  `Blog hero variant check passed — ${slugs.length} hero(es), all ${BLOG_HERO_VARIANT_WIDTHS.join("/")} variants present.`,
);
