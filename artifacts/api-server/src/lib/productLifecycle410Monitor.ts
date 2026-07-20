// Monitors for product URLs returning 410 Gone with no redirect entry in
// PRODUCT_REDIRECTS. When Presentail OS marks a product discontinued and no
// redirect is registered, serve.mjs issues a 410 and records a
// `product_lifecycle_410` analytics event (productId = the product slug).
//
// This monitor queries those events once per UTC day and fires a Slack alert
// listing every slug that served a 410 the prior day. Ops can then add the
// missing entries to scripts/productRedirects.mjs before link equity is lost.
//
// Configuration (all optional):
//   PRODUCT_LIFECYCLE_410_MONITOR_ENABLED — "0" / "false" / "no" / "off" to disable.

import { sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert } from "./alerts";

const ENABLED = (() => {
  const v = (process.env.PRODUCT_LIFECYCLE_410_MONITOR_ENABLED ?? "1").toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // check hourly, run once per UTC day

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastAlertedDay: string | null = null;

/** Reset in-process state. Only call this from tests. */
export function __resetForTest(): void {
  running = false;
  lastAlertedDay = null;
}

/** Return the UTC date string (YYYY-MM-DD) for a given timestamp (ms). */
function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export type CountSlugsFn = (startMs: number, endMs: number) => Promise<string[]>;

/**
 * Query distinct product slugs from product_lifecycle_410 events recorded in
 * the given UTC time window [startMs, endMs).
 */
export async function defaultCountSlugs(
  startMs: number,
  endMs: number,
): Promise<string[]> {
  const rows = await db
    .select({ productId: analyticsEventsTable.productId })
    .from(analyticsEventsTable)
    .where(
      sql`${analyticsEventsTable.name} = 'product_lifecycle_410'
        AND ${analyticsEventsTable.productId} IS NOT NULL
        AND ${analyticsEventsTable.createdAt} >= ${new Date(startMs)}
        AND ${analyticsEventsTable.createdAt} < ${new Date(endMs)}`,
    )
    .groupBy(analyticsEventsTable.productId);
  return rows.map((r) => r.productId as string).filter(Boolean).sort();
}

export async function runOnce(
  querySlugs: CountSlugsFn = defaultCountSlugs,
  nowMs: number = Date.now(),
): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Evaluate the prior full UTC day.
    const dayStart = new Date(nowMs);
    dayStart.setUTCHours(0, 0, 0, 0);
    const endMs = dayStart.getTime();
    const startMs = endMs - 24 * 60 * 60 * 1000;

    const priorDayKey = utcDayKey(startMs);

    // Only alert once per UTC day.
    if (lastAlertedDay === priorDayKey) {
      logger.info(
        { day: priorDayKey },
        "productLifecycle410Monitor: already evaluated this day",
      );
      return;
    }

    const slugs = await querySlugs(startMs, endMs);

    if (slugs.length === 0) {
      logger.info(
        { day: priorDayKey },
        "productLifecycle410Monitor: no unredirected 410s recorded for this day",
      );
      lastAlertedDay = priorDayKey;
      return;
    }

    lastAlertedDay = priorDayKey;

    const slugList = slugs.map((s) => `• \`${s}\``).join("\n");

    await sendAlert({
      title: "Unredirected product 410s detected",
      body:
        `${slugs.length} product slug(s) served HTTP 410 Gone on ${priorDayKey} with no entry in ` +
        `\`scripts/productRedirects.mjs\`. Each 410 permanently destroys any accumulated link equity for that URL. ` +
        `Add a redirect entry for each slug below and deploy — ops workflow: ` +
        `\`scripts/productRedirects.mjs\` → \`"<old-slug>": "<new-slug>"\`.`,
      severity: "warn",
      fields: [
        { title: "UTC day evaluated", value: priorDayKey },
        { title: "Slugs with no redirect", value: `${slugs.length}` },
        { title: "Affected slugs", value: slugList },
      ],
      source: "productLifecycle410Monitor",
    });

    logger.info(
      { day: priorDayKey, slugCount: slugs.length, slugs },
      "productLifecycle410Monitor: alerted on unredirected 410 slugs",
    );
  } finally {
    running = false;
  }
}

export function startProductLifecycle410Monitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("productLifecycle410Monitor: disabled");
    return;
  }
  if (timer) return;

  // Delay baseline run by 2 min so it doesn't race with startup I/O.
  const baseline = setTimeout(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: (err as Error)?.message },
        "productLifecycle410Monitor: baseline run failed",
      );
    });
  }, 2 * 60_000);
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: (err as Error)?.message },
        "productLifecycle410Monitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    { tickMs: TICK_MS, enabled: ENABLED },
    "productLifecycle410Monitor: started",
  );
}

export function stopProductLifecycle410Monitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
