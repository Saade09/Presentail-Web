#!/usr/bin/env node
/**
 * generate-blog-hero-variants.mjs
 *
 * Prebuild generator for responsive blog-hero WebP variants.
 *
 * For every original hero in public/blog/ (`<slug>.webp`, i.e. any .webp that
 * is not itself a width variant) this produces the downscaled
 * `<slug>-480.webp` and `<slug>-768.webp` variants referenced by the `srcset`
 * in Blog.tsx / BlogPost.tsx (widths come from blog-hero-variants.mjs).
 *
 * Idempotent: a variant is (re)generated only when it is missing or older than
 * its original, so repeat builds and unchanged heroes are no-ops. Widths
 * greater than or equal to the original's intrinsic width are skipped (no
 * upscaling) — matching buildSrcSet()'s descriptor logic.
 *
 * Generated variants are committed to the repo (the CI check
 * check-blog-hero-variants.mjs fails the build if any are missing), so the
 * normal contributor flow is: drop a new `<slug>.webp` into public/blog/, run
 * the build (or this script directly), and commit the new variant files.
 *
 * Exits 0 on success, 1 on any generation failure.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/generate-blog-hero-variants.mjs [publicDir]
 *
 * publicDir defaults to <script-dir>/../public
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  BLOG_HERO_VARIANT_WIDTHS,
  BLOG_HERO_VARIANT_QUALITY,
  blogDir,
  listHeroSlugs,
  variantFileName,
} from "../blog-hero-variants.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "..", "public");

const dir = blogDir(publicDir);

/** True when `out` is missing or older than its source `src`. */
function isStale(src, out) {
  if (!fs.existsSync(out)) return true;
  try {
    return fs.statSync(src).mtimeMs > fs.statSync(out).mtimeMs;
  } catch {
    return true;
  }
}

async function main() {
  const slugs = listHeroSlugs(dir);
  if (slugs.length === 0) {
    console.log(`[blog-hero-variants] No hero images found in ${dir} — nothing to generate.`);
    return;
  }

  let generated = 0;
  let skipped = 0;

  for (const slug of slugs) {
    const src = path.join(dir, `${slug}.webp`);
    const intrinsicWidth = (await sharp(src).metadata()).width ?? 0;

    for (const width of BLOG_HERO_VARIANT_WIDTHS) {
      const out = path.join(dir, variantFileName(slug, width));

      // No upscaling: skip widths >= the original (buildSrcSet drops these too).
      if (intrinsicWidth && width >= intrinsicWidth) {
        continue;
      }

      if (!isStale(src, out)) {
        skipped++;
        continue;
      }

      await sharp(src)
        .resize({ width })
        .webp({ quality: BLOG_HERO_VARIANT_QUALITY })
        .toFile(out);
      generated++;
      console.log(`[blog-hero-variants] Generated ${path.relative(publicDir, out)} (${width}w)`);
    }
  }

  console.log(
    `[blog-hero-variants] Done — ${generated} generated, ${skipped} up-to-date across ${slugs.length} hero(es).`,
  );
}

main().catch((err) => {
  console.error("[blog-hero-variants] Generation failed:", err);
  process.exit(1);
});
