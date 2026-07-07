/**
 * Scoring engine for homepage category and occasion carousels.
 *
 * Computes a composite score for each item and returns a sorted list:
 *   finalScore = performanceScore + seasonalBoost + manualBoost - availabilityPenalty
 *
 * Scoring signals:
 *   - Performance (Bayesian-smoothed, same pattern as productRanking.ts):
 *     sum of totalSales for all OS products tagged with the slug, normalised to [0, 1).
 *   - Seasonal boost: additive value when today's MM-DD falls inside the window.
 *   - Manual boost: operator-set additive value from the DB config row.
 *   - Availability penalty: linear penalty when in-stock product count < floor;
 *     items with 0 in-stock products receive a -2.0 penalty and are sorted to the end.
 *
 * Pinned positions are applied as a post-sort pass.
 * Hidden overrides are applied as a pre-filter.
 * When no config is present and no sales data exists, falls back to the supplied
 * defaultOrder array (same behaviour as the existing DEFAULT_OCCASION_SLUGS logic).
 */

import type { CollectionRankingConfigRow } from "@workspace/db";
import type { OSProduct } from "@workspace/presentail-os";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CollectionKind = "category" | "occasion";

export type ScoredItem = {
  id: string;
  slug: string;
};

export type ScoreDebug = {
  performanceScore: number;
  seasonalBoost: number;
  manualBoost: number;
  availabilityPenalty: number;
  finalScore: number;
  productCount: number;
};

export type ScoreCollectionsOpts = {
  kind: CollectionKind;
  countryCode?: string | null;
  cityId?: string | null;
  configRows: CollectionRankingConfigRow[];
  osProducts: OSProduct[];
  /**
   * Default slug order used as fallback when scoring produces ties or when no
   * scoring data is available. Items present in this list are stable-sorted to
   * match the list order after the score-based sort.
   */
  defaultOrder?: string[];
  /**
   * Minimum number of in-stock products before the availability penalty starts.
   * Default: 3.
   */
  availabilityFloor?: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const POPULARITY_PRIOR = 20;
const ZERO_STOCK_PENALTY = 2.0;
const DEFAULT_AVAILABILITY_FLOOR = 3;

// ── Helpers ───────────────────────────────────────────────────────────────────

function bayesianPopularity(totalSales: number): number {
  return totalSales / (totalSales + POPULARITY_PRIOR);
}

/**
 * Get today's MM-DD string in UTC.
 */
function todayMmDd(): string {
  const d = new Date();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

/**
 * Return true if `mmDd` (e.g. "02-14") falls within the inclusive window
 * [startMmDd, endMmDd], handling wrap-around across the year boundary
 * (e.g. "12-20" → "01-07").
 */
function isInSeasonalWindow(mmDd: string, startMmDd: string, endMmDd: string): boolean {
  if (startMmDd <= endMmDd) {
    return mmDd >= startMmDd && mmDd <= endMmDd;
  }
  // Year-wrap: e.g. Dec 20 – Jan 7
  return mmDd >= startMmDd || mmDd <= endMmDd;
}

/**
 * For a given slug, find the most-specific config row (country-specific row
 * beats global row).
 */
function findConfigRow(
  configRows: CollectionRankingConfigRow[],
  kind: CollectionKind,
  slug: string,
  countryCode?: string | null,
): CollectionRankingConfigRow | undefined {
  const rows = configRows.filter((r) => r.kind === kind && r.slug === slug);
  if (rows.length === 0) return undefined;
  if (countryCode) {
    const countryRow = rows.find(
      (r) => r.countryCode?.toUpperCase() === countryCode.toUpperCase(),
    );
    if (countryRow) return countryRow;
  }
  return rows.find((r) => r.countryCode === null || r.countryCode === undefined);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Score and sort a list of collection items.
 *
 * Returns `{ items, debugMap }` where:
 *   - `items` is the scored + sorted input array (same object references, new order).
 *   - `debugMap` maps slug → ScoreDebug for admin `?debug=1` responses.
 */
export function scoreCollections<T extends ScoredItem>(
  items: T[],
  opts: ScoreCollectionsOpts,
): { items: T[]; debugMap: Map<string, ScoreDebug> } {
  const { kind, countryCode, configRows, osProducts, defaultOrder = [], availabilityFloor = DEFAULT_AVAILABILITY_FLOOR } = opts;

  if (items.length === 0) {
    return { items: [], debugMap: new Map() };
  }

  const today = todayMmDd();

  // ── Build per-slug product tallies from OS products ───────────────────────
  //
  // For categories: a product belongs to the slug when its categories include it.
  // For occasions: a product belongs to the slug when its occasions include it.

  const slugSales = new Map<string, number>();
  const slugInStock = new Map<string, number>();

  for (const p of osProducts) {
    const tags: string[] =
      kind === "category"
        ? (p.categories ?? []).map((c) => c.slug)
        : (p.occasions ?? []).map((o) => o.slug);

    for (const slug of tags) {
      slugSales.set(slug, (slugSales.get(slug) ?? 0) + (p.totalSales ?? 0));
      if (p.inStock) {
        slugInStock.set(slug, (slugInStock.get(slug) ?? 0) + 1);
      }
    }
  }

  // ── Normalise performance scores ──────────────────────────────────────────
  //
  // Bayesian smoothing normalises to [0, 1) so that a slug with no history
  // gets 0 and well-established slugs approach 1. Each slug gets the sum of
  // its products' totalSales.

  const slugScores = new Map<string, number>();
  for (const { slug } of items) {
    const totalSales = slugSales.get(slug) ?? 0;
    slugScores.set(slug, bayesianPopularity(totalSales));
  }

  // ── Determine whether the dataset has any real signal ────────────────────
  const hasSalesData = [...slugScores.values()].some((s) => s > 0);
  const hasConfig = configRows.some((r) => r.kind === kind);

  // ── Compute final scores ──────────────────────────────────────────────────

  const debugMap = new Map<string, ScoreDebug>();
  const scored: Array<{ item: T; finalScore: number; defaultIdx: number }> = [];

  for (const item of items) {
    const { slug } = item;
    const cfg = findConfigRow(configRows, kind, slug, countryCode);

    if (cfg?.hiddenOverride) continue;

    const performanceScore = slugScores.get(slug) ?? 0;

    let seasonalBoost = 0;
    const boosts = cfg?.seasonalBoosts ?? [];
    for (const b of boosts) {
      if (isInSeasonalWindow(today, b.startMmDd, b.endMmDd)) {
        seasonalBoost += b.boost;
      }
    }

    const manualBoost = cfg?.manualBoost ?? 0;

    const inStockCount = slugInStock.get(slug) ?? 0;
    let availabilityPenalty = 0;
    if (inStockCount === 0) {
      availabilityPenalty = ZERO_STOCK_PENALTY;
    } else if (inStockCount < availabilityFloor) {
      availabilityPenalty = ((availabilityFloor - inStockCount) / availabilityFloor) * 0.5;
    }

    const finalScore = performanceScore + seasonalBoost + manualBoost - availabilityPenalty;

    debugMap.set(slug, {
      performanceScore,
      seasonalBoost,
      manualBoost,
      availabilityPenalty,
      finalScore,
      productCount: inStockCount,
    });

    const defaultIdx = defaultOrder.indexOf(slug);

    scored.push({ item, finalScore, defaultIdx });
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  //
  // When there is no scoring signal and no config, fall back entirely to
  // defaultOrder so behaviour is identical to the pre-scoring code paths.

  if (!hasSalesData && !hasConfig) {
    scored.sort((a, b) => {
      const ai = a.defaultIdx >= 0 ? a.defaultIdx : Infinity;
      const bi = b.defaultIdx >= 0 ? b.defaultIdx : Infinity;
      return ai - bi;
    });
  } else {
    scored.sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      // Stable tie-break: prefer defaultOrder position when scores are equal.
      const ai = a.defaultIdx >= 0 ? a.defaultIdx : Infinity;
      const bi = b.defaultIdx >= 0 ? b.defaultIdx : Infinity;
      return ai - bi;
    });
  }

  // ── Apply pinned positions ────────────────────────────────────────────────
  //
  // Collect items that have a pinnedPosition config and splice them into the
  // sorted array at their designated 1-based index.

  const unpinned = scored.filter(({ item }) => {
    const cfg = findConfigRow(configRows, kind, item.slug, countryCode);
    return cfg?.pinnedPosition === null || cfg?.pinnedPosition === undefined;
  });
  const pinned = scored
    .filter(({ item }) => {
      const cfg = findConfigRow(configRows, kind, item.slug, countryCode);
      return cfg?.pinnedPosition != null;
    })
    .map(({ item }) => {
      const cfg = findConfigRow(configRows, kind, item.slug, countryCode)!;
      return { item, position: cfg.pinnedPosition! };
    })
    .sort((a, b) => a.position - b.position);

  // ── Hard-bottom partition for zero-stock items ────────────────────────────
  //
  // Items with zero in-stock products are moved to the end of the unpinned
  // list regardless of their computed score (seasonal/manual boosts cannot
  // override a completely unavailable collection). Explicitly pinned items
  // are exempt — an operator pin is an intentional override.

  const unpinnedSlugs = new Set(unpinned.map((s) => s.item.slug));
  const zeroStock = unpinned.filter(
    (s) => (slugInStock.get(s.item.slug) ?? 0) === 0,
  );
  const hasStock = unpinned.filter(
    (s) => (slugInStock.get(s.item.slug) ?? 0) > 0,
  );
  // Only apply the partition when we have OS product data (at least one slug
  // has a stock reading); without product data every slug appears as zero-stock
  // which would incorrectly push all items to the bottom.
  const hasAnyStockData = osProducts.length > 0 && unpinnedSlugs.size > 0 && [...unpinnedSlugs].some((slug) => slugSales.get(slug) !== undefined || slugInStock.get(slug) !== undefined);
  const sortedUnpinned = hasAnyStockData ? [...hasStock, ...zeroStock] : unpinned;

  const result: T[] = sortedUnpinned.map((s) => s.item);
  for (const { item, position } of pinned) {
    const idx = Math.max(0, Math.min(position - 1, result.length));
    result.splice(idx, 0, item);
  }

  return { items: result, debugMap };
}
