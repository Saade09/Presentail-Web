// Public web storefront origin used to build shareable product links.
// Share URLs always point to the production web storefront so iOS/Android
// can resolve OG tags (product name, logo) for the share sheet preview.
// EXPO_PUBLIC_DOMAIN is the API server domain — do NOT use it here.
// presentail.com is the primary production storefront; the bare /product/<slug>
// path is resolved server-side to the correct locale-prefixed route.
export const PRODUCT_SHARE_WEB_BASE_URL = "https://presentail.com";

/**
 * Builds the canonical shareable URL for a product.
 *
 * The URL format is:
 *   https://presentail.com/product/{encodedSlug}
 *
 * The bare `/product/<slug>` path is the canonical share URL. The web server
 * has a redirect rule that resolves it to the correct locale-prefixed route,
 * which triggers per-product OG tag injection for share sheet previews.
 * Using the bare path avoids hardcoding a locale that may not match the
 * recipient's preferred country.
 *
 * @param productSlug - The OS product id / slug. May be a string or an array
 *   (useLocalSearchParams can return either). Arrays are coerced to the first
 *   element, matching the guard in the product detail screen.
 */
export function buildProductShareUrl(
  productSlug: string | string[] | null | undefined,
): string {
  // Coerce array → first element (mirrors useLocalSearchParams guard).
  const slug = Array.isArray(productSlug)
    ? (productSlug[0] ?? "")
    : (productSlug ?? "");

  const encodedSlug = encodeURIComponent(String(slug));
  return `${PRODUCT_SHARE_WEB_BASE_URL}/product/${encodedSlug}`;
}
