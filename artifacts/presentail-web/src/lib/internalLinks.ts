/**
 * Contextual internal-linking system.
 *
 * Builds followed internal-link suggestions for product and collection pages.
 * Rules are applied in order, deduplicated by href, capped at MAX_LINKS per
 * page.  Navigation and breadcrumb links are excluded from this cap.
 *
 * This module is intentionally free of React / Vite imports so it can be
 * tested from the scripts package via a relative path import.
 */

export interface InternalLinkSuggestion {
  href: string;
  anchorText: string;
  rel?: "nofollow";
}

/** Alias required by spec — same shape as InternalLinkSuggestion. */
export type InternalLinkRule = InternalLinkSuggestion;

export interface InternalLinksProduct {
  id: string;
  name: string;
  category: string;
  categories: string[];
  occasions: string[];
  brandNames?: string[];
  /** Total lifetime sales count — used to rank related products DESC. */
  totalSales?: number;
  /** @deprecated Use totalSales. Kept for backwards-compat with callers that pass popularity. */
  popularity?: number;
}

export interface InternalLinksLocale {
  lang: string;
  country: string;
  city: string | null;
}

export interface CategoryEntry {
  id: string;
  name: string;
  count?: number;
  routable?: boolean;
}

export interface OccasionEntry {
  id: string;
  name: string;
  count?: number;
  routable?: boolean;
}

export interface BrandEntry {
  slug: string;
  name: string;
}

export interface InternalLinksContext {
  categories?: CategoryEntry[];
  occasions?: OccasionEntry[];
  brands?: BrandEntry[];
  allProducts?: InternalLinksProduct[];
}

const MAX_LINKS = 8;
const MAX_RELATED = 4;

export function localeBase(lang: string, country: string, city: string | null): string {
  let base = `/${lang}-${country}`;
  if (city) base += `/${city}`;
  return base;
}

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const NON_ROUTABLE_CATEGORY_SLUGS = new Set(["room-deco"]);

function isRoutableCollection(
  entry: { id?: string; count?: number; routable?: boolean } | undefined | null,
  type: "category" | "occasion",
): entry is { id: string; count?: number; routable?: boolean } {
  return Boolean(
    entry &&
      typeof entry.id === "string" &&
      entry.id &&
      (type !== "category" || !NON_ROUTABLE_CATEGORY_SLUGS.has(entry.id)) &&
      entry.routable !== false &&
      entry.count !== 0,
  );
}

function cityDisplayName(slug: string): string {
  const KNOWN: Record<string, string> = {
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
  return (
    KNOWN[slug] ??
    slug
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ")
  );
}

const FLOWER_DELIVERY_PHRASE: Record<string, string> = {
  en: "flower delivery in {city}",
  ar: "توصيل الورود في {city}",
  fr: "livraison de fleurs à {city}",
};

const BRAND_COLLECTION_SUFFIX: Record<string, string> = {
  en: " collection",
  ar: " مجموعة",
  fr: " collection",
};

export const YOU_MIGHT_ALSO_LIKE: Record<string, string> = {
  en: "You might also like",
  ar: "قد يعجبك أيضاً",
  fr: "Vous aimerez aussi",
};

/**
 * Build up to MAX_LINKS contextual internal-link suggestions for a product
 * page.  Rules (applied in order, deduplicated by href):
 *  1. Primary category page
 *  2. First occasion page (if any)
 *  3. Brand collection page (if any)
 *  4. City homepage with "flower delivery in {city}" anchor
 *  5. Up to MAX_RELATED related products (same primary category, sorted by
 *     totalSales DESC, excluding the current product)
 */
export function buildInternalLinks(
  product: InternalLinksProduct,
  locale: InternalLinksLocale,
  context: InternalLinksContext = {},
): InternalLinkSuggestion[] {
  const base = localeBase(locale.lang, locale.country, locale.city);
  const seen = new Set<string>();
  const links: InternalLinkSuggestion[] = [];

  function add(href: string, anchorText: string): void {
    if (links.length >= MAX_LINKS) return;
    if (seen.has(href)) return;
    seen.add(href);
    links.push({ href, anchorText });
  }

  const primaryCatSlug = product.category || product.categories?.[0];

  // Rule 1: Primary category
  if (primaryCatSlug) {
    const catEntry = context.categories?.find((c) => c.id === primaryCatSlug);
    if (isRoutableCollection(catEntry, "category")) {
      add(`${base}/category/${encodeURIComponent(primaryCatSlug)}`, catEntry.name);
    }
  }

  // Rule 2: First product occasion that is present in the live catalog
  // allowlist. Product tags can outlive their public occasion page, so a raw
  // product occasion must never be treated as proof that the route exists.
  const occEntry = product.occasions
    ?.map((slug) => context.occasions?.find((occasion) => occasion.id === slug))
    .find((occasion): occasion is OccasionEntry => Boolean(occasion));
  if (isRoutableCollection(occEntry, "occasion")) {
    add(
      `${base}/occasion/${encodeURIComponent(occEntry.id)}`,
      occEntry.name,
    );
  }

  // Rule 3: Brand collection
  const brandName = product.brandNames?.[0];
  if (brandName) {
    const brandEntry = context.brands?.find((b) => b.name === brandName);
    const brandSlug = brandEntry?.slug ?? nameToSlug(brandName);
    const suffix = BRAND_COLLECTION_SUFFIX[locale.lang] ?? BRAND_COLLECTION_SUFFIX.en;
    add(
      `${base}/brand/${encodeURIComponent(brandSlug)}`,
      `${brandName}${suffix}`,
    );
  }

  // Rule 4: City homepage
  if (locale.city) {
    const cityName = cityDisplayName(locale.city);
    const phrase = (
      FLOWER_DELIVERY_PHRASE[locale.lang] ?? FLOWER_DELIVERY_PHRASE.en
    ).replace("{city}", cityName);
    add(`${base}/`, phrase);
  }

  // Rule 5: Related products (same primary category, sorted by totalSales DESC)
  if (context.allProducts && primaryCatSlug) {
    const related = context.allProducts
      .filter(
        (p) =>
          p.id !== product.id &&
          (p.category === primaryCatSlug ||
            p.categories?.includes(primaryCatSlug)),
      )
      .sort(
        (a, b) =>
          (b.totalSales ?? b.popularity ?? 0) -
          (a.totalSales ?? a.popularity ?? 0),
      )
      .slice(0, MAX_RELATED);
    for (const rel of related) {
      add(`${base}/product/${encodeURIComponent(rel.id)}`, rel.name);
    }
  }

  return links;
}

const ALL_OCCASIONS_LABEL: Record<string, string> = {
  en: "All Occasions",
  ar: "جميع المناسبات",
  fr: "Toutes les occasions",
};

const ALL_CATEGORIES_LABEL: Record<string, string> = {
  en: "All Categories",
  ar: "جميع الفئات",
  fr: "Toutes les catégories",
};

/**
 * Build up to MAX_LINKS contextual internal-link suggestions for a category
 * or occasion collection page.  Rules:
 *  1-3. Up to 3 related collections (occasions ↔ categories)
 *    4. City homepage
 *    5. Parent "All Occasions" or "All Categories" page
 */
export function buildCollectionInternalLinks(
  collection: { slug: string; name: string; type: "category" | "occasion" },
  locale: InternalLinksLocale,
  context: InternalLinksContext = {},
): InternalLinkSuggestion[] {
  const city =
    locale.city ||
    ({ lb: "beirut", ae: "dubai", cy: "nicosia" }[locale.country] ?? null);
  const base = localeBase(locale.lang, locale.country, city);
  const seen = new Set<string>();
  const links: InternalLinkSuggestion[] = [];

  function add(href: string, anchorText: string): void {
    if (links.length >= MAX_LINKS) return;
    if (seen.has(href)) return;
    seen.add(href);
    links.push({ href, anchorText });
  }

  const isCategory = collection.type === "category";

  // Rules 1-3: Related collections
  if (isCategory) {
    const related = (context.occasions ?? []).slice(0, 3);
    for (const occ of related) {
      if (occ.id !== collection.slug && isRoutableCollection(occ, "occasion")) {
        add(`${base}/occasion/${encodeURIComponent(occ.id)}`, occ.name);
      }
    }
  } else {
    const related = (context.categories ?? []).slice(0, 3);
    for (const cat of related) {
      if (cat.id !== collection.slug && isRoutableCollection(cat, "category")) {
        add(`${base}/category/${encodeURIComponent(cat.id)}`, cat.name);
      }
    }
  }

  // Rule 4: City homepage
  if (city) {
    const cityName = cityDisplayName(city);
    const phrase = (
      FLOWER_DELIVERY_PHRASE[locale.lang] ?? FLOWER_DELIVERY_PHRASE.en
    ).replace("{city}", cityName);
    add(`${base}/`, phrase);
  }

  // Rule 5: Parent hub page
  if (isCategory) {
    const label =
      ALL_CATEGORIES_LABEL[locale.lang] ?? ALL_CATEGORIES_LABEL.en;
    add(`${base}/shop`, label);
  } else {
    const label =
      ALL_OCCASIONS_LABEL[locale.lang] ?? ALL_OCCASIONS_LABEL.en;
    add(`${base}/occasions`, label);
  }

  return links;
}
