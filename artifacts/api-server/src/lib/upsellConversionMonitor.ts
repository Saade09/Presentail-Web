import {
  loadDailyUpsellItemBuckets,
  loadDailyOrdersByPlatform,
  buildUpsellToOrderDaily,
  summariseUpsellToOrder,
  type UpsellToOrderSummaryBucket,
} from "./upsellAggregator";
import { logger } from "./logger";
import { trackWorkerExecution } from "./inFlightWorkerExecutions";
import { sendAlert, type AlertField } from "./alerts";

// ── Configuration ────────────────────────────────────────────────────────────
//
// Evaluates the prior UTC day's upsell add-to-order day rate per
// (platform, productId) and compares it against a historical baseline window
// (default: the 7 days before the evaluated day). An alert fires only when a
// product was previously high-converting (baseline rate ≥ threshold) and
// drops below the threshold on the evaluated day — i.e. a genuine regression.
//
// "Order day rate" is the co-occurrence metric from upsellAggregator:
//   daysWithAddsAndOrders / daysWithAdds
// meaning: what fraction of days the product was upsell-added also saw at
// least one order_placed event on the same (platform, day).

const ENABLED = (() => {
  const raw = process.env.UPSELL_CONVERSION_MONITOR_ENABLED;
  if (raw === undefined || raw === null) {
    // Default on only when a Slack webhook is configured.
    return Boolean(process.env.ALERTS_SLACK_WEBHOOK_URL);
  }
  const v = raw.toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1 h

// Number of days before the evaluated day to use as the historical baseline.
const LOOKBACK_DAYS = (() => {
  const raw = Number(process.env.UPSELL_CONVERSION_LOOKBACK_DAYS);
  if (!Number.isFinite(raw) || raw < 1) return 7;
  return Math.floor(raw);
})();

// Minimum total upsell_item_added events over the baseline window for a
// (platform, productId) to be considered "popular enough" to monitor.
// Products below this threshold are skipped entirely to avoid noisy alerts.
const MIN_ADDS = (() => {
  const raw = Number(process.env.UPSELL_CONVERSION_MIN_ADDS);
  if (!Number.isFinite(raw) || raw <= 0) return 5;
  return Math.floor(raw);
})();

// Minimum acceptable order day rate (0–1). Products whose baseline rate
// was ≥ this threshold that fall below it on the evaluated day trigger an alert.
// Default 0.5 means: was converting on ≥50% of add-days historically, and
// is now converting on <50% of add-days (for a 1-day window this means 0 orders
// on a day when the product had adds).
const MIN_ORDER_DAY_RATE = (() => {
  const raw = Number(process.env.UPSELL_CONVERSION_MIN_ORDER_DAY_RATE);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return 0.5;
  return raw;
})();

// ── Module state ─────────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let running = false;
let lastEvaluatedDay: string | null = null;

// ── Public API ───────────────────────────────────────────────────────────────

export function startUpsellConversionMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("upsellConversionMonitor: disabled");
    return;
  }
  if (timer) return;

  startupTimer = setTimeout(() => {
    startupTimer = null;
    trackWorkerExecution("upsell-conversion", runOnce()).catch((err) => {
      logger.warn(
        { err: err?.message },
        "upsellConversionMonitor: baseline run failed",
      );
    });
  }, 60_000);
  startupTimer.unref?.();

  timer = setInterval(() => {
    trackWorkerExecution("upsell-conversion", runOnce()).catch((err) => {
      logger.warn(
        { err: err?.message },
        "upsellConversionMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    {
      tickMs: TICK_MS,
      lookbackDays: LOOKBACK_DAYS,
      minAdds: MIN_ADDS,
      minOrderDayRate: MIN_ORDER_DAY_RATE,
    },
    "upsellConversionMonitor: started",
  );
}

export function stopUpsellConversionMonitor(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runOnce(now: Date = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const evaluated = previousUtcDay(now);
    if (lastEvaluatedDay === evaluated.iso) return;

    // Baseline window: LOOKBACK_DAYS days ending just before the evaluated day.
    const baselineEnd = evaluated.start;
    const baselineStart = new Date(
      baselineEnd.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );

    // Fetch both windows in parallel to keep the tick lean.
    const [evalItems, evalOrders, baseItems, baseOrders] = await Promise.all([
      loadDailyUpsellItemBuckets(evaluated.start, evaluated.end),
      loadDailyOrdersByPlatform(evaluated.start, evaluated.end),
      loadDailyUpsellItemBuckets(baselineStart, baselineEnd),
      loadDailyOrdersByPlatform(baselineStart, baselineEnd),
    ]);

    if (baseItems.length === 0 && evalItems.length === 0) {
      lastEvaluatedDay = evaluated.iso;
      logger.info(
        { day: evaluated.iso },
        "upsellConversionMonitor: no upsell_item_added events in either window, nothing to evaluate",
      );
      return;
    }

    const evalSummary = summariseUpsellToOrder(
      buildUpsellToOrderDaily(evalItems, evalOrders),
    );
    const baseSummary = summariseUpsellToOrder(
      buildUpsellToOrderDaily(baseItems, baseOrders),
    );

    const breaches = detectDrops(baseSummary, evalSummary);

    if (breaches.length > 0) {
      await sendBreachAlert(evaluated.iso, breaches, baseSummary);
    } else {
      logger.info(
        { day: evaluated.iso, baselineProducts: baseSummary.length },
        "upsellConversionMonitor: no conversion regressions detected",
      );
    }
    lastEvaluatedDay = evaluated.iso;
  } finally {
    running = false;
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

function previousUtcDay(now: Date): { iso: string; start: Date; end: Date } {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const iso = start.toISOString().slice(0, 10);
  return { iso, start, end };
}

export type UpsellConversionBreach = {
  platform: string;
  productId: string;
  baselineRate: number;
  currentRate: number;
  baselineAdds: number;
  currentAdds: number;
};

/**
 * Compares the evaluated-day summary against the baseline-window summary and
 * returns (platform, productId) pairs that represent a genuine high→low drop:
 *
 *   1. The product must be "popular" in the baseline window
 *      (totalUpsellAdds ≥ MIN_ADDS) so low-volume noise is suppressed.
 *   2. The baseline order-day rate must be ≥ MIN_ORDER_DAY_RATE, confirming
 *      the add-on was previously high-converting.
 *   3. The evaluated-day order-day rate must be < MIN_ORDER_DAY_RATE, showing
 *      conversion has dropped below the acceptable floor.
 *
 * Products with no history in the baseline window are skipped — we can't
 * confirm they were ever high-converting. Products absent from the evaluated
 * day are treated as rate=0 (zero adds → zero daysWithAddsAndOrders).
 */
export function detectDrops(
  baseSummary: UpsellToOrderSummaryBucket[],
  evalSummary: UpsellToOrderSummaryBucket[],
): UpsellConversionBreach[] {
  // Index evaluated-day results for O(1) lookup.
  const evalIndex = new Map<string, UpsellToOrderSummaryBucket>();
  for (const b of evalSummary) {
    evalIndex.set(`${b.platform}::${b.productId}`, b);
  }

  const breaches: UpsellConversionBreach[] = [];

  for (const base of baseSummary) {
    // Skip low-volume products in the baseline — conversion rates are noisy.
    if (base.totalUpsellAdds < MIN_ADDS) continue;
    if (base.orderDayRatePct === null) continue;

    const baselineRate = base.orderDayRatePct / 100;

    // Only proceed when the product was previously high-converting.
    if (baselineRate < MIN_ORDER_DAY_RATE) continue;

    const key = `${base.platform}::${base.productId}`;
    const current = evalIndex.get(key);

    // A product with no adds today has currentRate = 0 only if it had adds
    // historically; if it had adds today, use its computed rate.
    const currentRate =
      current === undefined || current.orderDayRatePct === null
        ? 0
        : current.orderDayRatePct / 100;

    const currentAdds = current?.totalUpsellAdds ?? 0;

    // Alert only when we actually saw the product today (if there were no
    // adds at all today it's more likely a quiet day than a conversion failure;
    // ops can inspect the Slack alert to distinguish).
    if (currentAdds === 0) continue;

    if (currentRate < MIN_ORDER_DAY_RATE) {
      breaches.push({
        platform: base.platform,
        productId: base.productId,
        baselineRate,
        currentRate,
        baselineAdds: base.totalUpsellAdds,
        currentAdds,
      });
    }
  }

  return breaches;
}

async function sendBreachAlert(
  day: string,
  breaches: UpsellConversionBreach[],
  baseSummary: UpsellToOrderSummaryBucket[],
): Promise<void> {
  const qualifiedBase = baseSummary.filter((b) => b.totalUpsellAdds >= MIN_ADDS).length;

  const fields: AlertField[] = breaches.map((b) => ({
    title: `${b.platform} / product ${b.productId}`,
    value:
      `${b.currentAdds} adds today — ` +
      `today rate ${(b.currentRate * 100).toFixed(1)}% ` +
      `vs baseline ${(b.baselineRate * 100).toFixed(1)}% ` +
      `(baseline adds: ${b.baselineAdds} over ${LOOKBACK_DAYS}d, ` +
      `min: ${(MIN_ORDER_DAY_RATE * 100).toFixed(0)}%)`,
  }));

  const body =
    `${breaches.length} upsell add-on(s) dropped below the minimum order-day ` +
    `rate of ${(MIN_ORDER_DAY_RATE * 100).toFixed(0)}% on ${day} (UTC) after ` +
    `previously converting above that threshold over the prior ${LOOKBACK_DAYS} days. ` +
    `${qualifiedBase} product(s) had sufficient baseline volume.`;

  await sendAlert({
    title: "Upsell add-on conversion regression",
    body,
    severity: "warn",
    fields,
    source: "upsellConversionMonitor",
  });
}
