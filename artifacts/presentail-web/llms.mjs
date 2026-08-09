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
import { BLOG_POSTS } from "@workspace/blog-content";

/**
 * Build the "## Journal" Markdown section listing the blog hub and every
 * published article (English titles), so AI crawlers starting from llms.txt
 * can discover the editorial content directly. Pure and synchronous —
 * BLOG_POSTS is compiled into the bundle, no live fetch needed.
 *
 * @param {string} base - origin + clean base path, e.g. "https://presentail.com"
 * @param {object} [posts] - injectable for tests; defaults to BLOG_POSTS
 * @returns {string} Markdown section (ends without trailing blank line)
 */
export function buildJournalSection(base, posts = BLOG_POSTS) {
  const hub = `${base}/en-lb/beirut/blog`;
  const articles = Object.entries(posts ?? {})
    .map(([slug, byLang]) => {
      const post = byLang?.en;
      if (!post?.title) return null;
      return `- [${post.title}](${hub}/${encodeURIComponent(slug)})`;
    })
    .filter(Boolean)
    .join("\n");
  return (
    `## Journal\n\n` +
    `Editorial articles about gifting, sourcing, and the people behind Presentail.\n\n` +
    `- [Journal hub](${hub})\n` +
    (articles ? `${articles}\n` : "")
  );
}

// Maximum number of featured products listed in /llms-full.txt.
export const FEATURED_LIMIT = 50;

/**
 * Build the list of blog article Markdown twin links for the
 * "Machine-Readable Markdown Pages" section. Pure and synchronous.
 *
 * @param {string} base  - origin + clean base path, e.g. "https://presentail.com"
 * @param {object} [posts] - injectable for tests; defaults to BLOG_POSTS
 * @returns {string} zero or more `- [title](<url>.md)\n` lines (no trailing blank line)
 */
export function buildBlogMdLinks(base, posts = BLOG_POSTS) {
  const hub = `${base}/en-lb/beirut/blog`;
  return Object.entries(posts ?? {})
    .map(([slug, byLang]) => {
      const post = byLang?.en;
      if (!post?.title) return null;
      return `- [${post.title}](${hub}/${encodeURIComponent(slug)}.md)`;
    })
    .filter(Boolean)
    .join("\n");
}

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
  const blogMdLinks = buildBlogMdLinks(base);
  const mdSection =
    `## Machine-Readable Markdown Pages\n\n` +
    `Every public Presentail page has a Markdown twin served at \`<path>.md\` and via \`Accept: text/markdown\` content negotiation.\n\n` +
    `- [Markdown mirror index](${base}/sitemap.md)\n` +
    `- [Homepage — Beirut (Lebanon)](${base}/en-lb/beirut.md)\n` +
    `- [Homepage — Dubai (UAE)](${base}/en-ae/dubai.md)\n` +
    `- [Homepage — Nicosia (Cyprus)](${base}/en-cy/nicosia.md)\n` +
    `- [Shop — Beirut (Lebanon)](${base}/en-lb/beirut/shop.md)\n` +
    `- [Best Sellers — Beirut (Lebanon)](${base}/en-lb/beirut/best-sellers.md)\n` +
    `- Example product page: \`${base}/en-lb/beirut/product/<slug>.md\`\n` +
    `- Example brand page: \`${base}/en-lb/beirut/brand/<slug>.md\`\n` +
    (blogMdLinks ? `${blogMdLinks}\n` : "");

  return `# Presentail\n\n> ${LLMS_INTRO}\n\n## Pages\n\n${pagesList}\n\n${buildJournalSection(base)}\n${mdSection}`;
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

  const firstProduct = allProducts[0] ?? null;
  const blogMdLinks = buildBlogMdLinks(base);
  const mdSection =
    `## Machine-Readable Markdown Pages\n\n` +
    `Every public Presentail page has a Markdown twin served at \`<path>.md\` and via \`Accept: text/markdown\` content negotiation.\n\n` +
    `- [Markdown mirror index](${base}/sitemap.md)\n` +
    `- [Homepage — Beirut (Lebanon)](${base}/en-lb/beirut.md)\n` +
    `- [Homepage — Dubai (UAE)](${base}/en-ae/dubai.md)\n` +
    `- [Homepage — Nicosia (Cyprus)](${base}/en-cy/nicosia.md)\n` +
    `- [Shop — Beirut (Lebanon)](${base}/en-lb/beirut/shop.md)\n` +
    `- [Best Sellers — Beirut (Lebanon)](${base}/en-lb/beirut/best-sellers.md)\n` +
    (firstProduct?.slug
      ? `- [${firstProduct.name} (product example)](${base}/en-lb/beirut/product/${encodeURIComponent(firstProduct.slug)}.md)\n`
      : `- Example product page: \`${base}/en-lb/beirut/product/<slug>.md\`\n`) +
    `- Example brand page: \`${base}/en-lb/beirut/brand/<slug>.md\`\n` +
    (blogMdLinks ? `${blogMdLinks}\n` : "");

  return (
    `# Presentail\n\n${LLMS_INTRO}\n\n` +
    `## Pages\n\n${pagesList}\n\n` +
    `${brandsSection}\n` +
    `${occasionsSection}\n` +
    (featuredSection ? `${featuredSection}\n` : "") +
    `${buildJournalSection(base)}\n` +
    `${mdSection}\n` +
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

// After a regeneration failure the cache timestamp is rewound so the route
// retries the upstream after this short window instead of on every request —
// a totally-down catalog must not turn into a per-request retry storm.
export const LLMS_FULL_TXT_RETRY_WINDOW_MS = 5 * 60 * 1000;

/**
 * Resolve the value to serve for /llms-full.txt, applying the route's
 * stale-while-revalidate + cold-cache fallback policy. Pure with respect to its
 * inputs (the only side effects are the injected `generateFull` / `generateIndex`
 * builders and the optional `onError` logger) so it can be unit-tested without
 * booting the HTTP server.
 *
 * Policy:
 *  - Warm, fresh cache (within TTL): reused as-is, no regeneration.
 *  - Stale or missing cache: attempt `generateFull()`.
 *    - Success: cache the new value with a full TTL.
 *    - Failure with a prior cached value: keep it (stale-while-revalidate) and
 *      rewind the timestamp to retry after LLMS_FULL_TXT_RETRY_WINDOW_MS.
 *    - Failure with a cold cache: fall back to the static index-only
 *      `generateIndex()` output and rewind the timestamp the same way.
 *  Never returns an empty/undefined value, so the route never serves a blank
 *  body or a 500.
 *
 * @param {object} args
 * @param {{ value: (string|null), tsMs: number }} args.cache - current cache state
 * @param {number} args.nowMs   - current time (Date.now())
 * @param {number} args.ttlMs   - cache TTL in ms
 * @param {() => Promise<string>} args.generateFull  - builds the rich full index
 * @param {() => string} args.generateIndex          - builds the static fallback index
 * @param {(err: unknown, mode: "stale"|"index-fallback") => void} [args.onError]
 * @returns {Promise<{ value: string, tsMs: number, mode: "fresh"|"regenerated"|"stale"|"index-fallback" }>}
 */
export async function resolveLlmsFullTxt({
  cache,
  nowMs,
  ttlMs,
  generateFull,
  generateIndex,
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
    const tsMs = nowMs - ttlMs + LLMS_FULL_TXT_RETRY_WINDOW_MS;
    if (cache?.value) {
      onError?.(err, "stale");
      return { value: cache.value, tsMs, mode: "stale" };
    }
    onError?.(err, "index-fallback");
    return { value: generateIndex(), tsMs, mode: "index-fallback" };
  }
}
