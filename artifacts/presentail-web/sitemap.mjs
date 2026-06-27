// Sitemap generation extracted from serve.mjs so its filtering / hreflang /
// lastmod logic can be unit-tested without booting the HTTP server.
//
// `buildSitemapXml` is a pure, synchronous function that takes already-fetched
// catalog data and returns the sitemap XML string. `generateSitemap` is a thin
// async wrapper that fetches the catalog (products, brands, occasions,
// categories) and delegates to the pure builder.

// All cities per country — must mirror CITY_SLUGS_BY_COUNTRY in seo-inject.mjs.
export const SITEMAP_CITIES = {
  lb: [
    "akkar", "aley", "baabda", "baalbeck", "batroun", "bcharee", "beirut",
    "bent-jbeil", "chouf", "hasbaya", "hermel", "jbail", "jezzine",
    "kasserwan", "koura", "marjayoun", "metn", "minnieh-dennaya", "nabatieh",
    "rechaya", "saida", "tripoli", "tyre", "west-bekaa", "zahle", "zghorta",
  ],
  ae: ["abu-dhabi", "ajman", "dubai", "fujairah", "ras-al-khaimah", "sharjah", "umm-al-quwain"],
  cy: ["larnaca", "limassol", "nicosia", "paphos"],
};
export const SITEMAP_LANGS = ["en", "ar", "fr"];
// Representative city per country for product / brand canonical URLs.
export const SITEMAP_CANONICAL_CITIES = { lb: "beirut", ae: "dubai", cy: "nicosia" };
// Static sub-paths included for every lang / country / city combination.
// /shop is intentionally omitted — category and occasion clean paths
// (/category/<slug>, /occasion/<slug>) are emitted dynamically below so
// crawlers discover the canonical destinations without following a redirect.
export const SITEMAP_STATIC_PATHS = [
  "/", "/brands", "/occasions", "/contact", "/faqs",
  "/careers", "/blog", "/partner", "/weddings", "/corporate",
  "/terms", "/privacy",
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
 * @param {Array}  [args.products]   - [{ slug }]
 * @param {Array}  [args.brands]     - [{ slug }]
 * @param {Array}  [args.occasions]  - [{ id, count }]
 * @param {Array}  [args.categories] - [{ id, count }]
 * @param {string} [args.lastmod]    - YYYY-MM-DD; defaults to today (UTC).
 * @returns {string} sitemap XML
 */
export function buildSitemapXml({
  origin,
  basePath,
  products = [],
  brands = [],
  occasions = [],
  categories = [],
  lastmod = new Date().toISOString().slice(0, 10),
} = {}) {
  const cleanBase = (basePath ?? "/").replace(/\/$/, "");

  // Plain <url> entry for un-prefixed, language-agnostic paths (root, llms.txt).
  const urlEntry = (loc, priority, changefreq) =>
    `  <url><loc>${escXml(origin + cleanBase + loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;

  // <url> entry for a locale-prefixed path that also lists every language
  // variant via <xhtml:link rel="alternate" hreflang>. `rest` is the path after
  // the `/{lang}-{country}/{city}` prefix ("" for the home page, otherwise
  // beginning with "/"). x-default points at the English variant.
  const urlEntryWithAlternates = (priority, changefreq, country, city, rest) => {
    const loc = origin + cleanBase + `/en-${country}/${city}${rest}`;
    const alternates = SITEMAP_LANGS.map((altLang) => {
      const href = origin + cleanBase + `/${altLang}-${country}/${city}${rest}`;
      const code = `${altLang}-${country.toUpperCase()}`;
      return `    <xhtml:link rel="alternate" hreflang="${escXml(code)}" href="${escXml(href)}"/>`;
    });
    const xDefaultHref = origin + cleanBase + `/en-${country}/${city}${rest}`;
    alternates.push(
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${escXml(xDefaultHref)}"/>`,
    );
    return `  <url>\n    <loc>${escXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n${alternates.join("\n")}\n  </url>`;
  };

  const urls = [];

  // 0. Root landing page (un-prefixed, language-agnostic entry point).
  urls.push(urlEntry("/", "1.0", "weekly"));

  // 0a. LLMs.txt discovery — machine-readable content index for AI crawlers.
  // Listed early so crawlers encounter them before the long locale-path block.
  urls.push(urlEntry("/llms.txt", "0.5", "monthly"));
  urls.push(urlEntry("/llms-full.txt", "0.5", "monthly"));

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
  // language alternates).
  for (const product of products) {
    if (!product?.slug) continue;
    const encoded = encodeURIComponent(product.slug);
    for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
      urls.push(urlEntryWithAlternates("0.8", "weekly", country, city, `/product/${encoded}`));
    }
  }

  // 3. Brand pages — same canonical-city pattern.
  for (const brand of brands) {
    if (!brand?.slug) continue;
    const encoded = encodeURIComponent(brand.slug);
    for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
      urls.push(urlEntryWithAlternates("0.6", "monthly", country, city, `/brand/${encoded}`));
    }
  }

  // 4. Occasion pages — canonical city per country × all languages. Skip any
  // occasion with no in-stock products (count === 0) so crawlers never discover
  // a thin/empty listing page.
  for (const occasion of occasions) {
    if (!occasion?.id) continue;
    if ((occasion.count ?? 0) === 0) continue;
    const encoded = encodeURIComponent(occasion.id);
    for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
      urls.push(urlEntryWithAlternates("0.7", "weekly", country, city, `/occasion/${encoded}`));
    }
  }

  // 5. Category pages — canonical city per country × all languages. Skip any
  // category with no in-stock products (count === 0).
  for (const category of categories) {
    if (!category?.id) continue;
    if ((category.count ?? 0) === 0) continue;
    const encoded = encodeURIComponent(category.id);
    for (const [country, city] of Object.entries(SITEMAP_CANONICAL_CITIES)) {
      urls.push(urlEntryWithAlternates("0.7", "weekly", country, city, `/category/${encoded}`));
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>`;
}

/**
 * Fetch the live catalog and build the sitemap XML.
 *
 * @param {string} origin
 * @param {string} basePath
 * @param {(url: string) => Promise<any>} fetchJson - returns parsed JSON or null
 * @param {string} apiBaseUrl - internal API base, e.g. "http://localhost:80"
 * @returns {Promise<string>} sitemap XML
 */
export async function generateSitemap(origin, basePath, fetchJson, apiBaseUrl) {
  // lastmod for all entries — today's date, refreshed with the sitemap cache.
  // The catalog metadata / product / brand endpoints don't expose a reliable
  // per-entity update timestamp, so a single daily date is used throughout.
  const lastmod = new Date().toISOString().slice(0, 10);

  const [productsData, brandsData, catalogData] = await Promise.all([
    fetchJson(`${apiBaseUrl}/api/woo/products?lang=en&countryCode=LB`),
    fetchJson(`${apiBaseUrl}/api/woo/brands`),
    fetchJson(`${apiBaseUrl}/api/catalog/metadata`),
  ]);

  return buildSitemapXml({
    origin,
    basePath,
    products: productsData?.products ?? [],
    brands: brandsData?.brands ?? [],
    occasions: catalogData?.occasions ?? [],
    categories: catalogData?.categories ?? [],
    lastmod,
  });
}
