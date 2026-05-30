// Monitors the FX rate service for sustained live-rate failures. When the
// open.er-api.com fetch fails, `lib/fx.ts` silently falls back to embedded
// static rates — shoppers keep seeing prices, but those prices may drift from
// the live mid-market rates for hours without anyone noticing.
//
// `lib/fx.ts` caps live-rate retries to once every 5 minutes (FALLBACK_RETRY_MS)
// so `consecutiveFailures` measures retry cycles, not request volume. A single
// alert fires per failure run; recovery (any refresh cycle returning live data)
// resets the counter so the next failure sequence triggers a fresh alert.
//
// Configuration (all optional):
//   FX_FALLBACK_MONITOR_ENABLED          — "0" / "false" / "no" / "off" to disable.
//   FX_FALLBACK_CONSECUTIVE_FAILURES_MAX — integer ≥ 1; default 12 (≈ 1 h at a
//                                          5-min retry cadence). Alert fires when
//                                          consecutiveFailures ≥ this value.

import { logger } from "./logger";
import { sendAlert } from "./alerts";
import { getFxStatus } from "./fx";

const ENABLED = (() => {
  const v = (process.env.FX_FALLBACK_MONITOR_ENABLED ?? "1").toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1 h

function envPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

// Default: 12 consecutive retry cycles → alert (12 × 5-min retry = ~1 h of
// failed live-rate fetches before Slack fires).
const CONSECUTIVE_MAX = envPositiveInt("FX_FALLBACK_CONSECUTIVE_FAILURES_MAX", 12);

let timer: NodeJS.Timeout | null = null;
let running = false;
// Track the consecutiveFailures value at the time of the last alert so we
// only fire once per failure run, not on every hourly tick while it persists.
let lastAlertedAt: number | null = null;

export function startFxRatesFallbackMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("fxRatesFallbackMonitor: disabled");
    return;
  }
  if (timer) return;

  const baseline = setTimeout(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: (err as Error)?.message },
        "fxRatesFallbackMonitor: baseline run failed",
      );
    });
  }, 60_000);
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: (err as Error)?.message },
        "fxRatesFallbackMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    { tickMs: TICK_MS, consecutiveMax: CONSECUTIVE_MAX },
    "fxRatesFallbackMonitor: started",
  );
}

export function stopFxRatesFallbackMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const status = getFxStatus();

    // Reset alert state when live rates have recovered.
    if (status.source === "live") {
      if (lastAlertedAt !== null) {
        logger.info(
          { consecutiveFailures: status.consecutiveFailures },
          "fxRatesFallbackMonitor: live rates recovered",
        );
        lastAlertedAt = null;
      }
      return;
    }

    // source === "fallback"
    const { consecutiveFailures, lastLiveAt } = status;
    if (consecutiveFailures < CONSECUTIVE_MAX) {
      logger.info(
        { consecutiveFailures, consecutiveMax: CONSECUTIVE_MAX },
        "fxRatesFallbackMonitor: fallback active but below alert threshold",
      );
      return;
    }

    // Threshold crossed — but only alert once per failure run.
    if (lastAlertedAt !== null) {
      logger.info(
        { consecutiveFailures, lastAlertedAt },
        "fxRatesFallbackMonitor: still in fallback, alert already sent for this run",
      );
      return;
    }

    lastAlertedAt = Date.now();

    // Use lastLiveAt (timestamp of the last successful live fetch) for an
    // accurate "stale since" duration. If live rates were never fetched in this
    // process lifetime (lastLiveAt === 0), fall back to using the time of the
    // first observed fallback fetch (fetchedAt at cycle 1 is unavailable, so we
    // approximate with consecutiveFailures × FALLBACK_RETRY_MS).
    const FALLBACK_RETRY_MS = 5 * 60 * 1000;
    const staleSinceMs =
      lastLiveAt > 0
        ? Date.now() - lastLiveAt
        : consecutiveFailures * FALLBACK_RETRY_MS;
    const staleSinceH = (staleSinceMs / (60 * 60 * 1000)).toFixed(1);
    const lastLiveStr =
      lastLiveAt > 0
        ? new Date(lastLiveAt).toISOString()
        : "never in this process";

    await sendAlert({
      title: "FX rates stuck on fallback",
      body:
        `The live FX rate fetch from open.er-api.com has failed ${consecutiveFailures} consecutive ` +
        `retry cycle(s) — shoppers have been seeing static embedded rates for ≈${staleSinceH} h. ` +
        `Check network egress / open.er-api.com status. Prices remain functional but may ` +
        `drift from the live mid-market rate until the service recovers.`,
      severity: "warn",
      fields: [
        { title: "Consecutive failure cycles", value: String(consecutiveFailures) },
        { title: "Last live fetch", value: lastLiveStr },
        { title: "Stale since (approx)", value: `${staleSinceH} h` },
        { title: "Alert threshold", value: `${CONSECUTIVE_MAX} cycles` },
      ],
      source: "fxRatesFallbackMonitor",
    });
  } finally {
    running = false;
  }
}
