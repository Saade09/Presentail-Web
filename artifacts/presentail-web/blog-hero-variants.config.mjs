/**
 * Single source of truth for the responsive blog-hero WebP variant widths.
 *
 * Kept in a dedicated, dependency-free module (no `node:` imports) so it can be
 * safely imported from BOTH:
 *   - the node-only scripts (via `blog-hero-variants.mjs`, which re-exports these)
 *   - the browser bundle (Blog.tsx / BlogPost.tsx import this file directly so
 *     Vite never tries to bundle `node:fs`/`node:path`/`node:url`)
 *
 * Update the widths ONLY here. They flow through to the generator, the CI check,
 * and the rendered `srcset` together, so the responsive variants can never
 * silently drift out of sync.
 */

/** Downscaled WebP variant widths generated for every blog hero original. */
export const BLOG_HERO_VARIANT_WIDTHS = [480, 768];

/** WebP encode quality used for generated variants (matches the cwebp -q 80 convention). */
export const BLOG_HERO_VARIANT_QUALITY = 80;
