import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";

// Aggregator for `auth_social_failed` analytics events. Mirrors the
// `aggregateBuckets` shape used by `checkoutLoginFunnelMonitor` /
// `checkoutPurchaseFunnelMonitor` so that the admin dashboard and any
// future Slack monitor can never disagree on the numbers.
//
// Event shape (emitted by `artifacts/presentail/services/authService.ts`):
//   name:      "auth_social_failed"
//   action:    "google" | "apple"          (provider)
//   errorCode: native SDK error code, ≤ 64 chars
//   platform:  client platform (ios / android / web / unknown)

export type SocialFailureRawRow = {
  platform: string | null;
  action: string | null;
  errorCode: string | null;
  count: number;
};

export type SocialFailureBucket = {
  platform: string;
  provider: string;
  total: number;
  // Per-error-code counts, sorted by count desc then code asc.
  errorCodes: Array<{ errorCode: string; count: number }>;
};

export type SocialFailureDailyBucket = SocialFailureBucket & { day: string };

const PROVIDERS = new Set(["google", "apple"]);
const UNKNOWN = "unknown";

/**
 * Aggregate raw rows into per-(platform, provider) buckets with a top-N
 * error-code breakdown. Pure / synchronous so tests can call it directly.
 */
export function aggregateBuckets(
  rows: SocialFailureRawRow[],
): SocialFailureBucket[] {
  const map = new Map<string, SocialFailureBucket>();
  const codeCounts = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const platform = row.platform ?? UNKNOWN;
    const providerRaw = row.action ?? UNKNOWN;
    const provider = PROVIDERS.has(providerRaw) ? providerRaw : providerRaw || UNKNOWN;
    const key = `${platform}::${provider}`;
    let b = map.get(key);
    if (!b) {
      b = { platform, provider, total: 0, errorCodes: [] };
      map.set(key, b);
      codeCounts.set(key, new Map());
    }
    b.total += row.count;
    const codes = codeCounts.get(key)!;
    const code = row.errorCode && row.errorCode.length > 0 ? row.errorCode : UNKNOWN;
    codes.set(code, (codes.get(code) ?? 0) + row.count);
  }

  for (const [key, bucket] of map) {
    const codes = codeCounts.get(key)!;
    bucket.errorCodes = Array.from(codes.entries())
      .map(([errorCode, count]) => ({ errorCode, count }))
      .sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count;
        return a.errorCode < b.errorCode ? -1 : a.errorCode > b.errorCode ? 1 : 0;
      });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
    return a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0;
  });
}

export function aggregateDailySocialFailureBuckets(
  rows: Array<SocialFailureRawRow & { day: string }>,
): SocialFailureDailyBucket[] {
  const byDay = new Map<string, SocialFailureRawRow[]>();
  for (const r of rows) {
    let arr = byDay.get(r.day);
    if (!arr) {
      arr = [];
      byDay.set(r.day, arr);
    }
    arr.push({
      platform: r.platform,
      action: r.action,
      errorCode: r.errorCode,
      count: r.count,
    });
  }
  const out: SocialFailureDailyBucket[] = [];
  for (const [day, dayRows] of byDay) {
    for (const b of aggregateBuckets(dayRows)) {
      out.push({ day, ...b });
    }
  }
  return out.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
    return a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0;
  });
}

/**
 * Load per-day per-(platform, provider) social-sign-in failure buckets for
 * the day range `[startDayUtc, endDayUtcExclusive)`.
 */
export async function loadDailySocialFailureBuckets(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<SocialFailureDailyBucket[]> {
  const rows = (await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      platform: analyticsEventsTable.platform,
      action: analyticsEventsTable.action,
      errorCode: analyticsEventsTable.errorCode,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} = 'auth_social_failed'`,
        gte(analyticsEventsTable.createdAt, startDayUtc),
        lt(analyticsEventsTable.createdAt, endDayUtcExclusive),
      )!,
    )
    .groupBy(
      sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`,
      analyticsEventsTable.platform,
      analyticsEventsTable.action,
      analyticsEventsTable.errorCode,
    )) as Array<SocialFailureRawRow & { day: string }>;

  return aggregateDailySocialFailureBuckets(rows);
}

/**
 * Roll a list of per-day buckets up into per-(platform, provider) totals
 * spanning the whole window. Top error codes are merged across days. Used
 * by the dashboard summary panel — keeps the math in one place so the
 * windowed totals can never drift away from the per-day rows.
 */
export function summariseDailyBuckets(
  daily: SocialFailureDailyBucket[],
  topErrorCodes = 5,
): SocialFailureBucket[] {
  const rows: SocialFailureRawRow[] = [];
  for (const b of daily) {
    for (const ec of b.errorCodes) {
      rows.push({
        platform: b.platform,
        action: b.provider,
        errorCode: ec.errorCode,
        count: ec.count,
      });
    }
  }
  const summary = aggregateBuckets(rows);
  for (const b of summary) {
    b.errorCodes = b.errorCodes.slice(0, topErrorCodes);
  }
  return summary;
}
