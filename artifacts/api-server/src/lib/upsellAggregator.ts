import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";

// Aggregates the three upsell-modal analytics events:
//   upsell_tab_clicked  — shopper clicked a tab; `action` = tab name
//   upsell_item_added   — shopper added an item; `action` = tab name, `productId` = id
//   upsell_checkout_proceeded — shopper tapped "proceed to checkout" from the modal
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
