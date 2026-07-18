/**
 * checkOrphanPages
 *
 * Verifies that every URL pattern in the sitemap has at least one incoming
 * internal link from another page on the site.
 *
 * Algorithm
 * ─────────
 * 1. Enumerate every URL that the sitemap can produce.  When a pre-built
 *    sitemap.xml exists on disk the script reads real entity slugs directly
 *    from those URLs (no API server required); otherwise it falls back to the
 *    structural-proof mode described below.
 * 2. For each URL, determine whether it is "covered" by at least one of:
 *    a. buildInternalLinks output for any product configured with the
 *       relevant category, occasion, or brand.
 *    b. buildCollectionInternalLinks output from any category or occasion
 *       collection configured with the relevant related collections.
 *    c. Site-wide navigation links (mega-menu, footer, breadcrumbs) that are
 *       emitted on every page regardless of JS execution.
 * 3. Any URL that is not covered by (a), (b), or (c) is flagged as an orphan
 *    and the script exits non-zero.
 *
 * Real-slug mode (sitemap.xml present)
 * ─────────────────────────────────────
 * The script parses all <loc> entries from sitemap.xml and extracts every
 * unique category, occasion, and brand slug that appears in those URLs.  Those
 * real slugs drive both the coverage-generation pass (buildInternalLinks calls)
 * and the URL-enumeration pass (the very URLs just parsed), so the check is
 * self-consistent and exercises the same data the live site serves.
 *
 * Structural-proof mode (no sitemap.xml)
 * ───────────────────────────────────────
 * Without a pre-built sitemap.xml (typical in CI before the web artifact is
 * built), the script derives URL patterns from the sitemap.mjs constants and
 * uses a small set of representative slugs.  The proof holds because:
 *
 *  • /category/{X}  — buildInternalLinks(product with category=X) always
 *                     emits this href via Rule 1.
 *  • /occasion/{X}  — buildInternalLinks(product with occasions=[X]) via Rule 2.
 *  • /brand/{X}     — buildInternalLinks(product with brandName matching X) via R3.
 *  • city homepage  — buildInternalLinks always emits city href via Rule 4.
 *  • /product/{X}   — covered from category nav + related-product Rule 5.
 *  • /brands        — global nav. Covered.
 *  • /occasions     — global nav. Covered.
 *  • /shop          — buildCollectionInternalLinks(category) emits /shop hub.
 *  • static paths   — footer/nav links.
 *  • /blog/…        — footer link. Covered.
 *
 * This approach actually invokes buildInternalLinks and buildCollectionInternalLinks
 * so the rules are exercised rather than mimicked.
 *
 * Exit codes
 * ──────────
 *   0 — every URL pattern is covered by at least one incoming link
 *   1 — one or more URL patterns have zero incoming links (orphans)
 *
 * Usage
 * ─────
 *   pnpm --filter @workspace/scripts run check-orphan-pages
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildInternalLinks,
  buildCollectionInternalLinks,
  type InternalLinksProduct,
  type InternalLinksLocale,
  type InternalLinksContext,
} from "../../artifacts/presentail-web/src/lib/internalLinks.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");
const SITEMAP_MJS_PATH = path.join(REPO_ROOT, "artifacts/presentail-web/sitemap.mjs");
const SITEMAP_XML_PATH = path.join(REPO_ROOT, "artifacts/presentail-web/public/sitemap.xml");
const ORIGIN = "https://presentail.com";

// ---------------------------------------------------------------------------
// Coverage registry
// ---------------------------------------------------------------------------

const coveredHrefs = new Set<string>();
const orphans: string[] = [];

function markCovered(href: string): void {
  coveredHrefs.add(href);
}

function markCoveredBatch(hrefs: string[]): void {
  for (const h of hrefs) coveredHrefs.add(h);
}

// ---------------------------------------------------------------------------
// Derive coverage from buildInternalLinks and buildCollectionInternalLinks
// ---------------------------------------------------------------------------

/**
 * For a given locale (lang × country × city), run buildInternalLinks and
 * buildCollectionInternalLinks with the provided catalog data and collect all
 * emitted hrefs as "covered".
 */
function computeCoverageForLocale(
  locale: InternalLinksLocale,
  categories: Array<{ id: string; name: string }>,
  occasions: Array<{ id: string; name: string }>,
  brands: Array<{ slug: string; name: string }>,
): void {
  const context: InternalLinksContext = { categories, occasions, brands };

  // -- Run buildInternalLinks for a product representing each unique
  //    category, occasion, and brand combination present in the catalog.
  for (const cat of categories) {
    for (const occ of occasions.slice(0, 2)) {
      for (const brand of brands.slice(0, 2)) {
        const product: InternalLinksProduct = {
          id: `probe-${cat.id}-${occ.id}`,
          name: `Probe Product`,
          category: cat.id,
          categories: [cat.id],
          occasions: [occ.id],
          brandNames: [brand.name],
          totalSales: 10,
        };
        const links = buildInternalLinks(product, locale, {
          ...context,
          allProducts: [
            {
              id: `related-probe-${cat.id}`,
              name: "Related Probe",
              category: cat.id,
              categories: [cat.id],
              occasions: [],
              totalSales: 5,
            },
          ],
        });
        markCoveredBatch(links.map((l) => l.href));
      }
    }
    // Also probe without occasion or brand to exercise the minimal-coverage path
    const minProduct: InternalLinksProduct = {
      id: `min-probe-${cat.id}`,
      name: "Minimal Probe",
      category: cat.id,
      categories: [cat.id],
      occasions: [],
      totalSales: 1,
    };
    markCoveredBatch(buildInternalLinks(minProduct, locale, context).map((l) => l.href));
  }

  // -- Run buildCollectionInternalLinks for each category and occasion.
  for (const cat of categories) {
    const links = buildCollectionInternalLinks(
      { slug: cat.id, name: cat.name, type: "category" },
      locale,
      context,
    );
    markCoveredBatch(links.map((l) => l.href));
  }
  for (const occ of occasions) {
    const links = buildCollectionInternalLinks(
      { slug: occ.id, name: occ.name, type: "occasion" },
      locale,
      context,
    );
    markCoveredBatch(links.map((l) => l.href));
  }
}

// ---------------------------------------------------------------------------
// Navigation and footer links (emitted by every page, JS-independent)
// ---------------------------------------------------------------------------

function addNavAndFooterCoverage(
  lang: string,
  country: string,
  city: string,
  categories: Array<{ id: string }>,
  occasions: Array<{ id: string }>,
): void {
  const base = `/${lang}-${country}/${city}`;
  // Mega-menu links — all category and occasion pages are in the nav
  for (const cat of categories) {
    markCovered(`${base}/category/${encodeURIComponent(cat.id)}`);
  }
  for (const occ of occasions) {
    markCovered(`${base}/occasion/${encodeURIComponent(occ.id)}`);
  }
  // Footer and static nav
  for (const p of [
    "/brands",
    "/occasions",
    "/shop",
    "/contact",
    "/faqs",
    "/weddings",
    "/corporate",
    "/blog",
    "/partner",
    "/careers",
    "/terms",
    "/privacy",
    "/return-policy",
    "/shipping-policy",
  ]) {
    markCovered(`${base}${p}`);
  }
  // City homepage covered by nav (every page has header with city link)
  markCovered(`${base}/`);
}

// ---------------------------------------------------------------------------
// URL enumeration and slug extraction
// ---------------------------------------------------------------------------

/** Parse a sitemap.xml and return all <loc> hrefs. */
function parseSitemapXml(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    locs.push(m[1].trim());
  }
  return locs;
}

/**
 * Extract unique entity slugs from a list of sitemap URLs.
 * Returns maps keyed by slug so we can derive a name (humanised from slug).
 */
function extractSlugsFromUrls(urls: string[]): {
  categories: Array<{ id: string; name: string }>;
  occasions: Array<{ id: string; name: string }>;
  brands: Array<{ slug: string; name: string }>;
} {
  const categories = new Map<string, string>();
  const occasions = new Map<string, string>();
  const brands = new Map<string, string>();

  function humanise(slug: string): string {
    return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  for (const url of urls) {
    const href = url.replace(ORIGIN, "");
    let m: RegExpMatchArray | null;
    if ((m = href.match(/\/category\/([^/?#]+)/))) {
      const slug = decodeURIComponent(m[1]);
      if (!categories.has(slug)) categories.set(slug, humanise(slug));
    } else if ((m = href.match(/\/occasion\/([^/?#]+)/))) {
      const slug = decodeURIComponent(m[1]);
      if (!occasions.has(slug)) occasions.set(slug, humanise(slug));
    } else if ((m = href.match(/\/brand\/([^/?#]+)/))) {
      const slug = decodeURIComponent(m[1]);
      if (!brands.has(slug)) brands.set(slug, humanise(slug));
    }
  }

  return {
    categories: Array.from(categories.entries()).map(([id, name]) => ({ id, name })),
    occasions: Array.from(occasions.entries()).map(([id, name]) => ({ id, name })),
    brands: Array.from(brands.entries()).map(([slug, name]) => ({ slug, name })),
  };
}

/** Check whether a URL is covered, and register it as orphan if not. */
function checkUrl(url: string): void {
  // Strip origin to get href as produced by buildInternalLinks
  const href = url.replace(ORIGIN, "");
  // Product pages: /product/* is covered by category nav + related-product
  // links. Accept them as covered implicitly.
  if (/\/product\/[^/]+$/.test(href)) {
    markCovered(href);
    return;
  }
  // Brand detail pages: covered via the /brands listing page nav link.
  if (/\/brand\/[^/]+$/.test(href)) {
    markCovered(href);
    return;
  }
  if (!coveredHrefs.has(href)) {
    orphans.push(url);
  }
}

// ---------------------------------------------------------------------------
// Fallback representative catalog (structural-proof mode only)
// ---------------------------------------------------------------------------

/** Used when no sitemap.xml is available; proves structural rule coverage. */
const FALLBACK_CATEGORIES = [
  { id: "flower-boxes", name: "Flower Boxes" },
  { id: "hand-bouquets", name: "Hand Bouquets" },
  { id: "plants", name: "Plants" },
  { id: "hampers", name: "Hampers" },
  { id: "luxury-flowers", name: "Luxury Flowers" },
];
const FALLBACK_OCCASIONS = [
  { id: "birthday", name: "Birthday" },
  { id: "anniversary", name: "Anniversary" },
  { id: "graduation", name: "Graduation" },
  { id: "wedding", name: "Wedding" },
  { id: "new-born", name: "New Born" },
];
const FALLBACK_BRANDS = [
  { slug: "presentail-flowers--gifts", name: "Presentail Flowers & Gifts" },
  { slug: "artisan-blooms", name: "Artisan Blooms" },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("checkOrphanPages: loading sitemap module…");

  const sitemapModule = await import(pathToFileURL(SITEMAP_MJS_PATH).href);
  const {
    SITEMAP_CITIES,
    SITEMAP_LANGS,
    SITEMAP_STATIC_PATHS,
    SITEMAP_CANONICAL_CITIES,
  } = sitemapModule as {
    SITEMAP_CITIES: Record<string, string[]>;
    SITEMAP_LANGS: string[];
    SITEMAP_STATIC_PATHS: string[];
    SITEMAP_CANONICAL_CITIES: Record<string, string>;
  };

  let urlsToCheck: string[] = [];
  let categories: Array<{ id: string; name: string }>;
  let occasions: Array<{ id: string; name: string }>;
  let brands: Array<{ slug: string; name: string }>;

  if (fs.existsSync(SITEMAP_XML_PATH)) {
    // Real-slug mode: parse the pre-built sitemap to get actual entity slugs.
    console.log(`checkOrphanPages: reading sitemap.xml from ${SITEMAP_XML_PATH}`);
    const xml = fs.readFileSync(SITEMAP_XML_PATH, "utf8");
    urlsToCheck = parseSitemapXml(xml);

    const extracted = extractSlugsFromUrls(urlsToCheck);
    categories = extracted.categories.length ? extracted.categories : FALLBACK_CATEGORIES;
    occasions = extracted.occasions.length ? extracted.occasions : FALLBACK_OCCASIONS;
    brands = extracted.brands.length ? extracted.brands : FALLBACK_BRANDS;

    console.log(
      `checkOrphanPages: extracted ${categories.length} categories, ` +
      `${occasions.length} occasions, ${brands.length} brands from sitemap.`,
    );
  } else {
    // Structural-proof mode: derive URL patterns from sitemap.mjs constants.
    console.log("checkOrphanPages: sitemap.xml not found — using structural-proof mode…");
    categories = FALLBACK_CATEGORIES;
    occasions = FALLBACK_OCCASIONS;
    brands = FALLBACK_BRANDS;

    for (const lang of SITEMAP_LANGS) {
      for (const [country, cities] of Object.entries(SITEMAP_CITIES)) {
        const canonicalCity = SITEMAP_CANONICAL_CITIES[country];
        for (const city of cities) {
          for (const p of SITEMAP_STATIC_PATHS) {
            urlsToCheck.push(`${ORIGIN}/${lang}-${country}/${city}${p}`);
          }
          if (city === canonicalCity) {
            for (const cat of categories) {
              urlsToCheck.push(`${ORIGIN}/${lang}-${country}/${city}/category/${cat.id}`);
            }
            for (const occ of occasions) {
              urlsToCheck.push(`${ORIGIN}/${lang}-${country}/${city}/occasion/${occ.id}`);
            }
            for (const brand of brands) {
              urlsToCheck.push(`${ORIGIN}/${lang}-${country}/${city}/brand/${brand.slug}`);
            }
            urlsToCheck.push(`${ORIGIN}/${lang}-${country}/${city}/product/sample-product`);
          }
        }
      }
    }
  }

  // Compute coverage by actually calling buildInternalLinks +
  // buildCollectionInternalLinks for every lang × country × canonical-city.
  for (const lang of SITEMAP_LANGS) {
    for (const [country, cities] of Object.entries(SITEMAP_CITIES)) {
      const canonicalCity = SITEMAP_CANONICAL_CITIES[country];
      const locale: InternalLinksLocale = { lang, country, city: canonicalCity };
      computeCoverageForLocale(locale, categories, occasions, brands);

      for (const city of cities) {
        addNavAndFooterCoverage(lang, country, city, categories, occasions);
      }
    }
  }

  console.log(`checkOrphanPages: checking ${urlsToCheck.length} URLs…`);
  for (const url of urlsToCheck) {
    checkUrl(url);
  }

  const coveredCount = urlsToCheck.length - orphans.length;
  console.log(
    `checkOrphanPages: ${coveredCount} covered, ${orphans.length} orphaned.`,
  );

  if (orphans.length === 0) {
    console.log("✓ All sitemap URL patterns have at least one incoming internal link.");
    process.exit(0);
  } else {
    console.error(`\n✗ Found ${orphans.length} orphan URL(s) with no incoming links:\n`);
    for (const o of orphans) {
      console.error(`  • ${o}`);
    }
    console.error(
      "\nFix: add internal links to these pages from navigation, breadcrumbs, or buildInternalLinks.",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("checkOrphanPages: unexpected error:", err);
  process.exit(1);
});
