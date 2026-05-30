// Aggregates `order_push_tapped` analytics events into per-(day, state,
// platform) tap counts for the admin funnels dashboard.
//
// The `state` column is sourced from the server-controlled push payload
// (e.g. `out_for_delivery`, `delivered`) so it can be grouped meaningfully.
// Events where state is NULL are grouped under "(unknown)".
//
// Note: tap-through rate (taps / pushes sent) is not currently computable
// here because push sends are not persisted as analytics events. Tap counts
// alone are useful for comparing engagement across order states.

import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrderPushTapDailyBucket = {
  day: string;
  state: string;
  platform: string;
  taps: number;
};

// ---------------------------------------------------------------------------
// DB query
// ---------------------------------------------------------------------------

type RawRow = {
  day: string;
  state: string | null;
  platform: string | null;
  count: number;
};

export async function loadDailyOrderPushTapBuckets(
  start: Date,
  end: Date,
): Promise<OrderPushTapDailyBucket[]> {
  const rows = (await db
    .select({
      day: sql<string>`date_trunc('day', ${analyticsEventsTable.createdAt})::date::text`,
      state: analyticsEventsTable.state,
      platform: analyticsEventsTable.platform,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} = 'order_push_tapped'`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(
      sql`date_trunc('day', ${analyticsEventsTable.createdAt})::date::text`,
      analyticsEventsTable.state,
      analyticsEventsTable.platform,
    )) as RawRow[];

  return rows
    .map((r) => ({
      day: String(r.day).slice(0, 10),
      state: r.state ?? "(unknown)",
      platform: r.platform ?? "(unknown)",
      taps: r.count,
    }))
    .sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? -1 : 1;
      if (a.state !== b.state) return a.state < b.state ? -1 : 1;
      return a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : 0;
    });
}
