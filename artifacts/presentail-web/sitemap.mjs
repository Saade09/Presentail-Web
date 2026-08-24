// Sitemap generation extracted from serve.mjs so its filtering / hreflang /
// lastmod logic can be unit-tested without booting the HTTP server.
//
// `buildSitemapXml` is a pure, synchronous function that takes already-fetched
// catalog data and returns the sitemap XML string. `generateSitemap` is a thin
// async wrapper that fetches the catalog (products, brands, occasions,
// categories) and delegates to the pure builder.

import { BLOG_POSTS } from "@workspace/blog-content";
import { isPageEligible, MIN_PRODUCTS_BY_TYPE } from "./scripts/pageEligibility.mjs";
import { getOccasionSeoContent } from "./src/data/occasionSeoContent.mjs";
import { getCategorySeoContent, CATEGORY_SEO_CONTENT } from "./src/data/categorySeoContent.mjs";
import { buildProductImageAlt } from "./imageAlt.mjs";
import {
  getProductAvailabilityState,
  PRODUCT_AVAILABILITY_STATE,
} from "./seo-inject.mjs";
import { HUB_CITY, hreflangLangsForCountry } from "./src/lib/hreflang.mjs";

const PAGINATION_PAGE_SIZE = 24;
const PAGINATION_SITEMAP_MAX_PAGES = 10;

// All cities per country — must mirror CITY_SLUGS_BY_COUNTRY in seo-inject.mjs.
export const SITEMAP_CITIES = {
  lb: [
    "akkar", "aley", "baabda", "baalbeck", "batroun", "bcharee", "beirut",
    "bent-jbeil", "chouf", "hasbaya", "hermel", "jbeil", "jezzine",
    "kesserwan", "koura", "marjayoun", "metn", "minnieh-dennaya", "nabatieh",
    "rechaya", "saida", "tripoli", "tyre", "west-bekaa", "zahle", "zghorta",
  ],
  ae: ["abu-dhabi", "ajman", "dubai", "fujairah", "ras-al-khaimah", "sharjah", "umm-al-quwain"],
  cy: ["larnaca", "limassol", "nicosia", "paphos"],
};
export const SITEMAP_LANGS = ["en", "ar", "fr", "el"];
// Blog content exists in EN/AR/FR only — the Greek child sitemap carries no
// blog URLs and blog hreflang clusters never reference /el/blog.
export const SITEMAP_BLOG_LANGS = ["en", "ar", "fr"];
// Hub city per country for product / brand canonical URLs. Re-exported from
// the shared hreflang module so entity-page canonicals (seo-inject.mjs) and
// sitemap URLs can never disagree about which city is the hub.
export const SITEMAP_CANONICAL_CITIES = HUB_CITY;
// Static sub-paths included for every lang / country / city combination.
// /shop is intentionally omitted — category and occasion clean paths
// (/category/<slug>, /occasion/<slug>) are emitted dynamically below so
// crawlers discover the canonical destinations without following a redirect.
// Group A pages (city-specific, indexable) are included per city × lang.
// Group B pages (privacy, terms, careers, partner) are noindex and
// excluded from the sitemap entirely to avoid wasting crawl budget.
// The blog index (/blog) is indexable but emitted separately below at the
// canonical hub cities only (like blog posts) rather than per city.
export const SITEMAP_STATIC_PATHS = [
  "/", "/brands", "/occasions", "/contact", "/faqs",
  "/weddings", "/corporate",
];

export function escXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build the sitemap XML from already-fetched catalog data. Pure and
 * synchronous so it can be unit-tested with mock data.
 *
 * @param {object} args
 * @param {string} args.origin       - e.g. "https://presentail.com"
 * @param {string} args.basePath     - deploy prefix, e.g. "/" or "/web"
 * @param {Array}  [args.products]   - [{ slug, name?, imageUrl? }]
 * @param {Array}  [args.brands]     - [{ slug }]
 * @param {Array}  [args.occasions]  - [{ id, count }]
 * @param {Array}  [args.categories] - [{ id, count }]
 * @param {string} [args.locale]     - "en" | "ar" | "fr"; each <loc> uses this
 *                                     language prefix so the sitemap can be
 *                                     generated once per locale (child sitemaps
 *                                     of the /sitemap.xml index). Defaults "en".
 * @returns {string} sitemap XML
 */
export function buildSitemapXml({
  origin,
  basePath,
  locale = "en",
  products = [],
  /**
   * Per-hub-city product lists keyed by country code ("lb", "ae", "cy").
   * When provided, each hub city's product URLs are limited to the products
   * that are actually deliverable there (i.e. returned by a city-filtered
   * /api/woo/products?countryCode=…&cityId=… call). This prevents the sitemap
   * from emitting URLs that the product route would return 410 for because the
   * product is not offered in that city. Falls back to the global `products`
   * list for any country key that is absent, preserving backward-compat with
   * unit tests that supply a single flat list.
   */
  productsByCountry = null,
  brands = [],
  occasions = [],
  /**
   * Per-hub-city occasion lists keyed by country code ("lb", "ae", "cy"),
   * each containing occasion objects whose `count` reflects the per-country
   * product count. When provided, a city's occasion URLs are only emitted
   * when that country's data shows count > 0 (i.e. the occasion actually has
   * products deliverable there). Falls back to the global `occasions` list.
   */
  occasionsByCountry = null,
  categories = [],
  /**
   * Per-hub-city category lists keyed by country code ("lb", "ae", "cy"),
   * each containing category objects whose `count` reflects the per-country
   * product count. When provided, a city's category URLs are only emitted
   * when that country's data shows count > 0. Falls back to `categories`.
   */
  categoriesByCountry = null,
  blogPosts: blogPostsArg = null,
  /**
   * Optional mutable report collector. When provided, the function accumulates
   * per-pageType eligible/ineligible counts into `reportRef.counts` so callers
   * can print a JSON summary without a separate traversal.
   * Shape: { counts: { [pageType]: { eligible: number, ineligible: number } } }
   */
  reportRef = null,
  /**
   * Total product count across the full catalog (e.g. `products.length` from
   * the /api/woo/products response). Used as `parentProductCount` in
   * brand/occasion/category eligibility checks so the uniqueness-ratio and
   * identical-inventory rules can fire at sitemap build time.
   *
   * Per-city product counts are not available at sitemap build time for
   * brands/occasions/categories, so we use this global total as a conservative
   * proxy: if the collection represents a very small or identical fraction of
   * the whole catalog, the city page is treated as thin/duplicate and excluded.
   *
   * null = unknown (ratio rules are skipped — callers should always supply this
   * when productsData is available to ensure ratio checks are enforced).
   */
  totalProductCount = null,
  /**
   * ISO-8601 date string (YYYY-MM-DD) representing when this sitemap was
   * generated. Used as <lastmod> for all static and catalog entries where
   * a real per-entity modification timestamp is unavailable. Using the
   * generation date is an honest proxy: if the sitemap regenerated, the
   * catalog was re-fetched and the content was verified as of that date.
   * Blog posts carry their own real datePublished and ignore this value.
   * Omit (or pass null) to suppress <lastmod> on non-blog entries.
   */
  generatedAt = null,
} = {}) {
  const cleanBase = (basePath ?? "/").replace(/\/$/, "");
  const lang = SITEMAP_LANGS.includes(locale) ? locale : "en";

  // Greek ("el") is Cyprus-only: the Greek child sitemap must not emit URLs
  // for Lebanon or UAE, and non-Cyprus clusters must not list el alternates.
  const skipCountryForLang = (country) =>
    !hreflangLangsForCountry(country).includes(lang);

  // Accumulate eligibility counts into reportRef when provided.
  const recordEligibility = (pageType, eligible) => {
    if (!reportRef) return;
    if (!reportRef.counts) reportRef.counts = {};
    if (!reportRef.counts[pageType]) reportRef.counts[pageType] = { eligible: 0, ineligible: 0 };
    reportRef.counts[pageType][eligible ? "eligible" : "ineligible"]++;
  };

  // Plain <url> entry for un-prefixed, language-agnostic paths (root, llms.txt).
  // No <lastmod>: there is no real modification timestamp for these pages, and
  // fabricating one (e.g. "today") teaches crawlers to distrust the field.
  const urlEntry = (loc, priority, changefreq) =>
    `  <url><loc>${escXml(origin + cleanBase + loc)}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;

  // <url> entry for a locale-prefixed path that also lists every language
  // variant via <xhtml:link rel="alternate" hreflang>. `rest` is the path after
  // the `/{lang}-{country}/{city}` prefix ("" for the home page, otherwise
  // beginning with "/"). The <loc> uses this builder's `lang` prefix; the
  // alternates always list all three languages reciprocally (same city, same
  // country) so every child sitemap's entries agree with the page-level
  // hreflang. x-default points at the English variant.
  // `imageBlock` is an optional <image:image> XML string to embed for product URLs.
  // `lastmod` defaults to `generatedAt` (the sitemap build date) for all
  // static and catalog entries — an honest proxy for "content verified as of
  // this date". Blog posts pass their real datePublished and override it.
  const urlEntryWithAlternates = (priority, changefreq, country, city, rest, imageBlock = "", lastmod = generatedAt) => {
    const loc = origin + cleanBase + `/${lang}-${country}/${city}${rest}`;
    const alternates = hreflangLangsForCountry(country).map((altLang) => {
      const href = origin + cleanBase + `/${altLang}-${country}/${city}${rest}`;
      const code = `${altLang}-${country.toUpperCase()}`;
      return `    <xhtml:link rel="alternate" hreflang="${escXml(code)}" href="${escXml(href)}"/>`;
    });
    const xDefaultHref = origin + cleanBase + `/en-${country}/${city}${rest}`;
    alternates.push(
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${escXml(xDefaultHref)}"/>`,
    );
    const imageSection = imageBlock ? `\n${imageBlock}` : "";
    const lastmodLine = lastmod ? `\n    <lastmod>${escXml(lastmod)}</lastmod>` : "";
    return `  <url>\n    <loc>${escXml(loc)}</loc>${lastmodLine}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n${alternates.join("\n")}${imageSection}\n  </url>`;
  };

  /**
   * Build an <image:image> block for a product's primary photo.
   * @param {string} imageUrl
   * @param {string} title
   * @param {string} caption
   */
  const buildImageBlock = (imageUrl, title, caption) => {
    if (!imageUrl) return "";
    return (
      `    <image:image>\n` +
      `      <image:loc>${escXml(imageUrl)}</image:loc>\n` +
      `      <image:title>${escXml(title)}</image:title>\n` +
      `      <image:caption>${escXml(caption)}</image:caption>\n` +
      `    </image:image>`
    );
  };

  const urls = [];

  // 0. Root landing page (un-prefixed, language-agnostic entry point).
  // Emitted only in the English child sitemap so the URL appears exactly once
  // across the sitemap index (duplicating it per locale would inflate counts).
  if (lang === "en") {
    urls.push(urlEntry("/", "1.0", "weekly"));
  }

  // 1. Static locale pages — one <url> per country × city, each carrying its
  // language alternates (so the three languages collapse into a single block
  // instead of three separate <url> entries).
  for (const [country, cities] of Object.entries(SITEMAP_CITIES)) {
    if (skipCountryForLang(country)) continue;
    for (const city of cities) {
      for (const subpath of SITEMAP_STATIC_PATHS) {
        const rest = subpath === "/" ? "" : subpath;
        const priority = subpath === "/" ? "0.9" : "0.7";
        urls.push(urlEntryWithAlternates(priority, "weekly", country, city, rest));
      }
    }
  }

  // 2. Products — canonical-city URLs per country (each block carries all
  // language alternates). When a product has a primary image URL and name,
  // an <image:image> extension is embedded for Google Images discovery.
  //
  // Lifecycle filtering:
  //  - DISCONTINUED → omitted entirely (product returns 410; must not appear
  //    in the sitemap or Google will flag the submitted URL as an error).
  //  - SOLD_OUT_TEMPORARILY / SEASONAL_UNAVAILABLE → included but with a
  //    lower crawl-priority signal (0.4 vs 0.8) so Googlebot deprioritises
  //    re-crawling pages that are currently out of stock.
  //  - ACTIVE (or unknown) → standard priority 0.8.
  //
  // Per-city deliverability: when `productsByCountry` is supplied each hub
  // city only emits URLs for products returned by the city-filtered API call,
  // so we never submit a URL that the product route would serve as 410.
  // The outer loop is keyed by city so per-city product lists can be applied
  // directly; when `productsByCountry` is absent the single `products` list
  // is used for every city (backward-compat for unit tests).
  for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
    if (skipCountryForLang(country)) continue;
    const cityProducts = productsByCountry?.[country] ?? products;
    for (const product of cityProducts) {
      if (!product?.slug) continue;
      const availState = getProductAvailabilityState(product);
      if (availState === PRODUCT_AVAILABILITY_STATE.DISCONTINUED) continue;
      const priority =
        availState === PRODUCT_AVAILABILITY_STATE.SOLD_OUT_TEMPORARILY ||
        availState === PRODUCT_AVAILABILITY_STATE.SEASONAL_UNAVAILABLE
          ? "0.4"
          : "0.8";
      const encoded = encodeURIComponent(product.slug);
      const imageBlock =
        product.imageUrl && product.name
          ? buildImageBlock(
              product.imageUrl,
              product.name,
              buildProductImageAlt({ name: product.name }, lang, city.charAt(0).toUpperCase() + city.slice(1)),
            )
          : "";
      urls.push(urlEntryWithAlternates(priority, "weekly", country, city, `/product/${encoded}`, imageBlock));
    }
  }

  // 3. Brand pages — same canonical-city pattern.
  for (const brand of brands) {
    if (!brand?.slug) continue;
    const encoded = encodeURIComponent(brand.slug);
    for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
      if (skipCountryForLang(country)) continue;
      // At sitemap build time per-city product counts are unavailable without
      // O(brands×cities) extra API calls. We use brand.count (global brand total)
      // as productCount and totalProductCount (full catalog size) as the parent
      // so the ratio and identical-inventory rules can enforce some signal:
      //  - ratio: brand.count / totalProductCount < 0.15 → thin/niche brand page excluded
      //  - identical: brand covers entire catalog → no city-specific value added
      // This is a conservative proxy — any false positives are prevented by
      // the min-count check, and false negatives (thin per-city pages that pass)
      // are caught at request time by seo-inject which has the real per-city count.
      const parentEligibleBrand =
        totalProductCount !== null
          ? totalProductCount >= MIN_PRODUCTS_BY_TYPE["city-brand"]
          : null;
      const eligibility = isPageEligible({
        pageType: "city-brand",
        country,
        city,
        brandSlug: brand.slug,
        productCount: brand.count ?? 0,
        parentProductCount: totalProductCount,
        parentEligible: parentEligibleBrand,
      });
      recordEligibility("city-brand", eligibility.eligible);
      if (!eligibility.eligible) continue;
      urls.push(urlEntryWithAlternates("0.6", "monthly", country, city, `/brand/${encoded}`));
    }
  }

  // 4. Occasion pages — canonical city per country × all languages. Skip any
  // occasion that fails the eligibility check (thin/empty/duplicate pages).
  //
  // Per-city filtering: when `occasionsByCountry` is supplied each hub city
  // uses its own occasion list (counts reflecting per-country product stock),
  // so we never emit a URL for an occasion with 0 products in that city.
  // Pagination page count is also per-city so pages without content are omitted.
  for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
    if (skipCountryForLang(country)) continue;
    const cityOccasions = occasionsByCountry?.[country] ?? occasions;
    for (const occasion of cityOccasions) {
      if (!occasion?.id) continue;
      const encoded = encodeURIComponent(occasion.id);
      // parentProductCount intentionally omitted: comparing an occasion's
      // product count against the entire catalog total (which is the only
      // figure available here) would cause Rule 4's uniqueness-ratio check
      // to wrongly exclude small-but-real occasions (e.g. 7/334 = 0.021 <
      // 0.15). The absolute minimum-count check (Rule 3, ≥4 products) is
      // the correct gate; ratio vs. catalog total adds no meaningful signal.
      const eligibility = isPageEligible({
        pageType: "city-occasion",
        country,
        city,
        occasionSlug: occasion.id,
        productCount: occasion.count ?? 0,
      });
      // Curated occasion pages (hand-written intro/sections/FAQs) carry
      // substantial unique content, so the thin/duplicate-page eligibility
      // gate does not apply to them — keep them in the sitemap. Scoped to
      // the locale that actually has curated copy (EN-only today): ar/fr
      // variants still render template content, so they keep the normal
      // eligibility gate. Mirrors the same bypass in seo-inject.mjs.
      const hasCurated = !!getOccasionSeoContent({
        country,
        city,
        slug: occasion.id,
        lang: locale,
      });
      recordEligibility("city-occasion", eligibility.eligible || hasCurated);
      if (!eligibility.eligible && !hasCurated) continue;
      urls.push(urlEntryWithAlternates("0.7", "weekly", country, city, `/occasion/${encoded}`));
      // Pagination: use this city's product count so we don't emit page/N
      // entries for pages that have no products in this city.
      const occasionPageCount = Math.min(
        Math.ceil((occasion.count ?? 0) / PAGINATION_PAGE_SIZE),
        PAGINATION_SITEMAP_MAX_PAGES + 1,
      );
      for (let pageNum = 2; pageNum <= occasionPageCount; pageNum++) {
        urls.push(urlEntryWithAlternates("0.4", "weekly", country, city, `/occasion/${encoded}/page/${pageNum}`));
      }
    }
  }

  // 5. Category pages — canonical city per country × all languages. Skip any
  // category that fails the eligibility check (thin/empty/duplicate pages).
  //
  // Per-city filtering: same pattern as occasions above — `categoriesByCountry`
  // provides per-country counts so empty city/category combinations are omitted.
  for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
    if (skipCountryForLang(country)) continue;
    const cityCategories = categoriesByCountry?.[country] ?? categories;
    for (const category of cityCategories) {
      if (!category?.id) continue;
      const encoded = encodeURIComponent(category.id);
      // parentProductCount intentionally omitted — see occasion section above
      // for the same reasoning: ratio vs. global catalog total incorrectly
      // rejects small niche categories (cakes: 7/334 = 0.021 < 0.15).
      const eligibility = isPageEligible({
        pageType: "city-category",
        country,
        city,
        categorySlug: category.id,
        productCount: category.count ?? 0,
      });
      // Curated category pages (hand-written intro/sections/FAQs) carry
      // substantial unique content, so the thin/duplicate-page eligibility
      // gate does not apply to them — keep them in the sitemap. Scoped to
      // the locale that actually has curated copy (EN-only today): ar/fr
      // variants still render template content, so they keep the normal
      // eligibility gate. Mirrors the same bypass in occasion pages above.
      //
      // getCategorySeoContent falls back to English when no native-locale
      // copy exists. We must NOT use that fallback for the bypass decision
      // or the eligibility gate would be disabled for AR/FR too. Check
      // strictly: bypass only when lang === "en" (the locale that actually
      // carries the curated content). When AR/FR gain their own curated
      // copy the condition here should be widened accordingly.
      const hasCuratedCategory = lang === "en" && !!getCategorySeoContent({
        country,
        city,
        slug: category.id,
        lang: "en",
      });
      recordEligibility("city-category", eligibility.eligible || hasCuratedCategory);
      if (!eligibility.eligible && !hasCuratedCategory) continue;
      urls.push(urlEntryWithAlternates("0.7", "weekly", country, city, `/category/${encoded}`));
      // Pagination: use this city's product count to avoid emitting page/N
      // entries that would have no products and serve thin/noindex pages.
      const categoryPageCount = Math.min(
        Math.ceil((category.count ?? 0) / PAGINATION_PAGE_SIZE),
        PAGINATION_SITEMAP_MAX_PAGES + 1,
      );
      for (let pageNum = 2; pageNum <= categoryPageCount; pageNum++) {
        urls.push(urlEntryWithAlternates("0.4", "weekly", country, city, `/category/${encoded}/page/${pageNum}`));
      }
    }
  }

  // 5b. Curated category pages at non-hub cities (e.g. Larnaca/Limassol/
  // Paphos balloons). These pages carry hand-written unique content that
  // earns them their own indexable URL rather than consolidating under the
  // hub-city canonical.
  //
  // Guard: only emit when the catalog is available (categories non-empty).
  // When the API is down and we're building the static cold-cache fallback
  // sitemap, categories is [] and this block is skipped — same behaviour as
  // the hub-city category loop above (section 5) which also produces nothing
  // without catalog data.
  //
  // Locale: emitted for all three locales (en/ar/fr). AR/FR pages render
  // with EN fallback copy, but they ARE accessible and should be crawlable.
  // This keeps en/ar/fr sitemap URL counts in sync (the existing test
  // invariant: EN has exactly one extra entry for the un-prefixed root "/").
  //
  // The hub-city loop (section 5) already covers hub-city curated pages, so
  // we skip hub cities here to avoid duplicates.
  const hasCatalogData = categories.length > 0 || categoriesByCountry != null;
  if (hasCatalogData) {
    for (const [country, cities] of Object.entries(SITEMAP_CITIES)) {
      if (skipCountryForLang(country)) continue;
      const hubCity = HUB_CITY[country];
      for (const city of cities) {
        if (city === hubCity) continue; // already emitted above
        const cityKey = `${country}/${city}`;
        const curatedSlugMap = CATEGORY_SEO_CONTENT.en?.[cityKey] ?? {};
        for (const categorySlug of Object.keys(curatedSlugMap)) {
          const encoded = encodeURIComponent(categorySlug);
          // Priority 0.7 matches hub-city curated category pages.
          // No pagination — curated pages are single-page listings.
          urls.push(urlEntryWithAlternates("0.7", "weekly", country, city, `/category/${encoded}`));
        }
      }
    }
  }

  // 6. Blog pages — city-independent, language-scoped canonical URLs.
  // Blog content does not vary by city or country; the canonical URL for
  // every article is /{lang}/blog/:slug. The city-prefixed blog URLs that
  // previously appeared here (/{lang}-{country}/{city}/blog/:slug) now
  // 301-redirect to these canonical paths (serve.mjs § 7c), so emitting
  // them in the sitemap would waste crawl budget and re-introduce duplication.
  //
  // Format: /en/blog, /ar/blog, /fr/blog and /en/blog/:slug, etc.
  // hreflang alternates link the three language variants together.
  // Uses the module-level BLOG_POSTS source unless overridden via blogPostsArg
  // (useful in unit tests with mock data).
  const blogPostsSource = blogPostsArg ?? BLOG_POSTS ?? {};

  /**
   * Build a /{lang}/blog or /{lang}/blog/:slug sitemap entry with hreflang.
   * Article entries list only languages with dedicated editorial content; a
   * missing translation renders as an English fallback with noindex and must
   * never be advertised to crawlers in a sitemap.
   */
  const urlEntryBlog = (
    rest,
    lastmod = generatedAt,
    alternateLangs = SITEMAP_BLOG_LANGS,
  ) => {
    // `rest` is either "" (blog index) or "/:slug" (article).
    const loc = `${origin}${cleanBase}/${lang}/blog${rest}`;
    const alternates = alternateLangs.map((altLang) => {
      const href = `${origin}${cleanBase}/${altLang}/blog${rest}`;
      return `    <xhtml:link rel="alternate" hreflang="${escXml(altLang)}" href="${escXml(href)}"/>`;
    });
    const defaultLang = alternateLangs.includes("en")
      ? "en"
      : alternateLangs[0];
    alternates.push(
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${escXml(`${origin}${cleanBase}/${defaultLang}/blog${rest}`)}"/>`,
    );
    const lastmodLine = lastmod ? `\n    <lastmod>${escXml(lastmod)}</lastmod>` : "";
    return `  <url>\n    <loc>${escXml(loc)}</loc>${lastmodLine}\n    <changefreq>${rest ? "monthly" : "weekly"}</changefreq>\n    <priority>0.6</priority>\n${alternates.join("\n")}\n  </url>`;
  };

  // Blog URLs exist in EN/AR/FR only — skip the section for the Greek child.
  if (SITEMAP_BLOG_LANGS.includes(lang)) {
    // Blog index: /{lang}/blog
    urls.push(urlEntryBlog(""));

    // Blog articles: /{lang}/blog/:slug
    for (const [slug, langs] of Object.entries(blogPostsSource)) {
      if (!slug) continue;
      const availableLangs = SITEMAP_BLOG_LANGS.filter((candidate) => {
        const article = langs?.[candidate];
        return Boolean(
          article &&
          typeof article.title === "string" &&
          article.title.trim() &&
          typeof article.description === "string" &&
          article.description.trim(),
        );
      });
      // Do not include a URL that serves a noindex fallback translation.
      if (!availableLangs.includes(lang)) continue;
      const encoded = encodeURIComponent(slug);
      // Use the real publish date as lastmod when available; fall back to the
      // sitemap generation date. Never omit lastmod on articles — crawlers use
      // it to prioritise recrawling recently updated content.
      const datePublished =
        langs?.en?.datePublished ?? Object.values(langs ?? {})[0]?.datePublished ?? null;
      urls.push(
        urlEntryBlog(
          `/${encoded}`,
          datePublished ?? generatedAt,
          availableLangs,
        ),
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>`;
}

/**
 * Build the <sitemapindex> served at /sitemap.xml, pointing at one child
 * sitemap per locale (/sitemap-en.xml, /sitemap-ar.xml, /sitemap-fr.xml).
 * Google requires every URL in an hreflang cluster to appear as a sitemap
 * entry of its own; the per-locale children guarantee the Arabic and French
 * URLs referenced by the hreflang alternates are also listed.
 *
 * @param {string} origin   - e.g. "https://presentail.com"
 * @param {string} basePath - deploy prefix, e.g. "/" or "/web"
 * @returns {string} sitemap index XML
 */
export function buildSitemapIndexXml(origin, basePath) {
  const cleanBase = (basePath ?? "/").replace(/\/$/, "");
  const entries = SITEMAP_LANGS.map(
    (lang) =>
      `  <sitemap><loc>${escXml(`${origin}${cleanBase}/sitemap-${lang}.xml`)}</loc></sitemap>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</sitemapindex>`;
}

/**
 * Fetch the live catalog and build one locale's sitemap XML.
 *
 * @param {string} origin
 * @param {string} basePath
 * @param {(url: string) => Promise<any>} fetchJson - returns parsed JSON or null
 * @param {string} apiBaseUrl - internal API base, e.g. "http://localhost:80"
 * @param {string} [locale] - "en" | "ar" | "fr" (defaults to "en")
 * @returns {Promise<string>} sitemap XML
 */
export async function generateSitemap(origin, basePath, fetchJson, apiBaseUrl, locale = "en") {
  // Compute the generation date once; passed to buildSitemapXml as the
  // lastmod proxy for static and catalog entries. Using the sitemap build
  // date is honest — it means "content verified as of this date" — and
  // avoids fabricating a per-URL timestamp that crawlers would rightly
  // distrust. Blog posts carry their own real datePublished instead.
  const generatedAt = new Date().toISOString().slice(0, 10);

  // Hub-city fetch config — must mirror SITEMAP_CANONICAL_CITIES / HUB_CITY.
  // Products are fetched per hub city so the sitemap only emits URLs for
  // products that are actually deliverable in each city (matching the
  // per-city isDeliverable() filter that the product API applies at request
  // time). This prevents submitting URLs that the product route would return
  // 410 Gone for because the product is not offered in that city.
  const HUB_CITY_FETCH = [
    { country: "lb", city: "beirut",  countryCode: "LB" },
    { country: "ae", city: "dubai",   countryCode: "AE" },
    { country: "cy", city: "nicosia", countryCode: "CY" },
  ];

  const [brandsData, ...perCityData] = await Promise.all([
    fetchJson(`${apiBaseUrl}/api/woo/brands`),
    // Fetch products AND catalog metadata (categories/occasions) per hub city
    // so the sitemap only emits URLs that are actually available in each city.
    // Products: city-filtered by isDeliverable() → prevents 410 product URLs.
    // Catalog metadata: per-country counts → prevents empty category/occasion URLs.
    ...HUB_CITY_FETCH.flatMap(({ countryCode, country, city }) => [
      fetchJson(
        `${apiBaseUrl}/api/woo/products?lang=en&countryCode=${countryCode}&cityId=${country}-${city}`,
      ),
      fetchJson(`${apiBaseUrl}/api/catalog/metadata?countryCode=${countryCode}`),
    ]),
  ]);

  // perCityData is [lbProducts, lbMeta, aeProducts, aeMeta, cyProducts, cyMeta]
  const cityProducts = HUB_CITY_FETCH.map((_, i) => perCityData[i * 2]);
  const cityMetas   = HUB_CITY_FETCH.map((_, i) => perCityData[i * 2 + 1]);

  // Primary (LB) data used for backward-compat fallback and totalProductCount
  // (LB typically has the largest catalog, so it's the best proxy for the
  // brand eligibility ratio checks).
  const lbData = cityProducts[0] ?? null;
  const lbMeta = cityMetas[0] ?? null;

  // If every catalog fetch returned null the API server is unreachable. Return
  // a static-only sitemap so resolveSitemap can cache and serve it instead of
  // cascading into an error that leaves crawlers with nothing.
  if (lbData === null && brandsData === null && lbMeta === null) {
    return buildSitemapXml({ origin, basePath, locale, products: [], brands: [], occasions: [], generatedAt });
  }

  // Normalise a raw API products response into the shape buildSitemapXml
  // expects: slug, name, imageUrl, and availability fields.
  // transformProduct() in woo.ts stores the OS product slug in the 'id' field
  // (WC product shape uses id as the slug string), so the listing API response
  // has the slug in p.id rather than a separate p.slug field.
  const normalizeProducts = (data) =>
    (data?.products ?? []).map((p) => ({
      slug: p.slug ?? p.id,
      name: p.name ?? null,
      imageUrl: p.image?.uri ?? p.images?.[0]?.url ?? p.images?.[0]?.uri ?? null,
      inStock: p.inStock,
      status: p.status ?? null,
      tags: Array.isArray(p.tags) ? p.tags : [],
    }));

  // Build per-country product maps for city-aware product URL filtering.
  const productsByCountry = Object.fromEntries(
    HUB_CITY_FETCH.map(({ country }, i) => [country, normalizeProducts(cityProducts[i])]),
  );

  // Build per-country occasion/category maps for city-aware listing URL filtering.
  // Each entry's `count` reflects per-country in-stock product counts (returned
  // by /api/catalog/metadata?countryCode=…) so isPageEligible naturally skips
  // occasions/categories with 0 products in a given city.
  const occasionsByCountry = Object.fromEntries(
    HUB_CITY_FETCH.map(({ country }, i) => [country, cityMetas[i]?.occasions ?? []]),
  );
  const categoriesByCountry = Object.fromEntries(
    HUB_CITY_FETCH.map(({ country }, i) => [country, cityMetas[i]?.categories ?? []]),
  );

  // Keep flat fallback lists from LB metadata for any backward-compat path
  // (and for the brands list which is not per-city filtered here).
  const products = normalizeProducts(lbData);

  return buildSitemapXml({
    origin,
    basePath,
    locale,
    products,
    productsByCountry,
    brands: brandsData?.brands ?? [],
    occasions: lbMeta?.occasions ?? [],
    occasionsByCountry,
    categories: lbMeta?.categories ?? [],
    categoriesByCountry,
    // Pass the LB total as the totalProductCount proxy for brand eligibility
    // ratio checks (see buildSitemapXml JSDoc).
    totalProductCount: lbData?.products?.length ?? null,
    generatedAt,
  });
}

// After a regeneration failure the cache timestamp is rewound so the route
// retries the upstream after this short window instead of on every request —
// a totally-down catalog must not turn into a per-request retry storm.
export const SITEMAP_RETRY_WINDOW_MS = 5 * 60 * 1000;

/**
 * Resolve the value to serve for /sitemap.xml, applying the route's
 * stale-while-revalidate + cold-cache fallback policy. Pure with respect to its
 * inputs (the only side effects are the injected `generateFull` / `generateStatic`
 * builders and the optional `onError` logger) so it can be unit-tested without
 * booting the HTTP server. Mirrors resolveLlmsFullTxt in llms.mjs.
 *
 * Policy:
 *  - Warm, fresh cache (within TTL): reused as-is, no regeneration.
 *  - Stale or missing cache: attempt `generateFull()`.
 *    - Success: cache the new value with a full TTL.
 *    - Failure with a prior cached value: keep it (stale-while-revalidate) and
 *      rewind the timestamp to retry after SITEMAP_RETRY_WINDOW_MS.
 *    - Failure with a cold cache: fall back to the static, catalog-free
 *      `generateStatic()` sitemap (root + locale pages only) and rewind the
 *      timestamp the same way.
 *  Never returns an empty/undefined value, so the route never serves a blank
 *  body or a 500 — crawlers always receive a valid, non-empty sitemap.
 *
 * @param {object} args
 * @param {{ value: (string|null), tsMs: number }} args.cache - current cache state
 * @param {number} args.nowMs   - current time (Date.now())
 * @param {number} args.ttlMs   - cache TTL in ms
 * @param {() => Promise<string>} args.generateFull   - builds the full catalog sitemap
 * @param {() => string} args.generateStatic          - builds the static fallback sitemap
 * @param {(err: unknown, mode: "stale"|"static-fallback") => void} [args.onError]
 * @returns {Promise<{ value: string, tsMs: number, mode: "fresh"|"regenerated"|"stale"|"static-fallback" }>}
 */
export async function resolveSitemap({
  cache,
  nowMs,
  ttlMs,
  generateFull,
  generateStatic,
  onError,
}) {
  const hasFreshCache = Boolean(cache?.value) && nowMs - cache.tsMs <= ttlMs;
  if (hasFreshCache) {
    return { value: cache.value, tsMs: cache.tsMs, mode: "fresh" };
  }

  try {
    const value = await generateFull();
    return { value, tsMs: nowMs, mode: "regenerated" };
  } catch (err) {
    // Rewind the timestamp so the next attempt happens after the retry window
    // rather than on the very next request.
    const tsMs = nowMs - ttlMs + SITEMAP_RETRY_WINDOW_MS;
    if (cache?.value) {
      onError?.(err, "stale");
      return { value: cache.value, tsMs, mode: "stale" };
    }
    onError?.(err, "static-fallback");
    return { value: generateStatic(), tsMs, mode: "static-fallback" };
  }
}

// ---------------------------------------------------------------------------
// CLI: node sitemap.mjs --eligibility-report
// ---------------------------------------------------------------------------
// When run directly with --eligibility-report, builds the sitemap with
// whatever catalog data is available (empty lists when no live API is
// reachable) and prints a JSON summary of eligible/ineligible URL counts
// per page type to stdout, then exits 0.
//
// In production with a live API:
//   INTERNAL_API_BASE_URL=http://localhost:80 node sitemap.mjs --eligibility-report
//   (in/against production, use the public apex instead: https://presentail.com)
//
// In CI (no live API — shows zero counts from empty catalog):
//   node sitemap.mjs --eligibility-report

import { fileURLToPath } from "node:url";

const _isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (_isMain) {
  const args = process.argv.slice(2);
  if (!args.includes("--eligibility-report")) {
    process.stderr.write(
      "Usage: node sitemap.mjs --eligibility-report\n" +
      "  Optionally set INTERNAL_API_BASE_URL to fetch real catalog data.\n",
    );
    process.exit(1);
  }

  (async () => {
    const apiBase = process.env.INTERNAL_API_BASE_URL ?? "";
    const reportRef = { counts: {} };

    // Attempt to fetch catalog data when an API base is configured.
    let products = [], brands = [], occasions = [], categories = [];
    if (apiBase) {
      const fetchJson = async (url) => {
        try {
          const resp = await fetch(url);
          if (!resp.ok) return null;
          return resp.json();
        } catch {
          return null;
        }
      };
      const [productsData, brandsData, catalogData] = await Promise.all([
        fetchJson(`${apiBase}/api/woo/products?lang=en&countryCode=LB`),
        fetchJson(`${apiBase}/api/woo/brands`),
        fetchJson(`${apiBase}/api/catalog/metadata`),
      ]);
      products = productsData?.products ?? [];
      brands = brandsData?.brands ?? [];
      occasions = catalogData?.occasions ?? [];
      categories = catalogData?.categories ?? [];
    }

    buildSitemapXml({
      origin: process.env.ORIGIN ?? "https://presentail.com",
      basePath: "/",
      products,
      brands,
      occasions,
      categories,
      reportRef,
    });

    process.stdout.write(JSON.stringify(reportRef.counts, null, 2) + "\n");
    process.exit(0);
  })().catch((err) => {
    process.stderr.write(String(err) + "\n");
    process.exit(1);
  });
}
