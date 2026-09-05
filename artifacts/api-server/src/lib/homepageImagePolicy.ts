import { parseOsImageUrl } from "./imageDelivery";

export type HomepageImageKind = "hero" | "category" | "occasion" | "product";

const DEFAULT_WIDTHS: Record<HomepageImageKind, number> = {
  hero: 1200,
  category: 480,
  occasion: 288,
  product: 400,
};

export function buildHomepageOsImageUrl(
  source: string | null | undefined,
  kind: HomepageImageKind,
  width = DEFAULT_WIDTHS[kind],
): string {
  if (!source) return "";
  if (source.startsWith("/api/img/proxy") || source.startsWith("/api/catalog/")) return source;

  try {
    const canonical = parseOsImageUrl(source).toString();
    const query = new URLSearchParams({
      url: canonical,
      w: String(width),
      f: "webp",
    });
    return `/api/img/proxy?${query.toString()}`;
  } catch {
    return source;
  }
}

export function buildHomepageCatalogImageUrl(
  kind: "category" | "occasion",
  id: string | number,
): string {
  const width = DEFAULT_WIDTHS[kind];
  return `/api/catalog/${kind}-image/${encodeURIComponent(String(id))}?w=${width}&f=webp`;
}

export function buildHomepageProductImages(
  images: ReadonlyArray<{ url: string }>,
): Array<{ uri: string }> {
  return images
    .map((image) => ({ uri: buildHomepageOsImageUrl(image.url, "product") }))
    .filter((image) => image.uri.length > 0);
}