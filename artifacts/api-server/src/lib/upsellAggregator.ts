import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";

// Aggregates the three upsell-modal analytics events:
//   upsell_tab_clicked  — shopper clicked a tab; `action` = tab name
//   upsell_item_added   — shopper added an item; `action` = tab name, `productId` = id
//   upsell_checkout_proceeded — shopper tapped "proceed to checkout" from the modal
//
// Also provides `loadDailyOrdersByPlatform` used to correlate upsell adds with
// order_placed events on the same (platform, day) — the best proxy available
// without a session identifier in the analytics_events table.
//
// Retention pruning is already handled by the login funnel monitor (30-day prune
// of the analytics_events table), so no extra cleanup is needed here.

// ── Tab clicks ────────────────────────────────────────────────────────────────

export type UpsellTabDailyBucket = {
  day: string;
  platform: string;
  tab: string;
  clicks: number;
};

export type UpsellTabSummaryBucket = {
  platform: string;
  tab: string;
  clicks: number;
};

type RawTabRow = {
  day: string;
  platform: string | null;
  action: string | null;
  count: number;
};

export async function loadDailyUpsellTabBuckets(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<UpsellTabDailyBucket[]> {
  const rows = (await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      platform: analyticsEventsTable.platform,
      action: analyticsEventsTable.action,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} = 'upsell_tab_clicked'`,
        gte(analyticsEventsTable.createdAt, startDayUtc),
        lt(analyticsEventsTable.createdAt, endDayUtcExclusive),
      )!,
    )
    .groupBy(
      sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`,
      analyticsEventsTable.platform,
      analyticsEventsTable.action,
    )) as RawTabRow[];

  return rows
    .map((r) => ({
      day: r.day,
      platform: r.platform ?? "unknown",
      tab: r.action ?? "unknown",
      clicks: r.count,
    }))
    .sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
      return b.clicks - a.clicks;
    });
}

export function summariseUpsellTabBuckets(
  daily: UpsellTabDailyBucket[],
): UpsellTabSummaryBucket[] {
  const map = new Map<string, UpsellTabSummaryBucket>();
  for (const r of daily) {
    const key = `${r.platform}::${r.tab}`;
    const existing = map.get(key);
    if (existing) {
      existing.clicks += r.clicks;
    } else {
      map.set(key, { platform: r.platform, tab: r.tab, clicks: r.clicks });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
    return b.clicks - a.clicks;
  });
}

// ── Item adds ─────────────────────────────────────────────────────────────────

export type UpsellItemDailyBucket = {
  day: string;
  platform: string;
  tab: string;
  productId: string;
  adds: number;
};

export type UpsellItemSummaryBucket = {
  platform: string;
  tab: string;
  productId: string;
  adds: number;
};

type RawItemRow = {
  day: string;
  platform: string | null;
  action: string | null;
  productId: string | null;
  count: number;
};

export async function loadDailyUpsellItemBuckets(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<UpsellItemDailyBucket[]> {
  const rows = (await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      platform: analyticsEventsTable.platform,
      action: analyticsEventsTable.action,
      productId: analyticsEventsTable.productId,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} = 'upsell_item_added'`,
        gte(analyticsEventsTable.createdAt, startDayUtc),
        lt(analyticsEventsTable.createdAt, endDayUtcExclusive),
      )!,
    )
    .groupBy(
      sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`,
      analyticsEventsTable.platform,
      analyticsEventsTable.action,
      analyticsEventsTable.productId,
    )) as RawItemRow[];

  return rows
    .map((r) => ({
      day: r.day,
      platform: r.platform ?? "unknown",
      tab: r.action ?? "unknown",
      productId: r.productId ?? "unknown",
      adds: r.count,
    }))
    .sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
      return b.adds - a.adds;
    });
}

export function summariseUpsellItemBuckets(
  daily: UpsellItemDailyBucket[],
): UpsellItemSummaryBucket[] {
  const map = new Map<string, UpsellItemSummaryBucket>();
  for (const r of daily) {
    const key = `${r.platform}::${r.tab}::${r.productId}`;
    const existing = map.get(key);
    if (existing) {
      existing.adds += r.adds;
    } else {
      map.set(key, {
        platform: r.platform,
        tab: r.tab,
        productId: r.productId,
        adds: r.adds,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
    return b.adds - a.adds;
  });
}

// ── Checkout proceeded ────────────────────────────────────────────────────────

export type UpsellCheckoutDailyBucket = {
  day: string;
  platform: string;
  count: number;
};

export type UpsellCheckoutSummaryBucket = {
  platform: string;
  count: number;
};

type RawCheckoutRow = {
  day: string;
  platform: string | null;
  count: number;
};

export async function loadDailyUpsellCheckoutBuckets(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<UpsellCheckoutDailyBucket[]> {
  const rows = (await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      platform: analyticsEventsTable.platform,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} = 'upsell_checkout_proceeded'`,
        gte(analyticsEventsTable.createdAt, startDayUtc),
        lt(analyticsEventsTable.createdAt, endDayUtcExclusive),
      )!,
    )
    .groupBy(
      sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`,
      analyticsEventsTable.platform,
    )) as RawCheckoutRow[];

  return rows
    .map((r) => ({
      day: r.day,
      platform: r.platform ?? "unknown",
      count: r.count,
    }))
    .sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      return a.platform < b.platform ? -1 : 1;
    });
}

export function summariseUpsellCheckoutBuckets(
  daily: UpsellCheckoutDailyBucket[],
): UpsellCheckoutSummaryBucket[] {
  const map = new Map<string, UpsellCheckoutSummaryBucket>();
  for (const r of daily) {
    const existing = map.get(r.platform);
    if (existing) {
      existing.count += r.count;
    } else {
      map.set(r.platform, { platform: r.platform, count: r.count });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
    return b.count - a.count;
  });
}

// ── Upsell-to-order correlation ───────────────────────────────────────────────
//
// Two complementary views are provided:
//
// 1. Day-level co-occurrence (original approximation, no session_id required):
//
//   • `loadDailyOrdersByPlatform` returns total order_placed events per (day, platform).
//
//   • `summariseUpsellToOrder` joins those order counts onto the per-(day, platform,
//     productId) upsell-add rows and produces a per-(platform, productId) summary
//     with the following metrics (all computed in application code, not SQL, so the
//     aggregator layer stays query-only):
//
//       totalUpsellAdds        — total upsell_item_added events for this product over the window
//       daysWithAdds           — distinct days on which the product was upsell-added
//       daysWithAddsAndOrders  — of those days, how many also saw ≥1 order_placed
//       ordersOnAddDays        — total order_placed events on days the product was added
//       orderDayRatePct        — daysWithAddsAndOrders / daysWithAdds × 100
//                                (what % of add-days also generated orders; null when daysWithAdds=0)
//
//   This is explicitly a co-occurrence / correlation metric, not a causal attribution.
//
// 2. Session-level attribution (exact, requires session_id — see `buildUpsellToOrderBySession`):
//
//   Only events from clients that send session_id are counted. A session is considered
//   "converted" when the same session_id appears in both an `upsell_item_added` event
//   for the given product AND an `order_placed` event in the same window.
//
//       sessionsWithAdd        — distinct session_ids that added this product
//       sessionsConverted      — of those sessions, how many also placed an order
//       sessionConversionRatePct — sessionsConverted / sessionsWithAdd × 100
//
//   Events with NULL session_id (clients predating the field) are excluded so older
//   traffic never artificially inflates or deflates the session metric.

// ── Session-level upsell → order attribution ──────────────────────────────────

export type UpsellToOrderBySessionBucket = {
  platform: string;
  productId: string;
  sessionsWithAdd: number;
  sessionsConverted: number;
  sessionConversionRatePct: number | null;
};

type RawSessionRow = {
  platform: string | null;
  productId: string | null;
  sessionsWithAdd: number;
  sessionsConverted: number;
};

/**
 * Returns per-(platform, productId) session-level attribution for the given
 * window. Only sessions that supplied a session_id are counted — events with
 * NULL session_id (clients predating the field) are excluded so old traffic
 * doesn't dilute the metric.
 *
 * A session is "converted" when the same session_id appears in both an
 * `upsell_item_added` row (for this product) AND an `order_placed` row
 * anywhere in the window, regardless of day.
 */
export async function buildUpsellToOrderBySession(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<UpsellToOrderBySessionBucket[]> {
  const rows = (await db.execute(sql`
    WITH adds AS (
      SELECT DISTINCT session_id, platform, product_id
      FROM analytics_events
      WHERE name = 'upsell_item_added'
        AND session_id IS NOT NULL
        AND created_at >= ${startDayUtc}
        AND created_at < ${endDayUtcExclusive}
    ),
    orders AS (
      SELECT DISTINCT session_id
      FROM analytics_events
      WHERE name = 'order_placed'
        AND session_id IS NOT NULL
        AND created_at >= ${startDayUtc}
        AND created_at < ${endDayUtcExclusive}
    )
    SELECT
      a.platform,
      a.product_id AS "productId",
      COUNT(*)::int AS "sessionsWithAdd",
      COUNT(o.session_id)::int AS "sessionsConverted"
    FROM adds a
    LEFT JOIN orders o ON a.session_id = o.session_id
    GROUP BY a.platform, a.product_id
    ORDER BY a.platform, a.product_id
  `)) as { rows: RawSessionRow[] };

  return (rows.rows ?? [])
    .map((r) => {
      const sessionsWithAdd = r.sessionsWithAdd ?? 0;
      const sessionsConverted = r.sessionsConverted ?? 0;
      return {
        platform: r.platform ?? "unknown",
        productId: r.productId ?? "unknown",
        sessionsWithAdd,
        sessionsConverted,
        sessionConversionRatePct:
          sessionsWithAdd > 0
            ? Math.round((sessionsConverted / sessionsWithAdd) * 1000) / 10
            : null,
      };
    })
    .sort((a, b) => {
      if (a.sessionConversionRatePct == null && b.sessionConversionRatePct == null) return 0;
      if (a.sessionConversionRatePct == null) return 1;
      if (b.sessionConversionRatePct == null) return -1;
      if (b.sessionConversionRatePct !== a.sessionConversionRatePct)
        return b.sessionConversionRatePct - a.sessionConversionRatePct;
      return b.sessionsWithAdd - a.sessionsWithAdd;
    });
}

export type OrdersByPlatformDailyBucket = {
  day: string;
  platform: string;
  orders: number;
};

type RawOrderRow = {
  day: string;
  platform: string | null;
  count: number;
};

export async function loadDailyOrdersByPlatform(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<OrdersByPlatformDailyBucket[]> {
  const rows = (await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      platform: analyticsEventsTable.platform,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} = 'order_placed'`,
        gte(analyticsEventsTable.createdAt, startDayUtc),
        lt(analyticsEventsTable.createdAt, endDayUtcExclusive),
      )!,
    )
    .groupBy(
      sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`,
      analyticsEventsTable.platform,
    )) as RawOrderRow[];

  return rows.map((r) => ({
    day: r.day,
    platform: r.platform ?? "unknown",
    orders: r.count,
  }));
}

export type UpsellToOrderDailyBucket = {
  day: string;
  platform: string;
  productId: string;
  upsellAdds: number;
  ordersOnSameDay: number;
};

export type UpsellToOrderSummaryBucket = {
  platform: string;
  productId: string;
  totalUpsellAdds: number;
  daysWithAdds: number;
  daysWithAddsAndOrders: number;
  ordersOnAddDays: number;
  orderDayRatePct: number | null;
};

export function buildUpsellToOrderDaily(
  itemsDaily: UpsellItemDailyBucket[],
  ordersByDay: OrdersByPlatformDailyBucket[],
): UpsellToOrderDailyBucket[] {
  const orderMap = new Map<string, number>();
  for (const o of ordersByDay) {
    orderMap.set(`${o.platform}::${o.day}`, o.orders);
  }

  return itemsDaily
    .map((b) => ({
      day: b.day,
      platform: b.platform,
      productId: b.productId,
      upsellAdds: b.adds,
      ordersOnSameDay: orderMap.get(`${b.platform}::${b.day}`) ?? 0,
    }))
    .sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
      return b.upsellAdds - a.upsellAdds;
    });
}

export function summariseUpsellToOrder(
  daily: UpsellToOrderDailyBucket[],
): UpsellToOrderSummaryBucket[] {
  type Acc = {
    platform: string;
    productId: string;
    totalUpsellAdds: number;
    daysWithAdds: number;
    daysWithAddsAndOrders: number;
    ordersOnAddDays: number;
  };

  const map = new Map<string, Acc>();
  for (const r of daily) {
    const key = `${r.platform}::${r.productId}`;
    const existing = map.get(key);
    if (existing) {
      existing.totalUpsellAdds += r.upsellAdds;
      existing.daysWithAdds += 1;
      existing.ordersOnAddDays += r.ordersOnSameDay;
      if (r.ordersOnSameDay > 0) existing.daysWithAddsAndOrders += 1;
    } else {
      map.set(key, {
        platform: r.platform,
        productId: r.productId,
        totalUpsellAdds: r.upsellAdds,
        daysWithAdds: 1,
        daysWithAddsAndOrders: r.ordersOnSameDay > 0 ? 1 : 0,
        ordersOnAddDays: r.ordersOnSameDay,
      });
    }
  }

  return Array.from(map.values())
    .map((acc) => ({
      ...acc,
      orderDayRatePct:
        acc.daysWithAdds > 0
          ? Math.round((acc.daysWithAddsAndOrders / acc.daysWithAdds) * 1000) / 10
          : null,
    }))
    .sort((a, b) => {
      if (a.orderDayRatePct == null && b.orderDayRatePct == null) return 0;
      if (a.orderDayRatePct == null) return 1;
      if (b.orderDayRatePct == null) return -1;
      if (b.orderDayRatePct !== a.orderDayRatePct)
        return b.orderDayRatePct - a.orderDayRatePct;
      return b.totalUpsellAdds - a.totalUpsellAdds;
    });
}
