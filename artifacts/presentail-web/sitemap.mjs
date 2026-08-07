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
import { buildProductImageAlt } from "./imageAlt.mjs";
import {
  getProductAvailabilityState,
  PRODUCT_AVAILABILITY_STATE,
} from "./seo-inject.mjs";
import { HUB_CITY } from "./src/lib/hreflang.mjs";

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
export const SITEMAP_LANGS = ["en", "ar", "fr"];
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
  brands = [],
  occasions = [],
  categories = [],
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
   * Per-city product counts are not available at sitemap build time, so we use
   * this global total as a conservative proxy: if the collection represents a
   * very small or identical fraction of the whole catalog, the city page is
   * treated as thin/duplicate and excluded.
   *
   * null = unknown (ratio rules are skipped — callers should always supply this
   * when productsData is available to ensure ratio checks are enforced).
   */
  totalProductCount = null,
} = {}) {
  const cleanBase = (basePath ?? "/").replace(/\/$/, "");
  const lang = SITEMAP_LANGS.includes(locale) ? locale : "en";

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
  // `lastmod` is only emitted when a real per-entry date is known (e.g. blog
  // article publish dates); all other entries omit it rather than fabricating
  // a request-time value.
  const urlEntryWithAlternates = (priority, changefreq, country, city, rest, imageBlock = "", lastmod = null) => {
    const loc = origin + cleanBase + `/${lang}-${country}/${city}${rest}`;
    const alternates = SITEMAP_LANGS.map((altLang) => {
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
  for (const product of products) {
    if (!product?.slug) continue;
    const availState = getProductAvailabilityState(product);
    if (availState === PRODUCT_AVAILABILITY_STATE.DISCONTINUED) continue;
    const priority =
      availState === PRODUCT_AVAILABILITY_STATE.SOLD_OUT_TEMPORARILY ||
      availState === PRODUCT_AVAILABILITY_STATE.SEASONAL_UNAVAILABLE
        ? "0.4"
        : "0.8";
    const encoded = encodeURIComponent(product.slug);
    for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
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
  for (const occasion of occasions) {
    if (!occasion?.id) continue;
    const encoded = encodeURIComponent(occasion.id);
    for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
      const parentEligibleOccasion =
        totalProductCount !== null
          ? totalProductCount >= MIN_PRODUCTS_BY_TYPE["city-occasion"]
          : null;
      const eligibility = isPageEligible({
        pageType: "city-occasion",
        country,
        city,
        occasionSlug: occasion.id,
        productCount: occasion.count ?? 0,
        parentProductCount: totalProductCount,
        parentEligible: parentEligibleOccasion,
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
    }
    const occasionPageCount = Math.min(
      Math.ceil((occasion.count ?? 0) / PAGINATION_PAGE_SIZE),
      PAGINATION_SITEMAP_MAX_PAGES + 1,
    );
    for (let pageNum = 2; pageNum <= occasionPageCount; pageNum++) {
      for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
        urls.push(urlEntryWithAlternates("0.4", "weekly", country, city, `/occasion/${encoded}/page/${pageNum}`));
      }
    }
  }

  // 5. Category pages — canonical city per country × all languages. Skip any
  // category that fails the eligibility check (thin/empty/duplicate pages).
  for (const category of categories) {
    if (!category?.id) continue;
    const encoded = encodeURIComponent(category.id);
    for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
      const parentEligibleCategory =
        totalProductCount !== null
          ? totalProductCount >= MIN_PRODUCTS_BY_TYPE["city-category"]
          : null;
      const eligibility = isPageEligible({
        pageType: "city-category",
        country,
        city,
        categorySlug: category.id,
        productCount: category.count ?? 0,
        parentProductCount: totalProductCount,
        parentEligible: parentEligibleCategory,
      });
      recordEligibility("city-category", eligibility.eligible);
      if (!eligibility.eligible) continue;
      urls.push(urlEntryWithAlternates("0.7", "weekly", country, city, `/category/${encoded}`));
    }
    const categoryPageCount = Math.min(
      Math.ceil((category.count ?? 0) / PAGINATION_PAGE_SIZE),
      PAGINATION_SITEMAP_MAX_PAGES + 1,
    );
    for (let pageNum = 2; pageNum <= categoryPageCount; pageNum++) {
      for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
        urls.push(urlEntryWithAlternates("0.4", "weekly", country, city, `/category/${encoded}/page/${pageNum}`));
      }
    }
  }

  // 6. Blog article pages — one canonical-city URL per country × all
  // languages. Uses the module-level BLOG_POSTS source unless a caller
  // overrides it via blogPostsArg (useful in unit tests with mock data).
  // Blog *article* pages carry Article structured data and are meant to be
  // indexed; only the blog index (a Group-B noindex page) is excluded.
  const blogPostsSource = blogPostsArg ?? BLOG_POSTS ?? {};
  // Blog index (Journal hub) — indexable and the internal-link hub for the
  // articles, so it is included at the canonical hub city per country (each
  // block carries all language alternates).
  for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
    urls.push(urlEntryWithAlternates("0.6", "weekly", country, city, "/blog"));
  }
  for (const [slug, langs] of Object.entries(blogPostsSource)) {
    if (!slug) continue;
    const encoded = encodeURIComponent(slug);
    // Blog articles carry a real publish date (`datePublished` on the per-lang
    // content), so emit it as <lastmod>. Fall back to omitting the field if a
    // post somehow lacks it — never fabricate a date.
    const datePublished =
      langs?.en?.datePublished ?? Object.values(langs ?? {})[0]?.datePublished ?? null;
    for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
      urls.push(
        urlEntryWithAlternates("0.6", "monthly", country, city, `/blog/${encoded}`, "", datePublished),
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
  // No blanket lastmod: the catalog endpoints don't expose per-entity update
  // timestamps, so catalog/static entries omit <lastmod> entirely. Blog posts
  // carry their real datePublished (handled inside buildSitemapXml).
  const [productsData, brandsData, catalogData] = await Promise.all([
    fetchJson(`${apiBaseUrl}/api/woo/products?lang=en&countryCode=LB`),
    fetchJson(`${apiBaseUrl}/api/woo/brands`),
    fetchJson(`${apiBaseUrl}/api/catalog/metadata`),
  ]);

  // Normalise the product list: extract the slug, primary image URL, and name
  // so buildSitemapXml can embed <image:image> extensions without knowing the
  // raw API response shape. Also forward the availability fields so
  // buildSitemapXml can call getProductAvailabilityState to filter discontinued
  // products and lower crawl priority for sold-out / seasonal ones.
  const rawProducts = productsData?.products ?? [];
  const products = rawProducts.map((p) => ({
    // transformProduct() in woo.ts stores the OS product slug in the 'id'
    // field (WC product shape uses id as the slug string), so the listing
    // API response has the slug in p.id rather than a separate p.slug field.
    slug: p.slug ?? p.id,
    name: p.name ?? null,
    imageUrl: p.image?.uri ?? p.images?.[0]?.url ?? p.images?.[0]?.uri ?? null,
    inStock: p.inStock,
    status: p.status ?? null,
    tags: Array.isArray(p.tags) ? p.tags : [],
  }));

  return buildSitemapXml({
    origin,
    basePath,
    locale,
    products,
    brands: brandsData?.brands ?? [],
    occasions: catalogData?.occasions ?? [],
    categories: catalogData?.categories ?? [],
    // Pass the total product count so eligibility ratio/identical-inventory
    // rules can fire at sitemap build time (see buildSitemapXml JSDoc).
    totalProductCount: productsData?.products?.length ?? null,
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
