/**
 * In-memory cache for product catalog data fetched from Presentail OS.
 *
 * Products are cached **per store key** (lebanon / dubai / abudhabi / cyprus),
 * matching the city-level granularity of the existing WooCommerce per-store
 * model. UAE cities (Dubai and Abu Dhabi) are separate stores with distinct
 * catalogs, so they each get an independent OS product list fetched with the
 * appropriate (countryCode, cityId) filter.
 *
 * Fetch parameters per store:
 *   lebanon  → countryCode: LB
 *   dubai    → countryCode: AE, cityId: ae-dubai
 *   abudhabi → countryCode: AE, cityId: ae-abu-dhabi
 *   cyprus   → countryCode: CY
 *
 * Categories, brands, and occasions are global (not per-store) — fetched
 * once and shared across all stores.
 *
 * Fallback policy:
 *   - If OS is unreachable at startup → warn; WooCommerce (or the static
 *     catalog) remains the source of truth until OS first responds.
 *   - Once a store's cache is populated, a later fetch failure retains the
 *     last-good data rather than reverting to WC or clearing the cache.
 *
 * PRESENTAIL_OS_API_KEY must be present; otherwise the cache stays empty
 * and the existing WooCommerce paths handle all product reads.
 */

import {
  fetchOsProducts,
  fetchOsCategories,
  fetchOsCatalogAttributesBrands,
  fetchOsOccasions,
  type PresentailOsConfig,
} from "@workspace/presentail-os";
import type {
  OSProduct,
  OSProductCategory,
  OSProductBrand,
  OSProductOccasion,
} from "@workspace/presentail-os";
import { db, osPriceSnapshotsTable, osPriceAlertsTable, appOrdersTable } from "@workspace/db";
import { gt, lt, sql, inArray } from "drizzle-orm";
import { inferPersonalisationRequirements } from "./personalisationRequirementInference";
import type { StoreKey } from "./wooStore";
import { logger } from "./logger";
import { sendAlert } from "./alerts";
import { submitIndexNowUrls, buildCanonicalUrls } from "./indexNow";

// ── Types ──────────────────────────────────────────────────────────────────

type StoreProductCache = {
  products: OSProduct[];
  wcIdIndex: Map<number, OSProduct>;
  slugIndex: Map<string, OSProduct>;
};

type StoreOsFetchSpec = {
  storeKey: StoreKey;
  countryCode: string;
  cityId?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalise a brand name for slug cross-reference lookups.
 * Strips punctuation, lowercases, and collapses whitespace so that
 * "Hallab 1881" and "hallab 1881" produce the same key regardless of
 * capitalisation or minor punctuation differences.
 *
 * Exported so the brand-products route can resolve product-embedded brand
 * names to canonical catalog-attribute slugs at query time.
 */
export function normaliseBrandName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Known stores to fetch from OS ─────────────────────────────────────────

const OS_STORE_SPECS: StoreOsFetchSpec[] = [
  { storeKey: "lebanon", countryCode: "LB" },
  { storeKey: "dubai", countryCode: "AE", cityId: "ae-dubai" },
  { storeKey: "abudhabi", countryCode: "AE", cityId: "ae-abu-dhabi" },
  { storeKey: "cyprus", countryCode: "CY" },
];

// ── Module state ───────────────────────────────────────────────────────────

/**
 * Per-store product cache. Absent key = not yet fetched or OS unavailable.
 * Once populated a store's entry is never removed — transient OS errors
 * retain the last-good data.
 */
const storeCache = new Map<StoreKey, StoreProductCache>();

/**
 * Startup price snapshot — populated the very first time each store's cache
 * is successfully filled. Never updated after that initial load, so it
 * represents the prices at server boot time (a ~24 h baseline for the admin
 * funnels dashboard). Keys are OS product IDs; values are priceUsd.
 *
 * Products absent from the snapshot (arrived after startup, or the OS was
 * unavailable at boot) are excluded from change detection — they get
 * `priceChanged: false` to avoid spurious warnings.
 */
const startupPriceSnapshot = new Map<string, number>();

/**
 * Deduplication map for price-change Slack alerts.
 * Maps product id → timestamp of last alert sent.
 * An alert is suppressed when it was sent within the past 24 h.
 */
const priceAlertedAt = new Map<string, number>();
const PRICE_ALERT_DEDUPE_MS = 24 * 60 * 60 * 1000; // 24 h

/** Global taxonomy data (not per-store). */
let cachedCategories: OSProductCategory[] | null = null;
let cachedBrands: OSProductBrand[] | null = null;
let cachedOccasions: OSProductOccasion[] | null = null;
/**
 * The most recent set of best-seller product IDs, computed from blended
 * app_orders DB counts + OS totalSales after each cache refresh.
 * Exposed via getCachedBestSellerIds() for the catalog/best-seller-ids route.
 */
let cachedBestSellerIdSet: ReadonlySet<string> = new Set();
/**
 * Raw catalog-attribute brands as returned by the OS API, before the
 * zero-product-count filter is applied. Used by the catalog metadata endpoint
 * to surface active brands even when they have no products assigned yet.
 */
let cachedRawCatalogBrands: import("@workspace/presentail-os").OSCatalogAttributeBrand[] | null = null;

/**
 * Pre-computed per-brand in-stock product counts across all stores,
 * deduplicated by product id. Updated after every successful fetch cycle
 * so `/catalog/metadata` does not need to re-iterate over all store caches
 * on each request.
 *
 * Keys are brand slugs; values are the count of distinct in-stock products
 * associated with that brand across all stores.
 */
let cachedBrandProductCounts: Map<string, number> = new Map();

/**
 * Name-normalised cross-reference map from catalog-attribute brands.
 * Key: lowercase, whitespace-collapsed, punctuation-stripped brand name.
 * Value: the canonical catalog-attribute slug for that brand.
 *
 * Built whenever `cachedRawCatalogBrands` is populated and used in the
 * per-brand count computation to resolve product-embedded brand slugs that
 * differ from catalog-attribute slugs (e.g. embedded slug "hallab" vs
 * catalog slug "hallab-1881") to the correct canonical slug so the count
 * is stored under the same key that `catalog.ts` looks up.
 */
let cachedBrandNameToCanonicalSlug: Map<string, string> = new Map();

/**
 * Pre-computed per-category and per-occasion in-stock product counts across
 * all stores, deduplicated by product id. Same rationale as
 * `cachedBrandProductCounts`: `/catalog/metadata` reads these directly so it
 * never re-iterates over every store cache per request. Keys are category /
 * occasion slugs; values are the count of distinct in-stock products.
 */
let cachedCategoryProductCounts: Map<string, number> = new Map();
let cachedOccasionProductCounts: Map<string, number> = new Map();
// Per-country versions of the above (countryCode → slug → count).
// Populated alongside the global maps; AE stores are merged by deduplication.
let cachedCategoryProductCountsByCountry: Map<string, Map<string, number>> = new Map();
let cachedOccasionProductCountsByCountry: Map<string, Map<string, number>> = new Map();

// ── Product pricing enrichment cache ───────────────────────────────────────
//
// Populated after every successful fetch cycle by batch-fetching the
// single-product OS endpoint for each unique product. Only products with an
// active discount are stored (to keep the map small). Keyed by osNumericId
// (string). Consumers read this via getOsProductPricingMap().

export type ProductPricingEntry = {
  discountPriceUsd: number | null;
  discountPriceAed: number | null;
  /** Non-null when the modern regular_price/sale_price scheme is active. */
  regularPriceUsd: number | null;
};

let cachedProductPricing: Map<string, ProductPricingEntry> = new Map();
/**
 * Unique OSProductOccasion objects collected from product tags across all
 * stores, keyed by slug. Populated in the same post-fetch loop that builds
 * cachedOccasionProductCounts. Used by /catalog/metadata to surface occasions
 * that are tagged on products but not yet listed in the OS occasions catalog
 * endpoint (e.g. occasions created via product tagging before the OS admin
 * adds them to the occasions catalog).
 */
let cachedProductOccasions: Map<string, OSProductOccasion> = new Map();

let timer: NodeJS.Timeout | null = null;
let fetching = false;

/** Timestamp of the most recent successful `fetchAndStore()` completion. */
let lastRefreshedAt: Date | null = null;

// ── IndexNow slug-change detection ─────────────────────────────────────────

/**
 * Slugs seen in prior taxonomy fetches. Used to detect new category /
 * occasion / brand slugs and submit only the newly-added canonical URLs to
 * IndexNow instead of re-submitting the entire sitemap on every refresh
 * cycle.
 *
 * Populated on the first successful taxonomy fetch; subsequent fetches
 * diff against these sets. All sets are intentionally never cleared so
 * a slug that temporarily disappears from OS and returns later is NOT
 * re-submitted (it was already indexed).
 */
const knownCategorySlugs = new Set<string>();
const knownOccasionSlugs = new Set<string>();
const knownBrandSlugs = new Set<string>();
/**
 * Product slugs seen in prior fetches. Populated the first time any store's
 * product list is successfully fetched; new slugs arriving on subsequent
 * fetches are submitted to IndexNow. Never cleared so a temporarily-absent
 * product that returns later is NOT re-submitted.
 */
const knownProductSlugs = new Set<string>();

/**
 * Whether the taxonomy slug sets have been seeded from the first successful
 * fetch. On the very first fetch we record all slugs as "known" and do NOT
 * submit anything — IndexNow submissions only fire for slugs that arrive
 * after the first warm cache.
 */
let taxonomySeeded = false;

/** Reset slug tracking state. Only call from tests. */
export function __resetIndexNowSlugTrackingForTest(): void {
  knownCategorySlugs.clear();
  knownOccasionSlugs.clear();
  knownBrandSlugs.clear();
  knownProductSlugs.clear();
  taxonomySeeded = false;
}

/** Call detectAndSubmitNewTaxonomySlugs directly. Only call from tests. */
export function __detectAndSubmitNewTaxonomySlugsForTest(
  categories: OSProductCategory[],
  brands: OSProductBrand[],
  occasions: OSProductOccasion[],
  productSlugs: string[],
): void {
  detectAndSubmitNewTaxonomySlugs(categories, brands, occasions, productSlugs);
}

/**
 * Diff the fresh taxonomy lists and product slug set against the known-slug
 * sets. On the first call (taxonomySeeded = false) all slugs are recorded and
 * nothing is submitted. On subsequent calls, new slugs are submitted to
 * IndexNow and added to the known sets.
 *
 * @param categories   Fresh category list from the latest OS fetch.
 * @param brands       Fresh brand list from the latest OS fetch.
 * @param occasions    Fresh occasion list from the latest OS fetch.
 * @param productSlugs De-duplicated product slugs collected from all stores
 *                     in the latest fetch cycle.
 */
function detectAndSubmitNewTaxonomySlugs(
  categories: OSProductCategory[],
  brands: OSProductBrand[],
  occasions: OSProductOccasion[],
  productSlugs: string[],
): void {
  const newCategorySlugs: string[] = [];
  const newBrandSlugs: string[] = [];
  const newOccasionSlugs: string[] = [];
  const newProductSlugs: string[] = [];

  for (const cat of categories) {
    if (cat.id && !knownCategorySlugs.has(cat.id)) {
      newCategorySlugs.push(cat.id);
      knownCategorySlugs.add(cat.id);
    }
  }
  for (const brand of brands) {
    if (brand.id && !knownBrandSlugs.has(brand.id)) {
      newBrandSlugs.push(brand.id);
      knownBrandSlugs.add(brand.id);
    }
  }
  for (const occ of occasions) {
    if (occ.id && !knownOccasionSlugs.has(occ.id)) {
      newOccasionSlugs.push(occ.id);
      knownOccasionSlugs.add(occ.id);
    }
  }
  for (const slug of productSlugs) {
    if (slug && !knownProductSlugs.has(slug)) {
      newProductSlugs.push(slug);
      knownProductSlugs.add(slug);
    }
  }

  if (!taxonomySeeded) {
    // First fetch — record all slugs as baseline; nothing to submit yet.
    taxonomySeeded = true;
    logger.info(
      {
        categories: knownCategorySlugs.size,
        brands: knownBrandSlugs.size,
        occasions: knownOccasionSlugs.size,
        products: knownProductSlugs.size,
      },
      "osProductsCache: IndexNow slug baseline established",
    );
    return;
  }

  const newUrls = [
    ...buildCanonicalUrls("category", newCategorySlugs),
    ...buildCanonicalUrls("brand", newBrandSlugs),
    ...buildCanonicalUrls("occasion", newOccasionSlugs),
    ...buildCanonicalUrls("product", newProductSlugs),
  ];

  if (newUrls.length === 0) return;

  logger.info(
    {
      newCategories: newCategorySlugs.length,
      newBrands: newBrandSlugs.length,
      newOccasions: newOccasionSlugs.length,
      newProducts: newProductSlugs.length,
      urls: newUrls.length,
    },
    "osProductsCache: new taxonomy slugs detected — submitting to IndexNow",
  );

  submitIndexNowUrls(newUrls).catch((err: unknown) => {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "osProductsCache: IndexNow submission for new taxonomy slugs failed",
    );
  });
}

// ── OS-refresh listeners ────────────────────────────────────────────────────

/**
 * Callbacks registered via `registerOsProductsRefreshListener`.
 * Each is invoked (fire-and-forget) after every successful `fetchAndStore`
 * so dependent caches (e.g. the best-sellers ranking cache) can be
 * invalidated in lock-step with the OS product cache refresh.
 */
const osRefreshListeners: Array<() => void> = [];

/**
 * Register a function to be called after every successful OS products
 * refresh (i.e. every time `fetchAndStore` completes without throwing).
 * Useful for dependent caches that must stay aligned with the OS data.
 *
 * Multiple listeners may be registered; they are called in registration
 * order. Errors thrown by a listener are caught and logged so they cannot
 * break the refresh pipeline.
 */
export function registerOsProductsRefreshListener(fn: () => void): void {
  osRefreshListeners.push(fn);
}

// ── Pricing-enrichment completion listeners ─────────────────────────────────

/**
 * Callbacks registered via `registerPricingEnrichmentListener`.
 * Each is invoked after every successful `enrichProductPricingFromOs` run
 * (including partial runs that timed out but still committed results) so
 * dependent caches that embed pricing data can be invalidated as soon as
 * fresh discount data is available.
 *
 * This is especially important on cold start: the OS refresh fires first,
 * clearing dependent caches. If a request arrives before enrichment
 * completes, it may cache a null-discount snapshot. These listeners ensure
 * the dependent caches are busted again once enrichment finishes.
 */
const pricingEnrichmentListeners: Array<() => void> = [];

/**
 * Register a function to be called after every pricing enrichment cycle
 * completes (both full and partial/timed-out runs that committed results).
 * Listeners are called in registration order; errors are caught and logged.
 */
export function registerPricingEnrichmentListener(fn: () => void): void {
  pricingEnrichmentListeners.push(fn);
}

// ── First-population callback ───────────────────────────────────────────────

/**
 * Callback to invoke exactly once when the OS product cache transitions from
 * empty → populated for the first time after startup (or after a reset).
 * Cleared immediately after firing so it cannot run twice.
 */
let onFirstPopulatedCallback: (() => void) | null = null;

/**
 * Whether the first-populated callback has already fired. Once set to true
 * subsequent calls to `fetchAndStore` do not re-fire it even if the cache
 * was populated before this flag was checked.
 */
let firstPopulatedFired = false;

/**
 * Register a function to be called exactly once the next time the OS product
 * cache successfully transitions from empty → populated.
 *
 * If the cache is already populated when this is called the function is
 * scheduled on the next microtask so callers never need to handle synchronous
 * execution ordering.
 *
 * Registering a second time before the cache first populates overwrites the
 * previous registration.
 *
 * Intended for monitors (e.g. `seoAuditMonitor`) that need to run a check
 * immediately after the first successful OS fetch, without relying on a
 * fixed-interval timer.
 */
export function registerOnFirstPopulatedCallback(fn: () => void): void {
  if (firstPopulatedFired) {
    // Cache already warm — fire asynchronously so callers don't need to
    // handle synchronous execution ordering.
    Promise.resolve().then(fn).catch(() => undefined);
    return;
  }
  onFirstPopulatedCallback = fn;
}

/**
 * Reset first-populated callback state. Only call from tests.
 */
export function __resetFirstPopulatedForTest(): void {
  onFirstPopulatedCallback = null;
  firstPopulatedFired = false;
}

/**
 * Reset brand-filter state to blank. Only call from tests.
 */
export function __resetBrandFilterStateForTest(): void {
  storeCache.clear();
  cachedBrands = null;
  cachedRawCatalogBrands = null;
  cachedBrandProductCounts = new Map();
  cachedBrandNameToCanonicalSlug = new Map();
  cachedCategoryProductCounts = new Map();
  cachedOccasionProductCounts = new Map();
  cachedProductOccasions = new Map();
  cachedProductPricing = new Map();
}

/**
 * Call fetchAndStore directly (bypasses the startup timer and interval).
 * Use in tests to drive the full brand-assembly + count-recomputation path
 * with mocked OS fetchers. Only call from tests.
 */
export async function fetchAndStoreForTesting(): Promise<void> {
  return fetchAndStore();
}

/**
 * Run the pricing enrichment step directly (awaited) with a controlled config.
 * Reads from storeCache, which must be populated first via fetchAndStoreForTesting().
 * Only call from tests.
 */
export async function __enrichProductPricingForTest(
  config: PresentailOsConfig,
): Promise<void> {
  return enrichProductPricingFromOs(config);
}

/**
 * Simulate the first-populated event in tests without a real OS fetch.
 * Fires the registered callback (if any) exactly once and marks the state
 * as having fired.
 */
export function __triggerFirstPopulatedForTest(): void {
  if (firstPopulatedFired) return;
  firstPopulatedFired = true;
  const fn = onFirstPopulatedCallback;
  onFirstPopulatedCallback = null;
  fn?.();
}

/** UTC date (YYYY-MM-DD) of the most recently persisted daily snapshot, or null. */
let lastPersistedSnapshotDate: string | null = null;

// ── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

const INTERVAL_MS = (() => {
  const raw = Number(process.env.WOO_SYNC_INTERVAL_MS);
  if (!Number.isFinite(raw) || raw < 60_000) return DEFAULT_INTERVAL_MS;
  return raw;
})();

function getOsConfig(): PresentailOsConfig {
  return {
    apiKey: process.env.PRESENTAIL_OS_API_KEY ?? "",
    baseUrl: process.env.PRESENTAIL_OS_API_URL ?? "https://os.presentail.com",
    workspace: process.env.PRESENTAIL_OS_WORKSPACE ?? "presentail",
  };
}

/**
 * Filter products by brand slug allowlist.
 *
 * Reads PRESENTAIL_OS_BRAND_ALLOWLIST (comma-separated brand slugs).
 * Defaults to "" (no filtering) — all brands are shown unless the env var is set.
 * Set the env var to a comma-separated list of slugs to restrict to those brands only.
 */
function applyBrandAllowlist(products: OSProduct[]): OSProduct[] {
  const raw = process.env.PRESENTAIL_OS_BRAND_ALLOWLIST;
  const allowlistStr = raw ?? "";
  if (!allowlistStr.trim()) return products; // empty string = no filtering
  const allowed = new Set(allowlistStr.split(",").map((s) => s.trim()).filter(Boolean));
  return products.filter((p) =>
    Array.isArray(p.brands) && p.brands.some((b) => allowed.has(b.slug)),
  );
}

/**
 * Filter products by the OS availability matrix (deliverableCountries /
 * deliverableCities). When a product has no deliverableCountries set it is
 * available everywhere and passes through unchanged. When the list IS set the
 * product must include the store's country code; when deliverableCities is also
 * set and the store targets a specific city, the product must include that city.
 *
 * This mirrors the per-country / per-city checkboxes in the OS admin "Availability"
 * panel and acts as a client-side guard in case the OS API's own country_code
 * filter does not exclude the product from the response.
 */
function filterByAvailability(products: OSProduct[], spec: StoreOsFetchSpec): OSProduct[] {
  return products.filter((p) => {
    const countries = p.deliverableCountries;
    // No availability restriction → always visible.
    if (!countries || countries.length === 0) return true;
    // Country must be in the allowed list.
    if (!countries.includes(spec.countryCode.toUpperCase())) return false;
    // City-level check: only when both the store and the product have cities set.
    const cities = p.deliverableCities;
    if (spec.cityId && cities && cities.length > 0) {
      // OS city slugs omit the two-letter country prefix that our internal city
      // IDs carry (e.g. OS returns "dubai", spec.cityId is "ae-dubai").  The
      // fetchOsProducts call already strips the prefix before querying OS
      // (see client.ts line ~389).  Accept either form so both formats work.
      const bareCitySlug = spec.cityId.replace(/^[a-z]{2}-/, "");
      return cities.some((c) => c === spec.cityId || c === bareCitySlug);
    }
    return true;
  });
}

// ── Startup price snapshot helpers ─────────────────────────────────────────

/**
 * Record prices for all products in `products` into the startup snapshot,
 * but only when this is the very first fetch for `storeKey` (i.e. the store
 * cache did not previously have data). Subsequent refreshes update the live
 * cache but intentionally leave the snapshot untouched.
 *
 * When `seedFromDb()` has already populated the snapshot from the DB, this
 * function only fills in any products that were absent from that DB snapshot
 * (newly added products that don't yet have a prior-day DB row). Those get
 * `priceChangedSinceStartup: false` to avoid spurious warnings.
 */
function maybeRecordStartupSnapshot(products: OSProduct[], storeKey: StoreKey): void {
  if (storeCache.has(storeKey)) return; // not first fetch for this store
  for (const p of products) {
    // Only fill gaps — do not overwrite rows seeded from the DB.
    if (!startupPriceSnapshot.has(p.id) && typeof p.price === "number") {
      startupPriceSnapshot.set(p.id, p.price);
    }
  }
}

/**
 * Seed the startup price snapshot from the most recent daily DB snapshot
 * that predates today's UTC date. This makes the baseline survive server
 * restarts: instead of comparing prices against "what the server saw at
 * cold-boot", we compare against "what prices were yesterday (or the last
 * day we recorded)".
 *
 * Must be called before the first OS product fetch so that when
 * `maybeRecordStartupSnapshot` runs it sees the DB rows and leaves them
 * untouched. Safe to call multiple times (no-op after the first successful
 * seed).
 *
 * No-op in test environments.
 */
export async function seedStartupSnapshotFromDb(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  if (startupPriceSnapshot.size > 0) return; // already seeded
  try {
    const todayUtc = utcDateString(new Date());
    // Find the most recent snapshot_date that precedes today.
    const [latestRow] = await db
      .select({ snapshotDate: osPriceSnapshotsTable.snapshotDate })
      .from(osPriceSnapshotsTable)
      .where(lt(osPriceSnapshotsTable.snapshotDate, todayUtc))
      .orderBy(sql`${osPriceSnapshotsTable.snapshotDate} desc`)
      .limit(1);
    if (!latestRow) {
      logger.info(
        "osProductsCache: no prior-day DB snapshot found — baseline will be built from the first in-memory fetch",
      );
      return;
    }
    const rows = await db
      .select({
        productId: osPriceSnapshotsTable.productId,
        priceUsd: osPriceSnapshotsTable.priceUsd,
      })
      .from(osPriceSnapshotsTable)
      .where(sql`${osPriceSnapshotsTable.snapshotDate} = ${latestRow.snapshotDate}`);
    let seeded = 0;
    for (const row of rows) {
      startupPriceSnapshot.set(row.productId, row.priceUsd);
      seeded++;
    }
    logger.info(
      { snapshotDate: latestRow.snapshotDate, seeded },
      "osProductsCache: startup price snapshot seeded from DB",
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { err: msg },
      "osProductsCache: failed to seed startup snapshot from DB — baseline will be built from the first in-memory fetch",
    );
  }
}

/**
 * Persist the current in-memory product prices to the `os_price_snapshots`
 * table for today's UTC date, then prune rows older than 7 days.
 *
 * Idempotent within a UTC day: the unique index on (product_id, snapshot_date)
 * causes duplicate inserts to be silently discarded. The in-process guard
 * (`lastPersistedSnapshotDate`) avoids hitting the DB on every sync tick.
 *
 * Call this from the wooSync worker once per tick so that at least one
 * snapshot is written during each UTC day the server runs.
 *
 * No-op in test environments.
 */
export async function persistDailySnapshotIfNeeded(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const todayUtc = utcDateString(new Date());
  if (lastPersistedSnapshotDate === todayUtc) return; // already persisted today

  const allProducts: Array<{ productId: string; priceUsd: number }> = [];
  for (const spec of OS_STORE_SPECS) {
    const entry = storeCache.get(spec.storeKey);
    if (!entry) continue;
    for (const p of entry.products) {
      if (typeof p.price === "number") {
        allProducts.push({ productId: p.id, priceUsd: p.price });
      }
    }
  }

  if (allProducts.length === 0) {
    logger.info(
      "osProductsCache: persistDailySnapshot skipped — OS cache is empty",
    );
    return;
  }

  // Deduplicate by productId (a product may appear in multiple store caches
  // with the same price). Keep first occurrence.
  const seen = new Set<string>();
  const rows = allProducts.filter(({ productId }) => {
    if (seen.has(productId)) return false;
    seen.add(productId);
    return true;
  });

  try {
    await db
      .insert(osPriceSnapshotsTable)
      .values(rows.map((r) => ({ productId: r.productId, priceUsd: r.priceUsd, snapshotDate: todayUtc })))
      .onConflictDoNothing();
    lastPersistedSnapshotDate = todayUtc;
    logger.info(
      { snapshotDate: todayUtc, productCount: rows.length },
      "osProductsCache: daily price snapshot persisted to DB",
    );
    // Prune snapshots older than 7 days so the table stays small.
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cutoffStr = utcDateString(cutoff);
    await db
      .delete(osPriceSnapshotsTable)
      .where(lt(osPriceSnapshotsTable.snapshotDate, cutoffStr));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "osProductsCache: failed to persist daily price snapshot");
  }
}

/** Returns a UTC date string in YYYY-MM-DD format. */
function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Price-change alert helpers ─────────────────────────────────────────────

/**
 * Seed the in-memory `priceAlertedAt` deduplication map from the DB on
 * startup. Loads only rows whose `alerted_at` timestamp falls within the
 * past 24 h so we never suppress an alert that is already overdue.
 *
 * Must be called before the first OS product fetch (alongside
 * `seedStartupSnapshotFromDb`) so the dedupe window carries across deploys
 * and crashes — a reprice detected right before a restart won't re-fire
 * its alert on the next sync tick after boot.
 *
 * Safe to call multiple times (no-op once the map is non-empty).
 * No-op in test environments.
 */
export async function seedPriceAlertDedupeFromDb(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  if (priceAlertedAt.size > 0) return; // already seeded
  try {
    const cutoff = new Date(Date.now() - PRICE_ALERT_DEDUPE_MS);
    const rows = await db
      .select({
        productId: osPriceAlertsTable.productId,
        alertedAt: osPriceAlertsTable.alertedAt,
      })
      .from(osPriceAlertsTable)
      .where(gt(osPriceAlertsTable.alertedAt, cutoff));
    let seeded = 0;
    for (const row of rows) {
      priceAlertedAt.set(row.productId, row.alertedAt.getTime());
      seeded++;
    }
    if (seeded > 0) {
      logger.info(
        { seeded },
        "osProductsCache: price-alert dedupe map seeded from DB",
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { err: msg },
      "osProductsCache: failed to seed price-alert dedupe map from DB — mid-day restart may cause duplicate alerts",
    );
  }
}

/**
 * Persist a single product's alert timestamp to the `os_price_alerts` table
 * so the 24 h deduplication window survives restarts.
 *
 * Uses an upsert so the table stays small (one row per product ever alerted).
 * Failures are logged as warnings and do not block the alert itself.
 */
function persistAlertTimestamp(productId: string, alertedAt: Date): void {
  db.insert(osPriceAlertsTable)
    .values({ productId, alertedAt })
    .onConflictDoUpdate({
      target: osPriceAlertsTable.productId,
      set: { alertedAt },
    })
    .catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), productId },
        "osProductsCache: failed to persist price-alert timestamp to DB",
      );
    });
}

/**
 * Compare the freshly-fetched `products` against the startup price snapshot
 * and fire a Slack alert for each product whose price has changed.
 *
 * Deduplication: at most one alert per product per 24 h, so the message
 * fires once when a repricing is first detected and stays silent on every
 * subsequent polling tick until the window resets. The deduplication state
 * is persisted to the `os_price_alerts` table so it survives server restarts
 * and deploys — a reprice just before a deploy won't re-fire after boot.
 *
 * Called only on refreshes that follow the initial snapshot load — on the
 * very first fetch, prices equal the snapshot by construction and no alert
 * is fired.
 */
function detectAndAlertPriceChanges(products: OSProduct[]): void {
  if (startupPriceSnapshot.size === 0) return; // snapshot not yet populated

  const now = Date.now();
  const changed: Array<{
    id: string;
    name: string;
    oldPrice: number;
    newPrice: number;
  }> = [];

  for (const p of products) {
    if (typeof p.price !== "number") continue;
    const snapshotPrice = startupPriceSnapshot.get(p.id);
    if (snapshotPrice === undefined) continue; // not in baseline — skip
    if (snapshotPrice === p.price) continue; // unchanged

    // Deduplicate within 24 h
    const lastAlerted = priceAlertedAt.get(p.id);
    if (lastAlerted !== undefined && now - lastAlerted < PRICE_ALERT_DEDUPE_MS) continue;

    priceAlertedAt.set(p.id, now);
    changed.push({ id: p.id, name: p.name, oldPrice: snapshotPrice, newPrice: p.price });
  }

  if (changed.length === 0) return;

  const dashboardUrl =
    (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "") +
    "/api/admin/funnels";

  const alertedAtDate = new Date(now);
  for (const item of changed) {
    // Persist the alert timestamp before sending so even a Slack failure
    // doesn't leave the dedupe window un-persisted.
    persistAlertTimestamp(item.id, alertedAtDate);

    sendAlert({
      title: "Add-on price changed",
      body: `*${item.name}* price changed from $${item.oldPrice.toFixed(2)} to $${item.newPrice.toFixed(2)}. Revenue estimates in the funnel dashboard may be affected.`,
      severity: "warn",
      fields: [
        { title: "Product", value: item.name },
        { title: "Old price (USD)", value: `$${item.oldPrice.toFixed(2)}` },
        { title: "New price (USD)", value: `$${item.newPrice.toFixed(2)}` },
        { title: "Dashboard", value: dashboardUrl },
      ],
      source: "osProductsCache.priceChange",
    }).catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "osProductsCache: price-change alert send failed",
      );
    });
  }
}

// ── Product pricing enrichment ─────────────────────────────────────────────

function parseOsPriceField(v: unknown): number | null {
  if (v == null || v === "" || v === "0" || v === 0) return null;
  const n = parseFloat(String(v));
  return isFinite(n) && n > 0 ? n : null;
}

/**
 * After each successful store-cache refresh, batch-fetches the single-product
 * OS endpoint for every unique product (by osNumericId) across all stores to
 * retrieve `regular_price`, `sale_price`, `discount_price_usd`, and
 * `discount_price_aed` — fields that the list endpoint omits.
 *
 * Results are stored in `cachedProductPricing` (keyed by osNumericId string).
 * Only products with an active discount are stored.
 *
 * Concurrency is controlled by a promise pool (≤PRICING_CONCURRENCY requests
 * in-flight at any moment) so there is no per-batch serial overhead. A hard
 * overall wall-clock timeout (PRICING_OVERALL_TIMEOUT_MS) is enforced via
 * AbortSignal.any() so a hung OS response can never overlap the next 15-minute
 * refresh cycle. Partial results collected before the timeout are committed.
 *
 * This is best-effort: a failure here does not affect the store product caches.
 */
async function enrichProductPricingFromOs(config: PresentailOsConfig): Promise<void> {
  // Collect unique osNumericIds from all stores
  const idSet = new Set<string>();
  for (const entry of storeCache.values()) {
    for (const p of entry.products) {
      if (p.osNumericId != null) {
        idSet.add(String(p.osNumericId));
      }
    }
  }
  if (idSet.size === 0) return;

  const ids = [...idSet];
  const CONCURRENCY = 10;
  const OVERALL_TIMEOUT_MS = 60_000;
  const PER_REQUEST_TIMEOUT_MS = 8_000;
  const newPricing = new Map<string, ProductPricingEntry>();

  // Hard wall-clock cap: all in-flight fetches are aborted when this fires.
  const overallSignal = AbortSignal.timeout(OVERALL_TIMEOUT_MS);

  // Promise pool: spawn CONCURRENCY workers that each drain the shared id queue.
  // This keeps ≤CONCURRENCY requests in-flight at all times without per-batch
  // serial overhead (no waiting for the slowest in each batch before starting
  // the next one).
  let queueIndex = 0;

  async function worker(): Promise<void> {
    while (queueIndex < ids.length) {
      if (overallSignal.aborted) break;
      const id = ids[queueIndex++];
      try {
        const url = new URL(
          `${config.baseUrl ?? "https://os.presentail.com"}/api/products/${encodeURIComponent(id)}`,
        );
        url.searchParams.set("workspace", config.workspace ?? "presentail");
        url.searchParams.set("apiKey", config.apiKey);

        // Combine the per-request timeout with the overall budget so whichever
        // fires first aborts this individual fetch.
        const signal = AbortSignal.any([
          AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
          overallSignal,
        ]);

        const res = await fetch(url.toString(), {
          headers: { Accept: "application/json", "x-api-key": config.apiKey },
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          product?: Record<string, unknown>;
        };
        const p = body.product ?? {};
        const regularPriceRaw = parseOsPriceField(p["regular_price"]);
        const salePriceRaw = parseOsPriceField(p["sale_price"]);
        const priceRaw = parseOsPriceField(p["price"]);

        let regularPriceUsd: number | null = null;
        let discountPriceUsd: number | null = null;

        if (regularPriceRaw != null && regularPriceRaw > 0) {
          regularPriceUsd = regularPriceRaw;
          if (salePriceRaw != null && salePriceRaw > 0 && salePriceRaw < regularPriceRaw) {
            discountPriceUsd = salePriceRaw;
          } else if (priceRaw != null && priceRaw > 0 && priceRaw < regularPriceRaw) {
            discountPriceUsd = priceRaw;
          }
        } else {
          discountPriceUsd = parseOsPriceField(p["discount_price_usd"]);
        }
        const discountPriceAed = parseOsPriceField(p["discount_price_aed"]);

        // Only store when there is an active discount (keeps the map small).
        if (discountPriceUsd != null || discountPriceAed != null) {
          newPricing.set(id, { discountPriceUsd, discountPriceAed, regularPriceUsd });
        }
      } catch {
        // Individual failures are silently skipped; the overall error handler at
        // the call site logs a warn if the entire enrichment step fails.
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (overallSignal.aborted) {
    logger.warn(
      { enrichedCount: newPricing.size, totalProducts: ids.length },
      "osProductsCache: product pricing enrichment timed out — partial results applied",
    );
  }

  cachedProductPricing = newPricing;
  logger.info(
    { enrichedCount: newPricing.size, totalProducts: ids.length },
    "osProductsCache: product pricing enrichment complete",
  );

  // Notify listeners (e.g. homepage caches) so they can bust stale
  // null-discount snapshots captured before enrichment completed.
  for (const fn of pricingEnrichmentListeners) {
    try {
      fn();
    } catch (err) {
      logger.warn({ err }, "osProductsCache: pricingEnrichmentListener threw");
    }
  }
}

// ── Index helpers ──────────────────────────────────────────────────────────

function buildStoreCache(products: OSProduct[]): StoreProductCache {
  const wcIdIndex = new Map<number, OSProduct>();
  const slugIndex = new Map<string, OSProduct>();
  for (const p of products) {
    if (typeof p.wcId === "number" && p.wcId > 0) {
      wcIdIndex.set(p.wcId, p);
    }
    // p.id is the slug (normalised by fetchOsProducts in lib/presentail-os).
    if (p.id) {
      slugIndex.set(p.id, p);
    }
  }
  return { products, wcIdIndex, slugIndex };
}

// ── Fetch ──────────────────────────────────────────────────────────────────

async function fetchAndStore(): Promise<void> {
  const config = getOsConfig();
  if (!config.apiKey) return;

  try {
    // Shared unfiltered fallback: if any store's country-filtered fetch returns
    // 0 products (OS doesn't have country availability set yet), all stores share
    // a single unfiltered fetch rather than each firing their own concurrent
    // request, which overloads OS and causes timeouts.
    let unfilteredFetch: Promise<OSProduct[]> | null = null;
    const getUnfiltered = (): Promise<OSProduct[]> => {
      if (!unfilteredFetch) {
        unfilteredFetch = fetchOsProducts(config, {}).then(
          (r) => r.products ?? ([] as OSProduct[]),
        );
      }
      return unfilteredFetch;
    };

    // Fetch per-store product lists in parallel, plus global taxonomy data.
    const storeFetches = OS_STORE_SPECS.map((spec) =>
      fetchOsProducts(config, { countryCode: spec.countryCode, cityId: spec.cityId })
        .then(async (resp) => {
          const products = resp.products ?? ([] as OSProduct[]);
          // If OS returned 0 products with a country filter, the products may
          // not yet have country availability set on the OS side. Retry without
          // the filter so the full catalog is shown until OS data is corrected.
          // All stores share the same unfiltered fetch to avoid concurrent requests.
          if (products.length === 0 && (spec.countryCode || spec.cityId)) {
            logger.warn(
              { storeKey: spec.storeKey, countryCode: spec.countryCode, cityId: spec.cityId },
              "osProductsCache: country-filtered fetch returned 0 products — retrying without country filter (OS products may not have country availability set)",
            );
            const fallbackProducts = await getUnfiltered();
            return { spec, products: fallbackProducts };
          }
          return { spec, products };
        })
        .catch((err: unknown) => ({
          spec,
          products: null as OSProduct[] | null,
          err: err instanceof Error ? err.message : String(err),
        })),
    );

    const [categoriesResp, brandsResp, occasionsResp, ...storeResults] =
      await Promise.allSettled([
        fetchOsCategories(config),
        fetchOsCatalogAttributesBrands(config),
        fetchOsOccasions(config, { sort: "best_selling" }),
        ...storeFetches,
      ]);

    // ── Per-store products ────────────────────────────────────────────────
    // Collect the union of all product slugs across successfully-fetched
    // stores for IndexNow change detection below.
    const freshProductSlugSet = new Set<string>();

    for (const result of storeResults as PromiseSettledResult<{
      spec: StoreOsFetchSpec;
      products: OSProduct[] | null;
      err?: string;
    }>[]) {
      if (result.status !== "fulfilled") {
        logger.warn(
          { err: result.reason instanceof Error ? result.reason.message : String(result.reason) },
          "osProductsCache: store products fetch settled rejected",
        );
        continue;
      }
      const { spec, products, err } = result.value;
      if (products === null) {
        if (!storeCache.has(spec.storeKey)) {
          logger.warn(
            { storeKey: spec.storeKey, err },
            "osProductsCache: initial products fetch failed — WooCommerce will serve listings",
          );
        } else {
          logger.warn(
            { storeKey: spec.storeKey, err },
            "osProductsCache: products fetch failed — retaining last-good cache",
          );
        }
        continue;
      }
      const filtered = applyBrandAllowlist(filterByAvailability(products, spec));
      if (filtered.length > 0) {
        maybeRecordStartupSnapshot(filtered, spec.storeKey);
        detectAndAlertPriceChanges(filtered);
        storeCache.set(spec.storeKey, buildStoreCache(filtered));
        logger.info(
          {
            storeKey: spec.storeKey,
            productCount: filtered.length,
            filteredOut: products.length - filtered.length,
          },
          "osProductsCache: products refreshed from Presentail OS",
        );
        for (const p of products) {
          if (p.id) freshProductSlugSet.add(p.id);
        }
      } else if (!storeCache.has(spec.storeKey)) {
        logger.warn(
          { storeKey: spec.storeKey },
          "osProductsCache: OS returned 0 products — WooCommerce will serve listings until OS has data",
        );
      }
    }

    // ── Global taxonomy ───────────────────────────────────────────────────
    let freshCategories: OSProductCategory[] = [];
    let freshBrands: OSProductBrand[] = [];
    let freshOccasions: OSProductOccasion[] = [];

    if (categoriesResp.status === "fulfilled") {
      const cats = categoriesResp.value.categories ?? [];
      if (cats.length > 0) {
        cachedCategories = cats;
        freshCategories = cats;
      }
    }
    if (occasionsResp.status === "fulfilled") {
      const occasions = occasionsResp.value.occasions ?? [];
      if (occasions.length > 0) {
        // Annotate each occasion with its zero-based position in the OS
        // best-selling response so the ranking engine can use it as a
        // tiebreaker when local stats are thin or absent.
        const occasionsWithPosition = occasions.map((o, idx) => ({
          ...o,
          osPosition: idx,
        }));
        cachedOccasions = occasionsWithPosition;
        freshOccasions = occasionsWithPosition;
        const featuredCount = occasions.filter((o) => o.featured === true).length;
        logger.info(
          { occasionCount: occasions.length, featuredCount },
          "osProductsCache: occasions refreshed from Presentail OS",
        );
      }
    }

    // ── Brands ────────────────────────────────────────────────────────────
    // Primary: catalog-attributes endpoint — returns all brands regardless of
    // whether any products are linked, with canonical slugs, sort_order, and
    // image_url. Mapped to the shared OSProductBrand shape used throughout.
    //
    // Supplement: product-embedded brand objects — fills any gaps if the
    // catalog-attributes fetch fails or returns an incomplete set. First-seen
    // wins, so the catalog-attributes data always takes precedence.
    {
      const brandMap = new Map<string, OSProductBrand>();

      if (brandsResp.status === "fulfilled") {
        const raw = brandsResp.value.brands ?? [];
        // Brands without a slug field are recoverable — derive a slug from the
        // name the same way the client library does so we don't silently drop them.
        const withDerivedSlug = raw.map((b) => {
          if (b.slug) return b;
          const derived = b.name
            .toLowerCase()
            .replace(/'/g, "")
            .replace(/&/g, "and")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          return { ...b, slug: derived };
        });
        const withSlugCount = raw.filter((b) => b.slug).length;
        const derivedSlugCount = raw.length - withSlugCount;
        const activeCount = withDerivedSlug.filter((b) =>
          b.is_active !== false && b.is_active !== "inactive",
        ).length;
        // Store the full raw list (including zero-product brands) so the
        // catalog metadata endpoint can filter by is_active independently.
        cachedRawCatalogBrands = withDerivedSlug;
        // Build a name-normalised cross-reference map so that the per-brand
        // count computation can resolve product-embedded brand slugs (which may
        // differ from catalog-attribute slugs) to the canonical slug.
        cachedBrandNameToCanonicalSlug = new Map(
          withDerivedSlug.map((b) => [normaliseBrandName(b.name), b.slug!]),
        );
        const osBase = config.baseUrl ?? "https://os.presentail.com";
        for (const b of withDerivedSlug) {
          // image_public_url is preferred (absolute CDN URL); fall back to
          // image_url which is a relative path that needs the OS base prepended.
          const rawImage = b.image_public_url || b.image_url || null;
          const image = rawImage
            ? rawImage.startsWith("http")
              ? rawImage
              : `${osBase}${rawImage}`
            : null;
          brandMap.set(b.slug!, {
            id: b.slug!,
            slug: b.slug!,
            name: b.name,
            image,
            description: b.description ?? undefined,
          });
        }
        logger.info(
          {
            totalBrands: raw.length,
            withCanonicalSlug: withSlugCount,
            withDerivedSlug: derivedSlugCount,
            activeBrands: activeCount,
            brandMapSize: brandMap.size,
          },
          "osProductsCache: brands refreshed from Presentail OS catalog-attributes",
        );
      } else {
        logger.warn(
          { err: brandsResp.reason instanceof Error ? brandsResp.reason.message : String(brandsResp.reason) },
          "osProductsCache: catalog-attributes brands fetch failed — falling back to product-embedded brands",
        );
      }

      if (brandMap.size > 0) {
        const derived = [...brandMap.values()];
        cachedBrands = derived;
        freshBrands = derived;
      }
    }

    // ── Per-brand in-stock product counts ────────────────────────────────
    // Recompute after every cycle so the count stays in sync with the
    // refreshed store caches. Deduplicate by product id so a product
    // available in multiple regions is counted once.
    {
      const counts = new Map<string, number>();
      const categoryCounts = new Map<string, number>();
      const occasionCounts = new Map<string, number>();
      const seenProductIds = new Set<string>();
      // Per-country maps: countryCode → (slug → count), deduped within each country.
      const perCountryCategory = new Map<string, Map<string, number>>();
      const perCountryOccasion = new Map<string, Map<string, number>>();
      const seenByCountry = new Map<string, Set<string>>();
      for (const spec of OS_STORE_SPECS) {
        const entry = storeCache.get(spec.storeKey);
        if (!entry) continue;
        const cc = spec.countryCode.toUpperCase();
        if (!perCountryCategory.has(cc)) perCountryCategory.set(cc, new Map());
        if (!perCountryOccasion.has(cc)) perCountryOccasion.set(cc, new Map());
        if (!seenByCountry.has(cc)) seenByCountry.set(cc, new Set());
        const cCatMap = perCountryCategory.get(cc)!;
        const cOccMap = perCountryOccasion.get(cc)!;
        const cSeen = seenByCountry.get(cc)!;
        for (const p of entry.products) {
          if (!p.inStock) continue;
          // Global deduplication.
          if (!seenProductIds.has(p.id)) {
            seenProductIds.add(p.id);
            for (const b of p.brands ?? []) {
              // Resolve to the canonical catalog-attribute slug via name lookup.
              // This handles the case where the product-embedded brand slug
              // differs from the catalog-attribute slug (e.g. "hallab" vs
              // "hallab-1881"). Falls back to the embedded slug when no match.
              const canonicalSlug =
                cachedBrandNameToCanonicalSlug.get(normaliseBrandName(b.name)) ??
                b.slug;
              counts.set(canonicalSlug, (counts.get(canonicalSlug) ?? 0) + 1);
            }
            for (const c of p.categories ?? []) {
              categoryCounts.set(c.slug, (categoryCounts.get(c.slug) ?? 0) + 1);
            }
            for (const o of p.occasions ?? []) {
              occasionCounts.set(o.slug, (occasionCounts.get(o.slug) ?? 0) + 1);
              if (!cachedProductOccasions.has(o.slug)) {
                cachedProductOccasions.set(o.slug, o);
              }
            }
          }
          // Per-country deduplication (AE has two stores; dedupe within AE).
          if (!cSeen.has(p.id)) {
            cSeen.add(p.id);
            for (const c of p.categories ?? []) {
              cCatMap.set(c.slug, (cCatMap.get(c.slug) ?? 0) + 1);
            }
            for (const o of p.occasions ?? []) {
              cOccMap.set(o.slug, (cOccMap.get(o.slug) ?? 0) + 1);
            }
          }
        }
      }
      cachedBrandProductCounts = counts;
      cachedCategoryProductCounts = categoryCounts;
      cachedOccasionProductCounts = occasionCounts;
      cachedCategoryProductCountsByCountry = perCountryCategory;
      cachedOccasionProductCountsByCountry = perCountryOccasion;
    }

    // ── Best-seller flag ──────────────────────────────────────────────────
    // Compute the top-20 products by blended score (OS totalSales + app_orders
    // DB quantity) across all stores (deduplicated by product id) and annotate
    // each in-memory product with isBestSeller.
    //
    // OS totalSales alone is unreliable in some environments (returns 0 for
    // all products), so we blend it with actual order data from app_orders —
    // the same source the homepage best-sellers rail uses. This ensures brand
    // and catalog pages show the same badges as the homepage rail.
    //
    // Run after every successful fetch so the flag stays in sync with the cache.
    {
      const BEST_SELLER_COUNT = 20;
      // Collect unique products across all stores.
      const seen = new Set<string>();
      const uniqueProducts: OSProduct[] = [];
      for (const spec of OS_STORE_SPECS) {
        const entry = storeCache.get(spec.storeKey);
        if (!entry) continue;
        for (const p of entry.products) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            uniqueProducts.push(p);
          }
        }
      }

      // Build a normalised-name → product-id map for merging DB order data.
      const productIdByName = new Map<string, string>(
        uniqueProducts.map((p) => [p.name.toLowerCase().trim(), p.id]),
      );

      // Fetch local sales counts from app_orders (best-effort; non-blocking
      // failures leave localSalesById empty so OS totalSales still applies).
      const localSalesById = new Map<string, number>();
      try {
        const rows = await db
          .select({ lineItemsJson: appOrdersTable.lineItemsJson })
          .from(appOrdersTable)
          .where(inArray(appOrdersTable.state, ["confirmed", "out_for_delivery", "delivered"]));
        for (const row of rows) {
          if (!row.lineItemsJson) continue;
          let items: unknown;
          try { items = JSON.parse(row.lineItemsJson); } catch { continue; }
          if (!Array.isArray(items)) continue;
          for (const item of items) {
            if (typeof item !== "object" || item === null || !("name" in item)) continue;
            const rec = item as { name: string; quantity?: unknown };
            if (typeof rec.name !== "string" || !rec.name.trim()) continue;
            const key = rec.name.toLowerCase().trim();
            const qty = typeof rec.quantity === "number" && rec.quantity > 0 ? rec.quantity : 1;
            const id = productIdByName.get(key);
            if (id) localSalesById.set(id, (localSalesById.get(id) ?? 0) + qty);
          }
        }
      } catch {
        // DB unavailable — fall through; OS totalSales is still used below.
      }

      // Rank by blended score (OS totalSales + DB order count) descending.
      // Mirror the homepage best-sellers rail: sort all products by blended score
      // and take the top BEST_SELLER_COUNT. Only populate the set when at least
      // one product has actual sales data (blendedScore > 0) — this avoids
      // flagging arbitrary products in a completely cold environment where all
      // scores are 0. When at least one score is > 0, lower-ranked products
      // (score 0) may be included to pad to 20, matching homepage rail behaviour.
      const blendedScore = (p: OSProduct): number =>
        (p.totalSales ?? 0) + (localSalesById.get(p.id) ?? 0);
      const hasAnySales = uniqueProducts.some((p) => blendedScore(p) > 0);
      const sorted = hasAnySales
        ? [...uniqueProducts]
            .sort((a, b) => blendedScore(b) - blendedScore(a))
            .slice(0, BEST_SELLER_COUNT)
        : [];
      const bestSellerIds = new Set(sorted.map((p) => p.id));
      // Build a per-product blended score map so totalSales can be written back
      // onto each cached product — making the popularity sort field reflect
      // actual order volume rather than the OS-returned 0.
      const blendedScoreById = new Map<string, number>(
        uniqueProducts.map((p) => [p.id, blendedScore(p)]),
      );
      // Annotate every product in every store cache in-place.
      for (const spec of OS_STORE_SPECS) {
        const entry = storeCache.get(spec.storeKey);
        if (!entry) continue;
        for (const p of entry.products) {
          p.isBestSeller = bestSellerIds.has(p.id);
          // Write the blended score back so downstream reads of totalSales
          // (mapped to the `popularity` field in API responses) reflect actual
          // order volume instead of the OS-returned 0. This makes the
          // "Best Seller" sort option produce a visible, correct reordering.
          p.totalSales = blendedScoreById.get(p.id) ?? p.totalSales ?? 0;
        }
      }
      // Persist so getCachedBestSellerIds() can serve the catalog route.
      cachedBestSellerIdSet = bestSellerIds;
    }

    // ── Filter zero-product brands from cachedBrands ──────────────────────
    // Remove brands that have no in-stock products in any store. This prevents
    // zero-product brands from leaking into search metadata and brand listings.
    // freshBrands retains the full unfiltered list so IndexNow slug tracking
    // still fires for brand slugs that were newly added to the OS catalog even
    // before products are linked to them.
    if (cachedBrands !== null) {
      cachedBrands = cachedBrands.filter(
        (b) => (cachedBrandProductCounts.get(b.slug) ?? 0) > 0,
      );
    }

    // ── Personalisation requirement inference ─────────────────────────────
    // Collect unique products with hasInputField=true across all stores,
    // run inference (DB cache + optional LLM), then annotate each in-memory
    // product with personalisationRequired so it flows through to clients.
    {
      const seenNumericIds = new Set<string>();
      const toInfer: { osNumericId: string; name: string; description?: string; categories?: string[]; hasLetterField?: boolean }[] = [];
      const productsByNumericId = new Map<string, OSProduct[]>();

      for (const spec of OS_STORE_SPECS) {
        const entry = storeCache.get(spec.storeKey);
        if (!entry) continue;
        for (const p of entry.products) {
          if (!p.hasInputField) continue;
          const numericId = String(p.osNumericId ?? p.id);
          const list = productsByNumericId.get(numericId);
          if (list) {
            list.push(p);
          } else {
            productsByNumericId.set(numericId, [p]);
          }
          if (!seenNumericIds.has(numericId)) {
            seenNumericIds.add(numericId);
            toInfer.push({
              osNumericId: numericId,
              name: p.name,
              description: p.description,
              categories: (p.categories ?? []).map((c) => c.name),
              hasLetterField: p.hasLetterField ?? false,
            });
          }
        }
      }

      if (toInfer.length > 0) {
        try {
          const requirementMap = await inferPersonalisationRequirements(toInfer);
          for (const [numericId, required] of Object.entries(requirementMap)) {
            const products = productsByNumericId.get(numericId);
            if (products) {
              for (const p of products) {
                p.personalisationRequired = required;
              }
            }
          }
        } catch (err) {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            "osProductsCache: personalisation requirement inference failed",
          );
        }
      }
    }

    // ── Product pricing enrichment (best-effort, background) ─────────────
    // Batch-fetch single-product OS endpoints to retrieve regular_price /
    // sale_price / discount_price_usd / discount_price_aed — fields the list
    // endpoint omits. Runs asynchronously so it doesn't delay the cache
    // refresh or block the first-population callback.
    enrichProductPricingFromOs(config).catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "osProductsCache: product pricing enrichment failed",
      );
    });

    // ── IndexNow: ping for new taxonomy and product slugs ─────────────────
    // Fires when any of categories, brands, occasions, or products were
    // successfully fetched this cycle. On the first fetch all current slugs
    // are recorded as the baseline and nothing is submitted; subsequent
    // fetches submit only slugs that are newly seen since the baseline.
    const freshProductSlugs = [...freshProductSlugSet];
    if (
      freshCategories.length > 0 ||
      freshBrands.length > 0 ||
      freshOccasions.length > 0 ||
      freshProductSlugs.length > 0
    ) {
      detectAndSubmitNewTaxonomySlugs(freshCategories, freshBrands, freshOccasions, freshProductSlugs);
    }

    // ── First-population callback ─────────────────────────────────────────
    // Fire exactly once when the cache transitions empty → populated. Placed
    // after all store and taxonomy updates so the callback sees a fully
    // consistent cache state (hasOsProducts(), getOsBrands(), etc. all
    // reflect the current fetch before the callback runs).
    if (!firstPopulatedFired && storeCache.size > 0 && onFirstPopulatedCallback) {
      firstPopulatedFired = true;
      const fn = onFirstPopulatedCallback;
      onFirstPopulatedCallback = null;
      fn();
    }

    // Record successful refresh timestamp for the diagnostic endpoint.
    lastRefreshedAt = new Date();

    // ── OS-refresh listeners ──────────────────────────────────────────────
    // Notify dependent caches (e.g. best-sellers ranking) that the OS
    // product data has been refreshed so they can invalidate in lock-step.
    for (const fn of osRefreshListeners) {
      try {
        fn();
      } catch (listenerErr: unknown) {
        logger.warn(
          { err: listenerErr instanceof Error ? listenerErr.message : String(listenerErr) },
          "osProductsCache: refresh listener threw",
        );
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "osProductsCache: fetch crashed");
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Whether the OS product cache is populated for the given store.
 * When no storeKey is provided, returns true when ANY store has data.
 *
 * Set OS_PRODUCTS_DISABLED=1 to force all product routes to use the
 * WooCommerce fallback path (useful when the OS API key is broken or
 * for local dev without an OS key).
 */
export function hasOsProducts(storeKey?: string): boolean {
  if (process.env.OS_PRODUCTS_DISABLED === "1") return false;
  if (storeKey) {
    const entry = storeCache.get(storeKey as StoreKey);
    return entry !== undefined && entry.products.length > 0;
  }
  for (const entry of storeCache.values()) {
    if (entry.products.length > 0) return true;
  }
  return false;
}

/**
 * Returns cached OS products for the given store, or null when OS has not
 * yet responded for that store. Falls back to Lebanon when storeKey is not
 * provided.
 */
export function getOsProducts(storeKey?: string): OSProduct[] | null {
  const key = (storeKey ?? "lebanon") as StoreKey;
  const entry = storeCache.get(key);
  return entry && entry.products.length > 0 ? entry.products : null;
}

/**
 * Look up a product by its WooCommerce numeric id within a specific store's
 * cache. Falls back to searching all store caches when storeKey is not
 * provided (for checkout where the storeKey may not be available).
 */
export function getOsProductByWcId(
  wcId: number,
  storeKey?: string,
): OSProduct | null {
  if (storeKey) {
    const entry = storeCache.get(storeKey as StoreKey);
    return entry?.wcIdIndex.get(wcId) ?? null;
  }
  // Search all store caches — prices are product-level so the first match wins.
  for (const entry of storeCache.values()) {
    const p = entry.wcIdIndex.get(wcId);
    if (p) return p;
  }
  return null;
}

/**
 * Look up a product by its slug within a specific store's cache. Falls back
 * to searching all caches when storeKey is not provided.
 */
export function getOsProductBySlug(
  slug: string,
  storeKey?: string,
): OSProduct | null {
  if (storeKey) {
    const entry = storeCache.get(storeKey as StoreKey);
    return entry?.slugIndex.get(slug) ?? null;
  }
  for (const entry of storeCache.values()) {
    const p = entry.slugIndex.get(slug);
    if (p) return p;
  }
  return null;
}

/**
 * Returns cached OS categories (global, not per-store).
 */
export function getOsCategories(): OSProductCategory[] | null {
  return cachedCategories;
}

/**
 * Derives a slug → OSProductCategory map by scanning every product in every
 * store cache and collecting the embedded category entries.
 *
 * The OS /api/categories endpoint can lag behind the product catalogue — a
 * category may be tagged on products before it appears in the categories list
 * (e.g. "electronics"). This function surfaces those product-only categories
 * so the catalog metadata endpoint and the image proxy can serve them without
 * waiting for the categories endpoint to catch up.
 *
 * Returns an empty map when no stores are populated yet.
 * When the same slug appears in multiple products the first occurrence wins
 * (they should be identical; we just want the imagePublicUrl).
 */
export function getOsProductEmbeddedCategories(): Map<string, OSProductCategory> {
  const result = new Map<string, OSProductCategory>();
  for (const entry of storeCache.values()) {
    for (const product of entry.products) {
      for (const cat of product.categories) {
        if (cat.slug && !result.has(cat.slug)) {
          result.set(cat.slug, cat);
        }
      }
    }
  }
  return result;
}

/**
 * Returns cached OS brands (global, not per-store).
 * Only includes brands that have at least one in-stock product.
 */
export function getOsBrands(): OSProductBrand[] | null {
  return cachedBrands;
}

/**
 * Returns raw OS catalog-attribute brands as fetched from the OS API,
 * before the zero-product-count filter is applied. Brands without a slug
 * are already excluded. Returns null when the cache has not been populated.
 *
 * Use this when you want to show brands marked as active in the OS admin
 * regardless of whether any products are currently linked to them.
 */
export function getOsRawCatalogBrands(): import("@workspace/presentail-os").OSCatalogAttributeBrand[] | null {
  return cachedRawCatalogBrands;
}

/**
 * Returns cached OS occasions (global, not per-store).
 */
export function getOsOccasions(): OSProductOccasion[] | null {
  return cachedOccasions;
}

// ── Per-city occasion cache ─────────────────────────────────────────────────
//
// When a catalog request includes a `city` query param, the occasions are
// fetched from OS with `city_slug` so the best-selling sort reflects that
// city's own sales signal. Results are cached per city slug for the same
// interval as the global refresh so hot cities pay the network cost only
// on the first request within each cache window.

const cachedOccasionsByCity = new Map<
  string,
  { occasions: OSProductOccasion[]; fetchedAt: number }
>();

/**
 * Return OS occasions for a specific city, fetching from OS with
 * `sort=best_selling&city_slug=<citySlug>` and caching the result for
 * `INTERVAL_MS` milliseconds.
 *
 * Falls back to the global `cachedOccasions` when:
 *   - the OS API key is absent,
 *   - the OS fetch fails, or
 *   - the response is empty.
 *
 * Occasions are annotated with `osPosition` (zero-based index in the
 * city-specific best-selling response) the same way the global cache is.
 */
export async function getOsOccasionsForCity(citySlug: string): Promise<OSProductOccasion[]> {
  const now = Date.now();
  const cached = cachedOccasionsByCity.get(citySlug);
  if (cached && now - cached.fetchedAt < INTERVAL_MS) {
    return cached.occasions;
  }

  const config = getOsConfig();
  if (!config.apiKey) {
    return cachedOccasions ?? [];
  }

  try {
    const resp = await fetchOsOccasions(config, { sort: "best_selling", citySlug });
    const occasions = (resp.occasions ?? []).map((o, idx) => ({ ...o, osPosition: idx }));
    if (occasions.length > 0) {
      cachedOccasionsByCity.set(citySlug, { occasions, fetchedAt: now });
      logger.info(
        { citySlug, occasionCount: occasions.length },
        "osProductsCache: city-specific occasions fetched from Presentail OS",
      );
      return occasions;
    }
  } catch (err: unknown) {
    logger.warn(
      { citySlug, err: err instanceof Error ? err.message : String(err) },
      "osProductsCache: city-specific occasions fetch failed — falling back to global cache",
    );
  }

  return cachedOccasions ?? [];
}

/**
 * Returns the pre-computed per-brand in-stock product count map.
 *
 * Keys are brand slugs; values are the count of distinct in-stock products
 * associated with that brand across all stores (deduplicated by product id).
 * The map is recomputed after every successful OS fetch cycle and is always
 * consistent with the current store caches — callers do not need to iterate
 * over store products themselves.
 *
 * Returns an empty map when the cache has not yet been populated.
 */
export function getOsBrandProductCounts(): ReadonlyMap<string, number> {
  return cachedBrandProductCounts;
}

/**
 * Returns the pre-computed per-category in-stock product counts (slug → count),
 * deduplicated by product id across all stores. Empty until the cache is warm.
 */
export function getOsCategoryProductCounts(): ReadonlyMap<string, number> {
  return cachedCategoryProductCounts;
}

/**
 * Returns the pre-computed per-occasion in-stock product counts (slug → count),
 * deduplicated by product id across all stores. Empty until the cache is warm.
 */
export function getOsOccasionProductCounts(): ReadonlyMap<string, number> {
  return cachedOccasionProductCounts;
}

/**
 * Returns the per-occasion in-stock product counts for a specific country
 * (slug → count), deduplicated by product id within that country's stores.
 * Falls back to an empty map when the country is unknown or the cache is cold.
 */
export function getOsOccasionProductCountsByCountry(countryCode: string): ReadonlyMap<string, number> {
  return cachedOccasionProductCountsByCountry.get(countryCode.toUpperCase()) ?? new Map();
}

/**
 * Returns the per-category in-stock product counts for a specific country
 * (slug → count), deduplicated by product id within that country's stores.
 * Falls back to an empty map when the country is unknown or the cache is cold.
 */
export function getOsCategoryProductCountsByCountry(countryCode: string): ReadonlyMap<string, number> {
  return cachedCategoryProductCountsByCountry.get(countryCode.toUpperCase()) ?? new Map();
}

/**
 * Returns unique OSProductOccasion objects collected from product tags across
 * all stores. Supplements getOsOccasions() to surface occasions that are
 * tagged on products but not yet in the OS occasions catalog endpoint.
 * Empty map until the product cache is warm.
 */
export function getOsProductOccasions(): ReadonlyMap<string, OSProductOccasion> {
  return cachedProductOccasions;
}

/**
 * Returns the name-normalised → canonical-slug cross-reference map built
 * from the catalog-attribute brands endpoint.
 *
 * Key: `normaliseBrandName(brandName)` (lowercase, punctuation-stripped).
 * Value: canonical slug from the OS catalog-attributes endpoint.
 *
 * Use this at query time to resolve a product's embedded brand name to the
 * canonical catalog-attribute slug, so brand-products filtering works even
 * when the embedded slug differs from the catalog slug (e.g. "hallab" → "hallab-1881").
 *
 * Returns an empty map until the first successful catalog-attributes fetch.
 */
export function getOsBrandNameToCanonicalSlug(): ReadonlyMap<string, string> {
  return cachedBrandNameToCanonicalSlug;
}

/**
 * Returns the UTC timestamp of the most recent successful `fetchAndStore()`
 * completion, or null if no successful fetch has occurred since startup.
 */
export function getLastRefreshedAt(): Date | null {
  return lastRefreshedAt;
}

/**
 * Returns a snapshot of per-store product counts from the current in-memory
 * cache. Keys are store keys ("lebanon", "dubai", "abudhabi", "cyprus");
 * values are the product count in that store's cache (0 when unpopulated).
 */
export function getProductCountByStore(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const spec of OS_STORE_SPECS) {
    const entry = storeCache.get(spec.storeKey);
    result[spec.storeKey] = entry ? entry.products.length : 0;
  }
  return result;
}

/**
 * Returns the product pricing enrichment map: osNumericId (string) →
 * { discountPriceUsd, discountPriceAed, regularPriceUsd }. Only products
 * with an active discount have an entry. Populated asynchronously after
 * each successful cache refresh. Returns an empty map before the first
 * enrichment cycle completes.
 */
/**
 * Returns the current set of best-seller product IDs (OS slugs), computed
 * from blended app_orders DB counts + OS totalSales after each cache refresh.
 * Returns an empty Set before the first successful OS products fetch.
 */
export function getCachedBestSellerIds(): ReadonlySet<string> {
  return cachedBestSellerIdSet;
}

export function getOsProductPricingMap(): ReadonlyMap<string, ProductPricingEntry> {
  return cachedProductPricing;
}

/**
 * Returns the startup price snapshot: a product-id → priceUsd map recorded
 * the first time each store's cache was successfully populated after boot.
 * The snapshot is never updated, so it serves as a ~24 h baseline that the
 * admin funnels dashboard uses to flag add-ons whose price has changed since
 * the server last restarted.
 *
 * Products absent from the map were either not yet fetched at startup or
 * had no numeric price in the OS response. Treat them as "no change known".
 */
export function getStartupPriceSnapshot(): ReadonlyMap<string, number> {
  return startupPriceSnapshot;
}

/**
 * Compute a stable hash string for change detection in wooSync.
 * Includes product price/stock and taxonomy (category/occasion/brand slugs)
 * so any catalog or assignment change triggers a `data_refresh` push.
 * Returns an empty string when no products are cached for that store.
 */
export function getOsProductHash(storeKey?: string): string {
  const products = getOsProducts(storeKey);
  if (!products || products.length === 0) return "";
  return products
    .map((p) => {
      const cats = (p.categories ?? [])
        .map((c) => c.slug)
        .sort()
        .join(",");
      const occ = (p.occasions ?? [])
        .map((o) => o.slug)
        .sort()
        .join(",");
      const brands = (p.brands ?? [])
        .map((b) => b.slug)
        .sort()
        .join(",");
      return `${p.id}:${p.price}:${p.inStock ? "1" : "0"}:${cats}:${occ}:${brands}`;
    })
    .sort()
    .join("|");
}

/**
 * Immediately remove a single product (by OS integer id) from all per-store
 * caches so clients see the deletion without waiting for the next poll cycle.
 * Also triggers a full cache invalidation so the data converges with OS.
 *
 * `deletedId` is the integer id sent in the `product.deleted` webhook payload.
 * OSProduct.id is stored as a string, so we compare against `String(deletedId)`.
 */
export function removeOsProductById(deletedId: number | string): void {
  const idStr = String(deletedId);
  let removedFromAny = false;

  for (const [, cache] of storeCache) {
    const idx = cache.products.findIndex((p) => p.id === idStr);
    if (idx === -1) continue;
    const [removed] = cache.products.splice(idx, 1);
    if (removed) {
      // wcIdIndex is keyed by p.wcId (WooCommerce numeric id), not p.id.
      if (removed.wcId != null) cache.wcIdIndex.delete(removed.wcId);
      cache.slugIndex.delete(removed.id);
      removedFromAny = true;
    }
  }

  if (removedFromAny) {
    logger.info(
      { deletedId: idStr },
      "osProductsCache: product removed immediately from in-memory cache",
    );
  }

  // Full invalidation to reconcile with OS (in case the id doesn't match
  // exactly or the cache was already stale).
  invalidateOsProductsCache();
}

/**
 * Invalidate the cache and trigger a fresh fetch immediately.
 * Retains the last-good cache while the refetch is in progress.
 */
export function invalidateOsProductsCache(): void {
  fetchAndStore().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { err: msg },
      "osProductsCache: invalidation fetch failed",
    );
  });
}

/**
 * Start the background polling worker. Idempotent. No-op in test environments.
 */
export function startOsProductsSync(): void {
  if (process.env.NODE_ENV === "test") return;
  if (timer) return;

  const config = getOsConfig();
  if (!config.apiKey) {
    logger.info(
      "osProductsCache: PRESENTAIL_OS_API_KEY not set — products will be served from WooCommerce",
    );
    return;
  }

  const initTimer = setTimeout(() => {
    // Seed the startup price snapshot and the price-alert deduplication map
    // from the DB before the first OS fetch. Both must be populated before
    // `fetchAndStore` runs so that:
    //   1. `maybeRecordStartupSnapshot` uses the persisted prior-day baseline
    //      rather than treating the fresh prices as the baseline (which would
    //      make every product look "unchanged" immediately after a restart).
    //   2. `detectAndAlertPriceChanges` doesn't re-fire alerts that were
    //      already sent within the past 24 h before the restart.
    Promise.all([seedStartupSnapshotFromDb(), seedPriceAlertDedupeFromDb()])
      .then(() => fetchAndStore())
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ err: msg }, "osProductsCache: initial fetch failed");
      });
  }, 8_000);
  initTimer.unref?.();

  timer = setInterval(() => {
    if (fetching) return;
    fetching = true;
    fetchAndStore()
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ err: msg }, "osProductsCache: scheduled fetch failed");
      })
      .finally(() => {
        fetching = false;
      });
  }, INTERVAL_MS);
  timer.unref?.();

  logger.info(
    { intervalMs: INTERVAL_MS },
    "osProductsCache: worker started",
  );
}

export function stopOsProductsSync(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
