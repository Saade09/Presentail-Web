/**
 * internalLinks.mjs — pure-JS runtime version of the contextual
 * internal-linking system.
 *
 * This module is the single source of truth for the link-building rules shared
 * between the client (RelatedLinks.tsx via internalLinks.ts) and the server-
 * side SEO injector (seo-inject.mjs).  Both import from here so rule changes
 * propagate to both surfaces in lockstep.
 *
 * Keep this file as plain JS (no TypeScript syntax) — seo-inject.mjs cannot
 * import from .ts files.  The TypeScript version (internalLinks.ts) re-exports
 * from here with type annotations.
 */

/** Maximum contextual links per page (nav/breadcrumbs excluded from cap). */
export const MAX_LINKS = 5;
/** Maximum related-product links within the MAX_LINKS cap. */
export const MAX_RELATED = 2;

/**
 * Build the /{lang}-{country}/{city} locale base path.
 * @param {string} lang
 * @param {string} country
 * @param {string|null} city
 * @returns {string}
 */
export function localeBase(lang, country, city) {
  let base = `/${lang}-${country}`;
  if (city) base += `/${city}`;
  return base;
}

/**
 * Convert a display name (brand, category, etc.) to a URL slug.
 * Matches the server-side slug derivation pattern.
 * @param {string} name
 * @returns {string}
 */
export function nameToSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** @type {Record<string, string>} */
const CITY_DISPLAY_NAMES = {
  beirut: "Beirut",
  tripoli: "Tripoli",
  saida: "Saida",
  tyre: "Tyre",
  zahle: "Zahle",
  "abu-dhabi": "Abu Dhabi",
  dubai: "Dubai",
  sharjah: "Sharjah",
  ajman: "Ajman",
  fujairah: "Fujairah",
  "ras-al-khaimah": "Ras Al Khaimah",
  "umm-al-quwain": "Umm Al Quwain",
  nicosia: "Nicosia",
  limassol: "Limassol",
  larnaca: "Larnaca",
  paphos: "Paphos",
};

/**
 * @param {string} slug
 * @returns {string}
 */
export function cityDisplayName(slug) {
  return (
    CITY_DISPLAY_NAMES[slug] ??
    slug.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")
  );
}

/** @type {Record<string, string>} */
export const FLOWER_DELIVERY_PHRASE = {
  en: "flower delivery in {city}",
  ar: "توصيل الورود في {city}",
  fr: "livraison de fleurs à {city}",
};

/** @type {Record<string, string>} */
export const BRAND_COLLECTION_SUFFIX = {
  en: " collection",
  ar: " مجموعة",
  fr: " collection",
};

/** @type {Record<string, string>} */
export const YOU_MIGHT_ALSO_LIKE = {
  en: "You might also like",
  ar: "قد يعجبك أيضاً",
  fr: "Vous aimerez aussi",
};

/** @type {Record<string, string>} */
const ALL_OCCASIONS_LABEL = {
  en: "All Occasions",
  ar: "جميع المناسبات",
  fr: "Toutes les occasions",
};

/** @type {Record<string, string>} */
const ALL_CATEGORIES_LABEL = {
  en: "All Categories",
  ar: "جميع الفئات",
  fr: "Toutes les catégories",
};

/**
 * Build up to MAX_LINKS contextual internal-link suggestions for a product page.
 *
 * Rules (applied in order, deduplicated by href, capped at MAX_LINKS):
 *  1. Primary category page
 *  2. First occasion page (if any)
 *  3. Brand collection page (if any)
 *  4. City homepage — "flower delivery in {city}"
 *  5. Up to MAX_RELATED related products (same category, sorted by totalSales DESC)
 *
 * @param {{ id: string; name: string; category: string; categories: string[]; occasions: string[]; brandNames?: string[]; totalSales?: number; popularity?: number }} product
 * @param {{ lang: string; country: string; city: string|null; baseUrl?: string }} locale
 *   Pass `baseUrl` (e.g. "https://presentail.com/en-lb/beirut") to override the
 *   path-only locale base — useful in server-side contexts where an absolute URL
 *   prefix is already available.  When absent, the path is derived from
 *   lang/country/city.
 * @param {{ categories?: Array<{id:string;name:string}>; occasions?: Array<{id:string;name:string}>; brands?: Array<{slug:string;name:string}>; allProducts?: any[] }} context
 * @returns {Array<{href:string;anchorText:string;rel?:'nofollow'}>}
 */
export function buildInternalLinks(product, locale, context = {}) {
  const base = locale.baseUrl != null ? locale.baseUrl.replace(/\/$/, "") : localeBase(locale.lang, locale.country, locale.city);
  const seen = new Set();
  const links = [];

  function add(href, anchorText) {
    if (links.length >= MAX_LINKS) return;
    if (seen.has(href)) return;
    seen.add(href);
    links.push({ href, anchorText });
  }

  const primaryCatSlug = product.category || (product.categories && product.categories[0]);

  // Rule 1: Primary category
  if (primaryCatSlug) {
    const catEntry = context.categories && context.categories.find((c) => c.id === primaryCatSlug);
    const catName =
      (catEntry && catEntry.name) ??
      primaryCatSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    add(`${base}/category/${encodeURIComponent(primaryCatSlug)}`, catName);
  }

  // Rule 2: First product occasion that is present in the live catalog
  // allowlist. Product tags can outlive their public occasion page, so a raw
  // product occasion must never be treated as proof that the route exists.
  const occEntry =
    context.occasions &&
    product.occasions &&
    product.occasions
      .map((slug) => context.occasions.find((occasion) => occasion.id === slug))
      .find(Boolean);
  if (occEntry) {
    add(`${base}/occasion/${encodeURIComponent(occEntry.id)}`, occEntry.name);
  }

  // Rule 3: Brand collection
  const brandName = product.brandNames && product.brandNames[0];
  if (brandName) {
    const brandEntry = context.brands && context.brands.find((b) => b.name === brandName);
    const brandSlug = (brandEntry && brandEntry.slug) ?? nameToSlug(brandName);
    const suffix = BRAND_COLLECTION_SUFFIX[locale.lang] ?? BRAND_COLLECTION_SUFFIX.en;
    add(`${base}/brand/${encodeURIComponent(brandSlug)}`, `${brandName}${suffix}`);
  }

  // Rule 4: City homepage
  if (locale.city) {
    const cityName = cityDisplayName(locale.city);
    const template = FLOWER_DELIVERY_PHRASE[locale.lang] ?? FLOWER_DELIVERY_PHRASE.en;
    add(`${base}/`, template.replace("{city}", cityName));
  }

  // Rule 5: Related products (same primary category, sorted by totalSales DESC)
  if (context.allProducts && primaryCatSlug) {
    const related = context.allProducts
      .filter(
        (p) =>
          p.id !== product.id &&
          (p.category === primaryCatSlug ||
            (p.categories && p.categories.includes(primaryCatSlug))),
      )
      .sort(
        (a, b) =>
          ((b.totalSales ?? b.popularity) || 0) -
          ((a.totalSales ?? a.popularity) || 0),
      )
      .slice(0, MAX_RELATED);
    for (const rel of related) {
      add(`${base}/product/${encodeURIComponent(rel.id)}`, rel.name);
    }
  }

  return links;
}

/**
 * Build up to MAX_LINKS contextual internal-link suggestions for a category
 * or occasion collection page.
 *
 * Rules:
 *  1-3. Up to 3 related collections (occasions ↔ categories)
 *    4. City homepage
 *    5. Parent "All Categories" (/shop) or "All Occasions" (/occasions)
 *
 * @param {{ slug: string; name: string; type: 'category'|'occasion' }} collection
 * @param {{ lang: string; country: string; city: string|null }} locale
 * @param {{ categories?: Array<{id:string;name:string}>; occasions?: Array<{id:string;name:string}> }} context
 * @returns {Array<{href:string;anchorText:string;rel?:'nofollow'}>}
 */
export function buildCollectionInternalLinks(collection, locale, context = {}) {
  const base = localeBase(locale.lang, locale.country, locale.city);
  const seen = new Set();
  const links = [];

  function add(href, anchorText) {
    if (links.length >= MAX_LINKS) return;
    if (seen.has(href)) return;
    seen.add(href);
    links.push({ href, anchorText });
  }

  const isCategory = collection.type === "category";

  // Rules 1-3: Related collections
  if (isCategory) {
    const related = (context.occasions || []).slice(0, 3);
    for (const occ of related) {
      if (occ.id !== collection.slug) {
        add(`${base}/occasion/${encodeURIComponent(occ.id)}`, occ.name);
      }
    }
  } else {
    const related = (context.categories || []).slice(0, 3);
    for (const cat of related) {
      if (cat.id !== collection.slug) {
        add(`${base}/category/${encodeURIComponent(cat.id)}`, cat.name);
      }
    }
  }

  // Rule 4: City homepage
  if (locale.city) {
    const cityName = cityDisplayName(locale.city);
    const template = FLOWER_DELIVERY_PHRASE[locale.lang] ?? FLOWER_DELIVERY_PHRASE.en;
    add(`${base}/`, template.replace("{city}", cityName));
  }

  // Rule 5: Parent hub page
  if (isCategory) {
    const label = ALL_CATEGORIES_LABEL[locale.lang] ?? ALL_CATEGORIES_LABEL.en;
    add(`${base}/shop`, label);
  } else {
    const label = ALL_OCCASIONS_LABEL[locale.lang] ?? ALL_OCCASIONS_LABEL.en;
    add(`${base}/occasions`, label);
  }

  return links;
}
