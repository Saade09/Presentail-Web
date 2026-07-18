/**
 * Pure-JS mirror of src/lib/imageAlt.ts buildProductImageAlt / buildCollectionImageAlt.
 * Used by sitemap.mjs which cannot import TypeScript files directly.
 * Keep in sync with src/lib/imageAlt.ts.
 */

const DELIVERED_IN = { en: "delivered in", ar: "توصيل في", fr: "livraison à" };

function resolveLocale(locale) {
  if (locale === "ar" || locale === "fr") return locale;
  return "en";
}

/**
 * Build a localized alt string for a product image.
 * Mirrors buildProductImageAlt from src/lib/imageAlt.ts.
 *
 * @param {{ name: string; categories?: { name: string }[] }} product
 * @param {string} locale  "en" | "ar" | "fr"
 * @param {string} [cityName]
 * @param {{ decorative?: boolean }} [options]
 * @returns {string}
 */
export function buildProductImageAlt(product, locale, cityName = "", options = {}) {
  if (options.decorative) return "";
  const lang = resolveLocale(locale);
  const name = (product.name ?? "").trim();
  const category = ((product.categories ?? [])[0]?.name ?? "").trim();
  const deliveredIn = DELIVERED_IN[lang];
  const city = (cityName ?? "").trim();

  let alt;
  if (category && city) {
    alt = `${name} \u2013 ${category} \u2013 ${deliveredIn} ${city}`;
  } else if (category) {
    alt = `${name} \u2013 ${category}`;
  } else if (city) {
    alt = `${name} \u2013 ${deliveredIn} ${city}`;
  } else {
    alt = name;
  }
  return alt.slice(0, 125);
}

/**
 * Build a localized alt string for a collection cover image.
 * Mirrors buildCollectionImageAlt from src/lib/imageAlt.ts.
 *
 * @param {string} name
 * @param {string} type
 * @param {string} locale
 * @param {string} [cityName]
 * @returns {string}
 */
export function buildCollectionImageAlt(name, type, locale, cityName = "") {
  const city = (cityName ?? "").trim();
  return city
    ? `${name} ${type} \u2013 Presentail ${city}`
    : `${name} ${type} \u2013 Presentail`;
}
