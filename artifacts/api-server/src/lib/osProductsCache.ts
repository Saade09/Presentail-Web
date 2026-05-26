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
import type { StoreKey } from "./wooStore";
import { logger } from "./logger";

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

/** Global taxonomy data (not per-store). */
let cachedCategories: OSProductCategory[] | null = null;
let cachedBrands: OSProductBrand[] | null = null;
let cachedOccasions: OSProductOccasion[] | null = null;

let timer: NodeJS.Timeout | null = null;
let fetching = false;

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
    fetchAndStore().catch((err: unknown) => {
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
