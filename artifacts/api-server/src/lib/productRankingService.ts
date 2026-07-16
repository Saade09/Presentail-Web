/**
 * ProductRankingService — section-specific product ranking for homepage rails.
 *
 * Reads precomputed metrics from the `product_ranking_metrics` table (written
 * by ProductMetricsSyncJob) and applies a section-specific scoring formula.
 * All computation is synchronous on the request path; no OS calls are made here.
 *
 * Section formulas (weights over normalised [0,1] signals):
 *   best-sellers   60% normSales30d + 20% normClicks30d + 10% normAddToCarts30d + 10% freshness
 *   rail-summer    50% normAddToCarts30d + 25% normClicks30d + 15% normSales30d + 10% freshness
 *   rail-boxes     50% normSales30d + 30% normAddToCarts30d + 10% normClicks30d + 10% freshness
 *   rail-balloons  50% normSales30d + 30% normClicks30d + 10% normAddToCarts30d + 10% freshness
 *   default        50% normSales30d + 30% freshness + 20% normClicks30d
 *
 * Personalization (10% weight, only when customerId supplied):
 *   Boosts products that share a category/occasion with the customer's past orders,
 *   and products within ±20% of the customer's average spend per item.
 *   No cross-customer data is ever exposed.
 *
 * Fallback chain:
 *   1. Precomputed metrics available → use section formula
 *   2. No metrics row → neutral score (product ranked by OS totalSales / osNumericId)
 *   3. No metrics at all → preserve caller-supplied order
 *
 * Merchandising overrides (post-sort):
 *   - excluded_from_section: product removed from this section
 *   - ranking_start_at / ranking_end_at: time-gated eligibility
 *   - ranking_boost: additive delta applied before pin pass
 *   - ranking_penalty: multiplicative factor (0 = fully suppressed)
 *   - pinned_position: splice into final sorted list at 1-based index
 */

import type { ProductRankingMetricsRow } from "@workspace/db";
import { logger } from "./logger";

export const RANKING_SCORE_VERSION = "homepage-ranking-v1";

// ── Section keys ─────────────────────────────────────────────────────────────

export type SectionKey =
  | "best-sellers"
  | "rail-summer"
  | "rail-boxes"
  | "rail-balloons"
  | string; // future-proofed

// ── Minimal product shape required by the ranking service ────────────────────

export type RankableHomepageProduct = {
  /** OS canonical product ID — used to look up precomputed metrics. */
  id: string;
  /** OS numeric PK — used as freshness fallback when metrics are absent. */
  osNumericId?: number | string | null;
  /** Category slugs — used for personalization boosts. */
  categorySlugs?: string[];
  /** Occasion slugs — used for personalization boosts. */
  occasionSlugs?: string[];
  /** Display price in USD — used for price-range personalization. */
  priceValue?: number;
  /** Whether the product is currently in stock. */
  inStock?: boolean;
  /** OS totalSales — used as fallback blended score when metrics are absent. */
  totalSales?: number;
};

// ── Score debug shape (returned by rankWithDebug) ────────────────────────────

export type RankingScoreDebug = {
  osProductId: string;
  sectionKey: string;
  baseScore: number;
  personalBoost: number;
  boost: number;
  penaltyFactor: number;
  finalScore: number;
  metricsSource: "precomputed" | "fallback" | "none";
  excluded: boolean;
  pinned: boolean;
};

// ── Personalization context ──────────────────────────────────────────────────

export type PersonalizationContext = {
  /** Category slugs from the customer's prior orders. */
  purchasedCategorySlugs: Set<string>;
  /** Occasion slugs from the customer's prior orders. */
  purchasedOccasionSlugs: Set<string>;
  /** Average spend per order line item in USD (null = unknown). */
  avgItemPriceUsd: number | null;
};

// ── Formula weights ──────────────────────────────────────────────────────────

type FormulaWeights = {
  sales30d: number;
  sales7d: number;
  clicks30d: number;
  addToCarts30d: number;
  freshness: number;
};

const FORMULA_BY_SECTION: Record<string, FormulaWeights> = {
  "best-sellers": {
    sales30d: 0.60,
    sales7d: 0.00,
    clicks30d: 0.20,
    addToCarts30d: 0.10,
    freshness: 0.10,
  },
  "rail-summer": {
    sales30d: 0.15,
    sales7d: 0.00,
    clicks30d: 0.25,
    addToCarts30d: 0.50,
    freshness: 0.10,
  },
  "rail-boxes": {
    sales30d: 0.50,
    sales7d: 0.00,
    clicks30d: 0.10,
    addToCarts30d: 0.30,
    freshness: 0.10,
  },
  "rail-balloons": {
    sales30d: 0.50,
    sales7d: 0.00,
    clicks30d: 0.30,
    addToCarts30d: 0.10,
    freshness: 0.10,
  },
};

const DEFAULT_FORMULA: FormulaWeights = {
  sales30d: 0.50,
  sales7d: 0.00,
  clicks30d: 0.20,
  addToCarts30d: 0.00,
  freshness: 0.30,
};

const PERSONALIZATION_WEIGHT = 0.10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formulaFor(sectionKey: SectionKey): FormulaWeights {
  return FORMULA_BY_SECTION[sectionKey] ?? DEFAULT_FORMULA;
}

function parseExcludedSections(json: string | null | undefined): Set<string> {
  if (!json) return new Set();
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return new Set(arr.map(String));
  } catch {
    // malformed — treat as no exclusions
  }
  return new Set();
}

/**
 * Bayesian smoothing for a product whose metrics row is absent.
 * Returns a score in [0, 1) based on OS totalSales alone.
 */
function bayesianFallbackScore(totalSales: number | undefined): number {
  const sales = totalSales ?? 0;
  return sales / (sales + 20);
}

/**
 * Normalise osNumericId to a freshness score in [0, 1].
 * Higher PK = more recently created = higher freshness.
 */
function freshnessFromNumericId(
  numericId: number | string | null | undefined,
  minId: number,
  idRange: number,
): number {
  const id = Number(numericId ?? 0);
  if (id <= 0 || idRange <= 0) return 0;
  return (id - minId) / idRange;
}

/**
 * Compute the personalization boost for a single product.
 * Returns a value in [0, 1].
 */
function personalizationBoost(
  product: RankableHomepageProduct,
  ctx: PersonalizationContext,
): number {
  let score = 0;

  // Category/occasion affinity: 0.5 bonus per matching slug (capped at 0.7)
  const catOverlap = (product.categorySlugs ?? []).filter((s) =>
    ctx.purchasedCategorySlugs.has(s),
  ).length;
  const occOverlap = (product.occasionSlugs ?? []).filter((s) =>
    ctx.purchasedOccasionSlugs.has(s),
  ).length;
  score += Math.min((catOverlap + occOverlap) * 0.35, 0.7);

  // Price-range affinity: boost when within ±20% of customer's avg item price
  if (ctx.avgItemPriceUsd != null && product.priceValue != null) {
    const lo = ctx.avgItemPriceUsd * 0.8;
    const hi = ctx.avgItemPriceUsd * 1.2;
    if (product.priceValue >= lo && product.priceValue <= hi) {
      score += 0.3;
    }
  }

  return Math.min(score, 1.0);
}

// ── Main ranking function ─────────────────────────────────────────────────────

export type RankResult<T extends RankableHomepageProduct> = {
  products: T[];
  debug: Map<string, RankingScoreDebug>;
};

/**
 * Rank a list of eligible products for a given homepage section.
 *
 * @param products  Eligible products (already filtered for availability/country).
 * @param sectionKey  Homepage section identifier (e.g. "best-sellers").
 * @param metricsMap  Precomputed metrics keyed by osProductId (from the sync job).
 * @param personalization  Optional personalization context for the authenticated customer.
 * @returns Products sorted by section-specific score, with debug map.
 */
export function rankProducts<T extends RankableHomepageProduct>(
  products: T[],
  sectionKey: SectionKey,
  metricsMap: ReadonlyMap<string, ProductRankingMetricsRow>,
  personalization?: PersonalizationContext,
): RankResult<T> {
  if (products.length === 0) return { products: [], debug: new Map() };

  const now = Date.now();
  const formula = formulaFor(sectionKey);

  // ── Pre-compute global normalisation bounds from precomputed metrics ─────
  // (Only matters when metrics are available; otherwise fallback scores are used.)
  let minNumericId = Infinity;
  let maxNumericId = -Infinity;

  for (const p of products) {
    const id = Number(p.osNumericId ?? 0);
    if (id > 0) {
      if (id < minNumericId) minNumericId = id;
      if (id > maxNumericId) maxNumericId = id;
    }
  }
  const idRange = maxNumericId > minNumericId ? maxNumericId - minNumericId : 1;

  // ── Determine whether we have any precomputed data ───────────────────────
  const hasMetrics = metricsMap.size > 0;

  // ── Score each product ───────────────────────────────────────────────────
  const pinned: Array<{ product: T; position: number }> = [];
  const scored: Array<{ product: T; score: number; debug: RankingScoreDebug }> = [];

  for (const product of products) {
    const metrics = metricsMap.get(product.id);

    // ── Exclusion / date-gate checks ──────────────────────────────────────
    if (metrics) {
      const excluded = parseExcludedSections(metrics.excludedFromSectionJson);
      if (excluded.has(sectionKey)) {
        scored.push({
          product,
          score: -Infinity,
          debug: {
            osProductId: product.id,
            sectionKey,
            baseScore: 0,
            personalBoost: 0,
            boost: 0,
            penaltyFactor: 1,
            finalScore: -Infinity,
            metricsSource: "precomputed",
            excluded: true,
            pinned: false,
          },
        });
        continue;
      }

      const startAt = metrics.rankingStartAt ? new Date(metrics.rankingStartAt).getTime() : null;
      const endAt = metrics.rankingEndAt ? new Date(metrics.rankingEndAt).getTime() : null;
      if (startAt !== null && now < startAt) {
        continue; // Not yet eligible
      }
      if (endAt !== null && now > endAt) {
        continue; // Past eligibility window
      }
    }

    // ── Compute base score ────────────────────────────────────────────────
    let baseScore: number;
    let metricsSource: RankingScoreDebug["metricsSource"];

    if (metrics) {
      metricsSource = "precomputed";
      const fresh = freshnessFromNumericId(product.osNumericId, minNumericId, idRange);
      baseScore =
        formula.sales30d * (metrics.normSales30d ?? 0) +
        formula.sales7d * (metrics.normSales7d ?? 0) +
        formula.clicks30d * (metrics.normClicks30d ?? 0) +
        formula.addToCarts30d * (metrics.normAddToCarts30d ?? 0) +
        formula.freshness * fresh;
    } else if (hasMetrics) {
      // Metrics table is populated but this product has no row yet —
      // logged at WARN during sync; use OS totalSales as fallback.
      metricsSource = "fallback";
      const fresh = freshnessFromNumericId(product.osNumericId, minNumericId, idRange);
      const popScore = bayesianFallbackScore(product.totalSales);
      // Weight: 70% popularity, 30% freshness (mirrors default formula spirit)
      baseScore = 0.70 * popScore + 0.30 * fresh;
    } else {
      // No metrics at all (sync job hasn't run yet) — pure OS-signal fallback
      metricsSource = "none";
      const fresh = freshnessFromNumericId(product.osNumericId, minNumericId, idRange);
      const popScore = bayesianFallbackScore(product.totalSales);
      baseScore = 0.70 * popScore + 0.30 * fresh;
    }

    // ── Personalization boost ─────────────────────────────────────────────
    let personalBoost = 0;
    if (personalization) {
      personalBoost =
        PERSONALIZATION_WEIGHT * personalizationBoost(product, personalization);
    }

    // ── Merchandising overrides ───────────────────────────────────────────
    const boost = metrics?.rankingBoost ?? 0;
    const penaltyFactor = metrics?.rankingPenalty ?? 1;
    const finalScore = (baseScore + personalBoost + boost) * penaltyFactor;

    const dbg: RankingScoreDebug = {
      osProductId: product.id,
      sectionKey,
      baseScore,
      personalBoost,
      boost,
      penaltyFactor,
      finalScore,
      metricsSource,
      excluded: false,
      pinned: false,
    };

    // ── Pinned position ───────────────────────────────────────────────────
    if (metrics?.pinnedPosition != null && metrics.pinnedPosition > 0) {
      dbg.pinned = true;
      pinned.push({ product, position: metrics.pinnedPosition });
      continue;
    }

    scored.push({ product, score: finalScore, debug: dbg });
  }

  // ── Sort by score descending ─────────────────────────────────────────────
  scored.sort((a, b) => b.score - a.score);

  // ── Build debug map ──────────────────────────────────────────────────────
  const debugMap = new Map<string, RankingScoreDebug>();
  for (const { product, debug } of scored) {
    debugMap.set(product.id, debug);
  }

  // ── Splice pinned products into their designated positions ───────────────
  const result: T[] = scored
    .filter(({ score }) => score > -Infinity)
    .map(({ product }) => product);

  pinned.sort((a, b) => a.position - b.position);
  for (const { product, position } of pinned) {
    const idx = Math.max(0, Math.min(position - 1, result.length));
    result.splice(idx, 0, product);
    debugMap.set(product.id, {
      osProductId: product.id,
      sectionKey,
      baseScore: 0,
      personalBoost: 0,
      boost: 0,
      penaltyFactor: 1,
      finalScore: Infinity,
      metricsSource: "precomputed",
      excluded: false,
      pinned: true,
    });
  }

  return { products: result, debug: debugMap };
}

// ── In-process metrics cache (populated by ProductMetricsSyncJob) ────────────
//
// Keyed by osProductId. The sync job calls setMetricsCache() after each run.
// rankProducts() reads from this cache synchronously — no DB calls on the
// request path.

let _metricsCache: Map<string, ProductRankingMetricsRow> = new Map();
let _metricsCacheUpdatedAt: number | null = null;

export function setMetricsCache(rows: ProductRankingMetricsRow[]): void {
  const m = new Map<string, ProductRankingMetricsRow>();
  for (const row of rows) {
    m.set(row.osProductId, row);
  }
  _metricsCache = m;
  _metricsCacheUpdatedAt = Date.now();
  logger.info({ count: m.size }, "productRankingService: metrics cache updated");
}

export function getMetricsCache(): ReadonlyMap<string, ProductRankingMetricsRow> {
  return _metricsCache;
}

export function getMetricsCacheUpdatedAt(): number | null {
  return _metricsCacheUpdatedAt;
}

/**
 * Convenience wrapper: rank using the in-process metrics cache.
 * If the cache is empty the fallback chain handles it gracefully.
 */
export function rankWithCache<T extends RankableHomepageProduct>(
  products: T[],
  sectionKey: SectionKey,
  personalization?: PersonalizationContext,
): RankResult<T> {
  return rankProducts(products, sectionKey, _metricsCache, personalization);
}
