// Monitors Google Ads conversion ping failures recorded as `ads_conversion_ping_failed`
// analytics events by `routes/analytics.ts`. Evaluates the prior full UTC hour once
// per hour and fires a Slack alert when the failure count exceeds the configured
// threshold — giving early warning if Google changes the endpoint, the server
// loses outbound connectivity, or the conversion ID/label rotates.
//
// Configuration (all optional):
//   GOOGLE_ADS_CONVERSION_MONITOR_ENABLED — "0" / "false" / "no" / "off" to disable.
//   GOOGLE_ADS_CONVERSION_FAILURE_MAX     — integer ≥ 1; default 10. Alert fires when
//                                           the failure count in the prior hour is
//                                           ≥ this value.

import { sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert } from "./alerts";

const ENABLED = (() => {
  const v = (process.env.GOOGLE_ADS_CONVERSION_MONITOR_ENABLED ?? "1").toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1 h

function envPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

const FAILURE_MAX = envPositiveInt("GOOGLE_ADS_CONVERSION_FAILURE_MAX", 10);

let timer: NodeJS.Timeout | null = null;
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
 * Count `ads_conversion_ping_failed` events recorded in the given UTC hour window.
 * Injected as a parameter so tests can substitute a mock without hitting the DB.
 */
export type CountFailuresFn = (startMs: number, endMs: number) => Promise<number>;

export async function defaultCountFailures(
  startMs: number,
  endMs: number,
): Promise<number> {
  const rows = await db
    .select({ cnt: sql<string>`count(*)` })
    .from(analyticsEventsTable)
    .where(
      sql`${analyticsEventsTable.name} = 'ads_conversion_ping_failed'
        AND ${analyticsEventsTable.createdAt} >= ${new Date(startMs)}
        AND ${analyticsEventsTable.createdAt} < ${new Date(endMs)}`,
    );
  return Number(rows[0]?.cnt ?? 0);
}

export async function runOnce(
  countFailures: CountFailuresFn = defaultCountFailures,
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

    const count = await countFailures(startMs, endMs);

    if (count < FAILURE_MAX) {
      logger.info(
        { count, failureMax: FAILURE_MAX, hour: priorHourKey },
        "googleAdsConversionMonitor: failure count below threshold",
      );
      return;
    }

    // Threshold crossed — but only alert once per UTC hour.
    if (lastAlertedHour === priorHourKey) {
      logger.info(
        { count, hour: priorHourKey },
        "googleAdsConversionMonitor: already alerted for this hour",
      );
      return;
    }

    lastAlertedHour = priorHourKey;

    await sendAlert({
      title: "Google Ads conversion pings failing",
      body:
        `${count} Google Ads conversion ping failure(s) were recorded in the UTC hour starting ` +
        `${priorHourKey}:00Z — attribution may be broken. ` +
        `Check outbound connectivity to google.com, verify the conversion ID and label in ` +
        `routes/analytics.ts, and confirm Google has not changed the pagead/conversion endpoint. ` +
        `Failure threshold: ${FAILURE_MAX}/h.`,
      severity: "warn",
      fields: [
        { title: "Failure count", value: String(count) },
        { title: "Alert threshold", value: `${FAILURE_MAX} / h` },
        { title: "UTC hour evaluated", value: `${priorHourKey}:00Z` },
      ],
      source: "googleAdsConversionMonitor",
    });
  } finally {
    running = false;
  }
}

export function startGoogleAdsConversionMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("googleAdsConversionMonitor: disabled");
    return;
  }
  if (timer) return;

  const baseline = setTimeout(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: (err as Error)?.message },
        "googleAdsConversionMonitor: baseline run failed",
      );
    });
  }, 90_000);
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: (err as Error)?.message },
        "googleAdsConversionMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    { tickMs: TICK_MS, failureMax: FAILURE_MAX },
    "googleAdsConversionMonitor: started",
  );
}

export function stopGoogleAdsConversionMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
