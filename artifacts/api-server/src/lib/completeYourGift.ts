/**
 * Complete Your Gift — recommendation service for the PDP upsell module that
 * replaces "Frequently Bought Together".
 *
 * Given an anchor product and store context, returns at most one best product
 * for each of four fixed category slots — Chocolate, Cake, Balloon, Stuffed
 * animal — in that exact order, after eligibility filtering and a versioned,
 * rules-based ranking.
 *
 * Rollout control (CYG_ROLLOUT env var, default "off" — kill switch):
 *   off        — module disabled; frontend falls back to the old FBT section.
 *   test       — enabled only when the Stripe test key is active (QA in prod infra).
 *   percentage — enabled for CYG_ROLLOUT_PCT % of sessions (deterministic hash).
 *   on         — enabled for everyone.
 *
 * Ranking is deterministic and versioned (CYG_RULES_VERSION). All weights and
 * thresholds live in CYG_RANKING_CONFIG so a learned model can replace the
 * rules later by bumping the version.
 */

import { createHash } from "node:crypto";
import type { ProductRankingMetricsRow } from "@workspace/db";
import type { OSProduct, OSTimeSlot } from "@workspace/presentail-os";
import { logger } from "./logger";

// ── Versioning ───────────────────────────────────────────────────────────────

export const CYG_RULES_VERSION = "cyg-rules-v1";
export const CYG_EXPERIMENT_ID = "complete-your-gift-v1";
/** Section key used for merchandising exclusion lists in product_ranking_metrics. */
export const CYG_SECTION_KEY = "complete-your-gift";

// ── Fixed category slots (order matters and must never change) ──────────────

export type CygSlotKey = "chocolate" | "cake" | "balloon" | "stuffed-animal";

export type CygSlotDef = {
  key: CygSlotKey;
  /** OS catalog category slugs that qualify a product for this slot. */
  categorySlugs: string[];
};

export const CYG_SLOTS: readonly CygSlotDef[] = [
  { key: "chocolate", categorySlugs: ["chocolate", "chocolates"] },
  { key: "cake", categorySlugs: ["cakes", "cake"] },
  { key: "balloon", categorySlugs: ["balloons", "balloon"] },
  { key: "stuffed-animal", categorySlugs: ["stuffed-animals", "stuffed-animal", "teddy-bears"] },
] as const;

// ── Versioned ranking configuration ──────────────────────────────────────────

export type CygRankingConfig = {
  version: string;
  weights: {
    sales30d: number;
    addToCarts30d: number;
    clicks30d: number;
    freshness: number;
    margin: number;
    reliability: number;
  };
  /** Bayesian smoothing pseudo-count for the no-metrics totalSales fallback. */
  smoothingPseudoCount: number;
  /** Metrics rows with fewer impressions than this are treated as low-data. */
  minImpressions30d: number;
  /** Fraction of requests where the slot winner is an exploration pick. */
  explorationRate: number;
  /** Max products returned per slot (fixed to 1 by spec, kept configurable). */
  perSlotLimit: number;
};

export const CYG_RANKING_CONFIG: CygRankingConfig = {
  version: CYG_RULES_VERSION,
  weights: {
    sales30d: 0.4,
    addToCarts30d: 0.15,
    clicks30d: 0.1,
    freshness: 0.1,
    margin: 0.15,
    reliability: 0.1,
  },
  smoothingPseudoCount: 20,
  minImpressions30d: 50,
  explorationRate: 0.05,
  perSlotLimit: 1,
};

// ── Rollout flag / kill switch ───────────────────────────────────────────────

export type CygRolloutMode = "off" | "test" | "percentage" | "on";
export type CygVariant = "control" | "treatment";

export function getCygRolloutMode(): CygRolloutMode {
  const raw = (process.env.CYG_ROLLOUT ?? "off").trim().toLowerCase();
  if (raw === "off" || raw === "test" || raw === "percentage" || raw === "on") {
    return raw;
  }
  return "off";
}

function getCygRolloutPct(): number {
  const n = parseInt(process.env.CYG_ROLLOUT_PCT ?? "", 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** Deterministic 0–99 bucket for a session id (same shopper stays in cohort). */
export function cygCohortBucket(sessionId: string): number {
  const hash = createHash("sha256").update(`cyg:${sessionId}`).digest("hex");
  return parseInt(hash.slice(0, 8), 16) % 100;
}

/**
 * Resolve the experiment assignment for this request.
 * "treatment" = Complete Your Gift module shown; "control" = old FBT fallback.
 */
export function getCygAssignment(sessionId: string | undefined): {
  enabled: boolean;
  variant: CygVariant;
  mode: CygRolloutMode;
} {
  const mode = getCygRolloutMode();
  switch (mode) {
    case "off":
      return { enabled: false, variant: "control", mode };
    case "on":
      return { enabled: true, variant: "treatment", mode };
    case "test": {
      const isTest = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
      return { enabled: isTest, variant: isTest ? "treatment" : "control", mode };
    }
    case "percentage": {
      const pct = getCygRolloutPct();
      if (pct <= 0 || !sessionId) return { enabled: false, variant: "control", mode };
      const enabled = pct >= 100 || cygCohortBucket(sessionId) < pct;
      return { enabled, variant: enabled ? "treatment" : "control", mode };
    }
  }
}

// ── Tracking tokens ──────────────────────────────────────────────────────────

/**
 * Opaque recommendation tracking token — base64url-encoded JSON tying the
 * recommendation to the anchor, slot, product, rules version, and timestamp.
 * Not a secret; used purely to correlate analytics events with the exact
 * recommendation that produced them.
 */
export function buildCygToken(fields: {
  anchor: string;
  slot: CygSlotKey;
  productSlug: string;
  explored: boolean;
}): string {
  const payload = {
    v: CYG_RULES_VERSION,
    a: fields.anchor,
    s: fields.slot,
    p: fields.productSlug,
    x: fields.explored ? 1 : 0,
    t: Date.now(),
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

// ── Delivery-date eligibility ────────────────────────────────────────────────

/** IANA timezone per store, used to resolve "today" for same-day cutoffs. */
export const STORE_TIMEZONES: Record<string, string> = {
  lebanon: "Asia/Beirut",
  dubai: "Asia/Dubai",
  abudhabi: "Asia/Dubai",
  cyprus: "Asia/Nicosia",
};

function tzParts(now: Date, timeZone: string): { dateStr: string; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    hour: parseInt(get("hour"), 10),
  };
}

/**
 * Whether the requested delivery date is servable for a city, based on the
 * authoritative OS delivery slot configuration (same source the checkout
 * delivery picker uses).
 *
 * Rules:
 *   - No slot data for the city → fail open (true); the checkout flow remains
 *     the final authority and we must not empty the module on missing config.
 *   - Past dates → false.
 *   - Today → requires an enabled slot allowing same-day whose cutoff (in the
 *     store's timezone) has not passed. Slots without a sameDayEnabled flag
 *     carry no same-day restriction (see OSTimeSlot docs).
 *   - Tomorrow → requires an enabled slot not restricted to same-day only.
 *   - Later dates → any enabled slot.
 */
export function isDateDeliverableForCity(opts: {
  slots: OSTimeSlot[] | null | undefined;
  date: string; // YYYY-MM-DD
  storeKey: string;
  now?: Date;
}): boolean {
  const { slots, date, storeKey } = opts;
  if (!slots || slots.length === 0) return true; // fail open — no slot config
  const enabled = slots.filter((s) => s.enabled !== false);
  if (enabled.length === 0) return false;

  const tz = STORE_TIMEZONES[storeKey] ?? "Asia/Beirut";
  const { dateStr: today, hour } = tzParts(opts.now ?? new Date(), tz);

  if (date < today) return false;
  if (date === today) {
    return enabled.some((s) => {
      if (s.sameDayEnabled === false) return false;
      const cutoff = s.cutoffHour ?? 24;
      return hour < cutoff;
    });
  }
  // Tomorrow and beyond: exclude slots explicitly marked same-day-only
  // (sameDayEnabled === true with nextDayEnabled === false).
  return enabled.some((s) => !(s.sameDayEnabled === true && s.nextDayEnabled === false));
}

// ── Eligibility filtering ────────────────────────────────────────────────────

export type CygExclusionReason =
  | "out_of_stock"
  | "invalid_price"
  | "in_cart"
  | "is_anchor"
  | "duplicate_slot"
  | "not_deliverable_to_city"
  | "merch_suppressed";

export type CygCandidate = {
  product: OSProduct;
  slot: CygSlotKey;
};

function productCategorySlugs(p: OSProduct): string[] {
  return (p.categories ?? []).map((c) => c.slug ?? c.id ?? "").filter(Boolean);
}

/** Find the first slot (in fixed order) whose category set matches the product. */
export function slotForProduct(p: OSProduct): CygSlotKey | null {
  const slugs = productCategorySlugs(p);
  for (const slot of CYG_SLOTS) {
    if (slugs.some((s) => slot.categorySlugs.includes(s))) return slot.key;
  }
  return null;
}

function isMerchSuppressed(
  metrics: ProductRankingMetricsRow | undefined,
  now: number,
): boolean {
  if (!metrics) return false;
  if ((metrics.rankingPenalty ?? 1) === 0) return true;
  if (metrics.excludedFromSectionJson) {
    try {
      const arr = JSON.parse(metrics.excludedFromSectionJson);
      if (Array.isArray(arr) && arr.map(String).includes(CYG_SECTION_KEY)) return true;
    } catch {
      // malformed — treat as no exclusion
    }
  }
  const startAt = metrics.rankingStartAt ? new Date(metrics.rankingStartAt).getTime() : null;
  const endAt = metrics.rankingEndAt ? new Date(metrics.rankingEndAt).getTime() : null;
  if (startAt !== null && now < startAt) return true;
  if (endAt !== null && now > endAt) return true;
  return false;
}

export type CygFilterResult = {
  /** Eligible candidates keyed by slot, ready for ranking. */
  bySlot: Map<CygSlotKey, OSProduct[]>;
  /**
   * Reason the *first-encountered* excluded candidate per slot was dropped —
   * surfaced as fallbackReason when the slot ends up empty or degraded.
   */
  exclusionReasonBySlot: Map<CygSlotKey, CygExclusionReason>;
};

/**
 * Filter the store catalog down to eligible candidates per slot.
 * Runs BEFORE ranking, per spec.
 */
export function filterCygCandidates(opts: {
  catalog: OSProduct[];
  anchorSlug: string;
  cartSlugs: Set<string>;
  cityId?: string;
  metricsMap: ReadonlyMap<string, ProductRankingMetricsRow>;
  now?: number;
}): CygFilterResult {
  const { catalog, anchorSlug, cartSlugs, cityId, metricsMap } = opts;
  const now = opts.now ?? Date.now();

  const bySlot = new Map<CygSlotKey, OSProduct[]>();
  const exclusionReasonBySlot = new Map<CygSlotKey, CygExclusionReason>();
  const noteExclusion = (slot: CygSlotKey, reason: CygExclusionReason) => {
    if (!exclusionReasonBySlot.has(slot)) exclusionReasonBySlot.set(slot, reason);
  };

  for (const p of catalog) {
    const slot = slotForProduct(p);
    if (!slot) continue;

    if (p.id === anchorSlug) {
      noteExclusion(slot, "is_anchor");
      continue;
    }
    if (!p.inStock) {
      noteExclusion(slot, "out_of_stock");
      continue;
    }
    if (!Number.isFinite(p.price) || p.price <= 0) {
      noteExclusion(slot, "invalid_price");
      continue;
    }
    if (cartSlugs.has(p.id)) {
      noteExclusion(slot, "in_cart");
      continue;
    }
    // City-level deliverability: catalog cache is already filtered per store,
    // but products can carry a narrower deliverableCities list.
    if (cityId && p.deliverableCities && p.deliverableCities.length > 0) {
      const bare = cityId.replace(/^[a-z]{2}-/, "");
      if (!p.deliverableCities.some((c) => c === cityId || c === bare)) {
        noteExclusion(slot, "not_deliverable_to_city");
        continue;
      }
    }
    if (isMerchSuppressed(metricsMap.get(p.id), now)) {
      noteExclusion(slot, "merch_suppressed");
      continue;
    }

    const arr = bySlot.get(slot);
    if (arr) arr.push(p);
    else bySlot.set(slot, [p]);
  }

  return { bySlot, exclusionReasonBySlot };
}

// ── Ranking ──────────────────────────────────────────────────────────────────

export type CygScoredCandidate = {
  product: OSProduct;
  score: number;
  /** True when the metrics row was absent or below the impression threshold. */
  lowData: boolean;
  metricsSource: "precomputed" | "fallback";
};

function reliabilityScore(metrics: ProductRankingMetricsRow): number {
  const refund = metrics.refundRate ?? 0;
  const cancel = metrics.cancellationRate ?? 0;
  return Math.max(0, 1 - Math.min(1, refund + cancel));
}

function marginScore(metrics: ProductRankingMetricsRow): number {
  const pct = metrics.grossMarginPct;
  if (pct == null || !Number.isFinite(pct)) return 0.5; // neutral when unknown
  return Math.max(0, Math.min(1, pct / 100));
}

/**
 * Score candidates within one slot. Pure and deterministic for a given
 * (candidates, metricsMap, config) input. Higher score = better.
 * Ties break by osNumericId descending (newer product wins) then slug,
 * so ordering is fully deterministic.
 */
export function rankCygCandidates(
  candidates: OSProduct[],
  metricsMap: ReadonlyMap<string, ProductRankingMetricsRow>,
  config: CygRankingConfig = CYG_RANKING_CONFIG,
): CygScoredCandidate[] {
  const w = config.weights;

  let minId = Infinity;
  let maxId = -Infinity;
  for (const p of candidates) {
    const id = Number(p.osNumericId ?? 0);
    if (id > 0) {
      if (id < minId) minId = id;
      if (id > maxId) maxId = id;
    }
  }
  const idRange = maxId > minId ? maxId - minId : 1;

  const scored: CygScoredCandidate[] = candidates.map((p) => {
    const id = Number(p.osNumericId ?? 0);
    const freshness = id > 0 ? (id - minId) / idRange : 0;
    const metrics = metricsMap.get(p.id);

    if (metrics) {
      const lowData = (metrics.impressions30d ?? 0) < config.minImpressions30d;
      const score =
        w.sales30d * (metrics.normSales30d ?? 0) +
        w.addToCarts30d * (metrics.normAddToCarts30d ?? 0) +
        w.clicks30d * (metrics.normClicks30d ?? 0) +
        w.freshness * freshness +
        w.margin * marginScore(metrics) +
        w.reliability * reliabilityScore(metrics);
      return { product: p, score, lowData, metricsSource: "precomputed" };
    }

    // No metrics row — Bayesian-smoothed totalSales fallback (never raw sales).
    const sales = p.totalSales ?? 0;
    const pop = sales / (sales + config.smoothingPseudoCount);
    const score = 0.7 * pop + 0.3 * freshness;
    return { product: p, score, lowData: true, metricsSource: "fallback" };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aId = Number(a.product.osNumericId ?? 0);
    const bId = Number(b.product.osNumericId ?? 0);
    if (bId !== aId) return bId - aId;
    return a.product.id < b.product.id ? -1 : 1;
  });
  return scored;
}

// ── Exploration ──────────────────────────────────────────────────────────────

/**
 * Deterministically decide whether this (session, slot) pair falls into the
 * exploration slice, and if so pick the highest-ranked low-data candidate
 * instead of the top pick. The decision is logged for offline analysis.
 *
 * Returns the chosen candidate and whether exploration was applied.
 */
export function applyExploration(opts: {
  ranked: CygScoredCandidate[];
  slot: CygSlotKey;
  sessionId: string | undefined;
  anchorSlug: string;
  config?: CygRankingConfig;
}): { chosen: CygScoredCandidate; explored: boolean } | null {
  const { ranked, slot, sessionId, anchorSlug } = opts;
  const config = opts.config ?? CYG_RANKING_CONFIG;
  if (ranked.length === 0) return null;

  const top = ranked[0];
  if (!sessionId || config.explorationRate <= 0) return { chosen: top, explored: false };

  const hash = createHash("sha256")
    .update(`cyg-explore:${sessionId}:${slot}`)
    .digest("hex");
  const bucket = parseInt(hash.slice(0, 8), 16) % 10_000;
  const inSlice = bucket < Math.round(config.explorationRate * 10_000);
  if (!inSlice) return { chosen: top, explored: false };

  const exploreCandidate = ranked.find((c) => c.lowData && c !== top);
  if (!exploreCandidate) return { chosen: top, explored: false };

  logger.info(
    {
      slot,
      anchorSlug,
      exploited: top.product.id,
      explored: exploreCandidate.product.id,
      rulesVersion: config.version,
    },
    "completeYourGift: exploration slice served low-data candidate",
  );
  return { chosen: exploreCandidate, explored: true };
}
