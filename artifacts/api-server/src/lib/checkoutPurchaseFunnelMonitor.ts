import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert, type AlertField } from "./alerts";

// ── Configuration ──────────────────────────────────────────────────────────
//
// This is the sibling of `checkoutLoginFunnelMonitor` that watches the
// broader purchase funnel:
//
//   cart_viewed → checkout_started → payment_method_selected → order_placed
//
// We compute step-to-step conversion per platform and alert when any
// single step collapses below an agreed minimum. Pruning of the
// underlying analytics_events table is handled by the login monitor;
// no need to duplicate it here.

const ENABLED = (() => {
  const v = (
    process.env.CHECKOUT_PURCHASE_FUNNEL_MONITOR_ENABLED ?? "1"
  ).toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1h

// Don't alert on tiny samples; step-to-step ratios are noisy below this.
const MIN_CART_VIEWED = (() => {
  const raw = Number(process.env.CHECKOUT_PURCHASE_MIN_CART_VIEWED);
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.floor(raw);
})();

function envRatio(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return fallback;
  return raw;
}

// Minimum acceptable step-to-step conversion. Anything below ⇒ alert.
// Defaults reflect "the funnel is leaking heavily" rather than "looks
// normal", so we don't page on healthy day-to-day variance.
const CART_TO_CHECKOUT_MIN = envRatio(
  "CHECKOUT_PURCHASE_CART_TO_CHECKOUT_MIN",
  0.15,
);
const CHECKOUT_TO_PAYMENT_MIN = envRatio(
  "CHECKOUT_PURCHASE_CHECKOUT_TO_PAYMENT_MIN",
  0.4,
);
const PAYMENT_TO_ORDER_MIN = envRatio(
  "CHECKOUT_PURCHASE_PAYMENT_TO_ORDER_MIN",
  0.3,
);

const FUNNEL_EVENT_NAMES = [
  "cart_viewed",
  "checkout_started",
  "payment_method_selected",
  "order_placed",
] as const;

type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

// ── Module state ───────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastEvaluatedDay: string | null = null;

// ── Public API ─────────────────────────────────────────────────────────────

export function startCheckoutPurchaseFunnelMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("checkoutPurchaseFunnelMonitor: disabled");
    return;
  }
  if (timer) return;

  const baseline = setTimeout(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "checkoutPurchaseFunnelMonitor: baseline run failed",
      );
    });
  }, 60_000);
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "checkoutPurchaseFunnelMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    {
      tickMs: TICK_MS,
      minCartViewed: MIN_CART_VIEWED,
      cartToCheckoutMin: CART_TO_CHECKOUT_MIN,
      checkoutToPaymentMin: CHECKOUT_TO_PAYMENT_MIN,
      paymentToOrderMin: PAYMENT_TO_ORDER_MIN,
    },
    "checkoutPurchaseFunnelMonitor: started",
  );
}

export function stopCheckoutPurchaseFunnelMonitor(): void {
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
        "checkoutPurchaseFunnelMonitor: no events for day, nothing to evaluate",
      );
      return;
    }

    const breaches = evaluateBuckets(buckets);
    if (breaches.length > 0) {
      await sendBreachAlert(day.iso, breaches, buckets);
    } else {
      logger.info(
        { day: day.iso, buckets: buckets.length },
        "checkoutPurchaseFunnelMonitor: all step conversions within band",
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

export type PurchaseFunnelBucket = {
  platform: string;
  cartViewed: number;
  checkoutStarted: number;
  paymentMethodSelected: number;
  orderPlaced: number;
};

type RawRow = {
  name: string;
  platform: string | null;
  count: number;
};

async function loadBuckets(
  start: Date,
  end: Date,
): Promise<PurchaseFunnelBucket[]> {
  const rows = (await db
    .select({
      name: analyticsEventsTable.name,
      platform: analyticsEventsTable.platform,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} in ('cart_viewed', 'checkout_started', 'payment_method_selected', 'order_placed')`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(analyticsEventsTable.name, analyticsEventsTable.platform)) as RawRow[];

  return aggregateBuckets(rows);
}

export function aggregateBuckets(rows: RawRow[]): PurchaseFunnelBucket[] {
  const map = new Map<string, PurchaseFunnelBucket>();
  const get = (platform: string): PurchaseFunnelBucket => {
    let b = map.get(platform);
    if (!b) {
      b = {
        platform,
        cartViewed: 0,
        checkoutStarted: 0,
        paymentMethodSelected: 0,
        orderPlaced: 0,
      };
      map.set(platform, b);
    }
    return b;
  };

  for (const row of rows) {
    if (!isFunnelEvent(row.name)) continue;
    const b = get(row.platform ?? "unknown");
    switch (row.name) {
      case "cart_viewed":
        b.cartViewed += row.count;
        break;
      case "checkout_started":
        b.checkoutStarted += row.count;
        break;
      case "payment_method_selected":
        b.paymentMethodSelected += row.count;
        break;
      case "order_placed":
        b.orderPlaced += row.count;
        break;
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : 0,
  );
}

function isFunnelEvent(name: string): name is FunnelEventName {
  return (FUNNEL_EVENT_NAMES as readonly string[]).includes(name);
}

export type PurchaseFunnelBreach = {
  bucket: PurchaseFunnelBucket;
  reasons: string[];
};

export function evaluateBuckets(
  buckets: PurchaseFunnelBucket[],
): PurchaseFunnelBreach[] {
  const breaches: PurchaseFunnelBreach[] = [];
  for (const b of buckets) {
    if (b.cartViewed < MIN_CART_VIEWED) continue;
    const reasons: string[] = [];

    const cartToCheckout = b.cartViewed > 0 ? b.checkoutStarted / b.cartViewed : 0;
    if (cartToCheckout < CART_TO_CHECKOUT_MIN) {
      reasons.push(
        `cart→checkout ${(cartToCheckout * 100).toFixed(1)}% < ${(
          CART_TO_CHECKOUT_MIN * 100
        ).toFixed(0)}%`,
      );
    }

    // Only evaluate downstream steps when the upstream step has a sample
    // worth dividing by — otherwise a small denominator inflates noise.
    if (b.checkoutStarted >= Math.ceil(MIN_CART_VIEWED * CART_TO_CHECKOUT_MIN)) {
      const checkoutToPayment = b.paymentMethodSelected / b.checkoutStarted;
      if (checkoutToPayment < CHECKOUT_TO_PAYMENT_MIN) {
        reasons.push(
          `checkout→payment ${(checkoutToPayment * 100).toFixed(1)}% < ${(
            CHECKOUT_TO_PAYMENT_MIN * 100
          ).toFixed(0)}%`,
        );
      }
    }

    if (
      b.paymentMethodSelected >=
      Math.ceil(
        MIN_CART_VIEWED * CART_TO_CHECKOUT_MIN * CHECKOUT_TO_PAYMENT_MIN,
      )
    ) {
      const paymentToOrder = b.orderPlaced / b.paymentMethodSelected;
      if (paymentToOrder < PAYMENT_TO_ORDER_MIN) {
        reasons.push(
          `payment→order ${(paymentToOrder * 100).toFixed(1)}% < ${(
            PAYMENT_TO_ORDER_MIN * 100
          ).toFixed(0)}%`,
        );
      }
    }

    if (reasons.length > 0) breaches.push({ bucket: b, reasons });
  }
  return breaches;
}

async function sendBreachAlert(
  day: string,
  breaches: PurchaseFunnelBreach[],
  allBuckets: PurchaseFunnelBucket[],
): Promise<void> {
  const fields: AlertField[] = breaches.map(({ bucket, reasons }) => ({
    title: bucket.platform,
    value:
      `cart ${bucket.cartViewed}, checkout ${bucket.checkoutStarted}, ` +
      `payment ${bucket.paymentMethodSelected}, orders ${bucket.orderPlaced} → ` +
      reasons.join("; "),
  }));

  const body = `Purchase funnel collapsed at one or more steps on ${day} (UTC). ${breaches.length} platform(s) breached out of ${allBuckets.length} active.`;

  await sendAlert({
    title: "Checkout purchase funnel regression",
    body,
    severity: "warn",
    fields,
    source: "checkoutPurchaseFunnelMonitor",
  });
}
