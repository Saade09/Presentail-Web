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
import { db, osPriceSnapshotsTable, osPriceAlertsTable } from "@workspace/db";
import { gt, lt, sql } from "drizzle-orm";
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
 * Pre-computed per-brand in-stock product counts across all stores,
 * deduplicated by product id. Updated after every successful fetch cycle
 * so `/catalog/metadata` does not need to re-iterate over all store caches
 * on each request.
 *
 * Keys are brand slugs; values are the count of distinct in-stock products
 * associated with that brand across all stores.
 */
let cachedBrandProductCounts: Map<string, number> = new Map();

let timer: NodeJS.Timeout | null = null;
let fetching = false;

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
 * Defaults to "presentail-flowers--gifts" — only the Presentail brand.
 * Set the env var to an empty string to disable filtering and show all brands.
 */
function applyBrandAllowlist(products: OSProduct[]): OSProduct[] {
  const raw = process.env.PRESENTAIL_OS_BRAND_ALLOWLIST;
  const allowlistStr = raw === undefined
    ? "presentail-flowers--gifts"
    : raw;
  if (!allowlistStr.trim()) return products; // empty string = no filtering
  const allowed = new Set(allowlistStr.split(",").map((s) => s.trim()).filter(Boolean));
  return products.filter((p) =>
    Array.isArray(p.brands) && p.brands.some((b) => allowed.has(b.slug)),
  );
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
        fetchOsOccasions(config),
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
      const filtered = applyBrandAllowlist(products);
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
        cachedOccasions = occasions;
        freshOccasions = occasions;
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
        const osBase = config.baseUrl ?? "https://os.presentail.com";
        for (const b of raw) {
          if (!b.slug) continue;
          // image_public_url is preferred (absolute CDN URL); fall back to
          // image_url which is a relative path that needs the OS base prepended.
          const rawImage = b.image_public_url || b.image_url || null;
          const image = rawImage
            ? rawImage.startsWith("http")
              ? rawImage
              : `${osBase}${rawImage}`
            : null;
          brandMap.set(b.slug, {
            id: b.slug,
            slug: b.slug,
            name: b.name,
            image,
            description: b.description ?? undefined,
          });
        }
        logger.info(
          { brandCount: brandMap.size },
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
      const seenProductIds = new Set<string>();
      for (const spec of OS_STORE_SPECS) {
        const entry = storeCache.get(spec.storeKey);
        if (!entry) continue;
        for (const p of entry.products) {
          if (!p.inStock || seenProductIds.has(p.id)) continue;
          seenProductIds.add(p.id);
          for (const b of p.brands ?? []) {
            counts.set(b.slug, (counts.get(b.slug) ?? 0) + 1);
          }
        }
      }
      cachedBrandProductCounts = counts;
    }

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
 * Returns cached OS brands (global, not per-store).
 */
export function getOsBrands(): OSProductBrand[] | null {
  return cachedBrands;
}

/**
 * Returns cached OS occasions (global, not per-store).
 */
export function getOsOccasions(): OSProductOccasion[] | null {
  return cachedOccasions;
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
