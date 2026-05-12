import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert, type AlertField } from "./alerts";

// ── Configuration ──────────────────────────────────────────────────────────

const ENABLED = (() => {
  const v = (
    process.env.CHECKOUT_LOGIN_FUNNEL_MONITOR_ENABLED ?? "1"
  ).toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

// How often to wake up and look for the previous full UTC day. A short tick
// ensures we still alert if the server boots after midnight UTC.
const TICK_MS = 60 * 60 * 1000; // 1h

// Don't bother alerting on tiny samples; ratios are noisy below this.
const MIN_VIEWED = (() => {
  const raw = Number(process.env.CHECKOUT_LOGIN_MIN_VIEWED);
  if (!Number.isFinite(raw) || raw <= 0) return 25;
  return Math.floor(raw);
})();

// Agreed bands (overridable via env). Out-of-band ⇒ alert.
function envRatio(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return fallback;
  return raw;
}
const GUEST_RATE_MAX = envRatio("CHECKOUT_LOGIN_GUEST_RATE_MAX", 0.7);
const SIGNIN_RATE_MIN = envRatio("CHECKOUT_LOGIN_SIGNIN_RATE_MIN", 0.1);
const DISMISS_RATE_MAX = envRatio("CHECKOUT_LOGIN_DISMISS_RATE_MAX", 0.5);

// Retain ~30 days of raw events, then prune.
const RETENTION_DAYS = 30;

// ── Module state ───────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let running = false;
// Tracks the last UTC date (YYYY-MM-DD) we've already evaluated, so we don't
// re-alert every hour. Resets on process restart, which is acceptable: the
// alerting is idempotent and Slack is fine with a duplicate on cold boot.
let lastEvaluatedDay: string | null = null;

// ── Public API ─────────────────────────────────────────────────────────────

export function startCheckoutLoginFunnelMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("checkoutLoginFunnelMonitor: disabled");
    return;
  }
  if (timer) return;

  // First check shortly after startup so we don't wait an hour on a cold
  // boot that happens just after midnight UTC.
  const baseline = setTimeout(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "checkoutLoginFunnelMonitor: baseline run failed",
      );
    });
  }, 60_000);
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "checkoutLoginFunnelMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    {
      tickMs: TICK_MS,
      minViewed: MIN_VIEWED,
      guestRateMax: GUEST_RATE_MAX,
      signinRateMin: SIGNIN_RATE_MIN,
      dismissRateMax: DISMISS_RATE_MAX,
    },
    "checkoutLoginFunnelMonitor: started",
  );
}

export function stopCheckoutLoginFunnelMonitor(): void {
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
      lastEvaluatedDay = day.iso;
      logger.info(
        { day: day.iso },
        "checkoutLoginFunnelMonitor: no events for day, nothing to evaluate",
      );
    } else {
      const breaches = evaluateBuckets(buckets);
      if (breaches.length > 0) {
        await sendBreachAlert(day.iso, breaches, buckets);
      } else {
        logger.info(
          { day: day.iso, buckets: buckets.length },
          "checkoutLoginFunnelMonitor: all funnel ratios within band",
        );
      }
      lastEvaluatedDay = day.iso;
    }

    await pruneOldEvents(now);
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

export type FunnelBucket = {
  platform: string;
  surface: string;
  viewed: number;
  guest: number;
  signin: number; // continue + google + apple
  dismissed: number;
  other: number;
};

type RawRow = {
  name: string;
  platform: string | null;
  surface: string | null;
  action: string | null;
  count: number;
};

async function loadBuckets(start: Date, end: Date): Promise<FunnelBucket[]> {
  const rows = (await db
    .select({
      name: analyticsEventsTable.name,
      platform: analyticsEventsTable.platform,
      surface: analyticsEventsTable.surface,
      action: analyticsEventsTable.action,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} in ('checkout_login_prompt_viewed', 'checkout_login_prompt_action')`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(
      analyticsEventsTable.name,
      analyticsEventsTable.platform,
      analyticsEventsTable.surface,
      analyticsEventsTable.action,
    )) as RawRow[];

  return aggregateBuckets(rows);
}

export type LoginDailyBucket = FunnelBucket & { day: string };

/**
 * Load per-day per-(platform, surface) login-prompt funnel buckets for the
 * day range `[startDayUtc, endDayUtcExclusive)`. Shares the aggregator with
 * the alerting monitor so the dashboard view stays consistent.
 */
export async function loadDailyLoginBuckets(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<LoginDailyBucket[]> {
  const rows = (await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      name: analyticsEventsTable.name,
      platform: analyticsEventsTable.platform,
      surface: analyticsEventsTable.surface,
      action: analyticsEventsTable.action,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} in ('checkout_login_prompt_viewed', 'checkout_login_prompt_action')`,
        gte(analyticsEventsTable.createdAt, startDayUtc),
        lt(analyticsEventsTable.createdAt, endDayUtcExclusive),
      )!,
    )
    .groupBy(
      sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`,
      analyticsEventsTable.name,
      analyticsEventsTable.platform,
      analyticsEventsTable.surface,
      analyticsEventsTable.action,
    )) as Array<RawRow & { day: string }>;

  return aggregateDailyLoginBuckets(rows);
}

export function aggregateDailyLoginBuckets(
  rows: Array<RawRow & { day: string }>,
): LoginDailyBucket[] {
  const byDay = new Map<string, RawRow[]>();
  for (const r of rows) {
    let arr = byDay.get(r.day);
    if (!arr) {
      arr = [];
      byDay.set(r.day, arr);
    }
    arr.push({
      name: r.name,
      platform: r.platform,
      surface: r.surface,
      action: r.action,
      count: r.count,
    });
  }
  const out: LoginDailyBucket[] = [];
  for (const [day, dayRows] of byDay) {
    for (const b of aggregateBuckets(dayRows)) {
      out.push({ day, ...b });
    }
  }
  return out.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
    return a.surface < b.surface ? -1 : a.surface > b.surface ? 1 : 0;
  });
}

export function aggregateBuckets(rows: RawRow[]): FunnelBucket[] {
  const map = new Map<string, FunnelBucket>();
  const get = (platform: string, surface: string): FunnelBucket => {
    const key = `${platform}::${surface}`;
    let b = map.get(key);
    if (!b) {
      b = {
        platform,
        surface,
        viewed: 0,
        guest: 0,
        signin: 0,
        dismissed: 0,
        other: 0,
      };
      map.set(key, b);
    }
    return b;
  };

  for (const row of rows) {
    const platform = row.platform ?? "unknown";
    const surface = row.surface ?? "unknown";
    const b = get(platform, surface);
    if (row.name === "checkout_login_prompt_viewed") {
      b.viewed += row.count;
      continue;
    }
    // checkout_login_prompt_action
    switch (row.action) {
      case "guest":
        b.guest += row.count;
        break;
      case "dismissed":
        b.dismissed += row.count;
        break;
      case "continue":
      case "google":
      case "apple":
        b.signin += row.count;
        break;
      default:
        b.other += row.count;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
    return a.surface < b.surface ? -1 : a.surface > b.surface ? 1 : 0;
  });
}

export type FunnelBreach = {
  bucket: FunnelBucket;
  reasons: string[];
};

export function evaluateBuckets(buckets: FunnelBucket[]): FunnelBreach[] {
  const breaches: FunnelBreach[] = [];
  for (const b of buckets) {
    if (b.viewed < MIN_VIEWED) continue;
    const reasons: string[] = [];
    const guestRate = b.guest / b.viewed;
    const signinRate = b.signin / b.viewed;
    const dismissRate = b.dismissed / b.viewed;
    if (guestRate > GUEST_RATE_MAX) {
      reasons.push(
        `guest-rate ${(guestRate * 100).toFixed(1)}% > ${(
          GUEST_RATE_MAX * 100
        ).toFixed(0)}%`,
      );
    }
    if (signinRate < SIGNIN_RATE_MIN) {
      reasons.push(
        `sign-in rate ${(signinRate * 100).toFixed(1)}% < ${(
          SIGNIN_RATE_MIN * 100
        ).toFixed(0)}%`,
      );
    }
    if (dismissRate > DISMISS_RATE_MAX) {
      reasons.push(
        `dismiss-rate ${(dismissRate * 100).toFixed(1)}% > ${(
          DISMISS_RATE_MAX * 100
        ).toFixed(0)}%`,
      );
    }
    if (reasons.length > 0) breaches.push({ bucket: b, reasons });
  }
  return breaches;
}

async function sendBreachAlert(
  day: string,
  breaches: FunnelBreach[],
  allBuckets: FunnelBucket[],
): Promise<void> {
  const fields: AlertField[] = breaches.map(({ bucket, reasons }) => ({
    title: `${bucket.platform} / ${bucket.surface}`,
    value: `viewed ${bucket.viewed}, sign-in ${bucket.signin}, guest ${bucket.guest}, dismissed ${bucket.dismissed} → ${reasons.join("; ")}`,
  }));

  const body = `Checkout login prompt funnel moved outside the agreed band on ${day} (UTC). ${breaches.length} bucket(s) breached out of ${allBuckets.length} active.`;

  await sendAlert({
    title: "Checkout login funnel regression",
    body,
    severity: "warn",
    fields,
    source: "checkoutLoginFunnelMonitor",
  });
}

async function pruneOldEvents(now: Date): Promise<void> {
  const cutoff = new Date(
    now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  try {
    await db
      .delete(analyticsEventsTable)
      .where(lt(analyticsEventsTable.createdAt, cutoff));
  } catch (err: any) {
    logger.warn(
      { err: err?.message },
      "checkoutLoginFunnelMonitor: prune failed",
    );
  }
}
