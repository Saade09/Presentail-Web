/**
 * Single source of truth for the responsive blog-hero WebP variant widths used
 * by:
 *   - scripts/generate-blog-hero-variants.mjs  (prebuild generator)
 *   - scripts/check-blog-hero-variants.mjs     (CI guard)
 *   - src/lib/imageUtils.ts buildSrcSet() callers (Blog.tsx / BlogPost.tsx)
 *
 * Blog hero images live in public/blog/ as `<slug>.webp` (the full-resolution
 * original). For each original we ship downscaled `<slug>-480.webp` and
 * `<slug>-768.webp` variants so the `srcset` in the blog list/detail pages can
 * serve a small file to phones instead of the 1408px original. The generator
 * produces these from the original; the CI check fails the build if any are
 * missing so a hero added without its variants can never silently fall back to
 * the full-resolution file (quietly undoing the page-speed win).
 *
 * Update the widths ONLY here. They must stay in sync with the variant widths
 * passed to buildSrcSet() in Blog.tsx / BlogPost.tsx.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Downscaled WebP variant widths generated for every blog hero original. */
export const BLOG_HERO_VARIANT_WIDTHS = [480, 768];

/** WebP encode quality used for generated variants (matches the cwebp -q 80 convention). */
export const BLOG_HERO_VARIANT_QUALITY = 80;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to public/blog (overridable for tests). */
export function blogDir(publicDir) {
  return path.resolve(publicDir ?? path.join(__dirname, "public"), "blog");
}

/**
 * Regex matching a generated variant filename for one of the known widths,
 * e.g. `spring-trip-480.webp`. A `.webp` that does NOT match this is treated
 * as an original hero. Anchoring on the known widths means a slug that happens
 * to end in a number (e.g. `top-10-gifts.webp`) is never mistaken for a variant.
 */
export function variantSuffixRegex() {
  return new RegExp(`-(${BLOG_HERO_VARIANT_WIDTHS.join("|")})\\.webp$`, "i");
}

/** True when `name` is a generated variant file (not an original hero). */
export function isVariantFile(name) {
  return variantSuffixRegex().test(name);
}

/**
 * Returns the list of original hero basenames (without extension) found in
 * `dir` — i.e. every `.webp` that is not itself a generated width variant.
 */
export function listHeroSlugs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => /\.webp$/i.test(name) && !isVariantFile(name))
    .map((name) => name.replace(/\.webp$/i, ""))
    .sort();
}

/** Variant filename for a given hero slug + width, e.g. `spring-480.webp`. */
export function variantFileName(slug, width) {
  return `${slug}-${width}.webp`;
}
