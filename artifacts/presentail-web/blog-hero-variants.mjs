/**
 * Filesystem helpers for the responsive blog-hero WebP variants, used by:
 *   - scripts/generate-blog-hero-variants.mjs  (prebuild generator)
 *   - scripts/check-blog-hero-variants.mjs     (CI guard)
 *
 * The variant widths themselves (`BLOG_HERO_VARIANT_WIDTHS`) are the single
 * source of truth and live in the dependency-free `blog-hero-variants.config.mjs`
 * — re-exported below so existing script/test imports of this module keep
 * working, and imported directly by the browser bundle (Blog.tsx / BlogPost.tsx)
 * so the `srcset` widths can never drift from the generated/checked variants.
 *
 * Blog hero images live in public/blog/ as `<slug>.webp` (the full-resolution
 * original). For each original we ship downscaled `<slug>-480.webp` and
 * `<slug>-768.webp` variants so the `srcset` in the blog list/detail pages can
 * serve a small file to phones instead of the 1408px original. The generator
 * produces these from the original; the CI check fails the build if any are
 * missing so a hero added without its variants can never silently fall back to
 * the full-resolution file (quietly undoing the page-speed win).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The variant widths/quality live in a dependency-free module so the browser
// bundle (Blog.tsx / BlogPost.tsx) can import them without pulling in the
// `node:` builtins used by the helpers below. Re-exported here so existing
// script/test imports of this module keep working unchanged.
export { BLOG_HERO_VARIANT_WIDTHS, BLOG_HERO_VARIANT_QUALITY } from "./blog-hero-variants.config.mjs";

import { BLOG_HERO_VARIANT_WIDTHS } from "./blog-hero-variants.config.mjs";

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
