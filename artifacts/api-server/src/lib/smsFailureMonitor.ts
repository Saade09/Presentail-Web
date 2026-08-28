// Monitors the `sms_notify_sent` and `sms_notify_failed` analytics events
// written by `smsNotify.ts` after each Twilio send attempt. Evaluates the
// previous full UTC day once per hour and fires a Slack alert when the
// failure rate across any (channel, storeKey) bucket exceeds the configured
// threshold.
//
// Configuration (all optional):
//   SMS_FAILURE_MONITOR_ENABLED — "0" / "false" / "no" / "off" to disable.
//   SMS_FAILURE_RATE_MAX        — 0–1 ratio; default 0.2 (20 %).
//   SMS_FAILURE_MIN_SENDS       — minimum total send attempts before the
//                                 rate check fires; default 5. Suppresses
//                                 noise from very low-volume days.

import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { trackWorkerExecution } from "./inFlightWorkerExecutions";
import { sendAlert, type AlertField } from "./alerts";

const ENABLED = (() => {
  const v = (process.env.SMS_FAILURE_MONITOR_ENABLED ?? "1").toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1 h

function envRatio(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return fallback;
  return raw;
}

function envPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

const FAILURE_RATE_MAX = envRatio("SMS_FAILURE_RATE_MAX", 0.2);
const FAILURE_MIN_SENDS = envPositiveInt("SMS_FAILURE_MIN_SENDS", 5);

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let running = false;
let lastEvaluatedDay: string | null = null;

export function startSmsFailureMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("smsFailureMonitor: disabled");
    return;
  }
  if (timer) return;

  startupTimer = setTimeout(() => {
    startupTimer = null;
    trackWorkerExecution("sms-failure", runOnce()).catch((err) => {
      logger.warn({ err: (err as Error)?.message }, "smsFailureMonitor: baseline run failed");
    });
  }, 60_000);
  startupTimer.unref?.();

  timer = setInterval(() => {
    trackWorkerExecution("sms-failure", runOnce()).catch((err) => {
      logger.warn({ err: (err as Error)?.message }, "smsFailureMonitor: tick failed");
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    { tickMs: TICK_MS, failureRateMax: FAILURE_RATE_MAX, failureMinSends: FAILURE_MIN_SENDS },
    "smsFailureMonitor: started",
  );
}

export function stopSmsFailureMonitor(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export type SmsBucket = {
  channel: string;
  storeKey: string;
  sent: number;
  failed: number;
};

// ---------------------------------------------------------------------------
// UTC day helpers
// ---------------------------------------------------------------------------

function previousUtcDay(now: Date): { iso: string; start: Date; end: Date } {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const iso = start.toISOString().slice(0, 10);
  return { iso, start, end };
}

// ---------------------------------------------------------------------------
// DB query — one row per (channel, storeKey, eventName)
// ---------------------------------------------------------------------------

type RawRow = {
  name: string;
  channel: string | null;
  storeKey: string | null;
  count: number;
};

async function loadRawRows(start: Date, end: Date): Promise<RawRow[]> {
  return (await db
    .select({
      name: analyticsEventsTable.name,
      channel: analyticsEventsTable.action,
      storeKey: analyticsEventsTable.platform,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} in ('sms_notify_sent', 'sms_notify_failed')`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(
      analyticsEventsTable.name,
      analyticsEventsTable.action,
      analyticsEventsTable.platform,
    )) as RawRow[];
}

// ---------------------------------------------------------------------------
// Shared fold helper — single source of truth for the event-name → sent/failed
// mapping. Both aggregateBuckets (used by the monitor) and loadDailySmsBuckets
// (used by the dashboard) call this, so the two views can never disagree on
// which events count as a send vs. a failure.
// ---------------------------------------------------------------------------

/**
 * Apply one raw row's count to an existing SmsBucket in-place.
 * Returns true when the row was recognised (sms_notify_sent or
 * sms_notify_failed), false otherwise (caller may choose to ignore it).
 */
function applyRowToSmsCount(bucket: SmsBucket, name: string, count: number): boolean {
  if (name === "sms_notify_sent") {
    bucket.sent += count;
    return true;
  }
  if (name === "sms_notify_failed") {
    bucket.failed += count;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Aggregate raw rows into per-(channel, storeKey) buckets
// ---------------------------------------------------------------------------

export function aggregateBuckets(rows: RawRow[]): SmsBucket[] {
  const map = new Map<string, SmsBucket>();
  for (const row of rows) {
    const channel = row.channel ?? "unknown";
    const storeKey = row.storeKey ?? "unknown";
    const key = `${channel}::${storeKey}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { channel, storeKey, sent: 0, failed: 0 };
      map.set(key, bucket);
    }
    applyRowToSmsCount(bucket, row.name, row.count);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.channel !== b.channel) return a.channel < b.channel ? -1 : 1;
    return a.storeKey < b.storeKey ? -1 : a.storeKey > b.storeKey ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Per-day bucket type and loader (used by the admin dashboard)
// ---------------------------------------------------------------------------

export type SmsDailyBucket = {
  day: string;
  channel: string;
  storeKey: string;
  sent: number;
  failed: number;
};

type DailyRawRow = {
  day: string;
  name: string;
  channel: string | null;
  storeKey: string | null;
  count: number;
};

/**
 * Load per-(day, channel, storeKey) SMS send/fail counts for the given window.
 * Calls `applyRowToSmsCount` — the same shared fold helper used by
 * `aggregateBuckets` and the monitor — so dashboard totals are guaranteed
 * identical to the values the Slack alert evaluates.
 */
export async function loadDailySmsBuckets(start: Date, end: Date): Promise<SmsDailyBucket[]> {
  const rows = (await db
    .select({
      day: sql<string>`date_trunc('day', ${analyticsEventsTable.createdAt})::date::text`,
      name: analyticsEventsTable.name,
      channel: analyticsEventsTable.action,
      storeKey: analyticsEventsTable.platform,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} in ('sms_notify_sent', 'sms_notify_failed')`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(
      sql`date_trunc('day', ${analyticsEventsTable.createdAt})::date::text`,
      analyticsEventsTable.name,
      analyticsEventsTable.action,
      analyticsEventsTable.platform,
    )) as DailyRawRow[];

  // Re-use applyRowToSmsCount (same helper as aggregateBuckets) so the
  // event-name → sent/failed mapping is defined in exactly one place.
  const map = new Map<string, SmsDailyBucket>();
  for (const row of rows) {
    const day = String(row.day).slice(0, 10);
    const channel = row.channel ?? "unknown";
    const storeKey = row.storeKey ?? "unknown";
    const key = `${day}::${channel}::${storeKey}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { day, channel, storeKey, sent: 0, failed: 0 };
      map.set(key, bucket);
    }
    applyRowToSmsCount(bucket, row.name, row.count);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? -1 : 1;
    if (a.channel !== b.channel) return a.channel < b.channel ? -1 : 1;
    return a.storeKey < b.storeKey ? -1 : a.storeKey > b.storeKey ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Evaluate buckets — returns breaching ones
// ---------------------------------------------------------------------------

export type SmsBreach = {
  bucket: SmsBucket;
  failureRate: number;
  reason: string;
};

export function evaluateBuckets(buckets: SmsBucket[]): SmsBreach[] {
  const breaches: SmsBreach[] = [];
  for (const b of buckets) {
    const total = b.sent + b.failed;
    if (total < FAILURE_MIN_SENDS) continue;
    const rate = total > 0 ? b.failed / total : 0;
    if (rate > FAILURE_RATE_MAX) {
      breaches.push({
        bucket: b,
        failureRate: rate,
        reason: `failure-rate ${(rate * 100).toFixed(1)}% > ${(FAILURE_RATE_MAX * 100).toFixed(0)}%`,
      });
    }
  }
  return breaches;
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

async function sendBreachAlert(day: string, breaches: SmsBreach[]): Promise<void> {
  const fields: AlertField[] = breaches.map(({ bucket, failureRate, reason }) => ({
    title: `${bucket.channel} / ${bucket.storeKey}`,
    value:
      `sent ${bucket.sent}, failed ${bucket.failed} (${(failureRate * 100).toFixed(1)}%) — ${reason}`,
  }));

  const body =
    `SMS delivery failure check tripped on ${day} (UTC). ` +
    `${breaches.length} (channel, store) bucket(s) exceeded the ${(FAILURE_RATE_MAX * 100).toFixed(0)}% threshold. ` +
    `Check Twilio credentials, TWILIO_FROM_* sender overrides, and recent order-event push logs.`;

  await sendAlert({
    title: "SMS delivery failures spiking",
    body,
    severity: "warn",
    fields,
    source: "smsFailureMonitor",
  });
}

// ---------------------------------------------------------------------------
// Main evaluation loop
// ---------------------------------------------------------------------------

export async function runOnce(now: Date = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const day = previousUtcDay(now);
    if (lastEvaluatedDay === day.iso) return;

    const rows = await loadRawRows(day.start, day.end);
    const buckets = aggregateBuckets(rows);

    if (buckets.length === 0) {
      lastEvaluatedDay = day.iso;
      logger.info({ day: day.iso }, "smsFailureMonitor: no SMS attempts for day, nothing to evaluate");
      return;
    }

    const breaches = evaluateBuckets(buckets);
    if (breaches.length > 0) {
      await sendBreachAlert(day.iso, breaches);
    } else {
      logger.info(
        { day: day.iso, buckets: buckets.length },
        "smsFailureMonitor: all buckets within band",
      );
    }
    lastEvaluatedDay = day.iso;
  } finally {
    running = false;
  }
}
