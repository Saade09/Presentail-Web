import { and, asc, gt, ne, or, isNull } from "drizzle-orm";
import { db, customersTable, type Customer } from "@workspace/db";
import { logger } from "./logger";
import { trackWorkerExecution } from "./inFlightWorkerExecutions";
import {
  ensureClerkUserForCustomer,
  isClerkConfigured,
} from "./clerkUserSync";

// In-process daily catch-up sync: scans the local `customers` table and
// ensures every shopper has a corresponding Clerk user. This is the
// safety net for cases where the per-request mirror in /auth/register
// and /auth/social/* failed transiently — without it, ops would have to
// re-run `pnpm --filter @workspace/scripts run import-customers-to-clerk`
// by hand.
//
// Mirrors `scripts/src/importCustomersToClerk.ts`'s field mapping (via
// the shared `ensureClerkUserForCustomer`) so the script and the worker
// produce IDENTICAL Clerk users — running both is safe and idempotent.
//
// Disabled by default so existing deployments don't start back-filling
// silently after this lands. Set `CLERK_CATCHUP_SYNC_ENABLED=1` to enable.

const ENABLED = (() => {
  const v = (process.env.CLERK_CATCHUP_SYNC_ENABLED ?? "0").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
})();

// Wake up hourly — like the funnel monitors — but only run a real pass
// once per UTC day. A short tick keeps the worker honest if the server
// boots after the chosen run-time.
const TICK_MS = 60 * 60 * 1000; // 1h
const PAGE_SIZE = 200;
// Bound the per-tick blast radius. Even a brand-new install with tens of
// thousands of WP customers should burn down within a handful of days
// rather than fire thousands of Clerk createUser calls in one tick.
const MAX_PER_RUN = (() => {
  const raw = Number(process.env.CLERK_CATCHUP_SYNC_MAX_PER_RUN);
  if (!Number.isFinite(raw) || raw <= 0) return 500;
  return Math.floor(raw);
})();

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let running = false;
// Day-of-last-FULL-sweep. We only advance this when a pass reaches the
// end of the table — partial passes (capped by MAX_PER_RUN) leave the
// flag unset so the next tick keeps going from the persisted cursor.
let lastFullSweepDay: string | null = null;
// Persistent cursor across ticks. With MAX_PER_RUN=500 and a 1h tick,
// even a 100k-row table walks fully within ~9 days. Reset to 0 after a
// full sweep so the next day starts from the beginning.
let cursorId = 0;

export function startClerkCatchupSync(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("clerkCatchupSync: disabled (set CLERK_CATCHUP_SYNC_ENABLED=1)");
    return;
  }
  if (!isClerkConfigured()) {
    logger.info(
      "clerkCatchupSync: Clerk not configured (no CLERK_SECRET_KEY); skipping start",
    );
    return;
  }
  if (timer) return;

  // Same warm-up cadence as the funnel monitors — first pass shortly
  // after boot so cold-start right after the previous UTC day still
  // sweeps yesterday's signups quickly.
  startupTimer = setTimeout(() => {
    startupTimer = null;
    trackWorkerExecution("clerk-catchup", runOnce()).catch((err) => {
      logger.warn(
        { err: err?.message },
        "clerkCatchupSync: baseline run failed",
      );
    });
  }, 60_000);
  startupTimer.unref?.();

  timer = setInterval(() => {
    trackWorkerExecution("clerk-catchup", runOnce()).catch((err) => {
      logger.warn({ err: err?.message }, "clerkCatchupSync: tick failed");
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    { tickMs: TICK_MS, maxPerRun: MAX_PER_RUN },
    "clerkCatchupSync: started",
  );
}

export function stopClerkCatchupSync(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// Test-only: reset the in-memory state. NOT for production use.
export function __resetForTest(): void {
  lastFullSweepDay = null;
  cursorId = 0;
  running = false;
}

export async function runOnce(now: Date = new Date()): Promise<{
  scanned: number;
  created: number;
  alreadyExisted: number;
  failed: number;
  fullSweepCompleted: boolean;
  cursorAfter: number;
}> {
  const summary = {
    scanned: 0,
    created: 0,
    alreadyExisted: 0,
    failed: 0,
    fullSweepCompleted: false,
    cursorAfter: cursorId,
  };
  if (running) return summary;
  running = true;
  try {
    const day = now.toISOString().slice(0, 10);
    // Skip only when we've already completed a FULL sweep today. Partial
    // passes don't count, so a multi-tick day still progresses.
    if (lastFullSweepDay === day) return summary;

    // Pre-filter unlinked rows at the database level so already-clerk-
    // linked customers don't burn through the per-run cap. This is the
    // critical bit: without it, a table with thousands of mostly-linked
    // rows would never reach the new shoppers in the tail.
    const unlinkedClause = or(
      ne(customersTable.authProvider, "clerk"),
      isNull(customersTable.authProvider),
      isNull(customersTable.authUserId),
    );

    let processed = 0;
    let exhausted = false;
    for (;;) {
      if (processed >= MAX_PER_RUN) break;
      const remaining = MAX_PER_RUN - processed;
      const take = Math.min(PAGE_SIZE, remaining);
      const rows = (await db
        .select()
        .from(customersTable)
        .where(and(gt(customersTable.id, cursorId), unlinkedClause))
        .orderBy(asc(customersTable.id))
        .limit(take)) as Customer[];
      if (rows.length === 0) {
        exhausted = true;
        break;
      }
      cursorId = rows[rows.length - 1].id;

      for (const c of rows) {
        processed++;
        summary.scanned++;
        const email = c.email?.trim().toLowerCase();
        if (!email) continue;
        const res = await ensureClerkUserForCustomer({
          email,
          firstName: c.firstName ?? null,
          lastName: c.lastName ?? null,
          localCustomerId: c.id,
          log: logger,
        });
        if (res.ok) {
          if (res.created) summary.created++;
          else summary.alreadyExisted++;
        } else {
          summary.failed++;
        }
      }

      if (rows.length < take) {
        exhausted = true;
        break;
      }
    }

    summary.cursorAfter = cursorId;
    if (exhausted) {
      // Reached the tail → mark the day done and reset for tomorrow.
      lastFullSweepDay = day;
      cursorId = 0;
      summary.fullSweepCompleted = true;
      logger.info(
        { day, ...summary },
        "clerkCatchupSync: full sweep complete",
      );
    } else {
      logger.info(
        { day, ...summary },
        "clerkCatchupSync: partial pass (cap reached); will resume next tick",
      );
    }
    return summary;
  } finally {
    running = false;
  }
}
