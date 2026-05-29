import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert, type AlertField } from "./alerts";
import { loadDailyUpsellItemBuckets } from "./upsellAggregator";
import { loadDailyRevenueRows } from "./checkoutPurchaseFunnelMonitor";
import { getOsProducts } from "./osProductsCache";

// ── Configuration ──────────────────────────────────────────────────────────
//
// Hourly monitor that evaluates the previous UTC day's upsell funnel per
// platform and fires a Slack alert when either the item-add rate or the
// checkout-proceeded count collapses below configurable thresholds.
//
// The three upsell events tracked:
//   upsell_tab_clicked      — shopper opened/clicked a upsell tab
//   upsell_item_added       — shopper added a suggested item
//   upsell_checkout_proceeded — shopper tapped "proceed to checkout"
//
// Metrics monitored per platform:
//   itemAddRate   = upsell_item_added / upsell_tab_clicked
//   checkoutProceededCount = raw upsell_checkout_proceeded count
//
// We skip a platform when tab clicks are below MIN_TAB_CLICKS (low traffic).
// Only the checkout-proceeded count has its own minimum-sample guard:
// CHECKOUT_PROCEEDED_MIN is an absolute floor, not a rate.
//
// Revenue % WoW check:
//   upsellRevenuePct = (sum of upsell_item_added × product price) /
//                      (confirmed app_orders total) × 100
//   An alert fires when the prior day's ratio drops more than
//   REVENUE_PCT_DROP_MAX percentage points below the 7-day trailing average.
//   The check is gated on the OS product cache being warm; it is skipped
//   silently when no product prices are available (cold cache).

const ENABLED = (() => {
  const v = (process.env.UPSELL_FUNNEL_MONITOR_ENABLED ?? "1").toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1h

// Don't evaluate platforms with fewer than this many tab clicks. Step-to-step
// ratios are noisy below this.
const MIN_TAB_CLICKS = (() => {
  const raw = Number(process.env.UPSELL_FUNNEL_MIN_TAB_CLICKS);
  if (!Number.isFinite(raw) || raw <= 0) return 20;
  return Math.floor(raw);
})();

function envRatio(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return fallback;
  return raw;
}

// Minimum acceptable item-add rate (adds / tab clicks). Anything below ⇒ alert.
// Exported so the admin funnels dashboard can highlight digest rows that breach
// the same threshold the monitor evaluates (single source of truth).
export const ITEM_ADD_RATE_MIN = envRatio("UPSELL_FUNNEL_ITEM_ADD_RATE_MIN", 0.1);

// Minimum absolute checkout-proceeded count. Zero-or-near-zero on a day with
// enough tab clicks is a strong signal the "proceed" CTA is broken.
const CHECKOUT_PROCEEDED_MIN = (() => {
  const raw = Number(process.env.UPSELL_FUNNEL_CHECKOUT_PROCEEDED_MIN);
  if (!Number.isFinite(raw) || raw < 0) return 5;
  return Math.floor(raw);
})();

// Maximum acceptable WoW drop in upsell revenue as a % of total purchase
// revenue (in percentage points). When the prior day's ratio falls more than
// this many pp below the 7-day trailing average, a Slack alert fires.
// Set to 0 to disable this specific check while keeping the rest of the
// monitor active. Default 5 pp.
export const REVENUE_PCT_DROP_MAX = (() => {
  const raw = Number(process.env.UPSELL_REVENUE_PCT_DROP_MAX);
  if (!Number.isFinite(raw) || raw < 0) return 5;
  return raw;
})();

// Number of trailing days used to compute the reference average for the
// revenue % WoW check. Not user-configurable; internal constant.
const REVENUE_PCT_TRAILING_DAYS = 7;

// ── Module state ───────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastEvaluatedDay: string | null = null;

// ── Public API ─────────────────────────────────────────────────────────────

export function startUpsellFunnelMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("upsellFunnelMonitor: disabled");
    return;
  }
  if (timer) return;

  const baseline = setTimeout(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "upsellFunnelMonitor: baseline run failed",
      );
    });
  }, 60_000);
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "upsellFunnelMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    {
      tickMs: TICK_MS,
      minTabClicks: MIN_TAB_CLICKS,
      itemAddRateMin: ITEM_ADD_RATE_MIN,
      checkoutProceededMin: CHECKOUT_PROCEEDED_MIN,
      revenuePctDropMax: REVENUE_PCT_DROP_MAX,
    },
    "upsellFunnelMonitor: started",
  );
}

export function stopUpsellFunnelMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runOnce(now: Date = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const day = previousUtcDay(now);
    if (lastEvaluatedDay === day.iso) return;

    const buckets = await loadBuckets(day.start, day.end);

    if (buckets.length === 0) {
      logger.info(
        { day: day.iso },
        "upsellFunnelMonitor: no upsell events for day, nothing to evaluate",
      );
    } else {
      const breaches = evaluateBuckets(buckets);
      if (breaches.length > 0) {
        await sendBreachAlert(day.iso, breaches, buckets);
      } else {
        logger.info(
          { day: day.iso, buckets: buckets.length },
          "upsellFunnelMonitor: all upsell metrics within band",
        );
      }
    }

    // Revenue % WoW check — runs regardless of whether the funnel event
    // counts breached; a broken upsell UI could produce zero events (caught
    // above) while this check covers the complementary case where events look
    // fine but revenue contribution has quietly dropped.
    if (REVENUE_PCT_DROP_MAX > 0) {
      await checkRevenuePctDropWoW(day);
    }

    lastEvaluatedDay = day.iso;
  } finally {
    running = false;
  }
}

// ── Revenue % WoW check ────────────────────────────────────────────────────

/**
 * Computes the upsell revenue % for the prior day and the 7-day trailing
 * average immediately before it, then fires a Slack alert when the drop
 * exceeds REVENUE_PCT_DROP_MAX percentage points.
 *
 * upsellRevenuePct = Σ(upsell_item_added × priceUsd) / totalOrderRevenue × 100
 *
 * Uses the same two data sources as the admin funnels dashboard:
 *   • `loadDailyUpsellItemBuckets` for per-product add counts
 *   • `loadDailyRevenueRows` for confirmed app_orders revenue
 *
 * Silently skips when:
 *   • The OS product cache is cold (no prices available to estimate revenue)
 *   • The prior day has zero confirmed order revenue (can't compute a ratio)
 *   • Fewer than 2 of the 7 trailing days have usable revenue data (too
 *     little history to form a reliable baseline average)
 */
async function checkRevenuePctDropWoW(day: {
  iso: string;
  start: Date;
  end: Date;
}): Promise<void> {
  const priceMap = buildProductPriceMap();
  if (priceMap.size === 0) {
    logger.info(
      { day: day.iso },
      "upsellFunnelMonitor: OS cache cold — skipping revenue % WoW check",
    );
    return;
  }

  const baselineEnd = day.start;
  const baselineStart = new Date(
    baselineEnd.getTime() - REVENUE_PCT_TRAILING_DAYS * 24 * 60 * 60 * 1000,
  );

  // Fetch the prior day and the 7 trailing days in parallel.
  const [currentPcts, baselinePcts] = await Promise.all([
    computeDailyRevenuePcts(day.start, day.end, priceMap),
    computeDailyRevenuePcts(baselineStart, baselineEnd, priceMap),
  ]);

  if (currentPcts.length === 0) {
    logger.info(
      { day: day.iso },
      "upsellFunnelMonitor: no confirmed revenue for day — skipping revenue % WoW check",
    );
    return;
  }

  const currentPct = currentPcts[0].pct;

  // Require at least 2 days of baseline data so a single anomalous prior day
  // doesn't skew the reference average into triggering a false alert.
  if (baselinePcts.length < 2) {
    logger.info(
      { day: day.iso, baselineDays: baselinePcts.length },
      "upsellFunnelMonitor: insufficient baseline days — skipping revenue % WoW check",
    );
    return;
  }

  const trailingAvg =
    baselinePcts.reduce((sum, r) => sum + r.pct, 0) / baselinePcts.length;
  const drop = trailingAvg - currentPct;

  logger.info(
    {
      day: day.iso,
      currentPct: +currentPct.toFixed(2),
      trailingAvg: +trailingAvg.toFixed(2),
      drop: +drop.toFixed(2),
      revenuePctDropMax: REVENUE_PCT_DROP_MAX,
      baselineDays: baselinePcts.length,
    },
    "upsellFunnelMonitor: revenue % WoW evaluation",
  );

  if (drop > REVENUE_PCT_DROP_MAX) {
    await sendRevenuePctDropAlert(day.iso, currentPct, trailingAvg, drop, baselinePcts.length);
  }
}

/**
 * Build a productId → USD price lookup from the in-memory OS product caches
 * across all four store keys. First-seen price wins (they should be equal, but
 * the Lebanon store is the canonical reference). Returns an empty map when the
 * OS cache is cold — callers must guard against this.
 */
function buildProductPriceMap(): Map<string, number> {
  const map = new Map<string, number>();
  const storeKeys = ["lebanon", "dubai", "abudhabi", "cyprus"] as const;
  for (const storeKey of storeKeys) {
    const products = getOsProducts(storeKey);
    if (!products) continue;
    for (const p of products) {
      if (!map.has(p.id) && typeof p.price === "number") {
        map.set(p.id, p.price);
      }
    }
  }
  return map;
}

type DailyRevenuePct = { day: string; pct: number };

/**
 * For each day in [start, end) that has confirmed purchase revenue, returns the
 * upsell revenue % defined as:
 *
 *   Σ(upsell_item_added × priceUsd) / totalOrderRevenue × 100
 *
 * Days with zero total revenue are omitted (ratio undefined).
 * Days with no upsell adds yield pct = 0 (upsell contributed nothing that day).
 */
async function computeDailyRevenuePcts(
  start: Date,
  end: Date,
  priceMap: Map<string, number>,
): Promise<DailyRevenuePct[]> {
  const [itemBuckets, revenueRows] = await Promise.all([
    loadDailyUpsellItemBuckets(start, end),
    loadDailyRevenueRows(start, end),
  ]);

  // Sum confirmed revenue per day across all platforms.
  const revenueCentsByDay = new Map<string, number>();
  for (const r of revenueRows) {
    revenueCentsByDay.set(
      r.day,
      (revenueCentsByDay.get(r.day) ?? 0) + (r.revenueUsdCents ?? 0),
    );
  }

  // Sum estimated upsell revenue per day across all platforms and products.
  const upsellRevByDay = new Map<string, number>();
  for (const b of itemBuckets) {
    const price = priceMap.get(b.productId);
    if (price != null && price > 0) {
      upsellRevByDay.set(
        b.day,
        (upsellRevByDay.get(b.day) ?? 0) + b.adds * price,
      );
    }
  }

  const result: DailyRevenuePct[] = [];
  for (const [day, totalCents] of revenueCentsByDay) {
    if (totalCents <= 0) continue;
    const upsellRev = upsellRevByDay.get(day) ?? 0;
    const pct = (upsellRev / (totalCents / 100)) * 100;
    result.push({ day, pct });
  }
  return result;
}

async function sendRevenuePctDropAlert(
  day: string,
  currentPct: number,
  trailingAvg: number,
  drop: number,
  baselineDays: number,
): Promise<void> {
  const fields: AlertField[] = [
    {
      title: "Prior day upsell revenue %",
      value: `${currentPct.toFixed(1)}%`,
    },
    {
      title: `${baselineDays}-day trailing average`,
      value: `${trailingAvg.toFixed(1)}%`,
    },
    {
      title: "Drop (pp)",
      value: `${drop.toFixed(1)} pp (threshold: ${REVENUE_PCT_DROP_MAX} pp)`,
    },
  ];

  await sendAlert({
    title: "Upsell revenue contribution drop",
    body:
      `Upsell revenue was ${currentPct.toFixed(1)}% of total purchase revenue on ` +
      `${day} (UTC), which is ${drop.toFixed(1)} percentage points below the ` +
      `${baselineDays}-day trailing average of ${trailingAvg.toFixed(1)}%. ` +
      `Threshold: ${REVENUE_PCT_DROP_MAX} pp. ` +
      `Check the upsell flow for broken add-to-cart or pricing issues.`,
    severity: "warn",
    fields,
    source: "upsellFunnelMonitor",
  });
}

// ── Internals ──────────────────────────────────────────────────────────────

function previousUtcDay(now: Date): {
  iso: string;
  start: Date;
  end: Date;
} {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const iso = start.toISOString().slice(0, 10);
  return { iso, start, end };
}

export type UpsellFunnelBucket = {
  platform: string;
  tabClicks: number;
  itemAdds: number;
  checkoutProceeded: number;
};

type RawRow = {
  name: string;
  platform: string | null;
  count: number;
};

const UPSELL_EVENT_NAMES = [
  "upsell_tab_clicked",
  "upsell_item_added",
  "upsell_checkout_proceeded",
] as const;

async function loadBuckets(
  start: Date,
  end: Date,
): Promise<UpsellFunnelBucket[]> {
  const rows = (await db
    .select({
      name: analyticsEventsTable.name,
      platform: analyticsEventsTable.platform,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} in ('upsell_tab_clicked', 'upsell_item_added', 'upsell_checkout_proceeded')`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(
      analyticsEventsTable.name,
      analyticsEventsTable.platform,
    )) as RawRow[];

  return aggregateBuckets(rows);
}

export function aggregateBuckets(rows: RawRow[]): UpsellFunnelBucket[] {
  const map = new Map<string, UpsellFunnelBucket>();
  const get = (platform: string): UpsellFunnelBucket => {
    let b = map.get(platform);
    if (!b) {
      b = { platform, tabClicks: 0, itemAdds: 0, checkoutProceeded: 0 };
      map.set(platform, b);
    }
    return b;
  };

  for (const row of rows) {
    if (!(UPSELL_EVENT_NAMES as readonly string[]).includes(row.name)) continue;
    const b = get(row.platform ?? "unknown");
    switch (row.name) {
      case "upsell_tab_clicked":
        b.tabClicks += row.count;
        break;
      case "upsell_item_added":
        b.itemAdds += row.count;
        break;
      case "upsell_checkout_proceeded":
        b.checkoutProceeded += row.count;
        break;
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : 0,
  );
}

export type UpsellFunnelBreach = {
  bucket: UpsellFunnelBucket;
  reasons: string[];
};

export function evaluateBuckets(
  buckets: UpsellFunnelBucket[],
): UpsellFunnelBreach[] {
  const breaches: UpsellFunnelBreach[] = [];
  for (const b of buckets) {
    // Skip low-traffic platforms so we don't alert on noise.
    if (b.tabClicks < MIN_TAB_CLICKS) continue;
    const reasons: string[] = [];

    const addRate = b.tabClicks > 0 ? b.itemAdds / b.tabClicks : 0;
    if (addRate < ITEM_ADD_RATE_MIN) {
      reasons.push(
        `item-add rate ${(addRate * 100).toFixed(1)}% < ${(ITEM_ADD_RATE_MIN * 100).toFixed(0)}%` +
          ` (${b.itemAdds} adds / ${b.tabClicks} tab clicks)`,
      );
    }

    if (b.checkoutProceeded < CHECKOUT_PROCEEDED_MIN) {
      reasons.push(
        `checkout-proceeded count ${b.checkoutProceeded} < ${CHECKOUT_PROCEEDED_MIN}`,
      );
    }

    if (reasons.length > 0) breaches.push({ bucket: b, reasons });
  }
  return breaches;
}

async function sendBreachAlert(
  day: string,
  breaches: UpsellFunnelBreach[],
  allBuckets: UpsellFunnelBucket[],
): Promise<void> {
  const fields: AlertField[] = breaches.map(({ bucket, reasons }) => ({
    title: bucket.platform,
    value:
      `tab clicks ${bucket.tabClicks}, adds ${bucket.itemAdds}, ` +
      `checkout-proceeded ${bucket.checkoutProceeded} → ` +
      reasons.join("; "),
  }));

  const body =
    `Upsell conversion collapsed on ${day} (UTC). ` +
    `${breaches.length} platform(s) breached out of ${allBuckets.length} active.`;

  await sendAlert({
    title: "Upsell funnel regression",
    body,
    severity: "warn",
    fields,
    source: "upsellFunnelMonitor",
  });
}
