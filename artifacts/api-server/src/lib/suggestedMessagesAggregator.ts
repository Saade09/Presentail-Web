import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";

// Per-day per-(platform, category) pick counts for the
// `suggested_message_picked` analytics event. Reads from the shared
// `analytics_events` table the rest of the funnel monitors use, so retention
// pruning is already handled by the login monitor.

export type SuggestedMessageDailyBucket = {
  day: string;
  platform: string;
  category: string;
  count: number;
};

export type SuggestedMessageSummaryBucket = {
  platform: string;
  category: string;
  count: number;
};

type RawRow = {
  day: string;
  platform: string | null;
  action: string | null;
  count: number;
};

export async function loadDailySuggestedMessageBuckets(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<SuggestedMessageDailyBucket[]> {
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
        sql`${analyticsEventsTable.name} = 'suggested_message_picked'`,
        gte(analyticsEventsTable.createdAt, startDayUtc),
        lt(analyticsEventsTable.createdAt, endDayUtcExclusive),
      )!,
    )
    .groupBy(
      sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`,
      analyticsEventsTable.platform,
      analyticsEventsTable.action,
    )) as RawRow[];

  return rows
    .map((r) => ({
      day: r.day,
      platform: r.platform ?? "unknown",
      category: r.action ?? "unknown",
      count: r.count,
    }))
    .sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
      return a.category < b.category ? -1 : a.category > b.category ? 1 : 0;
    });
}

export function summariseSuggestedMessageBuckets(
  daily: SuggestedMessageDailyBucket[],
): SuggestedMessageSummaryBucket[] {
  const map = new Map<string, SuggestedMessageSummaryBucket>();
  for (const r of daily) {
    const key = `${r.platform}::${r.category}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += r.count;
    } else {
      map.set(key, {
        platform: r.platform,
        category: r.category,
        count: r.count,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
    if (a.count !== b.count) return b.count - a.count;
    return a.category < b.category ? -1 : a.category > b.category ? 1 : 0;
  });
}
