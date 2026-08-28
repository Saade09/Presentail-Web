/**
 * productAffinityMonitor.ts — Nightly background job that recomputes co-purchase
 * affinity scores from `app_orders` into `product_pair_affinity`.
 *
 * Runs once per UTC day (checked every hour). Uses the same pair-counting
 * algorithm as the standalone script so the table always stays in sync with
 * historical order data without manual intervention.
 */

import { db, appOrdersTable, productPairAffinityTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { trackWorkerExecution } from "./inFlightWorkerExecutions";

// ── Types ──────────────────────────────────────────────────────────────────

type LineItem = {
  name?: string;
  quantity?: number;
  priceUsdCents?: number;
  osSlug?: string;
};

// ── Module state ───────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;
let lastComputedDay: string | null = null;

const TICK_MS = 60 * 60 * 1000; // 1 h

// ── Core computation ───────────────────────────────────────────────────────

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function runCompute(): Promise<void> {
  const today = utcDateString(new Date());

  // Only run once per UTC day (independent of server restarts within the day).
  if (lastComputedDay === today) return;
  lastComputedDay = today;

  logger.info("productAffinityMonitor: starting nightly affinity recompute");

  try {
    const orders = await db
      .select({
        appOrderId: appOrdersTable.appOrderId,
        lineItemsJson: appOrdersTable.lineItemsJson,
      })
      .from(appOrdersTable);

    const pairCounts = new Map<string, number>();

    for (const order of orders) {
      if (!order.lineItemsJson) continue;

      let items: LineItem[];
      try {
        items = JSON.parse(order.lineItemsJson) as LineItem[];
      } catch {
        continue;
      }

      const slugs = new Set<string>();
      for (const item of items) {
        if (item.osSlug && typeof item.osSlug === "string") {
          slugs.add(item.osSlug);
        }
      }

      if (slugs.size < 2) continue;

      const slugArr = Array.from(slugs).sort();
      for (let i = 0; i < slugArr.length; i++) {
        for (let j = i + 1; j < slugArr.length; j++) {
          const slugA = slugArr[i]!;
          const slugB = slugArr[j]!;
          const key = `${slugA}\0${slugB}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    if (pairCounts.size === 0) {
      logger.info(
        { ordersScanned: orders.length },
        "productAffinityMonitor: no pairs found (no orders with ≥2 slug-annotated items yet)",
      );
      return;
    }

    // Upsert in batches of 500
    const BATCH = 500;
    const entries = Array.from(pairCounts.entries());
    const now = new Date();
    let upserted = 0;

    for (let start = 0; start < entries.length; start += BATCH) {
      const batch = entries.slice(start, start + BATCH);
      const rows = batch.map(([key, count]) => {
        const [slugA, slugB] = key.split("\0") as [string, string];
        return {
          productSlugA: slugA,
          productSlugB: slugB,
          coPurchaseCount: count,
          lastComputedAt: now,
        };
      });

      await db
        .insert(productPairAffinityTable)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            productPairAffinityTable.productSlugA,
            productPairAffinityTable.productSlugB,
          ],
          set: {
            coPurchaseCount: sql`excluded.co_purchase_count`,
            lastComputedAt: sql`excluded.last_computed_at`,
          },
        });

      upserted += rows.length;
    }

    logger.info(
      { ordersScanned: orders.length, pairsUpserted: upserted },
      "productAffinityMonitor: nightly affinity recompute complete",
    );
  } catch (err: unknown) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "productAffinityMonitor: nightly recompute failed",
    );
    // Reset so it retries on the next hourly tick rather than giving up for the day.
    lastComputedDay = null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function startProductAffinityMonitor(): void {
  // Run shortly after boot so the table is warm within the first startup window.
  startupTimer = setTimeout(() => {
    startupTimer = null;
    trackWorkerExecution("product-affinity", runCompute()).catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "productAffinityMonitor: startup run failed",
      );
    });
  }, 30_000);
  startupTimer.unref?.();

  timer = setInterval(() => {
    trackWorkerExecution("product-affinity", runCompute()).catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "productAffinityMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info({ tickMs: TICK_MS }, "productAffinityMonitor: started");
}

export function stopProductAffinityMonitor(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
