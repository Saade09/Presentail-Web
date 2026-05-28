import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert, type AlertField } from "./alerts";

// ── Configuration ──────────────────────────────────────────────────────────
//
// Hourly monitor that evaluates the previous UTC day's upsell funnel per
// platform and fires a Slack alert when either the item-add rate or the
// checkout-proceeded count collapses below configurable thresholds.
//
// The three upsell events tracked:
//   upsell_tab_clicked      — shopper opened/clicked a upsell tab
//   upsell_item_added       — shopper added a suggested item
//   upsell_checkout_proceeded — shopper tapped "proceed to checkout"
//
// Metrics monitored per platform:
//   itemAddRate   = upsell_item_added / upsell_tab_clicked
//   checkoutProceededCount = raw upsell_checkout_proceeded count
//
// We skip a platform when tab clicks are below MIN_TAB_CLICKS (low traffic).
// Only the checkout-proceeded count has its own minimum-sample guard:
// CHECKOUT_PROCEEDED_MIN is an absolute floor, not a rate.

const ENABLED = (() => {
  const v = (process.env.UPSELL_FUNNEL_MONITOR_ENABLED ?? "1").toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1h

// Don't evaluate platforms with fewer than this many tab clicks. Step-to-step
// ratios are noisy below this.
const MIN_TAB_CLICKS = (() => {
  const raw = Number(process.env.UPSELL_FUNNEL_MIN_TAB_CLICKS);
  if (!Number.isFinite(raw) || raw <= 0) return 20;
  return Math.floor(raw);
})();

function envRatio(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return fallback;
  return raw;
}

// Minimum acceptable item-add rate (adds / tab clicks). Anything below ⇒ alert.
const ITEM_ADD_RATE_MIN = envRatio("UPSELL_FUNNEL_ITEM_ADD_RATE_MIN", 0.1);

// Minimum absolute checkout-proceeded count. Zero-or-near-zero on a day with
// enough tab clicks is a strong signal the "proceed" CTA is broken.
const CHECKOUT_PROCEEDED_MIN = (() => {
  const raw = Number(process.env.UPSELL_FUNNEL_CHECKOUT_PROCEEDED_MIN);
  if (!Number.isFinite(raw) || raw < 0) return 5;
  return Math.floor(raw);
})();

// ── Module state ───────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastEvaluatedDay: string | null = null;

// ── Public API ─────────────────────────────────────────────────────────────

export function startUpsellFunnelMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("upsellFunnelMonitor: disabled");
    return;
  }
  if (timer) return;

  const baseline = setTimeout(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "upsellFunnelMonitor: baseline run failed",
      );
    });
  }, 60_000);
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "upsellFunnelMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    {
      tickMs: TICK_MS,
      minTabClicks: MIN_TAB_CLICKS,
      itemAddRateMin: ITEM_ADD_RATE_MIN,
      checkoutProceededMin: CHECKOUT_PROCEEDED_MIN,
    },
    "upsellFunnelMonitor: started",
  );
}

export function stopUpsellFunnelMonitor(): void {
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
        "upsellFunnelMonitor: no upsell events for day, nothing to evaluate",
      );
      return;
    }

    const breaches = evaluateBuckets(buckets);
    if (breaches.length > 0) {
      await sendBreachAlert(day.iso, breaches, buckets);
    } else {
      logger.info(
        { day: day.iso, buckets: buckets.length },
        "upsellFunnelMonitor: all upsell metrics within band",
      );
    }
    lastEvaluatedDay = day.iso;
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

export type UpsellFunnelBucket = {
  platform: string;
  tabClicks: number;
  itemAdds: number;
  checkoutProceeded: number;
};

type RawRow = {
  name: string;
  platform: string | null;
  count: number;
};

const UPSELL_EVENT_NAMES = [
  "upsell_tab_clicked",
  "upsell_item_added",
  "upsell_checkout_proceeded",
] as const;

async function loadBuckets(
  start: Date,
  end: Date,
): Promise<UpsellFunnelBucket[]> {
  const rows = (await db
    .select({
      name: analyticsEventsTable.name,
      platform: analyticsEventsTable.platform,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} in ('upsell_tab_clicked', 'upsell_item_added', 'upsell_checkout_proceeded')`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(
      analyticsEventsTable.name,
      analyticsEventsTable.platform,
    )) as RawRow[];

  return aggregateBuckets(rows);
}

export function aggregateBuckets(rows: RawRow[]): UpsellFunnelBucket[] {
  const map = new Map<string, UpsellFunnelBucket>();
  const get = (platform: string): UpsellFunnelBucket => {
    let b = map.get(platform);
    if (!b) {
      b = { platform, tabClicks: 0, itemAdds: 0, checkoutProceeded: 0 };
      map.set(platform, b);
    }
    return b;
  };

  for (const row of rows) {
    if (!(UPSELL_EVENT_NAMES as readonly string[]).includes(row.name)) continue;
    const b = get(row.platform ?? "unknown");
    switch (row.name) {
      case "upsell_tab_clicked":
        b.tabClicks += row.count;
        break;
      case "upsell_item_added":
        b.itemAdds += row.count;
        break;
      case "upsell_checkout_proceeded":
        b.checkoutProceeded += row.count;
        break;
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : 0,
  );
}

export type UpsellFunnelBreach = {
  bucket: UpsellFunnelBucket;
  reasons: string[];
};

export function evaluateBuckets(
  buckets: UpsellFunnelBucket[],
): UpsellFunnelBreach[] {
  const breaches: UpsellFunnelBreach[] = [];
  for (const b of buckets) {
    // Skip low-traffic platforms so we don't alert on noise.
    if (b.tabClicks < MIN_TAB_CLICKS) continue;
    const reasons: string[] = [];

    const addRate = b.tabClicks > 0 ? b.itemAdds / b.tabClicks : 0;
    if (addRate < ITEM_ADD_RATE_MIN) {
      reasons.push(
        `item-add rate ${(addRate * 100).toFixed(1)}% < ${(ITEM_ADD_RATE_MIN * 100).toFixed(0)}%` +
          ` (${b.itemAdds} adds / ${b.tabClicks} tab clicks)`,
      );
    }

    if (b.checkoutProceeded < CHECKOUT_PROCEEDED_MIN) {
      reasons.push(
        `checkout-proceeded count ${b.checkoutProceeded} < ${CHECKOUT_PROCEEDED_MIN}`,
      );
    }

    if (reasons.length > 0) breaches.push({ bucket: b, reasons });
  }
  return breaches;
}

async function sendBreachAlert(
  day: string,
  breaches: UpsellFunnelBreach[],
  allBuckets: UpsellFunnelBucket[],
): Promise<void> {
  const fields: AlertField[] = breaches.map(({ bucket, reasons }) => ({
    title: bucket.platform,
    value:
      `tab clicks ${bucket.tabClicks}, adds ${bucket.itemAdds}, ` +
      `checkout-proceeded ${bucket.checkoutProceeded} → ` +
      reasons.join("; "),
  }));

  const body =
    `Upsell conversion collapsed on ${day} (UTC). ` +
    `${breaches.length} platform(s) breached out of ${allBuckets.length} active.`;

  await sendAlert({
    title: "Upsell funnel regression",
    body,
    severity: "warn",
    fields,
    source: "upsellFunnelMonitor",
  });
}
