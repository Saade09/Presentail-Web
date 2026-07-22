// Public web storefront origin used to build shareable brand links.
// Share URLs always point to the production web storefront so iOS/Android
// can resolve OG tags (brand name, logo) for the share sheet preview.
// EXPO_PUBLIC_DOMAIN is the API server domain — do NOT use it here.
// presentail.com is the primary production storefront; the bare /brand/<slug>
// path is resolved server-side to the correct locale-prefixed route.
export const BRAND_SHARE_WEB_BASE_URL = "https://presentail.com";

/**
 * Builds the canonical shareable URL for a brand.
 *
 * The URL format is:
 *   https://presentail.com/brand/{encodedSlug}
 *
 * The bare `/brand/<slug>` path is the canonical share URL. The web server
 * has a redirect rule that resolves it to the correct locale-prefixed route,
 * which triggers per-brand OG tag injection for share sheet previews.
 * Using the bare path avoids hardcoding a locale that may not match the
 * recipient's preferred country.
 *
 * @param brandSlug - The OS brand slug (e.g. "roses-de-chloe"). May be a
 *   string or an array (useLocalSearchParams can return either). Arrays are
 *   coerced to the first element, matching the guard in the brand detail screen.
 */
export function buildBrandShareUrl(
  brandSlug: string | string[] | null | undefined,
): string {
  // Coerce array → first element (mirrors useLocalSearchParams guard).
  const slug = Array.isArray(brandSlug)
    ? (brandSlug[0] ?? "")
    : (brandSlug ?? "");

  const encodedSlug = encodeURIComponent(String(slug));
  return `${BRAND_SHARE_WEB_BASE_URL}/brand/${encodedSlug}`;
}
