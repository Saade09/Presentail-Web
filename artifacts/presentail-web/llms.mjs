// llms.txt generation extracted from serve.mjs so its section assembly,
// fallback copy, and featured-product sorting/capping logic can be unit-tested
// without booting the HTTP server. Mirrors the sitemap.mjs extraction pattern.
//
// `generateLlmsTxt` is a pure, synchronous builder for the static /llms.txt
// index. `buildLlmsFullTxt` is a pure, synchronous builder that takes
// already-fetched catalog data and returns the /llms-full.txt Markdown.
// `generateLlmsFullTxt` is a thin async wrapper that fetches the catalog
// (brands, occasions, products) and delegates to the pure builder.

import {
  LLMS_INTRO,
  LLMS_PAGES,
  LLMS_PAGE_SECTIONS,
} from "./llms-content.mjs";

// Maximum number of featured products listed in /llms-full.txt.
export const FEATURED_LIMIT = 50;

/**
 * Build the static /llms.txt index. Pure and synchronous.
 *
 * generateLlmsTxt is intentionally static: LLMS_INTRO is a fixed service
 * description and LLMS_PAGES is a fixed navigation index. Neither requires live
 * catalog data — brand names, occasion names, and featured products are already
 * included in /llms-full.txt, which uses a TTL-based live-fetch pattern. If the
 * page list or intro copy ever needs to embed live counts or names, apply the
 * same async + TTL pattern used in generateLlmsFullTxt below.
 *
 * @param {string} origin   - e.g. "https://new.presentail.com"
 * @param {string} basePath - deploy prefix, e.g. "/" or "/web"
 * @returns {string} llms.txt Markdown
 */
export function generateLlmsTxt(origin, basePath) {
  const cleanBase = (basePath ?? "/").replace(/\/$/, "");
  const base = origin + cleanBase;
  const pagesList = LLMS_PAGES
    .map(({ label, path }) => `- [${label}](${base}${path})`)
    .join("\n");
  return `# Presentail\n\n${LLMS_INTRO}\n\n## Pages\n\n${pagesList}\n`;
}

/**
 * Build the /llms-full.txt index from already-fetched catalog data. Pure and
 * synchronous so it can be unit-tested with mock data.
 *
 * @param {object} args
 * @param {string} args.origin          - e.g. "https://new.presentail.com"
 * @param {string} args.basePath        - deploy prefix, e.g. "/" or "/web"
 * @param {Array}  [args.brands]        - [{ name }]
 * @param {Array}  [args.occasions]     - [{ name, slug }]
 * @param {Array}  [args.products]      - [{ name, popularity, brandNames, priceValue, occasions }]
 * @param {number} [args.featuredLimit] - cap on featured products (default FEATURED_LIMIT)
 * @returns {string} llms-full.txt Markdown
 */
export function buildLlmsFullTxt({
  origin,
  basePath,
  brands = [],
  occasions = [],
  products = [],
  featuredLimit = FEATURED_LIMIT,
} = {}) {
  const cleanBase = (basePath ?? "/").replace(/\/$/, "");
  const base = origin + cleanBase;

  const pagesList = LLMS_PAGES
    .map(({ label, path }) => `- [${label}](${base}${path})`)
    .join("\n");

  const fullContent = LLMS_PAGE_SECTIONS
    .map(({ title, path, body }) => `### ${title} (${base}${path})\n\n${body}`)
    .join("\n\n");

  const brandNames = brands.map((b) => b?.name).filter(Boolean);
  const occasionNames = occasions.map((o) => o?.name).filter(Boolean);

  const brandsSection = brandNames.length > 0
    ? `## Brands\n\n${brandNames.map((n) => `- ${n}`).join("\n")}\n`
    : `## Brands\n\n_Brand list not yet available._\n`;

  const occasionsSection = occasionNames.length > 0
    ? `## Occasions\n\n${occasionNames.map((n) => `- ${n}`).join("\n")}\n`
    : `## Occasions\n\n_Occasion list not yet available._\n`;

  const occasionSlugToName = Object.fromEntries(
    occasions
      .filter((o) => o?.slug && o?.name)
      .map((o) => [o.slug, o.name])
  );

  const allProducts = products
    .filter((p) => Boolean(p?.name))
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  const featuredProducts = allProducts.slice(0, featuredLimit);
  const featuredSection = featuredProducts.length > 0
    ? `## Featured Products\n\n` +
      featuredProducts.map((p) => {
        const brand = (p.brandNames ?? [])[0] ?? null;
        const priceUsd = typeof p.priceValue === "number" ? `~$${Math.round(p.priceValue)}` : null;
        const resolvedOccasions = (p.occasions ?? [])
          .map((slug) => occasionSlugToName[slug] ?? slug)
          .filter(Boolean);
        const parts = [p.name];
        if (brand) parts.push(`by ${brand}`);
        if (priceUsd) parts.push(`(${priceUsd})`);
        if (resolvedOccasions.length > 0) parts.push(`— ${resolvedOccasions.join(", ")}`);
        return `- ${parts.join(" ")}`;
      }).join("\n") + "\n"
    : "";

  return (
    `# Presentail\n\n${LLMS_INTRO}\n\n` +
    `## Pages\n\n${pagesList}\n\n` +
    `${brandsSection}\n` +
    `${occasionsSection}\n` +
    (featuredSection ? `${featuredSection}\n` : "") +
    `## Full content\n\n${fullContent}\n`
  );
}

/**
 * Fetch the live catalog and build the /llms-full.txt Markdown.
 *
 * @param {string} origin
 * @param {string} basePath
 * @param {(url: string) => Promise<any>} fetchJson - returns parsed JSON or null
 * @param {string} apiBaseUrl - internal API base, e.g. "http://localhost:80"
 * @returns {Promise<string>} llms-full.txt Markdown
 */
export async function generateLlmsFullTxt(origin, basePath, fetchJson, apiBaseUrl) {
  const [brandsData, catalogData, productsData] = await Promise.all([
    fetchJson(`${apiBaseUrl}/api/woo/brands`),
    fetchJson(`${apiBaseUrl}/api/catalog/metadata`),
    fetchJson(`${apiBaseUrl}/api/woo/products?lang=en&countryCode=LB`),
  ]);

  return buildLlmsFullTxt({
    origin,
    basePath,
    brands: brandsData?.brands ?? [],
    occasions: catalogData?.occasions ?? [],
    products: productsData?.products ?? [],
  });
}
