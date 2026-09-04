/**
 * Single source of truth for the WebP logo asset basenames used by:
 *   - logo-preloads.mjs (server-side locale-aware preload generation)
 *   - scripts/check-logo-preload.mjs  (post-build CI check)
 *
 * Update ONLY here when the source assets are renamed or replaced.
 * The server resolves these against the Vite manifest for each response, so a
 * rename here keeps the locale-aware preload output in sync with Logo.tsx.
 */

/** Source filename (without path) of the English WebP logo imported by Logo.tsx. */
export const LOGO_EN_WEBP_BASENAME = "Presentail_PNG-01_1777795626872.webp";

/** Source filename (without path) of the Arabic WebP logo imported by Logo.tsx. */
export const LOGO_AR_WEBP_BASENAME = "Presentail-Arabic-Logo.webp";

/**
 * White (inverse) variants — used on dark backgrounds, e.g. the checkout
 * page header. Both are best-effort: missing entries are logged but do not
 * fail the build.
 */

/** Source filename (without path) of the English white WebP logo imported by Logo.tsx. */
export const LOGO_EN_WHITE_WEBP_BASENAME = "Presentail_PNG-01_white.webp";

/** Source filename (without path) of the Arabic white WebP logo imported by Logo.tsx. */
export const LOGO_AR_WHITE_WEBP_BASENAME = "Presentail-Arabic-Logo-white.webp";
