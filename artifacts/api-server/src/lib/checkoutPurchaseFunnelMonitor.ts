import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable, appOrdersTable } from "@workspace/db";
import { logger } from "./logger";
import { trackWorkerExecution } from "./inFlightWorkerExecutions";
import { sendAlert, type AlertField } from "./alerts";
import {
  loadDailyUpsellTabBuckets,
  loadDailyUpsellItemBuckets,
  loadDailyUpsellCheckoutBuckets,
  summariseUpsellTabBuckets,
  summariseUpsellItemBuckets,
  summariseUpsellCheckoutBuckets,
} from "./upsellAggregator";

// ── Configuration ──────────────────────────────────────────────────────────
//
// This is the sibling of `checkoutLoginFunnelMonitor` that watches the
// broader purchase funnel:
//
//   cart_viewed → checkout_started → payment_method_selected → order_placed
//
// We compute step-to-step conversion per platform and alert when any
// single step collapses below an agreed minimum. Pruning of the
// underlying analytics_events table is handled by the login monitor;
// no need to duplicate it here.

const ENABLED = (() => {
  const v = (
    process.env.CHECKOUT_PURCHASE_FUNNEL_MONITOR_ENABLED ?? "1"
  ).toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1h

// Don't alert on tiny samples; step-to-step ratios are noisy below this.
const MIN_CART_VIEWED = (() => {
  const raw = Number(process.env.CHECKOUT_PURCHASE_MIN_CART_VIEWED);
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.floor(raw);
})();

function envRatio(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return fallback;
  return raw;
}

// Minimum acceptable step-to-step conversion. Anything below ⇒ alert.
// Defaults reflect "the funnel is leaking heavily" rather than "looks
// normal", so we don't page on healthy day-to-day variance.
const CART_TO_CHECKOUT_MIN = envRatio(
  "CHECKOUT_PURCHASE_CART_TO_CHECKOUT_MIN",
  0.15,
);
const CHECKOUT_TO_PAYMENT_MIN = envRatio(
  "CHECKOUT_PURCHASE_CHECKOUT_TO_PAYMENT_MIN",
  0.4,
);
const PAYMENT_TO_ORDER_MIN = envRatio(
  "CHECKOUT_PURCHASE_PAYMENT_TO_ORDER_MIN",
  0.3,
);

const FUNNEL_EVENT_NAMES = [
  "cart_viewed",
  "checkout_started",
  "payment_method_selected",
  "order_placed",
] as const;

type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

// ── Module state ───────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let running = false;
let lastEvaluatedDay: string | null = null;

// ── Public API ─────────────────────────────────────────────────────────────

export function startCheckoutPurchaseFunnelMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("checkoutPurchaseFunnelMonitor: disabled");
    return;
  }
  if (timer) return;

  startupTimer = setTimeout(() => {
    startupTimer = null;
    trackWorkerExecution("checkout-purchase-funnel", runOnce()).catch((err) => {
      logger.warn(
        { err: err?.message },
        "checkoutPurchaseFunnelMonitor: baseline run failed",
      );
    });
  }, 60_000);
  startupTimer.unref?.();

  timer = setInterval(() => {
    trackWorkerExecution("checkout-purchase-funnel", runOnce()).catch((err) => {
      logger.warn(
        { err: err?.message },
        "checkoutPurchaseFunnelMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    {
      tickMs: TICK_MS,
      minCartViewed: MIN_CART_VIEWED,
      cartToCheckoutMin: CART_TO_CHECKOUT_MIN,
      checkoutToPaymentMin: CHECKOUT_TO_PAYMENT_MIN,
      paymentToOrderMin: PAYMENT_TO_ORDER_MIN,
    },
    "checkoutPurchaseFunnelMonitor: started",
  );
}

export function stopCheckoutPurchaseFunnelMonitor(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
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

    const [buckets, upsellRows] = await Promise.all([
      loadBuckets(day.start, day.end),
      loadUpsellPlatformSummary(day.start, day.end),
    ]);

    if (buckets.length === 0 && upsellRows.length === 0) {
      lastEvaluatedDay = day.iso;
      logger.info(
        { day: day.iso },
        "checkoutPurchaseFunnelMonitor: no events for day, nothing to evaluate",
      );
      return;
    }

    const breaches = evaluateBuckets(buckets);
    if (breaches.length > 0) {
      await sendBreachAlert(day.iso, breaches, buckets, upsellRows);
    } else {
      await sendDailyDigest(day.iso, buckets, upsellRows);
    }
    lastEvaluatedDay = day.iso;
  } finally {
    running = false;
  }
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

export type PurchaseFunnelBucket = {
  platform: string;
  cartViewed: number;
  checkoutStarted: number;
  paymentMethodSelected: number;
  orderPlaced: number;
};

type RawRow = {
  name: string;
  platform: string | null;
  count: number;
};

async function loadBuckets(
  start: Date,
  end: Date,
): Promise<PurchaseFunnelBucket[]> {
  const rows = (await db
    .select({
      name: analyticsEventsTable.name,
      platform: analyticsEventsTable.platform,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} in ('cart_viewed', 'checkout_started', 'payment_method_selected', 'order_placed')`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(analyticsEventsTable.name, analyticsEventsTable.platform)) as RawRow[];

  return aggregateBuckets(rows);
}

export type PurchaseDailyBucket = PurchaseFunnelBucket & {
  day: string;
  // Sum of confirmed app-order totals for this (day, platform), in USD. Source
  // of truth is `app_orders.total_usd_cents` — populated server-side at order
  // creation time, so it can never be inflated or zero'd by the client. Days
  // before the column landed will read as 0 (rows had no totals stored).
  revenueUsd: number;
};

export type DailyRevenueRow = {
  day: string;
  platform: string | null;
  revenueUsdCents: number;
};

/**
 * Load per-day per-platform purchase funnel buckets for the inclusive day
 * range `[startDayUtc, endDayUtcExclusive)`. Used by the admin dashboard;
 * shares the underlying aggregator with the alerting monitor so the two
 * views can never disagree.
 *
 * Also enriches each bucket with `revenueUsd` summed from `app_orders` so
 * the dashboard can show absolute money alongside the count funnel.
 */
export async function loadDailyPurchaseBuckets(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<PurchaseDailyBucket[]> {
  const [rows, revenueRows] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        name: analyticsEventsTable.name,
        platform: analyticsEventsTable.platform,
        count: sql<number>`count(*)::int`,
      })
      .from(analyticsEventsTable)
      .where(
        and(
          sql`${analyticsEventsTable.name} in ('cart_viewed', 'checkout_started', 'payment_method_selected', 'order_placed')`,
          gte(analyticsEventsTable.createdAt, startDayUtc),
          lt(analyticsEventsTable.createdAt, endDayUtcExclusive),
        )!,
      )
      .groupBy(
        sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`,
        analyticsEventsTable.name,
        analyticsEventsTable.platform,
      ) as Promise<Array<RawRow & { day: string }>>,
    loadDailyRevenueRows(startDayUtc, endDayUtcExclusive),
  ]);

  return aggregateDailyPurchaseBuckets(rows, revenueRows);
}

/**
 * Sum confirmed app-order revenue (in USD cents) per (UTC day, platform) for
 * the given window. Pulls only from `app_orders` — the canonical record of
 * what a shopper actually paid for, server-derived at order creation. Rows
 * with `total_usd_cents IS NULL` (legacy, pre-column) are skipped rather
 * than inflating the totals with 0s.
 */
export async function loadDailyRevenueRows(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<DailyRevenueRow[]> {
  return db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${appOrdersTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      platform: appOrdersTable.platform,
      revenueUsdCents: sql<number>`coalesce(sum(${appOrdersTable.totalUsdCents}), 0)::bigint::int`,
    })
    .from(appOrdersTable)
    .where(
      and(
        gte(appOrdersTable.createdAt, startDayUtc),
        lt(appOrdersTable.createdAt, endDayUtcExclusive),
        sql`${appOrdersTable.totalUsdCents} is not null`,
      )!,
    )
    .groupBy(
      sql`date_trunc('day', ${appOrdersTable.createdAt} at time zone 'UTC')`,
      appOrdersTable.platform,
    ) as Promise<DailyRevenueRow[]>;
}

export function aggregateDailyPurchaseBuckets(
  rows: Array<RawRow & { day: string }>,
  revenueRows: DailyRevenueRow[] = [],
): PurchaseDailyBucket[] {
  const byDay = new Map<string, RawRow[]>();
  for (const r of rows) {
    let arr = byDay.get(r.day);
    if (!arr) {
      arr = [];
      byDay.set(r.day, arr);
    }
    arr.push({ name: r.name, platform: r.platform, count: r.count });
  }

  // Index revenue by `${day}::${platform}` so every emitted bucket can look
  // up its USD total in O(1). Unknown / null platforms collapse to "unknown",
  // matching the count aggregator's behaviour.
  const revenueIndex = new Map<string, number>();
  for (const r of revenueRows) {
    const key = `${r.day}::${r.platform ?? "unknown"}`;
    revenueIndex.set(
      key,
      (revenueIndex.get(key) ?? 0) + (r.revenueUsdCents ?? 0),
    );
  }
  // Days that have revenue but zero analytics events still need a row so the
  // dashboard doesn't silently drop the money. Materialise placeholder rows.
  for (const r of revenueRows) {
    const day = r.day;
    let arr = byDay.get(day);
    if (!arr) {
      arr = [];
      byDay.set(day, arr);
    }
  }

  const out: PurchaseDailyBucket[] = [];
  for (const [day, dayRows] of byDay) {
    const platformsWithCounts = new Set<string>();
    for (const b of aggregateBuckets(dayRows)) {
      const cents = revenueIndex.get(`${day}::${b.platform}`) ?? 0;
      out.push({ day, ...b, revenueUsd: cents / 100 });
      platformsWithCounts.add(b.platform);
    }
    // Surface revenue-only platforms (orders placed without a corresponding
    // analytics event) with zeroed counts so the money shows up explicitly.
    for (const r of revenueRows) {
      if (r.day !== day) continue;
      const platform = r.platform ?? "unknown";
      if (platformsWithCounts.has(platform)) continue;
      const cents = revenueIndex.get(`${day}::${platform}`) ?? 0;
      if (cents <= 0) continue;
      out.push({
        day,
        platform,
        cartViewed: 0,
        checkoutStarted: 0,
        paymentMethodSelected: 0,
        orderPlaced: 0,
        revenueUsd: cents / 100,
      });
      platformsWithCounts.add(platform);
    }
  }
  // Newest day first; within a day, alphabetical platform.
  return out.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    return a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : 0;
  });
}

export function aggregateBuckets(rows: RawRow[]): PurchaseFunnelBucket[] {
  const map = new Map<string, PurchaseFunnelBucket>();
  const get = (platform: string): PurchaseFunnelBucket => {
    let b = map.get(platform);
    if (!b) {
      b = {
        platform,
        cartViewed: 0,
        checkoutStarted: 0,
        paymentMethodSelected: 0,
        orderPlaced: 0,
      };
      map.set(platform, b);
    }
    return b;
  };

  for (const row of rows) {
    if (!isFunnelEvent(row.name)) continue;
    const b = get(row.platform ?? "unknown");
    switch (row.name) {
      case "cart_viewed":
        b.cartViewed += row.count;
        break;
      case "checkout_started":
        b.checkoutStarted += row.count;
        break;
      case "payment_method_selected":
        b.paymentMethodSelected += row.count;
        break;
      case "order_placed":
        b.orderPlaced += row.count;
        break;
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : 0,
  );
}

function isFunnelEvent(name: string): name is FunnelEventName {
  return (FUNNEL_EVENT_NAMES as readonly string[]).includes(name);
}

export type PurchaseFunnelBreach = {
  bucket: PurchaseFunnelBucket;
  reasons: string[];
};

export function evaluateBuckets(
  buckets: PurchaseFunnelBucket[],
): PurchaseFunnelBreach[] {
  const breaches: PurchaseFunnelBreach[] = [];
  for (const b of buckets) {
    if (b.cartViewed < MIN_CART_VIEWED) continue;
    const reasons: string[] = [];

    const cartToCheckout = b.cartViewed > 0 ? b.checkoutStarted / b.cartViewed : 0;
    if (cartToCheckout < CART_TO_CHECKOUT_MIN) {
      reasons.push(
        `cart→checkout ${(cartToCheckout * 100).toFixed(1)}% < ${(
          CART_TO_CHECKOUT_MIN * 100
        ).toFixed(0)}%`,
      );
    }

    // Only evaluate downstream steps when the upstream step has a sample
    // worth dividing by — otherwise a small denominator inflates noise.
    if (b.checkoutStarted >= Math.ceil(MIN_CART_VIEWED * CART_TO_CHECKOUT_MIN)) {
      const checkoutToPayment = b.paymentMethodSelected / b.checkoutStarted;
      if (checkoutToPayment < CHECKOUT_TO_PAYMENT_MIN) {
        reasons.push(
          `checkout→payment ${(checkoutToPayment * 100).toFixed(1)}% < ${(
            CHECKOUT_TO_PAYMENT_MIN * 100
          ).toFixed(0)}%`,
        );
      }
    }

    if (
      b.paymentMethodSelected >=
      Math.ceil(
        MIN_CART_VIEWED * CART_TO_CHECKOUT_MIN * CHECKOUT_TO_PAYMENT_MIN,
      )
    ) {
      const paymentToOrder = b.orderPlaced / b.paymentMethodSelected;
      if (paymentToOrder < PAYMENT_TO_ORDER_MIN) {
        reasons.push(
          `payment→order ${(paymentToOrder * 100).toFixed(1)}% < ${(
            PAYMENT_TO_ORDER_MIN * 100
          ).toFixed(0)}%`,
        );
      }
    }

    if (reasons.length > 0) breaches.push({ bucket: b, reasons });
  }
  return breaches;
}

// ── Upsell platform summary ─────────────────────────────────────────────────

export type UpsellPlatformRow = {
  platform: string;
  tabClicks: number;
  itemAdds: number;
  checkoutProceeded: number;
  addRatePct: number | null;
  checkoutRatePct: number | null;
};

/**
 * Load tab clicks, item adds, and checkout-proceeded events for the given UTC
 * window and aggregate them into a compact per-platform summary.  Uses the
 * same upsellAggregator helpers that the admin dashboard uses so the numbers
 * in Slack can never diverge from the dashboard view.
 *
 * addRatePct      = itemAdds / tabClicks × 100  (how often a tab click led to an add)
 * checkoutRatePct = checkoutProceeded / tabClicks × 100  (how often a tab click led to checkout)
 */
export async function loadUpsellPlatformSummary(
  start: Date,
  end: Date,
): Promise<UpsellPlatformRow[]> {
  const [tabsDaily, itemsDaily, checkoutDaily] = await Promise.all([
    loadDailyUpsellTabBuckets(start, end),
    loadDailyUpsellItemBuckets(start, end),
    loadDailyUpsellCheckoutBuckets(start, end),
  ]);

  const tabSummary = summariseUpsellTabBuckets(tabsDaily);
  const itemSummary = summariseUpsellItemBuckets(itemsDaily);
  const checkoutSummary = summariseUpsellCheckoutBuckets(checkoutDaily);

  const totals = new Map<
    string,
    { tabClicks: number; itemAdds: number; checkoutProceeded: number }
  >();
  const ensure = (p: string) => {
    if (!totals.has(p))
      totals.set(p, { tabClicks: 0, itemAdds: 0, checkoutProceeded: 0 });
    return totals.get(p)!;
  };

  for (const t of tabSummary) ensure(t.platform).tabClicks += t.clicks;
  for (const it of itemSummary) ensure(it.platform).itemAdds += it.adds;
  for (const c of checkoutSummary)
    ensure(c.platform).checkoutProceeded += c.count;

  return Array.from(totals.entries())
    .map(([platform, t]) => ({
      platform,
      tabClicks: t.tabClicks,
      itemAdds: t.itemAdds,
      checkoutProceeded: t.checkoutProceeded,
      addRatePct:
        t.tabClicks > 0
          ? Math.round((t.itemAdds / t.tabClicks) * 1000) / 10
          : null,
      checkoutRatePct:
        t.tabClicks > 0
          ? Math.round((t.checkoutProceeded / t.tabClicks) * 1000) / 10
          : null,
    }))
    .sort((a, b) => a.platform.localeCompare(b.platform));
}

function formatUpsellFields(rows: UpsellPlatformRow[]): AlertField[] {
  if (rows.length === 0) return [];
  return rows.map((r) => ({
    title: `upsell / ${r.platform}`,
    value:
      `${r.tabClicks} tab clicks, ` +
      `${r.itemAdds} adds (${r.addRatePct !== null ? r.addRatePct.toFixed(1) : "n/a"}%), ` +
      `${r.checkoutProceeded} checkout proceeded (${r.checkoutRatePct !== null ? r.checkoutRatePct.toFixed(1) : "n/a"}%)`,
  }));
}

// ── Alert helpers ───────────────────────────────────────────────────────────

async function sendBreachAlert(
  day: string,
  breaches: PurchaseFunnelBreach[],
  allBuckets: PurchaseFunnelBucket[],
  upsellRows: UpsellPlatformRow[],
): Promise<void> {
  const funnelFields: AlertField[] = breaches.map(({ bucket, reasons }) => ({
    title: bucket.platform,
    value:
      `cart ${bucket.cartViewed}, checkout ${bucket.checkoutStarted}, ` +
      `payment ${bucket.paymentMethodSelected}, orders ${bucket.orderPlaced} → ` +
      reasons.join("; "),
  }));

  const fields: AlertField[] = [...funnelFields, ...formatUpsellFields(upsellRows)];

  const body = `Purchase funnel collapsed at one or more steps on ${day} (UTC). ${breaches.length} platform(s) breached out of ${allBuckets.length} active.`;

  await sendAlert({
    title: "Checkout purchase funnel regression",
    body,
    severity: "warn",
    fields,
    source: "checkoutPurchaseFunnelMonitor",
  });
}

async function sendDailyDigest(
  day: string,
  buckets: PurchaseFunnelBucket[],
  upsellRows: UpsellPlatformRow[],
): Promise<void> {
  logger.info(
    { day, buckets: buckets.length },
    "checkoutPurchaseFunnelMonitor: all step conversions within band",
  );

  const funnelFields: AlertField[] = buckets.map((b) => ({
    title: b.platform,
    value:
      `cart ${b.cartViewed} → checkout ${b.checkoutStarted} → ` +
      `payment ${b.paymentMethodSelected} → orders ${b.orderPlaced}`,
  }));

  const fields: AlertField[] = [...funnelFields, ...formatUpsellFields(upsellRows)];

  await sendAlert({
    title: `Purchase funnel — ${day} (UTC)`,
    body: `All step conversions within band across ${buckets.length} active platform(s).`,
    severity: "info",
    fields,
    source: "checkoutPurchaseFunnelMonitor",
  });
}
