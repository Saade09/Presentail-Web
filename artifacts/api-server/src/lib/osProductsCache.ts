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
  fetchOsBrands,
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

let timer: NodeJS.Timeout | null = null;
let fetching = false;

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
  };
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
    // Fetch per-store product lists in parallel, plus global taxonomy data.
    const storeFetches = OS_STORE_SPECS.map((spec) =>
      fetchOsProducts(config, { countryCode: spec.countryCode, cityId: spec.cityId })
        .then((resp) => ({ spec, products: resp.products ?? [] as OSProduct[] }))
        .catch((err: unknown) => ({
          spec,
          products: null as OSProduct[] | null,
          err: err instanceof Error ? err.message : String(err),
        })),
    );

    const [categoriesResp, brandsResp, occasionsResp, ...storeResults] =
      await Promise.allSettled([
        fetchOsCategories(config),
        fetchOsBrands(config),
        fetchOsOccasions(config),
        ...storeFetches,
      ]);

    // ── Per-store products ────────────────────────────────────────────────
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
      if (products.length > 0) {
        maybeRecordStartupSnapshot(products, spec.storeKey);
        detectAndAlertPriceChanges(products);
        storeCache.set(spec.storeKey, buildStoreCache(products));
        logger.info(
          { storeKey: spec.storeKey, productCount: products.length },
          "osProductsCache: products refreshed from Presentail OS",
        );
      } else if (!storeCache.has(spec.storeKey)) {
        logger.warn(
          { storeKey: spec.storeKey },
          "osProductsCache: OS returned 0 products — WooCommerce will serve listings until OS has data",
        );
      }
    }

    // ── Global taxonomy ───────────────────────────────────────────────────
    if (categoriesResp.status === "fulfilled") {
      const cats = categoriesResp.value.categories ?? [];
      if (cats.length > 0) cachedCategories = cats;
    }
    if (brandsResp.status === "fulfilled") {
      const brands = brandsResp.value.brands ?? [];
      if (brands.length > 0) cachedBrands = brands;
    }
    if (occasionsResp.status === "fulfilled") {
      const occasions = occasionsResp.value.occasions ?? [];
      if (occasions.length > 0) cachedOccasions = occasions;
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
