// Monitors the IP geolocation service for elevated USD fallback rates. When
// both ipapi.co and ipwho.is fail to resolve a shopper's IP to a country, the
// server silently returns USD — the same class of silent-fallback problem the
// FX monitor was built to catch, but on the currency-detection side.
//
// Each failed lookup records a `geo_currency_fallback` event in `analytics_events`.
// This monitor counts those events over the prior full UTC hour and fires a
// Slack alert when the count exceeds the configured threshold.
//
// Configuration (all optional):
//   GEO_CURRENCY_FALLBACK_MONITOR_ENABLED — "0" / "false" / "no" / "off" to disable.
//   GEO_CURRENCY_FALLBACK_COUNT_MAX       — integer ≥ 1; default 50. Alert fires when
//                                           the fallback count in the prior hour is
//                                           ≥ this value.

import { gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { trackWorkerExecution } from "./inFlightWorkerExecutions";
import { sendAlert } from "./alerts";

const ENABLED = (() => {
  const v = (process.env.GEO_CURRENCY_FALLBACK_MONITOR_ENABLED ?? "1").toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1 h

function envPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

const COUNT_MAX = envPositiveInt("GEO_CURRENCY_FALLBACK_COUNT_MAX", 50);

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let running = false;
// Track the UTC hour string of the last alert so we only fire once per hour.
let lastAlertedHour: string | null = null;

/** Reset in-process state. Only call this from tests. */
export function __resetForTest(): void {
  running = false;
  lastAlertedHour = null;
}

/** Return the UTC hour key for a given timestamp (ms). e.g. "2026-05-31T14". */
function utcHourKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 13);
}

/**
 * Count `geo_currency_fallback` events recorded in the given UTC hour window.
 * Injected as a parameter so tests can substitute a mock without hitting the DB.
 */
export type CountFallbacksFn = (startMs: number, endMs: number) => Promise<number>;

export async function defaultCountFallbacks(
  startMs: number,
  endMs: number,
): Promise<number> {
  const rows = await db
    .select({ cnt: sql<string>`count(*)` })
    .from(analyticsEventsTable)
    .where(
      sql`${analyticsEventsTable.name} = 'geo_currency_fallback'
        AND ${analyticsEventsTable.createdAt} >= ${new Date(startMs)}
        AND ${analyticsEventsTable.createdAt} < ${new Date(endMs)}`,
    );
  return Number(rows[0]?.cnt ?? 0);
}

export async function runOnce(
  countFallbacks: CountFallbacksFn = defaultCountFallbacks,
  nowMs: number = Date.now(),
): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Evaluate the prior full UTC hour.
    const hourStart = new Date(nowMs);
    hourStart.setUTCMinutes(0, 0, 0);
    const endMs = hourStart.getTime();
    const startMs = endMs - TICK_MS;

    const priorHourKey = utcHourKey(startMs);

    const count = await countFallbacks(startMs, endMs);

    if (count < COUNT_MAX) {
      logger.info(
        { count, countMax: COUNT_MAX, hour: priorHourKey },
        "geoCurrencyFallbackMonitor: fallback count below threshold",
      );
      return;
    }

    // Threshold crossed — but only alert once per UTC hour.
    if (lastAlertedHour === priorHourKey) {
      logger.info(
        { count, hour: priorHourKey },
        "geoCurrencyFallbackMonitor: already alerted for this hour",
      );
      return;
    }

    lastAlertedHour = priorHourKey;

    await sendAlert({
      title: "IP geolocation fallback rate elevated",
      body:
        `The IP geolocation service (ipapi.co + ipwho.is) failed to resolve ${count} shopper ` +
        `IP(s) to a country in the UTC hour starting ${priorHourKey}:00Z — those shoppers ` +
        `were silently shown USD prices. Check whether ipapi.co is rate-limiting or down. ` +
        `Fallback count threshold: ${COUNT_MAX}/h.`,
      severity: "warn",
      fields: [
        { title: "Fallback count", value: String(count) },
        { title: "Alert threshold", value: `${COUNT_MAX} / h` },
        { title: "UTC hour evaluated", value: `${priorHourKey}:00Z` },
      ],
      source: "geoCurrencyFallbackMonitor",
    });
  } finally {
    running = false;
  }
}

export function startGeoCurrencyFallbackMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("geoCurrencyFallbackMonitor: disabled");
    return;
  }
  if (timer) return;

  startupTimer = setTimeout(() => {
    startupTimer = null;
    trackWorkerExecution("geo-currency-fallback", runOnce()).catch((err) => {
      logger.warn(
        { err: (err as Error)?.message },
        "geoCurrencyFallbackMonitor: baseline run failed",
      );
    });
  }, 90_000);
  startupTimer.unref?.();

  timer = setInterval(() => {
    trackWorkerExecution("geo-currency-fallback", runOnce()).catch((err) => {
      logger.warn(
        { err: (err as Error)?.message },
        "geoCurrencyFallbackMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    { tickMs: TICK_MS, countMax: COUNT_MAX },
    "geoCurrencyFallbackMonitor: started",
  );
}

export function stopGeoCurrencyFallbackMonitor(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
