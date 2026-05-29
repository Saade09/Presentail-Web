import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable, appOrdersTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert, type AlertField } from "./alerts";
import { loadDailyUpsellItemBuckets } from "./upsellAggregator";
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

// Minimum confirmed order count for a platform to be included in the revenue
// % WoW check. Platforms with fewer confirmed orders on the prior day are
// skipped to suppress noise from low-volume days. Default 5.
const REVENUE_PCT_MIN_ORDERS = (() => {
  const raw = Number(process.env.UPSELL_REVENUE_PCT_MIN_ORDERS);
  if (!Number.isFinite(raw) || raw < 0) return 5;
  return Math.floor(raw);
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
      revenuePctMinOrders: REVENUE_PCT_MIN_ORDERS,
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

// ── Revenue % WoW check (per platform) ─────────────────────────────────────

/**
 * Per-platform upsell revenue % record for a single day.
 *   pct        = Σ(upsell_item_added × priceUsd) / totalOrderRevenue × 100
 *   orderCount = number of confirmed app_orders on that (day, platform)
 */
export type PlatformRevenuePct = {
  day: string;
  platform: string;
  pct: number;
  orderCount: number;
};

/**
 * Result of evaluating one platform in the revenue % WoW check.
 */
export type PlatformRevenuePctBreach = {
  platform: string;
  currentPct: number;
  trailingAvg: number;
  drop: number;
  baselineDays: number;
};

/**
 * Pure, synchronous evaluation of the per-platform revenue % WoW check.
 *
 * Takes the pre-fetched current-day rows, the baseline window rows, the
 * minimum-order-count guard, and the maximum acceptable drop (in pp) and
 * returns:
 *   breaches      — platforms whose drop exceeded `dropMax`
 *   eligibleCount — number of platforms that passed the `minOrders` filter
 *                   (0 means the whole check would be skipped)
 *
 * Skipping rules (mirrors `checkRevenuePctDropWoW`):
 *   • A platform on the current day with orderCount < minOrders is excluded.
 *   • A platform with fewer than 2 baseline-window days is skipped (continue).
 *   • A platform whose drop ≤ dropMax is healthy — not added to breaches.
 */
/** Diagnostic snapshot for one evaluated platform (used in structured logs). */
export type PlatformRevenuePctEval = {
  platform: string;
  currentPct: number;
  trailingAvg: number;
  drop: number;
  orderCount: number;
  baselineDays: number;
  breached: boolean;
};

export function evaluateRevenuePctDropPerPlatform(
  currentRows: PlatformRevenuePct[],
  baselineRows: PlatformRevenuePct[],
  minOrders: number,
  dropMax: number,
): {
  breaches: PlatformRevenuePctBreach[];
  eligibleCount: number;
  evaluations: PlatformRevenuePctEval[];
} {
  const eligibleCurrent = currentRows.filter((r) => r.orderCount >= minOrders);

  if (eligibleCurrent.length === 0) {
    return { breaches: [], eligibleCount: 0, evaluations: [] };
  }

  const baselineByPlatform = new Map<string, PlatformRevenuePct[]>();
  for (const r of baselineRows) {
    let arr = baselineByPlatform.get(r.platform);
    if (!arr) {
      arr = [];
      baselineByPlatform.set(r.platform, arr);
    }
    arr.push(r);
  }

  const breaches: PlatformRevenuePctBreach[] = [];
  const evaluations: PlatformRevenuePctEval[] = [];

  for (const current of eligibleCurrent) {
    const platformBaseline = baselineByPlatform.get(current.platform) ?? [];

    if (platformBaseline.length < 2) continue;

    const trailingAvg =
      platformBaseline.reduce((sum, r) => sum + r.pct, 0) /
      platformBaseline.length;
    const drop = trailingAvg - current.pct;
    const breached = drop > dropMax;

    evaluations.push({
      platform: current.platform,
      currentPct: current.pct,
      trailingAvg,
      drop,
      orderCount: current.orderCount,
      baselineDays: platformBaseline.length,
      breached,
    });

    if (breached) {
      breaches.push({
        platform: current.platform,
        currentPct: current.pct,
        trailingAvg,
        drop,
        baselineDays: platformBaseline.length,
      });
    }
  }

  return { breaches, eligibleCount: eligibleCurrent.length, evaluations };
}

/**
 * Revenue + order-count row returned by `loadDailyRevenueWithCountsByPlatform`.
 * Separate from the exported `DailyRevenueRow` so we can add orderCount without
 * changing the shared type used by `aggregateDailyPurchaseBuckets`.
 */
type RevenueCountRow = {
  day: string;
  platform: string;
  revenueUsdCents: number;
  orderCount: number;
};

/**
 * Per-(UTC day, platform) confirmed purchase revenue and order count.
 * Rows with `total_usd_cents IS NULL` are excluded (legacy, no stored total).
 */
async function loadDailyRevenueWithCountsByPlatform(
  start: Date,
  end: Date,
): Promise<RevenueCountRow[]> {
  return db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${appOrdersTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      platform: sql<string>`coalesce(${appOrdersTable.platform}, 'unknown')`,
      revenueUsdCents: sql<number>`coalesce(sum(${appOrdersTable.totalUsdCents}), 0)::bigint::int`,
      orderCount: sql<number>`count(*)::int`,
    })
    .from(appOrdersTable)
    .where(
      and(
        gte(appOrdersTable.createdAt, start),
        lt(appOrdersTable.createdAt, end),
        sql`${appOrdersTable.totalUsdCents} is not null`,
      )!,
    )
    .groupBy(
      sql`date_trunc('day', ${appOrdersTable.createdAt} at time zone 'UTC')`,
      appOrdersTable.platform,
    ) as Promise<RevenueCountRow[]>;
}

/**
 * Evaluates the upsell revenue % for the prior day per platform and fires a
 * Slack alert for each platform where the drop exceeds REVENUE_PCT_DROP_MAX
 * percentage points below that platform's own 7-day trailing average.
 *
 * upsellRevenuePct = Σ(upsell_item_added × priceUsd) / totalOrderRevenue × 100
 *
 * Silently skips when:
 *   • The OS product cache is cold (no prices available to estimate revenue)
 *   • No platform on the prior day has ≥ REVENUE_PCT_MIN_ORDERS confirmed orders
 *   • A platform has fewer than 2 days of baseline data (insufficient history)
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
  const [currentRows, baselineRows] = await Promise.all([
    computePlatformRevenuePcts(day.start, day.end, priceMap),
    computePlatformRevenuePcts(baselineStart, baselineEnd, priceMap),
  ]);

  const {
    breaches,
    eligibleCount,
    evaluations: evalList,
  } = evaluateRevenuePctDropPerPlatform(
    currentRows,
    baselineRows,
    REVENUE_PCT_MIN_ORDERS,
    REVENUE_PCT_DROP_MAX,
  );

  if (eligibleCount === 0) {
    logger.info(
      {
        day: day.iso,
        totalPlatforms: currentRows.length,
        minOrders: REVENUE_PCT_MIN_ORDERS,
      },
      "upsellFunnelMonitor: no platform met minimum order count — skipping revenue % WoW check",
    );
    return;
  }

  // Log all evaluated platforms (not just those that breached) so ops can
  // inspect the full per-platform diagnostics without waiting for a breach.
  const evalLog: Record<string, object> = {};
  for (const e of evalList) {
    evalLog[e.platform] = {
      currentPct: +e.currentPct.toFixed(2),
      trailingAvg: +e.trailingAvg.toFixed(2),
      drop: +e.drop.toFixed(2),
      orderCount: e.orderCount,
      baselineDays: e.baselineDays,
      breached: e.breached,
    };
  }

  logger.info(
    { day: day.iso, revenuePctDropMax: REVENUE_PCT_DROP_MAX, ...evalLog },
    "upsellFunnelMonitor: per-platform revenue % WoW evaluation",
  );

  if (breaches.length > 0) {
    await sendRevenuePctDropAlert(day.iso, breaches);
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

/**
 * For each (day, platform) in [start, end) that has confirmed purchase revenue,
 * returns the upsell revenue % defined as:
 *
 *   Σ(upsell_item_added × priceUsd) / totalOrderRevenue × 100
 *
 * (day, platform) pairs with zero revenue are omitted (ratio undefined).
 * (day, platform) pairs with no upsell adds yield pct = 0.
 */
async function computePlatformRevenuePcts(
  start: Date,
  end: Date,
  priceMap: Map<string, number>,
): Promise<PlatformRevenuePct[]> {
  const [itemBuckets, revenueRows] = await Promise.all([
    loadDailyUpsellItemBuckets(start, end),
    loadDailyRevenueWithCountsByPlatform(start, end),
  ]);

  // Index revenue and order counts by `${day}::${platform}`.
  const revenueByKey = new Map<
    string,
    { revenueUsdCents: number; orderCount: number }
  >();
  for (const r of revenueRows) {
    revenueByKey.set(`${r.day}::${r.platform}`, {
      revenueUsdCents: r.revenueUsdCents,
      orderCount: r.orderCount,
    });
  }

  // Sum estimated upsell revenue per (day, platform).
  const upsellRevByKey = new Map<string, number>();
  for (const b of itemBuckets) {
    const price = priceMap.get(b.productId);
    if (price != null && price > 0) {
      const key = `${b.day}::${b.platform}`;
      upsellRevByKey.set(key, (upsellRevByKey.get(key) ?? 0) + b.adds * price);
    }
  }

  const result: PlatformRevenuePct[] = [];
  for (const [key, { revenueUsdCents, orderCount }] of revenueByKey) {
    if (revenueUsdCents <= 0) continue;
    const [day, platform] = key.split("::");
    const upsellRev = upsellRevByKey.get(key) ?? 0;
    const pct = (upsellRev / (revenueUsdCents / 100)) * 100;
    result.push({ day, platform, pct, orderCount });
  }
  return result;
}

export async function sendRevenuePctDropAlert(
  day: string,
  breaches: PlatformRevenuePctBreach[],
): Promise<void> {
  const fields: AlertField[] = breaches.map((b) => ({
    title: b.platform,
    value:
      `${b.currentPct.toFixed(1)}% today, ` +
      `${b.trailingAvg.toFixed(1)}% ${b.baselineDays}-day avg, ` +
      `↓ ${b.drop.toFixed(1)} pp (threshold: ${REVENUE_PCT_DROP_MAX} pp)`,
  }));

  const platformList = breaches
    .map(
      (b) =>
        `${b.platform} (${b.currentPct.toFixed(1)}% vs ${b.trailingAvg.toFixed(1)}% avg, ↓${b.drop.toFixed(1)} pp)`,
    )
    .join(", ");

  await sendAlert({
    title: "Upsell revenue contribution drop",
    body:
      `Upsell revenue % of total purchase revenue dropped on ${day} (UTC) ` +
      `for ${breaches.length} platform(s): ${platformList}. ` +
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
