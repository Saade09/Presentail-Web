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
// Because analytics_events has no session identifier we approximate upsell→order
// conversion at the (platform, day) granularity:
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
// This is explicitly a co-occurrence / correlation metric, not a causal attribution.
// A product with a high orderDayRatePct is frequently present on days orders are
// placed; a product with a high ordersOnAddDays / totalUpsellAdds ratio implies
// many orders relative to its upsell volume.

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
