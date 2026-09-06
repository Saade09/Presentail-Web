import { parseOsImageUrl } from "./imageDelivery";

export const CATALOG_CARD_IMAGE_WIDTH = 400;
export const PRODUCT_GALLERY_IMAGE_WIDTH = 1200;

export function buildCatalogProductImageUrl(
  source: string | null | undefined,
  width: number,
): string {
  if (!source) return "";
  if (source.startsWith("/api/img/proxy?")) {
    const params = new URLSearchParams(source.slice(source.indexOf("?") + 1));
    if (!params.has("url")) return source;
    params.set("w", String(width));
    params.set("f", "webp");
    return `/api/img/proxy?${params.toString()}`;
  }

  try {
    const canonical = parseOsImageUrl(source).toString();
    const query = new URLSearchParams({
      url: canonical,
      w: String(width),
      f: "webp",
    });
    return `/api/img/proxy?${query.toString()}`;
  } catch {
    // Static assets and non-OS/CDN fallbacks are intentionally unchanged.
    return source;
  }
}