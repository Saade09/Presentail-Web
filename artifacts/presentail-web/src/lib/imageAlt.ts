/**
 * Image alt text generation utilities for SEO and accessibility.
 *
 * Provides localized alt text builders for product and collection images,
 * following Google's image alt-text guidelines (descriptive, concise, ≤125 chars).
 */

export type ImageAltLocale = "en" | "ar" | "fr";

export interface ProductAltInput {
  name: string;
  categories?: { name: string }[];
}

export interface ProductAltOptions {
  decorative?: boolean;
}

const DELIVERED_IN: Record<ImageAltLocale, string> = {
  en: "delivered in",
  ar: "توصيل في",
  fr: "livraison à",
};

function resolveLocale(locale: string): ImageAltLocale {
  if (locale === "ar" || locale === "fr") return locale;
  return "en";
}

/**
 * Build a localized alt string for a product image.
 *
 * EN: "{productName} – {primaryCategory} – delivered in {cityName}"
 * AR: "{productName} – {primaryCategory} – توصيل في {cityName}"
 * FR: "{productName} – {primaryCategory} – livraison à {cityName}"
 *
 * The category segment is omitted when `product.categories` is empty.
 * The result is trimmed to ≤125 characters.
 * Returns "" when `options.decorative` is true (purely decorative image).
 */
export function buildProductImageAlt(
  product: ProductAltInput,
  locale: string,
  cityName: string,
  options?: ProductAltOptions,
): string {
  if (options?.decorative) return "";

  const lang = resolveLocale(locale);
  const name = (product.name ?? "").trim();
  const category = (product.categories?.[0]?.name ?? "").trim();
  const deliveredIn = DELIVERED_IN[lang];

  let alt: string;
  if (category) {
    alt = `${name} – ${category} – ${deliveredIn} ${cityName}`;
  } else {
    alt = `${name} – ${deliveredIn} ${cityName}`;
  }

  return alt.slice(0, 125);
}

/**
 * Build a localized alt string for a category, occasion, or brand cover image.
 *
 * EN: "{name} {type} – Presentail {cityName}"  e.g. "Roses Flowers – Presentail Beirut"
 * AR: "{name} {type} – Presentail {cityName}"
 * FR: "{name} {type} – Presentail {cityName}"
 */
export function buildCollectionImageAlt(
  name: string,
  type: string,
  locale: string,
  cityName: string,
): string {
  return `${name} ${type} – Presentail ${cityName}`;
}
