// Markdown mirror builder for Presentail public pages.
//
// Every public, indexable page has a Markdown twin served at <path>.md and
// also via `Accept: text/markdown` content negotiation. The Markdown contains
// valid YAML frontmatter + a meaningful body built from the same live OS
// catalog data the HTML pages use — same stale-while-revalidate caching
// pattern as sitemap.mjs and llms.mjs.
//
// Exports
// ────────
//   isMirroredPath(pathname)            — true when the HTML path has a mirror
//   getMarkdownForPath(pathname, opts)  — builds Markdown or returns null
//   MARKDOWN_RETRY_WINDOW_MS            — retry window constant (matches sitemap)

import {
  SITEMAP_CITIES,
  SITEMAP_LANGS,
  SITEMAP_CANONICAL_CITIES,
} from "./sitemap.mjs";
import {
  CITY_NAMES,
  COUNTRY_NAMES,
  DESCRIPTIONS,
} from "./src/lib/seo.mjs";
import { BLOG_POSTS } from "@workspace/blog-content";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MARKDOWN_RETRY_WINDOW_MS = 5 * 60 * 1000;

const CATALOG_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_PRODUCTS_IN_LIST = 20;
// The shop mirror is the primary product listing for AI crawlers — it gets a
// higher cap than the other listing mirrors.
const MAX_PRODUCTS_IN_SHOP = 30;
const CANONICAL_DOMAIN = "https://presentail.com";

// ---------------------------------------------------------------------------
// Product field helpers
//
// The live /api/woo/products response carries the product slug in `id`
// (e.g. "ivory-rose-vase") and has no `slug` field; older fixtures and tests
// use `slug`. Accept both so mirrors are populated with real catalog data.
// ---------------------------------------------------------------------------

function productSlugOf(p) {
  const s = p?.slug ?? p?.id;
  return typeof s === "string" && s.length > 0 ? s : null;
}

function isListableProduct(p) {
  return Boolean(
    p?.name && productSlugOf(p) && p.inStock !== false && p.status !== "discontinued"
  );
}

/**
 * Human-readable price string, discount-aware:
 *   "$40 (was $50)" when a discount price applies, "$50" otherwise, "" when
 *   no numeric price is available.
 */
function productPriceStr(p) {
  const regular = typeof p?.priceValue === "number" ? p.priceValue : null;
  const discount =
    typeof p?.discountPriceValue === "number" && p.discountPriceValue > 0
      ? p.discountPriceValue
      : null;
  if (discount != null && regular != null && discount < regular) {
    return ` — $${Math.round(discount)} (was $${Math.round(regular)})`;
  }
  if (regular != null) return ` — $${Math.round(regular)}`;
  return "";
}

/** One "- [Name by Brand — $price](url)" Markdown bullet for a product. */
function productLine(p, { origin, cleanBase, localePath }) {
  const brand = (p.brandNames ?? [])[0] ?? null;
  const brandStr = brand ? ` by ${brand}` : "";
  return `- [${p.name}${brandStr}${productPriceStr(p)}](${origin}${cleanBase}${localePath}/product/${encodeURIComponent(productSlugOf(p))})`;
}

/** Sort most-relevant first: best sellers, then popularity. */
function byRelevance(a, b) {
  const bs = (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0);
  if (bs !== 0) return bs;
  return (b.popularity ?? 0) - (a.popularity ?? 0);
}

const LOCALE_RE = /^\/([a-z]{2})-([a-z]{2})\/([^/]+)(\/.*)?$/;

// ---------------------------------------------------------------------------
// isMirroredPath
//
// Returns true for every locale-prefixed, public indexable path that has a
// Markdown twin. Returns false for private/transactional paths and for any
// non-locale path (/, /sitemap.xml, etc.) — those don't need per-page mirrors.
// ---------------------------------------------------------------------------

const NON_MIRROR_SUBROUTES = new Set([
  "/cart",
  "/checkout",
  "/order-confirmed",
  "/auth",
  "/account",
  "/sign-in",
  "/sign-up",
  "/reset-password",
  "/unauthorized",
  "/favorites",
  "/careers",
  "/partner",
  "/blog",
  "/terms",
  "/privacy",
  "/shipping-policy",
  "/return-policy",
]);

/**
 * Returns true when the given HTML pathname has a Markdown mirror.
 * Accepts either the HTML path or a path already ending in ".md" (strips suffix).
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isMirroredPath(pathname) {
  if (!pathname) return false;
  const htmlPath = pathname.endsWith(".md") ? pathname.slice(0, -3) : pathname;
  const m = htmlPath.match(LOCALE_RE);
  if (!m) return false;
  const [, lang, country, , rest = ""] = m;
  const city = m[3];

  if (!SITEMAP_LANGS.includes(lang)) return false;
  if (!SITEMAP_CITIES[country]) return false;
  if (!SITEMAP_CITIES[country].includes(city)) return false;

  const subroute = rest || "";

  if (NON_MIRROR_SUBROUTES.has(subroute)) return false;
  if (
    subroute.startsWith("/account/") ||
    subroute.startsWith("/sign-in/") ||
    subroute.startsWith("/sign-up/")
  ) return false;

  // Allow individual blog post paths for known slugs only.
  // The /blog listing is already in NON_MIRROR_SUBROUTES; unknown slugs → false.
  if (subroute.startsWith("/blog/")) {
    const slug = subroute.slice("/blog/".length).replace(/\/$/, "");
    return Boolean(slug && BLOG_POSTS[slug]);
  }

  // Allowed sub-routes (city home + known public pages + dynamic entity pages)
  if (subroute === "" || subroute === "/") return true;
  if (subroute === "/shop") return true;
  if (subroute === "/brands") return true;
  if (subroute === "/occasions") return true;
  if (subroute === "/contact") return true;
  if (subroute === "/faqs") return true;
  if (subroute === "/weddings") return true;
  if (subroute === "/corporate") return true;
  if (subroute === "/best-sellers") return true;
  if (subroute.startsWith("/product/") && subroute.length > "/product/".length) return true;
  if (subroute.startsWith("/brand/") && subroute.length > "/brand/".length) return true;
  if (subroute.startsWith("/category/") && subroute.length > "/category/".length) return true;
  if (subroute.startsWith("/occasion/") && subroute.length > "/occasion/".length) return true;

  return false;
}

// ---------------------------------------------------------------------------
// In-process catalog cache (products, brands, occasions, categories)
// ---------------------------------------------------------------------------

/** @type {{ products: any[], brands: any[], occasions: any[], categories: any[] } | null} */
let _catalogCache = null;
let _catalogCacheTsMs = 0;

/**
 * Fetch or return the cached catalog data.
 * Never throws — returns an empty catalog on error.
 *
 * @param {(url: string) => Promise<any>} fetchJson
 * @param {string} apiBaseUrl
 * @returns {Promise<{ products: any[], brands: any[], occasions: any[], categories: any[] }>}
 */
async function getCatalogData(fetchJson, apiBaseUrl) {
  const nowMs = Date.now();
  if (_catalogCache && nowMs - _catalogCacheTsMs <= CATALOG_CACHE_TTL_MS) {
    return _catalogCache;
  }
  try {
    const [productsData, brandsData, catalogData] = await Promise.all([
      fetchJson(`${apiBaseUrl}/api/woo/products?lang=en&countryCode=LB`),
      fetchJson(`${apiBaseUrl}/api/woo/brands`),
      fetchJson(`${apiBaseUrl}/api/catalog/metadata`),
    ]);
    _catalogCache = {
      products: productsData?.products ?? [],
      brands: brandsData?.brands ?? [],
      occasions: catalogData?.occasions ?? [],
      categories: catalogData?.categories ?? [],
    };
    _catalogCacheTsMs = nowMs;
  } catch {
    if (!_catalogCache) {
      _catalogCache = { products: [], brands: [], occasions: [], categories: [] };
    }
  }
  return _catalogCache;
}

// ---------------------------------------------------------------------------
// YAML frontmatter helper
// ---------------------------------------------------------------------------

/**
 * Build a YAML frontmatter block from a plain-object map.
 * Values are JSON-encoded strings (double-quoted, special chars escaped).
 * Null/undefined values are skipped.
 *
 * @param {Record<string, string|null|undefined>} fields
 * @returns {string}
 */
function buildFrontmatter(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    lines.push(`${key}: ${JSON.stringify(String(value))}`);
  }
  lines.push("---");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Locale helpers
// ---------------------------------------------------------------------------

function getCityLabel(lang, country, city) {
  const key = `${country}-${city}`;
  return (
    CITY_NAMES[lang]?.[key] ??
    CITY_NAMES.en?.[key] ??
    city.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function getCountryLabel(lang, country) {
  return (
    COUNTRY_NAMES[lang]?.[country] ??
    COUNTRY_NAMES.en?.[country] ??
    country.toUpperCase()
  );
}

function fmt(template, params) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (_, k) =>
    k in params ? String(params[k]) : `{${k}}`
  );
}

// ---------------------------------------------------------------------------
// Page-type builder functions
// ---------------------------------------------------------------------------

function buildCityHomeMarkdown({
  lang, country, city, origin, cleanBase, lastmod,
  products, categories, occasions,
}) {
  const cityLbl = getCityLabel(lang, country, city);
  const countryLbl = getCountryLabel(lang, country);
  const localePath = `/${lang}-${country}/${city}`;
  const canonicalUrl = `${origin}${cleanBase}${localePath}`;
  const markdownUrl = `${canonicalUrl}.md`;

  const descTemplate =
    DESCRIPTIONS.en?.home ??
    "Send flowers, cakes, balloons, plants, chocolates and gifts online in {city}. Express same-day delivery available with Presentail.";
  const description = fmt(descTemplate, { city: cityLbl, country: countryLbl });

  const frontmatter = buildFrontmatter({
    title: `Flower & Gift Delivery in ${cityLbl} | Presentail`,
    description,
    canonical_url: canonicalUrl,
    markdown_url: markdownUrl,
    language: lang,
    locale: `${lang}-${country}`,
    page_type: "city_home",
    site_name: "Presentail",
    last_modified: lastmod,
  });

  const topProducts = products
    .filter(isListableProduct)
    .sort(byRelevance)
    .slice(0, MAX_PRODUCTS_IN_LIST);
  const topCategories = categories.slice(0, 8);
  const topOccasions = occasions.slice(0, 8);

  const productLines = topProducts.map((p) => productLine(p, { origin, cleanBase, localePath }));

  const categoryLines = topCategories
    .filter((c) => c?.id && c?.name)
    .map((c) => `- [${c.name}](${origin}${cleanBase}${localePath}/category/${encodeURIComponent(c.id)})`);

  const occasionLines = topOccasions
    .filter((o) => o?.id && o?.name)
    .map((o) => `- [${o.name}](${origin}${cleanBase}${localePath}/occasion/${encodeURIComponent(o.id)})`);

  const body = [
    `# Flower & Gift Delivery in ${cityLbl}`,
    "",
    description,
    "",
    `Browse the full collection: [Shop Flowers & Gifts in ${cityLbl}](${origin}${cleanBase}${localePath}/shop)`,
    "",
    ...(categoryLines.length > 0 ? ["## Browse by Category", "", ...categoryLines, ""] : []),
    ...(occasionLines.length > 0 ? ["## Browse by Occasion", "", ...occasionLines, ""] : []),
    ...(productLines.length > 0 ? ["## Featured Products", "", ...productLines, "", `[See all products](${origin}${cleanBase}${localePath}/shop)`, ""] : []),
    "## About Presentail",
    "",
    `Presentail delivers luxury flowers and gifts across ${countryLbl} with same-day express delivery. Order online for delivery in ${cityLbl} and surrounding areas.`,
    "",
    `- [Contact Us](${origin}${cleanBase}${localePath}/contact)`,
    `- [FAQs & Delivery Information](${origin}${cleanBase}${localePath}/faqs)`,
    `- [All Brands](${origin}${cleanBase}${localePath}/brands)`,
    `- [All Occasions](${origin}${cleanBase}${localePath}/occasions)`,
  ].join("\n");

  return `${frontmatter}\n\n${body}`;
}

function buildShopMarkdown({
  lang, country, city, origin, cleanBase, lastmod,
  products, categories, occasions,
}) {
  const cityLbl = getCityLabel(lang, country, city);
  const countryLbl = getCountryLabel(lang, country);
  const localePath = `/${lang}-${country}/${city}`;
  const canonicalUrl = `${origin}${cleanBase}${localePath}/shop`;
  const markdownUrl = `${canonicalUrl}.md`;

  const descTemplate =
    DESCRIPTIONS.en?.shop ??
    "Browse Presentail's curated bouquets, cakes and luxury gifts for delivery in {city}, {country}.";
  const description = fmt(descTemplate, { city: cityLbl, country: countryLbl });

  const frontmatter = buildFrontmatter({
    title: `Shop Flowers & Gifts in ${cityLbl} | Presentail`,
    description,
    canonical_url: canonicalUrl,
    markdown_url: markdownUrl,
    language: lang,
    locale: `${lang}-${country}`,
    page_type: "shop",
    site_name: "Presentail",
    last_modified: lastmod,
  });

  const topProducts = products
    .filter(isListableProduct)
    .sort(byRelevance)
    .slice(0, MAX_PRODUCTS_IN_SHOP);

  const categoryLines = categories
    .filter((c) => c?.id && c?.name)
    .slice(0, 10)
    .map((c) => `- [${c.name}](${origin}${cleanBase}${localePath}/category/${encodeURIComponent(c.id)})`);

  const occasionLines = occasions
    .filter((o) => o?.id && o?.name)
    .slice(0, 8)
    .map((o) => `- [${o.name}](${origin}${cleanBase}${localePath}/occasion/${encodeURIComponent(o.id)})`);

  const productLines = topProducts.map((p) => productLine(p, { origin, cleanBase, localePath }));

  const body = [
    `# Shop Flowers & Gifts in ${cityLbl}`,
    "",
    description,
    "",
    ...(categoryLines.length > 0 ? ["## Categories", "", ...categoryLines, ""] : []),
    ...(occasionLines.length > 0 ? ["## Browse by Occasion", "", ...occasionLines, ""] : []),
    ...(productLines.length > 0 ? ["## Products", "", ...productLines, "", `[See all products](${canonicalUrl})`, ""] : []),
  ].join("\n");

  return `${frontmatter}\n\n${body}`;
}

function buildBrandsListMarkdown({
  lang, country, city, origin, cleanBase, lastmod,
  brands,
}) {
  const cityLbl = getCityLabel(lang, country, city);
  const countryLbl = getCountryLabel(lang, country);
  const localePath = `/${lang}-${country}/${city}`;
  const canonicalUrl = `${origin}${cleanBase}${localePath}/brands`;
  const markdownUrl = `${canonicalUrl}.md`;

  const descTemplate =
    DESCRIPTIONS.en?.brands ??
    "Discover Presentail's hand-picked partner brands available for delivery in {city}, {country}.";
  const description = fmt(descTemplate, { city: cityLbl, country: countryLbl });

  const frontmatter = buildFrontmatter({
    title: `Partner Brands in ${cityLbl} | Presentail`,
    description,
    canonical_url: canonicalUrl,
    markdown_url: markdownUrl,
    language: lang,
    locale: `${lang}-${country}`,
    page_type: "brands_list",
    site_name: "Presentail",
    last_modified: lastmod,
  });

  const brandLines = brands
    .filter((b) => b?.name && b?.slug)
    .slice(0, 40)
    .map((b) => `- [${b.name}](${origin}${cleanBase}${localePath}/brand/${encodeURIComponent(b.slug)})`);

  const body = [
    `# Partner Brands in ${cityLbl}`,
    "",
    description,
    "",
    ...(brandLines.length > 0 ? ["## Brands", "", ...brandLines, ""] : ["_Brand list not yet available._", ""]),
  ].join("\n");

  return `${frontmatter}\n\n${body}`;
}

function buildOccasionsListMarkdown({
  lang, country, city, origin, cleanBase, lastmod,
  occasions,
}) {
  const cityLbl = getCityLabel(lang, country, city);
  const countryLbl = getCountryLabel(lang, country);
  const localePath = `/${lang}-${country}/${city}`;
  const canonicalUrl = `${origin}${cleanBase}${localePath}/occasions`;
  const markdownUrl = `${canonicalUrl}.md`;

  const descTemplate =
    DESCRIPTIONS.en?.occasions ??
    "Browse gifts by occasion in {city}, {country} — birthdays, anniversaries, weddings, sympathy, and more on Presentail.";
  const description = fmt(descTemplate, { city: cityLbl, country: countryLbl });

  const frontmatter = buildFrontmatter({
    title: `Shop by Occasion in ${cityLbl} | Presentail`,
    description,
    canonical_url: canonicalUrl,
    markdown_url: markdownUrl,
    language: lang,
    locale: `${lang}-${country}`,
    page_type: "occasions_list",
    site_name: "Presentail",
    last_modified: lastmod,
  });

  const occasionLines = occasions
    .filter((o) => o?.id && o?.name)
    .map((o) => {
      const count = typeof o.count === "number" ? ` (${o.count} products)` : "";
      return `- [${o.name}${count}](${origin}${cleanBase}${localePath}/occasion/${encodeURIComponent(o.id)})`;
    });

  const body = [
    `# Shop by Occasion in ${cityLbl}`,
    "",
    description,
    "",
    ...(occasionLines.length > 0 ? ["## Occasions", "", ...occasionLines, ""] : ["_Occasion list not yet available._", ""]),
  ].join("\n");

  return `${frontmatter}\n\n${body}`;
}

function buildCategoryMarkdown({
  lang, country, city, categorySlug, origin, cleanBase, lastmod,
  products, categories,
}) {
  const cityLbl = getCityLabel(lang, country, city);
  const countryLbl = getCountryLabel(lang, country);
  const localePath = `/${lang}-${country}/${city}`;
  const canonicalUrl = `${origin}${cleanBase}${localePath}/category/${encodeURIComponent(categorySlug)}`;
  const markdownUrl = `${canonicalUrl}.md`;

  const category = categories.find((c) => c?.id === categorySlug) ?? null;
  const categoryName = category?.name ?? categorySlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const descTemplate =
    DESCRIPTIONS.en?.category ??
    "Order from this gift category for delivery in {city}, {country} with Presentail.";
  const description = fmt(descTemplate, { city: cityLbl, country: countryLbl });

  const frontmatter = buildFrontmatter({
    title: `${categoryName} — Gift Delivery in ${cityLbl} | Presentail`,
    description,
    canonical_url: canonicalUrl,
    markdown_url: markdownUrl,
    language: lang,
    locale: `${lang}-${country}`,
    page_type: "category",
    site_name: "Presentail",
    last_modified: lastmod,
  });

  const categoryProducts = products
    .filter((p) => {
      if (!isListableProduct(p)) return false;
      const cats = Array.isArray(p.categories) ? p.categories : (Array.isArray(p.categoryIds) ? p.categoryIds : []);
      if (cats.length === 0) return false;
      return cats.some((c) => (typeof c === "string" ? c : c?.id ?? c?.slug) === categorySlug);
    })
    .sort(byRelevance)
    .slice(0, MAX_PRODUCTS_IN_LIST);

  const productLines = categoryProducts.map((p) => productLine(p, { origin, cleanBase, localePath }));

  const body = [
    `# ${categoryName} — Gift Delivery in ${cityLbl}`,
    "",
    description,
    "",
    ...(productLines.length > 0
      ? ["## Products in this Category", "", ...productLines, "", `[See all ${categoryName} products](${canonicalUrl})`, ""]
      : [`[Browse ${categoryName} products](${canonicalUrl})`, ""]),
  ].join("\n");

  return `${frontmatter}\n\n${body}`;
}

function buildOccasionMarkdown({
  lang, country, city, occasionSlug, origin, cleanBase, lastmod,
  products, occasions,
}) {
  const cityLbl = getCityLabel(lang, country, city);
  const countryLbl = getCountryLabel(lang, country);
  const localePath = `/${lang}-${country}/${city}`;
  const canonicalUrl = `${origin}${cleanBase}${localePath}/occasion/${encodeURIComponent(occasionSlug)}`;
  const markdownUrl = `${canonicalUrl}.md`;

  const occasion = occasions.find((o) => o?.id === occasionSlug) ?? null;
  const occasionName = occasion?.name ?? occasionSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const descTemplate =
    DESCRIPTIONS.en?.occasion ??
    "Shop the perfect gift for this occasion in {city}, {country} with same-day delivery from Presentail.";
  const description = fmt(descTemplate, { city: cityLbl, country: countryLbl });

  const frontmatter = buildFrontmatter({
    title: `${occasionName} Gifts in ${cityLbl} | Presentail`,
    description,
    canonical_url: canonicalUrl,
    markdown_url: markdownUrl,
    language: lang,
    locale: `${lang}-${country}`,
    page_type: "occasion",
    site_name: "Presentail",
    last_modified: lastmod,
  });

  const occasionProducts = products
    .filter((p) => {
      if (!isListableProduct(p)) return false;
      const occ = Array.isArray(p.occasions) ? p.occasions : [];
      return occ.includes(occasionSlug);
    })
    .sort(byRelevance)
    .slice(0, MAX_PRODUCTS_IN_LIST);

  const productLines = occasionProducts.map((p) => productLine(p, { origin, cleanBase, localePath }));

  const body = [
    `# ${occasionName} Gifts in ${cityLbl}`,
    "",
    description,
    "",
    ...(productLines.length > 0
      ? ["## Gift Ideas", "", ...productLines, "", `[See all ${occasionName} gifts](${canonicalUrl})`, ""]
      : [`[Browse ${occasionName} gifts](${canonicalUrl})`, ""]),
  ].join("\n");

  return `${frontmatter}\n\n${body}`;
}

function buildProductMarkdown({
  lang, country, city, productSlug, origin, cleanBase, lastmod,
  products, occasions,
}) {
  const cityLbl = getCityLabel(lang, country, city);
  const countryLbl = getCountryLabel(lang, country);
  const localePath = `/${lang}-${country}/${city}`;
  const canonicalUrl = `${origin}${cleanBase}${localePath}/product/${encodeURIComponent(productSlug)}`;
  const markdownUrl = `${canonicalUrl}.md`;

  const product = products.find((p) => productSlugOf(p) === productSlug) ?? null;
  const productName = product?.name ?? productSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const descTemplate =
    DESCRIPTIONS.en?.product ??
    "Order this gift for delivery in {city}, {country} with Presentail.";
  const description = fmt(descTemplate, { city: cityLbl, country: countryLbl });

  const availability =
    product?.status === "discontinued"
      ? "Discontinued"
      : product?.inStock === false
      ? "Out of Stock"
      : "In Stock";

  const frontmatter = buildFrontmatter({
    title: `${productName} | Gift Delivery in ${cityLbl} | Presentail`,
    description: product?.description ? String(product.description).slice(0, 200) : description,
    canonical_url: canonicalUrl,
    markdown_url: markdownUrl,
    language: lang,
    locale: `${lang}-${country}`,
    page_type: "product",
    site_name: "Presentail",
    last_modified: lastmod,
  });

  const productBrand = product ? (Array.isArray(product.brandNames) ? product.brandNames[0] : null) : null;
  // Discount-aware price: "$40 (was $50)" or "$50". productPriceStr returns
  // " — <price>"; strip the leading separator for the detail line.
  const priceStr = product ? productPriceStr(product).replace(/^ — /, "") : "";
  const productPrice = priceStr || null;
  const productCategories = product && Array.isArray(product.categoryNames)
    ? product.categoryNames.filter(Boolean)
    : [];
  const productOccasions = product && Array.isArray(product.occasions)
    ? product.occasions
        .map((slug) => occasions.find((o) => o?.id === slug)?.name ?? slug)
        .filter(Boolean)
    : [];

  const detailLines = [
    productBrand ? `- **Brand**: ${productBrand}` : null,
    productPrice ? `- **Price**: ${productPrice}` : null,
    productCategories.length > 0 ? `- **Categories**: ${productCategories.join(", ")}` : null,
    `- **Availability**: ${availability}`,
    `- **Delivery**: ${cityLbl}, ${countryLbl}`,
    productOccasions.length > 0 ? `- **Perfect for**: ${productOccasions.join(", ")}` : null,
  ].filter(Boolean);

  const body = [
    `# ${productName}`,
    "",
    product?.description
      ? String(product.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : description,
    "",
    "## Details",
    "",
    ...detailLines,
    "",
    `[Order now](${canonicalUrl})`,
    "",
    `[Back to shop](${origin}${cleanBase}${localePath}/shop)`,
  ].join("\n");

  return `${frontmatter}\n\n${body}`;
}

function buildBrandMarkdown({
  lang, country, city, brandSlug, origin, cleanBase, lastmod,
  products, brands,
}) {
  const cityLbl = getCityLabel(lang, country, city);
  const countryLbl = getCountryLabel(lang, country);
  const localePath = `/${lang}-${country}/${city}`;
  const canonicalUrl = `${origin}${cleanBase}${localePath}/brand/${encodeURIComponent(brandSlug)}`;
  const markdownUrl = `${canonicalUrl}.md`;

  const brand = brands.find((b) => b?.slug === brandSlug) ?? null;
  const brandName = brand?.name ?? brandSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const descTemplate =
    DESCRIPTIONS.en?.brand ??
    "Shop this brand's full collection for delivery in {city}, {country} on Presentail.";
  const description = fmt(descTemplate, { city: cityLbl, country: countryLbl });

  const frontmatter = buildFrontmatter({
    title: `${brandName} — Brand Collection in ${cityLbl} | Presentail`,
    description,
    canonical_url: canonicalUrl,
    markdown_url: markdownUrl,
    language: lang,
    locale: `${lang}-${country}`,
    page_type: "brand",
    site_name: "Presentail",
    last_modified: lastmod,
  });

  const brandProducts = products
    .filter((p) => {
      if (!isListableProduct(p)) return false;
      const names = Array.isArray(p.brandNames) ? p.brandNames : [];
      return names.some((n) => typeof n === "string" && n.toLowerCase() === brandName.toLowerCase());
    })
    .sort(byRelevance)
    .slice(0, MAX_PRODUCTS_IN_LIST);

  const productLines = brandProducts.map((p) => productLine(p, { origin, cleanBase, localePath }));

  const body = [
    `# ${brandName}`,
    "",
    description,
    "",
    ...(brand?.description ? [String(brand.description).replace(/<[^>]+>/g, " ").trim(), ""] : []),
    ...(productLines.length > 0
      ? ["## Products", "", ...productLines, "", `[See full collection](${canonicalUrl})`, ""]
      : [`[Browse ${brandName} products](${canonicalUrl})`, ""]),
  ].join("\n");

  return `${frontmatter}\n\n${body}`;
}

function buildBestSellersMarkdown({
  lang, country, city, origin, cleanBase, lastmod, products,
}) {
  const cityLbl = getCityLabel(lang, country, city);
  const countryLbl = getCountryLabel(lang, country);
  const localePath = `/${lang}-${country}/${city}`;
  const canonicalUrl = `${origin}${cleanBase}${localePath}/best-sellers`;
  const markdownUrl = `${canonicalUrl}.md`;

  const description = fmt(
    DESCRIPTIONS.en?.shop ??
      "Browse Presentail's curated bouquets, cakes and luxury gifts for delivery in {city}, {country}.",
    { city: cityLbl, country: countryLbl }
  );

  const frontmatter = buildFrontmatter({
    title: `Best Sellers — Flowers & Gifts in ${cityLbl} | Presentail`,
    description,
    canonical_url: canonicalUrl,
    markdown_url: markdownUrl,
    language: lang,
    locale: `${lang}-${country}`,
    page_type: "best_sellers",
    site_name: "Presentail",
    last_modified: lastmod,
  });

  const topProducts = products
    .filter(isListableProduct)
    .sort(byRelevance)
    .slice(0, MAX_PRODUCTS_IN_LIST);

  const productLines = topProducts.map((p) => productLine(p, { origin, cleanBase, localePath }));

  const body = [
    `# Best Sellers in ${cityLbl}`,
    "",
    description,
    "",
    ...(productLines.length > 0
      ? ["## Top Products", "", ...productLines, "", `[See all best sellers](${canonicalUrl})`, ""]
      : [`[Browse best-selling products](${canonicalUrl})`, ""]),
    `[Back to ${cityLbl}](${origin}${cleanBase}${localePath})`,
  ].join("\n");

  return `${frontmatter}\n\n${body}`;
}

function buildStaticPageMarkdown({
  lang, country, city, pageKey, origin, cleanBase, lastmod,
}) {
  const cityLbl = getCityLabel(lang, country, city);
  const countryLbl = getCountryLabel(lang, country);
  const localePath = `/${lang}-${country}/${city}`;

  const subpathMap = {
    contact: "/contact",
    faqs: "/faqs",
    weddings: "/weddings",
    corporate: "/corporate",
  };
  const subpath = subpathMap[pageKey] ?? `/${pageKey}`;
  const canonicalUrl = `${origin}${cleanBase}${localePath}${subpath}`;
  const markdownUrl = `${canonicalUrl}.md`;

  const titleMap = {
    contact: `Contact Presentail in ${cityLbl} | Gift Delivery Help`,
    faqs: `Flower Delivery FAQs in ${cityLbl} | Presentail`,
    weddings: `Wedding Flowers in ${cityLbl} | Presentail`,
    corporate: `Corporate Gifting in ${cityLbl} | Presentail`,
  };
  const title = titleMap[pageKey] ?? `${pageKey.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} | Presentail`;

  const descKey = pageKey;
  const descTemplate = DESCRIPTIONS.en?.[descKey] ?? `Presentail gift and flower delivery services in ${cityLbl}, ${countryLbl}.`;
  const description = fmt(descTemplate, { city: cityLbl, country: countryLbl });

  const frontmatter = buildFrontmatter({
    title,
    description,
    canonical_url: canonicalUrl,
    markdown_url: markdownUrl,
    language: lang,
    locale: `${lang}-${country}`,
    page_type: pageKey,
    site_name: "Presentail",
    last_modified: lastmod,
  });

  const headingMap = {
    contact: `Contact Presentail in ${cityLbl}`,
    faqs: `Flower Delivery FAQs — ${cityLbl}`,
    weddings: `Wedding Flowers & Floral Design in ${cityLbl}`,
    corporate: `Corporate Gifting in ${cityLbl}`,
  };
  const heading = headingMap[pageKey] ?? title;

  const bodyAddition = {
    contact: `\nFor order support, delivery tracking, custom requests and partnership enquiries, contact the Presentail concierge in ${cityLbl}.\n\n[Visit contact page](${canonicalUrl})`,
    faqs: `\nAnswers to common questions about Presentail flower and gift delivery in ${cityLbl}, including delivery windows, payment options, cancellations and returns.\n\n[Visit FAQs page](${canonicalUrl})`,
    weddings: `\nBespoke floral design and styling for weddings and private events in ${cityLbl} by the Presentail atelier, with same-day guest gift delivery.\n\n[Plan your wedding flowers](${canonicalUrl})`,
    corporate: `\nCorporate gifting programmes from Presentail in ${cityLbl} — curated client and team gifts at scale, with branded packaging and consolidated invoicing.\n\n[Explore corporate gifting](${canonicalUrl})`,
  };

  const body = [
    `# ${heading}`,
    "",
    description,
    bodyAddition[pageKey] ?? `\n[Visit this page](${canonicalUrl})`,
    "",
    `[Back to ${cityLbl}](${origin}${cleanBase}${localePath})`,
  ].join("\n");

  return `${frontmatter}\n\n${body}`;
}

// ---------------------------------------------------------------------------
// Sitemap Markdown builder
//
// Builds the content for /sitemap.md — an index of all public Markdown mirrors
// grouped by section. Used both by the serve.mjs sitemap.md route and by
// getMarkdownForPath when pathname === "/sitemap.md".
// ---------------------------------------------------------------------------

/**
 * Build the /sitemap.md content as a Markdown index of all public mirrors.
 * Pure and synchronous — all catalog data must be pre-fetched by the caller.
 *
 * @param {object} args
 * @param {string} args.origin       - e.g. "https://presentail.com"
 * @param {string} args.basePath     - deploy prefix, e.g. "" or "/web"
 * @param {Array}  args.categories   - [{ id, name }]
 * @param {Array}  args.occasions    - [{ id, name }]
 * @param {Array}  args.brands       - [{ slug, name }]
 * @param {Array}  args.products     - [{ slug, name }]
 * @param {string} args.lastmod      - YYYY-MM-DD
 * @returns {string}
 */
export function buildSitemapMd({
  origin,
  basePath = "",
  categories = [],
  occasions = [],
  brands = [],
  products = [],
  lastmod = new Date().toISOString().slice(0, 10),
} = {}) {
  const cleanBase = (basePath ?? "").replace(/\/$/, "");
  const markdownUrl = `${origin}${cleanBase}/sitemap.md`;

  const COUNTRY_LABELS = { lb: "Lebanon", ae: "UAE", cy: "Cyprus" };
  const LANG_LABELS = { en: "English", ar: "Arabic", fr: "French" };

  // Enumerate ALL locale+city combinations (every public indexable city page).
  // Uses SITEMAP_CITIES (the full set) × SITEMAP_LANGS.
  const homepageLines = [];
  for (const lang of SITEMAP_LANGS) {
    for (const [country, cities] of Object.entries(SITEMAP_CITIES)) {
      for (const city of cities) {
        const cityLbl = getCityLabel(lang, country, city);
        homepageLines.push(
          `- [${COUNTRY_LABELS[country] ?? country} – ${cityLbl} (${LANG_LABELS[lang] ?? lang})](${origin}${cleanBase}/${lang}-${country}/${city}.md)`
        );
      }
    }
  }

  // Enumerate all catalog entities — no artificial caps; same scope as sitemap.xml.
  const categoryLines = categories
    .filter((c) => c?.id && c?.name)
    .map((c) => `- [${c.name}](${origin}${cleanBase}/en-lb/beirut/category/${encodeURIComponent(c.id)}.md)`);

  const occasionLines = occasions
    .filter((o) => o?.id && o?.name)
    .map((o) => `- [${o.name}](${origin}${cleanBase}/en-lb/beirut/occasion/${encodeURIComponent(o.id)}.md)`);

  const brandLines = brands
    .filter((b) => b?.slug && b?.name)
    .map((b) => `- [${b.name}](${origin}${cleanBase}/en-lb/beirut/brand/${encodeURIComponent(b.slug)}.md)`);

  const productLines = products
    .filter((p) => productSlugOf(p) && p?.name && p.status !== "discontinued")
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .map((p) => `- [${p.name}](${origin}${cleanBase}/en-lb/beirut/product/${encodeURIComponent(productSlugOf(p))}.md)`);

  // Enumerate all per-city best-sellers + shop pages for canonical cities.
  const shopLines = [];
  const bestSellersLines = [];
  for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
    const cityLbl = getCityLabel("en", country, city);
    shopLines.push(`- [Shop — ${cityLbl} (${COUNTRY_LABELS[country]})](${origin}${cleanBase}/en-${country}/${city}/shop.md)`);
    bestSellersLines.push(`- [Best Sellers — ${cityLbl} (${COUNTRY_LABELS[country]})](${origin}${cleanBase}/en-${country}/${city}/best-sellers.md)`);
  }

  const lines = [
    "---",
    `title: "Presentail — Markdown Mirror Index"`,
    `description: "Index of all public Markdown mirrors for Presentail pages. Every HTML page has a Markdown twin at .md and via Accept: text/markdown."`,
    `canonical_url: "${markdownUrl}"`,
    `markdown_url: "${markdownUrl}"`,
    `page_type: "sitemap_md"`,
    `language: "en"`,
    `locale: "global"`,
    `site_name: "Presentail"`,
    `last_modified: "${lastmod}"`,
    "---",
    "",
    "# Presentail — Markdown Mirror Index",
    "",
    "Every public Presentail page has a Markdown twin served at `<path>.md` and also via",
    "`Accept: text/markdown` content negotiation. This index enumerates all public mirrors",
    "grouped by page type, covering all indexed locale+city combinations.",
    "",
    "> **Primary SEO sitemap**: Use `/sitemap.xml` for search engines.",
    "> This file is for AI agents and structured crawlers.",
    "",
    "## City Homepages",
    "",
    ...homepageLines,
    "",
    "## Shop Pages",
    "",
    ...shopLines,
    "",
    "## Best-Sellers Pages",
    "",
    ...bestSellersLines,
    "",
    ...(categoryLines.length > 0 ? ["## Categories", "", ...categoryLines, ""] : []),
    ...(occasionLines.length > 0 ? ["## Occasions", "", ...occasionLines, ""] : []),
    ...(brandLines.length > 0 ? ["## Brands", "", ...brandLines, ""] : []),
    ...(productLines.length > 0 ? ["## Products", "", ...productLines, ""] : []),
    "## Other Machine-Readable Indexes",
    "",
    `- [llms.txt (concise index for AI agents)](${origin}${cleanBase}/llms.txt)`,
    `- [llms-full.txt (full content for AI agents)](${origin}${cleanBase}/llms-full.txt)`,
    `- [sitemap.xml (primary XML sitemap for search engines)](${origin}${cleanBase}/sitemap.xml)`,
    `- [agents.md (AI agent guidance)](${origin}${cleanBase}/agents.md)`,
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main entry: getMarkdownForPath
// ---------------------------------------------------------------------------

/**
 * Build Markdown for the given pathname. Accepts either a `.md`-suffixed URL
 * or a plain HTML URL. Returns null for unrecognised or non-public paths.
 *
 * @param {string} pathname    - URL path (with or without .md suffix)
 * @param {object} [opts]
 * @param {string} [opts.origin]      - Request origin, e.g. "https://presentail.com"
 * @param {string} [opts.basePath]    - Artifact base prefix, e.g. "" or "/web"
 * @param {(url: string) => Promise<any>} [opts.fetchJson] - JSON fetcher
 * @param {string} [opts.apiBaseUrl]  - Internal API base URL
 * @returns {Promise<string|null>}
 */
export async function getMarkdownForPath(
  pathname,
  { origin = CANONICAL_DOMAIN, basePath = "", fetchJson, apiBaseUrl } = {}
) {
  if (!pathname) return null;

  const htmlPath = pathname.endsWith(".md") ? pathname.slice(0, -3) : pathname;

  // Handle /sitemap.md specially
  if (htmlPath === "/sitemap" || htmlPath === "/sitemap.md" || pathname === "/sitemap.md") {
    let catalog = { products: [], brands: [], occasions: [], categories: [] };
    if (fetchJson && apiBaseUrl) {
      catalog = await getCatalogData(fetchJson, apiBaseUrl);
    }
    return buildSitemapMd({
      origin,
      basePath,
      ...catalog,
      lastmod: new Date().toISOString().slice(0, 10),
    });
  }

  if (!isMirroredPath(htmlPath)) return null;

  const m = htmlPath.match(LOCALE_RE);
  if (!m) return null;
  const [, lang, country, city, rest = ""] = m;
  const subroute = rest || "";
  const cleanBase = (basePath ?? "").replace(/\/$/, "");
  const lastmod = new Date().toISOString().slice(0, 10);

  // Fetch catalog data (cached, non-fatal)
  let catalog = { products: [], brands: [], occasions: [], categories: [] };
  if (fetchJson && apiBaseUrl) {
    catalog = await getCatalogData(fetchJson, apiBaseUrl);
  }

  const baseArgs = { lang, country, city, origin, cleanBase, lastmod, ...catalog };

  if (subroute === "" || subroute === "/") {
    return buildCityHomeMarkdown(baseArgs);
  }
  if (subroute === "/shop") {
    return buildShopMarkdown(baseArgs);
  }
  if (subroute === "/brands") {
    return buildBrandsListMarkdown(baseArgs);
  }
  if (subroute === "/occasions") {
    return buildOccasionsListMarkdown(baseArgs);
  }
  if (subroute === "/contact") {
    return buildStaticPageMarkdown({ ...baseArgs, pageKey: "contact" });
  }
  if (subroute === "/faqs") {
    return buildStaticPageMarkdown({ ...baseArgs, pageKey: "faqs" });
  }
  if (subroute === "/weddings") {
    return buildStaticPageMarkdown({ ...baseArgs, pageKey: "weddings" });
  }
  if (subroute === "/corporate") {
    return buildStaticPageMarkdown({ ...baseArgs, pageKey: "corporate" });
  }
  if (subroute === "/best-sellers") {
    return buildBestSellersMarkdown(baseArgs);
  }
  if (subroute.startsWith("/category/")) {
    const categorySlug = decodeURIComponent(subroute.slice("/category/".length));
    if (!categorySlug) return null;
    // Return null when catalog is populated but slug is absent — avoids 200 for
    // nonexistent entities. When catalog is empty (cold start) we also 404 since
    // we cannot verify existence.
    if (catalog.categories.length === 0) return null;
    if (!catalog.categories.some((c) => c?.id === categorySlug)) return null;
    return buildCategoryMarkdown({ ...baseArgs, categorySlug });
  }
  if (subroute.startsWith("/occasion/")) {
    const occasionSlug = decodeURIComponent(subroute.slice("/occasion/".length));
    if (!occasionSlug) return null;
    if (catalog.occasions.length === 0) return null;
    if (!catalog.occasions.some((o) => o?.id === occasionSlug)) return null;
    return buildOccasionMarkdown({ ...baseArgs, occasionSlug });
  }
  if (subroute.startsWith("/product/")) {
    const productSlug = decodeURIComponent(subroute.slice("/product/".length));
    if (!productSlug) return null;
    if (catalog.products.length === 0) return null;
    if (!catalog.products.some((p) => productSlugOf(p) === productSlug)) return null;
    return buildProductMarkdown({ ...baseArgs, productSlug });
  }
  if (subroute.startsWith("/brand/")) {
    const brandSlug = decodeURIComponent(subroute.slice("/brand/".length));
    if (!brandSlug) return null;
    if (catalog.brands.length === 0) return null;
    if (!catalog.brands.some((b) => b?.slug === brandSlug)) return null;
    return buildBrandMarkdown({ ...baseArgs, brandSlug });
  }

  if (subroute.startsWith("/blog/")) {
    const blogSlug = decodeURIComponent(subroute.slice("/blog/".length).replace(/\/$/, ""));
    if (!blogSlug) return null;
    const articlesByLang = BLOG_POSTS[blogSlug];
    if (!articlesByLang) return null;
    const article = articlesByLang[lang] ?? articlesByLang.en;
    if (!article) return null;
    return buildBlogPostMarkdown({ article, lang, country, city, origin, cleanBase, lastmod });
  }

  return null;
}

/**
 * Build Markdown for a blog article page.
 *
 * @param {object} opts
 * @param {object} opts.article     - Blog article object from BLOG_POSTS
 * @param {string} opts.lang        - Language code
 * @param {string} opts.country     - Country code
 * @param {string} opts.city        - City slug
 * @param {string} opts.origin      - Site origin
 * @param {string} opts.cleanBase   - Base path prefix (no trailing slash)
 * @param {string} opts.lastmod     - ISO date string for frontmatter
 * @returns {string}
 */
function buildBlogPostMarkdown({ article, lang, country, city, origin, cleanBase, lastmod }) {
  const localeBase = `${origin}${cleanBase}/${lang}-${country}/${city}`;
  const slug = article.slug ?? "";
  const canonical = `${localeBase}/blog/${slug}`;
  const lines = [
    "---",
    `title: "${(article.title ?? "").replace(/"/g, '\\"')}"`,
    `description: "${(article.description ?? "").replace(/"/g, '\\"')}"`,
    `url: "${canonical}"`,
    `date_published: "${article.datePublished ?? lastmod}"`,
    `lang: "${lang}"`,
    `country: "${country}"`,
    `city: "${city}"`,
    `canonical: "${canonical}"`,
    "---",
    "",
    `# ${article.title ?? ""}`,
    "",
  ];
  if (article.datePublished) {
    lines.push(`*Published: ${article.datePublished}*`, "");
  }
  if (article.description) {
    lines.push(article.description, "");
  }
  const sections = Array.isArray(article.sections) ? article.sections : [];
  for (const sec of sections) {
    if (sec.heading) lines.push(`## ${sec.heading}`, "");
    if (sec.body) lines.push(sec.body, "");
  }
  lines.push(
    "---",
    "",
    `[← Back to Journal](${localeBase}/blog)`,
    `[Browse all gifts](${localeBase}/shop)`,
  );
  return lines.join("\n");
}

/**
 * Build Markdown for the root homepage (/). Used by the /index.md route and
 * Accept: text/markdown content negotiation on /. Does not require catalog data
 * because the homepage overview is static editorial copy.
 *
 * @param {object} opts
 * @param {string} [opts.origin] - Site origin, e.g. "https://presentail.com"
 * @returns {string}
 */
export function buildHomepageMarkdown({ origin = "https://presentail.com" } = {}) {
  return [
    "---",
    'title: "Presentail — Luxury Flower & Gift Delivery in Lebanon, UAE, and Cyprus"',
    'description: "Order curated bouquets, gift boxes, chocolates, and more online. Same-day Express delivery or scheduled delivery across Lebanon, UAE, and Cyprus."',
    `url: "${origin}/"`,
    `canonical: "${origin}/"`,
    "---",
    "",
    "# Presentail",
    "",
    "> Luxury flower and gift delivery in Lebanon, the UAE, and Cyprus.",
    "",
    "## About",
    "",
    "Presentail is a curated gift delivery platform. Browse hundreds of arrangements, gift boxes,",
    "hampers, chocolates, plants, and premium lifestyle gifts from top local and international brands.",
    "Order online or via the iOS / Android app with same-day Express or scheduled delivery.",
    "",
    "## Delivery Areas",
    "",
    "- **Lebanon**: Beirut, Jounieh, Jbeil, Metn, Baabda, Aley, Chouf, and more",
    "- **UAE**: Dubai, Abu Dhabi",
    "- **Cyprus**: Nicosia, Limassol, Larnaca, Paphos",
    "",
    "## Languages",
    "",
    "All pages are available in English, Arabic, and French.",
    "",
    "## Payment Methods",
    "",
    "Credit/debit card (Stripe), Mamo Pay, PayPal, Whish Money, Western Union.",
    "",
    "## Key Pages",
    "",
    `- [Shop — Beirut](${origin}/en-lb/beirut/shop)`,
    `- [Brands](${origin}/en-lb/beirut/brands)`,
    `- [Occasions](${origin}/en-lb/beirut/occasions)`,
    `- [Blog / Journal](${origin}/en-lb/beirut/blog)`,
    `- [Corporate Gifting](${origin}/en-lb/beirut/corporate)`,
    `- [Weddings](${origin}/en-lb/beirut/weddings)`,
    `- [Contact](${origin}/en-lb/beirut/contact)`,
    `- [FAQs](${origin}/en-lb/beirut/faqs)`,
    "",
    "## Machine-Readable Resources",
    "",
    `- [LLM index](${origin}/llms.txt)`,
    `- [Full LLM content](${origin}/llms-full.txt)`,
    `- [Sitemap (Markdown)](${origin}/sitemap.md)`,
    `- [Agent guidance](${origin}/agents.md)`,
    `- [XML Sitemap](${origin}/sitemap.xml)`,
  ].join("\n");
}

/**
 * Invalidate the in-process catalog cache so the next getMarkdownForPath call
 * triggers a fresh fetch. Called by serve.mjs when the OS catalog webhook fires
 * (same pattern as sitemapCache / llmsFullTxtCache invalidation).
 */
export function invalidateMarkdownCatalogCache() {
  _catalogCache = null;
  _catalogCacheTsMs = 0;
}
