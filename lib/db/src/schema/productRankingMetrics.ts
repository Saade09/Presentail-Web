import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Precomputed product ranking metrics, written by the background sync job
 * and read by ProductRankingService on the request path (no blocking IO).
 *
 * Financial metrics (revenue, COGS, gross margin, unique_customers) are
 * stored server-side only and are never serialised into API responses.
 *
 * Keyed by os_product_id (OS canonical ID). The sync job upserts rows
 * after each aggregation cycle (every 30–60 min for engagement metrics,
 * every 30–60 min for OS sales, nightly for historical aggregates).
 *
 * Normalised scores are stored in [0, 1] using log-normalisation for
 * volume metrics and Laplace smoothing for rates.
 */
export const productRankingMetricsTable = pgTable(
  "product_ranking_metrics",
  {
    id: serial("id").primaryKey(),

    // ── Identity ────────────────────────────────────────────────────────────
    /** Canonical OS product ID (primary lookup key). */
    osProductId: text("os_product_id").notNull(),
    /** Numeric OS DB PK — stored for JOIN with osProductsCache. */
    osNumericId: text("os_numeric_id"),
    /** Human-readable name for debug endpoint responses. */
    productName: text("product_name"),

    // ── OS sales metrics (written from OSProductMetricsClient) ──────────────
    sales7d: integer("sales_7d").notNull().default(0),
    sales30d: integer("sales_30d").notNull().default(0),
    sales90d: integer("sales_90d").notNull().default(0),
    orderCount30d: integer("order_count_30d").notNull().default(0),
    /** Revenue in USD cents over 30 days. Server-side only. */
    revenue30dUsdCents: integer("revenue_30d_usd_cents").notNull().default(0),
    /** Gross profit in USD cents over 30 days. Server-side only. */
    grossProfit30dUsdCents: integer("gross_profit_30d_usd_cents").notNull().default(0),
    /** Gross margin percentage [0, 100]. Server-side only. */
    grossMarginPct: real("gross_margin_pct"),
    /** Unique customers over 30 days. Server-side only. */
    uniqueCustomers30d: integer("unique_customers_30d").notNull().default(0),
    /** Repeat customers over 90 days. Server-side only. */
    repeatCustomers90d: integer("repeat_customers_90d").notNull().default(0),
    refundRate: real("refund_rate"),
    cancellationRate: real("cancellation_rate"),

    // ── Local analytics metrics (written from WebsiteAnalyticsRepository) ──
    impressions7d: integer("impressions_7d").notNull().default(0),
    impressions30d: integer("impressions_30d").notNull().default(0),
    clicks7d: integer("clicks_7d").notNull().default(0),
    clicks30d: integer("clicks_30d").notNull().default(0),
    productViews30d: integer("product_views_30d").notNull().default(0),
    addToCarts30d: integer("add_to_carts_30d").notNull().default(0),
    purchases30d: integer("purchases_30d").notNull().default(0),

    // ── Derived rate metrics (with Laplace smoothing) ───────────────────────
    /** clicks / impressions, Laplace-smoothed. */
    clickThroughRate: real("click_through_rate"),
    /** purchases / clicks, Laplace-smoothed. */
    conversionRate: real("conversion_rate"),
    /** add_to_carts / clicks, Laplace-smoothed. */
    addToCartRate: real("add_to_cart_rate"),

    // ── Normalised scores [0, 1] ────────────────────────────────────────────
    /** log(1 + sales_30d) / log(1 + max_sales_30d) */
    normSales30d: real("norm_sales_30d").notNull().default(0),
    /** log(1 + sales_7d) / log(1 + max_sales_7d) */
    normSales7d: real("norm_sales_7d").notNull().default(0),
    /** log(1 + impressions_30d) / log(1 + max_impressions_30d) */
    normImpressions30d: real("norm_impressions_30d").notNull().default(0),
    /** log(1 + clicks_30d) / log(1 + max_clicks_30d) */
    normClicks30d: real("norm_clicks_30d").notNull().default(0),
    /** log(1 + add_to_carts_30d) / log(1 + max_add_to_carts_30d) */
    normAddToCarts30d: real("norm_add_to_carts_30d").notNull().default(0),
    /** Normalised freshness: higher osNumericId = newer product. */
    freshnessScore: real("freshness_score").notNull().default(0),
    /** Stock availability signal: 1.0 = in stock, 0.0 = out of stock. */
    stockScore: real("stock_score").notNull().default(0),

    // ── Merchandising overrides ─────────────────────────────────────────────
    /**
     * 1-based pinned position within a section. When set, overrides the
     * computed score and places the product at this position.
     */
    pinnedPosition: smallint("pinned_position"),
    /** Additive score boost applied after normalisation. Range: [-1, 1]. */
    rankingBoost: real("ranking_boost").notNull().default(0),
    /** Multiplicative score penalty applied after normalisation. Range: [0, 1]; 0 = fully suppressed. */
    rankingPenalty: real("ranking_penalty").notNull().default(1),
    /**
     * JSON array of section keys from which this product is excluded.
     * Example: '["best-sellers","rail-summer"]'
     * Null = visible in all sections.
     */
    excludedFromSectionJson: text("excluded_from_section_json"),
    /** When set, this product is only ranked from this UTC timestamp onwards. */
    rankingStartAt: timestamp("ranking_start_at", { withTimezone: true }),
    /** When set, this product is excluded from ranking after this UTC timestamp. */
    rankingEndAt: timestamp("ranking_end_at", { withTimezone: true }),

    // ── Sync timestamps ─────────────────────────────────────────────────────
    lastOsSyncAt: timestamp("last_os_sync_at", { withTimezone: true }),
    lastWebsiteCalculationAt: timestamp("last_website_calculation_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    osProductIdUniq: uniqueIndex("product_ranking_metrics_os_product_id_uniq").on(t.osProductId),
    osNumericIdIdx: index("product_ranking_metrics_os_numeric_id_idx").on(t.osNumericId),
    updatedAtIdx: index("product_ranking_metrics_updated_at_idx").on(t.updatedAt),
  }),
);

export type ProductRankingMetricsRow = typeof productRankingMetricsTable.$inferSelect;
export type InsertProductRankingMetrics = typeof productRankingMetricsTable.$inferInsert;
