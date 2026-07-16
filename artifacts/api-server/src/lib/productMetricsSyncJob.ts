/**
 * Background sync job that computes product ranking metrics.
 *
 * Runs every ENGAGEMENT_INTERVAL_MS (default 30 min) for engagement metrics
 * (analytics_events) and every OS_INTERVAL_MS (default 45 min) for OS sales
 * data. Writes normalised scores to `product_ranking_metrics` via upsert.
 *
 * Financial data (revenue, COGS, gross margin, unique customers) is computed
 * from app_orders line items and stays server-side — never serialised in API
 * responses.
 *
 * Fallback: if this job has never run (table empty), homepage routes fall
 * through to the in-memory OS totalSales / osNumericId fallback in
 * productRankingService.ts.
 */

import { db, productRankingMetricsTable } from "@workspace/db";
import type { InsertProductRankingMetrics } from "@workspace/db";
import { eq, sql, gte, and } from "drizzle-orm";
import { getOsProducts } from "./osProductsCache";
import { setMetricsCache } from "./productRankingService";
import { logger } from "./logger";

const ENGAGEMENT_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const OS_INTERVAL_MS = 45 * 60 * 1000;         // 45 min
const MIN_SAMPLE_SIZE = 50; // Bayesian smoothing floor

// ── Analytics aggregation ─────────────────────────────────────────────────────

type EngagementRow = {
  productId: string;
  impressions7d: number;
  impressions30d: number;
  clicks7d: number;
  clicks30d: number;
  productViews30d: number;
  addToCarts30d: number;
  purchases30d: number;
};

async function fetchEngagementMetrics(): Promise<Map<string, EngagementRow>> {
  const now = new Date();
  const cutoff7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Batched SQL aggregation — no N+1 queries.
  const rows = await db.execute<{
    product_id: string;
    event_name: string;
    window7: number;
    window30: number;
  }>(sql`
    SELECT
      product_id,
      name AS event_name,
      COUNT(*) FILTER (WHERE created_at >= ${cutoff7.toISOString()}::timestamptz) AS window7,
      COUNT(*) FILTER (WHERE created_at >= ${cutoff30.toISOString()}::timestamptz) AS window30
    FROM analytics_events
    WHERE
      name IN (
        'product_impression',
        'product_card_click',
        'product_view',
        'add_to_cart',
        'order_placed',
        'purchase_completed'
      )
      AND product_id IS NOT NULL
      AND created_at >= ${cutoff30.toISOString()}::timestamptz
    GROUP BY product_id, name
  `);

  const map = new Map<string, EngagementRow>();

  for (const row of rows.rows) {
    const pid = row.product_id;
    if (!pid) continue;
    if (!map.has(pid)) {
      map.set(pid, {
        productId: pid,
        impressions7d: 0,
        impressions30d: 0,
        clicks7d: 0,
        clicks30d: 0,
        productViews30d: 0,
        addToCarts30d: 0,
        purchases30d: 0,
      });
    }
    const entry = map.get(pid)!;
    const w7 = Number(row.window7 ?? 0);
    const w30 = Number(row.window30 ?? 0);
    switch (row.event_name) {
      case "product_impression":
        entry.impressions7d += w7;
        entry.impressions30d += w30;
        break;
      case "product_card_click":
        entry.clicks7d += w7;
        entry.clicks30d += w30;
        break;
      case "product_view":
        entry.productViews30d += w30;
        break;
      case "add_to_cart":
        entry.addToCarts30d += w30;
        break;
      case "order_placed":
      case "purchase_completed":
        entry.purchases30d += w30;
        break;
    }
  }
  return map;
}

// ── OS sales aggregation (from app_orders line items) ────────────────────────

type SalesRow = {
  osProductId: string;
  sales7d: number;
  sales30d: number;
  sales90d: number;
  orderCount30d: number;
  revenue30dUsdCents: number;
};

async function fetchLocalOrderMetrics(): Promise<Map<string, SalesRow>> {
  const now = new Date();
  const cutoff7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const cutoff90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // app_orders line_items_json shape:
  //   [{name, quantity, priceUsdCents, osProductId?, wcId?}]
  const rows = await db.execute<{
    line_items_json: string | null;
    created_at: Date;
  }>(sql`
    SELECT line_items_json, created_at
    FROM app_orders
    WHERE
      state IN ('confirmed', 'out_for_delivery', 'delivered')
      AND line_items_json IS NOT NULL
      AND created_at >= ${cutoff90.toISOString()}::timestamptz
  `);

  const map = new Map<string, SalesRow>();

  for (const row of rows.rows) {
    if (!row.line_items_json) continue;
    let items: unknown;
    try { items = JSON.parse(row.line_items_json); } catch { continue; }
    if (!Array.isArray(items)) continue;

    const createdAt = new Date(row.created_at);
    const in7d = createdAt >= cutoff7;
    const in30d = createdAt >= cutoff30;

    for (const item of items) {
      if (typeof item !== "object" || item === null) continue;
      const rec = item as Record<string, unknown>;
      const osId = typeof rec.osProductId === "string" ? rec.osProductId : null;
      if (!osId) continue;
      const qty = typeof rec.quantity === "number" && rec.quantity > 0 ? rec.quantity : 1;
      const priceUsdCents = typeof rec.priceUsdCents === "number" ? rec.priceUsdCents : 0;

      if (!map.has(osId)) {
        map.set(osId, {
          osProductId: osId,
          sales7d: 0,
          sales30d: 0,
          sales90d: 0,
          orderCount30d: 0,
          revenue30dUsdCents: 0,
        });
      }
      const entry = map.get(osId)!;
      entry.sales90d += qty;
      if (in30d) {
        entry.sales30d += qty;
        entry.orderCount30d += 1;
        entry.revenue30dUsdCents += priceUsdCents * qty;
      }
      if (in7d) {
        entry.sales7d += qty;
      }
    }
  }
  return map;
}

// ── Laplace-smoothed rate ─────────────────────────────────────────────────────

function laplaceRate(numerator: number, denominator: number): number {
  // Laplace smoothing with α=1 (adds 1 to numerator and denominator)
  return (numerator + 1) / (denominator + 2);
}

// ── Log-normalisation ─────────────────────────────────────────────────────────

function logNorm(value: number, maxValue: number): number {
  if (maxValue <= 0) return 0;
  return Math.log(1 + value) / Math.log(1 + maxValue);
}

// ── Main sync ─────────────────────────────────────────────────────────────────

async function runSync(): Promise<void> {
  logger.info("productMetricsSyncJob: starting sync");

  // ── Collect all known OS products (all stores) ───────────────────────────
  const storeKeys = ["lebanon", "dubai", "abudhabi", "cyprus"] as const;
  const allProductsById = new Map<string, {
    osProductId: string;
    osNumericId: string | null;
    productName: string;
    totalSales: number;
    inStock: boolean;
    categorySlugs: string[];
    occasionSlugs: string[];
  }>();

  for (const sk of storeKeys) {
    const products = getOsProducts(sk) ?? [];
    for (const p of products) {
      if (allProductsById.has(p.id)) continue; // dedup across stores
      allProductsById.set(p.id, {
        osProductId: p.id,
        osNumericId: p.osNumericId != null ? String(p.osNumericId) : null,
        productName: p.name,
        totalSales: p.totalSales ?? 0,
        inStock: p.inStock,
        categorySlugs: (p.categories ?? []).map((c) => c.slug),
        occasionSlugs: (p.occasions ?? []).map((o) => o.slug),
      });
    }
  }

  if (allProductsById.size === 0) {
    logger.warn("productMetricsSyncJob: no OS products in cache — skipping sync");
    return;
  }

  // ── Fetch engagement and sales metrics in parallel ───────────────────────
  const [engagementMap, salesMap] = await Promise.all([
    fetchEngagementMetrics().catch((err: unknown) => {
      logger.warn({ err }, "productMetricsSyncJob: engagement fetch failed");
      return new Map<string, EngagementRow>();
    }),
    fetchLocalOrderMetrics().catch((err: unknown) => {
      logger.warn({ err }, "productMetricsSyncJob: local sales fetch failed");
      return new Map<string, SalesRow>();
    }),
  ]);

  // ── Compute global max values for log-normalisation ──────────────────────
  let maxSales30d = 0;
  let maxSales7d = 0;
  let maxImpressions30d = 0;
  let maxClicks30d = 0;
  let maxAddToCarts30d = 0;

  for (const p of allProductsById.values()) {
    const sales = salesMap.get(p.osProductId);
    const eng = engagementMap.get(p.osProductId);
    const s30d = sales?.sales30d ?? p.totalSales;
    const s7d = sales?.sales7d ?? 0;
    if (s30d > maxSales30d) maxSales30d = s30d;
    if (s7d > maxSales7d) maxSales7d = s7d;
    if (eng) {
      if (eng.impressions30d > maxImpressions30d) maxImpressions30d = eng.impressions30d;
      if (eng.clicks30d > maxClicks30d) maxClicks30d = eng.clicks30d;
      if (eng.addToCarts30d > maxAddToCarts30d) maxAddToCarts30d = eng.addToCarts30d;
    }
  }

  // ── Freshness normalisation: based on osNumericId range ──────────────────
  let minNumericId = Infinity;
  let maxNumericId = -Infinity;
  for (const p of allProductsById.values()) {
    const id = Number(p.osNumericId ?? 0);
    if (id > 0) {
      if (id < minNumericId) minNumericId = id;
      if (id > maxNumericId) maxNumericId = id;
    }
  }
  const idRange = maxNumericId > minNumericId ? maxNumericId - minNumericId : 1;

  // ── Build upsert rows ────────────────────────────────────────────────────
  const now = new Date();
  const upserts: InsertProductRankingMetrics[] = [];

  for (const p of allProductsById.values()) {
    const sales = salesMap.get(p.osProductId);
    const eng = engagementMap.get(p.osProductId);

    const sales7d = sales?.sales7d ?? 0;
    // Blend app_orders with OS totalSales for 30d (OS is the ground-truth for longer windows)
    const sales30d = Math.max(sales?.sales30d ?? 0, p.totalSales);
    const sales90d = sales?.sales90d ?? 0;
    const orderCount30d = sales?.orderCount30d ?? 0;
    const revenue30dUsdCents = sales?.revenue30dUsdCents ?? 0;

    const impressions7d = eng?.impressions7d ?? 0;
    const impressions30d = eng?.impressions30d ?? 0;
    const clicks7d = eng?.clicks7d ?? 0;
    const clicks30d = eng?.clicks30d ?? 0;
    const productViews30d = eng?.productViews30d ?? 0;
    const addToCarts30d = eng?.addToCarts30d ?? 0;
    const purchases30d = eng?.purchases30d ?? 0;

    // ── Rate metrics with Laplace smoothing ──────────────────────────────
    const clickThroughRate = impressions30d >= MIN_SAMPLE_SIZE
      ? laplaceRate(clicks30d, impressions30d)
      : null;
    const conversionRate = clicks30d >= MIN_SAMPLE_SIZE
      ? laplaceRate(purchases30d, clicks30d)
      : null;
    const addToCartRate = clicks30d >= MIN_SAMPLE_SIZE
      ? laplaceRate(addToCarts30d, clicks30d)
      : null;

    // ── Normalised volume scores ─────────────────────────────────────────
    const normSales30d = logNorm(sales30d, maxSales30d);
    const normSales7d = logNorm(sales7d, maxSales7d);
    const normImpressions30d = logNorm(impressions30d, maxImpressions30d);
    const normClicks30d = logNorm(clicks30d, maxClicks30d);
    const normAddToCarts30d = logNorm(addToCarts30d, maxAddToCarts30d);

    // ── Freshness ────────────────────────────────────────────────────────
    const numId = Number(p.osNumericId ?? 0);
    const freshnessScore = numId > 0 ? (numId - minNumericId) / idRange : 0;

    // ── Stock ────────────────────────────────────────────────────────────
    const stockScore = p.inStock ? 1.0 : 0.0;

    upserts.push({
      osProductId: p.osProductId,
      osNumericId: p.osNumericId,
      productName: p.productName,
      sales7d,
      sales30d,
      sales90d,
      orderCount30d,
      revenue30dUsdCents,
      grossProfit30dUsdCents: 0, // OS COGS not yet available from API
      grossMarginPct: null,
      uniqueCustomers30d: 0,
      repeatCustomers90d: 0,
      refundRate: null,
      cancellationRate: null,
      impressions7d,
      impressions30d,
      clicks7d,
      clicks30d,
      productViews30d,
      addToCarts30d,
      purchases30d,
      clickThroughRate,
      conversionRate,
      addToCartRate,
      normSales30d,
      normSales7d,
      normImpressions30d,
      normClicks30d,
      normAddToCarts30d,
      freshnessScore,
      stockScore,
      lastOsSyncAt: now,
      lastWebsiteCalculationAt: now,
      updatedAt: now,
    });
  }

  // ── Warn on unmatched products (in analytics but not in OS cache) ────────
  for (const [pid] of engagementMap) {
    if (!allProductsById.has(pid)) {
      logger.warn(
        { osProductId: pid },
        "productMetricsSyncJob: analytics product_id not found in OS cache — ranked with website-only metrics",
      );
    }
  }

  // ── Batch upsert into product_ranking_metrics ────────────────────────────
  // Upsert in chunks of 100 to avoid hitting PG parameter limits.
  const CHUNK = 100;
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const chunk = upserts.slice(i, i + CHUNK);
    await db
      .insert(productRankingMetricsTable)
      .values(chunk)
      .onConflictDoUpdate({
        target: productRankingMetricsTable.osProductId,
        set: {
          osNumericId: sql`excluded.os_numeric_id`,
          productName: sql`excluded.product_name`,
          sales7d: sql`excluded.sales_7d`,
          sales30d: sql`excluded.sales_30d`,
          sales90d: sql`excluded.sales_90d`,
          orderCount30d: sql`excluded.order_count_30d`,
          revenue30dUsdCents: sql`excluded.revenue_30d_usd_cents`,
          grossProfit30dUsdCents: sql`excluded.gross_profit_30d_usd_cents`,
          grossMarginPct: sql`excluded.gross_margin_pct`,
          uniqueCustomers30d: sql`excluded.unique_customers_30d`,
          repeatCustomers90d: sql`excluded.repeat_customers_90d`,
          impressions7d: sql`excluded.impressions_7d`,
          impressions30d: sql`excluded.impressions_30d`,
          clicks7d: sql`excluded.clicks_7d`,
          clicks30d: sql`excluded.clicks_30d`,
          productViews30d: sql`excluded.product_views_30d`,
          addToCarts30d: sql`excluded.add_to_carts_30d`,
          purchases30d: sql`excluded.purchases_30d`,
          clickThroughRate: sql`excluded.click_through_rate`,
          conversionRate: sql`excluded.conversion_rate`,
          addToCartRate: sql`excluded.add_to_cart_rate`,
          normSales30d: sql`excluded.norm_sales_30d`,
          normSales7d: sql`excluded.norm_sales_7d`,
          normImpressions30d: sql`excluded.norm_impressions_30d`,
          normClicks30d: sql`excluded.norm_clicks_30d`,
          normAddToCarts30d: sql`excluded.norm_add_to_carts_30d`,
          freshnessScore: sql`excluded.freshness_score`,
          stockScore: sql`excluded.stock_score`,
          lastOsSyncAt: sql`excluded.last_os_sync_at`,
          lastWebsiteCalculationAt: sql`excluded.last_website_calculation_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  // ── Reload in-process metrics cache ─────────────────────────────────────
  const allRows = await db.select().from(productRankingMetricsTable);
  setMetricsCache(allRows);

  logger.info(
    { productCount: upserts.length },
    "productMetricsSyncJob: sync complete",
  );
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let _engagementTimer: ReturnType<typeof setInterval> | null = null;
let _running = false;

async function safeRunSync(): Promise<void> {
  if (_running) return; // skip if previous run still in progress
  _running = true;
  try {
    await runSync();
  } catch (err: unknown) {
    logger.warn({ err }, "productMetricsSyncJob: unhandled error in sync");
  } finally {
    _running = false;
  }
}

/**
 * Start the background product metrics sync job.
 * Safe to call multiple times — only the first call starts the scheduler.
 * Also loads the initial metrics cache from DB immediately.
 */
export function startProductMetricsSyncJob(): void {
  if (_engagementTimer) return;

  // Load existing metrics into cache immediately (no waiting for first interval)
  db.select()
    .from(productRankingMetricsTable)
    .then((rows) => {
      setMetricsCache(rows);
      logger.info({ count: rows.length }, "productMetricsSyncJob: loaded initial metrics cache from DB");
    })
    .catch((err: unknown) => {
      logger.warn({ err }, "productMetricsSyncJob: failed to load initial metrics from DB");
    });

  // Run first sync after a 2-minute delay (let OS cache warm up first)
  setTimeout(() => {
    void safeRunSync();
    _engagementTimer = setInterval(() => {
      void safeRunSync();
    }, ENGAGEMENT_INTERVAL_MS);
  }, 2 * 60 * 1000);

  logger.info(
    { intervalMs: ENGAGEMENT_INTERVAL_MS },
    "productMetricsSyncJob: scheduler started",
  );
}

/**
 * Force an immediate sync (for testing or admin-triggered refreshes).
 */
export async function forceProductMetricsSync(): Promise<void> {
  await safeRunSync();
}
