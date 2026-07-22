/**
 * Scoring engine for homepage category and occasion carousels.
 *
 * Computes a composite score for each item and returns a sorted list:
 *   finalScore = (performanceScore + clickScore) + seasonalBoost + manualBoost - availabilityPenalty
 *
 * Scoring signals:
 *   - Performance (Bayesian-smoothed, same pattern as productRanking.ts):
 *     sum of totalSales for all OS products tagged with the slug, normalised to [0, 1).
 *   - Click score: recency-weighted count of category/occasion view events from
 *     the local analytics_events table (last 30 days), normalised to [0, 1].
 *     Events in the last 7 days count double. Capped at 0.5 to avoid overriding
 *     strong manual boosts or pinned positions. Returns 0 on cold start (no rows).
 *   - Seasonal boost: additive value when today's MM-DD falls inside the window.
 *   - Manual boost: operator-set additive value from the DB config row.
 *   - Availability penalty: linear penalty when in-stock product count < floor;
 *     items with 0 in-stock products receive a -2.0 penalty and are sorted to the end.
 *
 * Pinned positions are applied as a post-sort pass.
 * Seasonal targetPosition (optional per boost window) acts as a temporary pin
 * that auto-expires when the window ends; regular pinnedPosition takes precedence.
 * Hidden overrides are applied as a pre-filter.
 * When no config is present and no sales data exists, falls back to the supplied
 * defaultOrder array (same behaviour as the existing DEFAULT_OCCASION_SLUGS logic).
 *
 * Config row resolution is 3-tier:
 *   1. city + country (most specific)
 *   2. country-only
 *   3. global (null city, null country)
 */

import { and, eq, gte, isNotNull, or } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
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
  clickScore: number;
  seasonalBoost: number;
  manualBoost: number;
  availabilityPenalty: number;
  finalScore: number;
  productCount: number;
  /** Human-readable label indicating how this item got its position. */
  source: "pinned" | "scheduled" | "demand" | "default";
};

export type ScoreCollectionsOpts = {
  kind: CollectionKind;
  countryCode?: string | null;
  /** City slug for 3-tier config resolution (city+country > country > global). */
  citySlug?: string | null;
  configRows: CollectionRankingConfigRow[];
  osProducts: OSProduct[];
  /**
   * Pre-computed click scores keyed by slug (normalised to [0, 1]).
   * When omitted, click score is treated as 0 for all items.
   * Use `getCollectionClickScores()` to compute this async before scoring.
   */
  clickScores?: Map<string, number>;
  /**
   * OS-provided occasion-level statistics keyed by slug (raw totalOrders /
   * totalSales count). When provided for kind="occasion", these override the
   * product-level totalSales aggregate as the primary performance signal.
   * Values are fed through the same Bayesian-smoothed normalisation so the
   * final score scale is comparable to the product-aggregate fallback.
   */
  osOccasionStats?: Map<string, number>;
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
/** Maximum contribution of click score to the final score. */
const CLICK_SCORE_CAP = 0.5;

// ── Click-score cache ─────────────────────────────────────────────────────────
//
// Caches the DB query result per (kind, countryCode) for the same 5-minute TTL
// used by the ranking config cache so the analytics query doesn't run on every
// homepage request.

const CLICK_SCORE_TTL_MS = 5 * 60 * 1000;
const clickScoreCache = new Map<
  string,
  { scores: Map<string, number>; fetchedAt: number }
>();

/**
 * Query the analytics_events table for the last 30 days and compute a
 * recency-weighted click score for each collection slug. Returns a
 * Map<slug, normalizedScore> where the score is in [0, 1].
 *
 * Signals included:
 *  - Events with `link_kind = kind` and `link_slug` set (banner clicks /
 *    navigation events tagged with a collection kind).
 *  - Future-named events `category_viewed` / `occasion_viewed` with
 *    `link_slug` set (forward-compatible for when clients emit them).
 *
 * Events in the last 7 days count 2× to reward recent demand spikes.
 * The result is normalised to [0, 1] relative to the highest-scoring slug.
 * Returns an empty Map on cold start (no rows) or on DB error,
 * so the ranking formula degrades gracefully to clickScore = 0.
 */
export async function getCollectionClickScores(
  kind: CollectionKind,
  countryCode?: string | null,
): Promise<Map<string, number>> {
  const cacheKey = `${kind}::${countryCode ?? ""}`;
  const now = Date.now();
  const cached = clickScoreCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < CLICK_SCORE_TTL_MS) {
    return cached.scores;
  }

  try {
    const cutoff30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const cutoff7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const viewEventName =
      kind === "category" ? "category_viewed" : "occasion_viewed";

    // Demand signals captured for this collection kind:
    //   1. Any event that explicitly carries link_kind = kind (banner clicks,
    //      navigation tiles, add-to-cart events sent with collection context, …)
    //   2. Explicit page-view events (category_viewed / occasion_viewed)
    //   3. Add-to-cart demand signals named "add_to_cart" or
    //      "product_added_to_cart" that carry collection context via link_kind
    //
    // Country scoping: when countryCode is supplied we filter by the `state`
    // column, which clients populate with the selected delivery country (LB / AE /
    // CY). This ensures per-country cache entries reflect distinct click distributions
    // rather than silently returning identical global data under different cache keys.
    const rows = await db
      .select({
        slug: analyticsEventsTable.linkSlug,
        createdAt: analyticsEventsTable.createdAt,
      })
      .from(analyticsEventsTable)
      .where(
        and(
          gte(analyticsEventsTable.createdAt, cutoff30),
          isNotNull(analyticsEventsTable.linkSlug),
          or(
            // Banner clicks and any navigation event with collection context
            eq(analyticsEventsTable.linkKind, kind),
            // Explicit collection page view events
            eq(analyticsEventsTable.name, viewEventName),
            // Add-to-cart demand signals that carry collection context
            and(
              or(
                eq(analyticsEventsTable.name, "add_to_cart"),
                eq(analyticsEventsTable.name, "product_added_to_cart"),
              ),
              eq(analyticsEventsTable.linkKind, kind),
            ),
          ),
          // Country scoping via the `state` column (delivery country sent by client)
          countryCode ? eq(analyticsEventsTable.state, countryCode) : undefined,
        ),
      );

    if (rows.length === 0) {
      clickScoreCache.set(cacheKey, { scores: new Map(), fetchedAt: now });
      return new Map();
    }

    const weighted = new Map<string, number>();
    for (const row of rows) {
      if (!row.slug) continue;
      const isRecent = row.createdAt >= cutoff7;
      const weight = isRecent ? 2 : 1;
      weighted.set(row.slug, (weighted.get(row.slug) ?? 0) + weight);
    }

    if (weighted.size === 0) {
      clickScoreCache.set(cacheKey, { scores: new Map(), fetchedAt: now });
      return new Map();
    }

    const maxRaw = Math.max(...weighted.values());
    const scores = new Map<string, number>();
    for (const [slug, rawScore] of weighted) {
      scores.set(slug, rawScore / maxRaw);
    }

    clickScoreCache.set(cacheKey, { scores, fetchedAt: now });
    return scores;
  } catch {
    return clickScoreCache.get(cacheKey)?.scores ?? new Map();
  }
}

/** Invalidate click score cache (e.g. after config changes). */
export function invalidateClickScoreCache(): void {
  clickScoreCache.clear();
}

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
export function isInSeasonalWindow(mmDd: string, startMmDd: string, endMmDd: string): boolean {
  if (startMmDd <= endMmDd) {
    return mmDd >= startMmDd && mmDd <= endMmDd;
  }
  // Year-wrap: e.g. Dec 20 – Jan 7
  return mmDd >= startMmDd || mmDd <= endMmDd;
}

/**
 * For a given slug, find the most-specific config row using 3-tier resolution:
 *   1. city + country exact match
 *   2. country-only match (city_slug is null)
 *   3. global row (country_code and city_slug are both null)
 */
export function findConfigRow(
  configRows: CollectionRankingConfigRow[],
  kind: CollectionKind,
  slug: string,
  countryCode?: string | null,
  citySlug?: string | null,
): CollectionRankingConfigRow | undefined {
  const rows = configRows.filter((r) => r.kind === kind && r.slug === slug);
  if (rows.length === 0) return undefined;

  // Tier 1: city + country exact match
  if (citySlug && countryCode) {
    const cityRow = rows.find(
      (r) =>
        r.citySlug === citySlug &&
        r.countryCode?.toUpperCase() === countryCode.toUpperCase(),
    );
    if (cityRow) return cityRow;
  }

  // Tier 2: country-only match (no city scope)
  if (countryCode) {
    const countryRow = rows.find(
      (r) =>
        (r.citySlug === null || r.citySlug === undefined) &&
        r.countryCode?.toUpperCase() === countryCode.toUpperCase(),
    );
    if (countryRow) return countryRow;
  }

  // Tier 3: global row (no city, no country)
  return rows.find(
    (r) =>
      (r.citySlug === null || r.citySlug === undefined) &&
      (r.countryCode === null || r.countryCode === undefined),
  );
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
  const {
    kind,
    countryCode,
    citySlug,
    configRows,
    osProducts,
    clickScores = new Map(),
    osOccasionStats,
    defaultOrder = [],
    availabilityFloor = DEFAULT_AVAILABILITY_FLOOR,
  } = opts;

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
  // gets 0 and well-established slugs approach 1.
  //
  // Primary signal: when osOccasionStats is provided for kind="occasion", use
  // the OS-level per-occasion stat (totalOrders / totalSales) as the raw count.
  // This reflects the OS admin "Top occasions" ranking directly.
  // Fallback: sum of product-level totalSales tagged with each occasion slug.

  const useOsStats = kind === "occasion" && osOccasionStats != null && osOccasionStats.size > 0;

  const slugScores = new Map<string, number>();
  for (const { slug } of items) {
    const rawCount = useOsStats
      ? (osOccasionStats!.get(slug) ?? 0)
      : (slugSales.get(slug) ?? 0);
    slugScores.set(slug, bayesianPopularity(rawCount));
  }

  // ── Determine whether the dataset has any real signal ────────────────────
  const hasSalesData = [...slugScores.values()].some((s) => s > 0);
  const hasClickData = clickScores.size > 0;
  const hasConfig = configRows.some((r) => r.kind === kind);

  // ── Compute final scores ──────────────────────────────────────────────────

  const debugMap = new Map<string, ScoreDebug>();
  const scored: Array<{ item: T; finalScore: number; defaultIdx: number }> = [];

  for (const item of items) {
    const { slug } = item;
    const cfg = findConfigRow(configRows, kind, slug, countryCode, citySlug);

    if (cfg?.hiddenOverride) continue;

    const performanceScore = slugScores.get(slug) ?? 0;
    const rawClickScore = clickScores.get(slug) ?? 0;
    const clickScore = Math.min(rawClickScore, CLICK_SCORE_CAP);

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

    const finalScore =
      performanceScore + clickScore + seasonalBoost + manualBoost - availabilityPenalty;

    // Determine source label for admin/debug
    let source: ScoreDebug["source"] = "default";
    if (cfg?.pinnedPosition != null) {
      source = "pinned";
    } else {
      const hasActiveSeasonalTarget = boosts.some(
        (b) => b.targetPosition != null && isInSeasonalWindow(today, b.startMmDd, b.endMmDd),
      );
      if (hasActiveSeasonalTarget) {
        source = "scheduled";
      } else if (performanceScore > 0 || clickScore > 0) {
        source = "demand";
      }
    }

    debugMap.set(slug, {
      performanceScore,
      clickScore,
      seasonalBoost,
      manualBoost,
      availabilityPenalty,
      finalScore,
      productCount: inStockCount,
      source,
    });

    const defaultIdx = defaultOrder.indexOf(slug);

    scored.push({ item, finalScore, defaultIdx });
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  //
  // When there is no scoring signal and no config, fall back entirely to
  // defaultOrder so behaviour is identical to the pre-scoring code paths.

  if (!hasSalesData && !hasClickData && !hasConfig) {
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

  // ── Build effective pinned positions ──────────────────────────────────────
  //
  // Effective position = pinnedPosition (DB) if set; otherwise the first
  // active seasonal boost window's targetPosition (temporary pin that
  // auto-expires). Regular pinnedPosition always takes precedence.

  function getEffectivePinnedPosition(slug: string): number | null {
    const cfg = findConfigRow(configRows, kind, slug, countryCode, citySlug);
    if (cfg?.pinnedPosition != null) return cfg.pinnedPosition;
    const boosts = cfg?.seasonalBoosts ?? [];
    for (const b of boosts) {
      if (b.targetPosition != null && isInSeasonalWindow(today, b.startMmDd, b.endMmDd)) {
        return b.targetPosition;
      }
    }
    return null;
  }

  // ── Apply pinned positions ────────────────────────────────────────────────
  //
  // Collect items that have an effective pinned position and splice them into
  // the sorted array at their designated 1-based index.

  const unpinned = scored.filter(({ item }) => getEffectivePinnedPosition(item.slug) === null);
  const pinned = scored
    .filter(({ item }) => getEffectivePinnedPosition(item.slug) !== null)
    .map(({ item }) => ({ item, position: getEffectivePinnedPosition(item.slug)! }))
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
