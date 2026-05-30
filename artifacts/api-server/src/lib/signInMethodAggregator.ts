import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";

// Per-day per-(platform, source, action) sign-in method counts.
// Aggregates two event types:
//   • `signin_page_action`           — full sign-in page (web only)
//   • `checkout_login_prompt_action` — checkout login prompt (mobile + web)
// Source values in the output:
//   • "signin_page"     — from signin_page_action
//   • "checkout_prompt" — from checkout_login_prompt_action
// Action values (as emitted by clients): google / apple / continue / guest / dismissed

export type SignInMethodDailyBucket = {
  day: string;
  platform: string;
  source: string;
  action: string;
  count: number;
};

export type SignInMethodSummaryBucket = {
  platform: string;
  source: string;
  action: string;
  count: number;
};

type RawRow = {
  day: string;
  name: string;
  platform: string | null;
  action: string | null;
  count: number;
};

export async function loadDailySignInMethodBuckets(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<SignInMethodDailyBucket[]> {
  const rows = (await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      name: sql<string>`${analyticsEventsTable.name}`,
      platform: analyticsEventsTable.platform,
      action: analyticsEventsTable.action,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} in ('signin_page_action', 'checkout_login_prompt_action')`,
        gte(analyticsEventsTable.createdAt, startDayUtc),
        lt(analyticsEventsTable.createdAt, endDayUtcExclusive),
      )!,
    )
    .groupBy(
      sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`,
      analyticsEventsTable.name,
      analyticsEventsTable.platform,
      analyticsEventsTable.action,
    )) as RawRow[];

  return rows
    .map((r) => ({
      day: r.day,
      platform: r.platform ?? "unknown",
      source: r.name === "signin_page_action" ? "signin_page" : "checkout_prompt",
      action: r.action ?? "unknown",
      count: r.count,
    }))
    .sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
      if (a.source !== b.source) return a.source < b.source ? -1 : 1;
      return a.action < b.action ? -1 : a.action > b.action ? 1 : 0;
    });
}

export function summariseSignInMethodBuckets(
  daily: SignInMethodDailyBucket[],
): SignInMethodSummaryBucket[] {
  const map = new Map<string, SignInMethodSummaryBucket>();
  for (const r of daily) {
    const key = `${r.platform}::${r.source}::${r.action}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += r.count;
    } else {
      map.set(key, {
        platform: r.platform,
        source: r.source,
        action: r.action,
        count: r.count,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    if (a.count !== b.count) return b.count - a.count;
    return a.action < b.action ? -1 : a.action > b.action ? 1 : 0;
  });
}
