import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert } from "./alerts";

// Monitors `clerk_session_fallback` events written by resolveClerkSession()
// when the Clerk session token template is missing `email`, `first_name`,
// `last_name`, or `public_metadata` claims and the server falls back to a
// full clerk.users.getUser() API call.
//
// Every fallback costs an extra Clerk API round-trip on an otherwise
// cache-friendly path. A sustained fallback rate signals that the Clerk
// token template is misconfigured and should be fixed.
//
// Same shape as the other hourly monitors: evaluate the previous full UTC
// day once per process lifetime, then re-check every hour. We rely on the
// checkout-login-funnel monitor to prune the shared `analytics_events`
// table; this file owns evaluation only.

// ── Configuration ──────────────────────────────────────────────────────────

const ENABLED = (() => {
  const v = (
    process.env.CLERK_SESSION_FALLBACK_MONITOR_ENABLED ?? "1"
  ).toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1h

// Don't alert on tiny samples — the fallback can happen legitimately on
// cold boot or right after a token template change. Below this threshold
// it's noise; above it the template is almost certainly misconfigured.
const MIN_FALLBACKS = (() => {
  const raw = Number(process.env.CLERK_SESSION_FALLBACK_MIN_COUNT);
  if (!Number.isFinite(raw) || raw <= 0) return 10;
  return Math.floor(raw);
})();

// ── Module state ───────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastEvaluatedDay: string | null = null;

// ── Public API ─────────────────────────────────────────────────────────────

export function startClerkSessionFallbackMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("clerkSessionFallbackMonitor: disabled");
    return;
  }
  if (timer) return;

  // Run shortly after startup so a cold boot just after midnight UTC still
  // alerts promptly rather than waiting a full hour.
  const baseline = setTimeout(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "clerkSessionFallbackMonitor: baseline run failed",
      );
    });
  }, 60_000);
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "clerkSessionFallbackMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    { tickMs: TICK_MS, minFallbacks: MIN_FALLBACKS },
    "clerkSessionFallbackMonitor: started",
  );
}

export function stopClerkSessionFallbackMonitor(): void {
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

    const count = await loadFallbackCount(day.start, day.end);

    if (count === 0) {
      lastEvaluatedDay = day.iso;
      logger.info(
        { day: day.iso },
        "clerkSessionFallbackMonitor: no fallbacks on day, nothing to evaluate",
      );
      return;
    }

    if (count >= MIN_FALLBACKS) {
      await sendFallbackAlert(day.iso, count);
    } else {
      logger.info(
        { day: day.iso, fallbackCount: count, minFallbacks: MIN_FALLBACKS },
        "clerkSessionFallbackMonitor: fallback count below threshold, within band",
      );
    }

    lastEvaluatedDay = day.iso;
  } finally {
    running = false;
  }
}

// ── Internals ──────────────────────────────────────────────────────────────

function previousUtcDay(now: Date): { iso: string; start: Date; end: Date } {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const iso = start.toISOString().slice(0, 10);
  return { iso, start, end };
}

async function loadFallbackCount(start: Date, end: Date): Promise<number> {
  const rows = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} = 'clerk_session_fallback'`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )) as { count: number }[];
  return rows[0]?.count ?? 0;
}

async function sendFallbackAlert(day: string, count: number): Promise<void> {
  await sendAlert({
    title: "Clerk session token template misconfigured",
    body:
      `resolveClerkSession fell back to clerk.users.getUser() ${count} time(s) on ${day} (UTC) — ` +
      `above the threshold of ${MIN_FALLBACKS}. ` +
      `This adds an extra Clerk API round-trip to every affected sign-in. ` +
      `Fix: in the Clerk Dashboard → Configure → Sessions → "Customize session token", ` +
      `add email, first_name, last_name, and public_metadata to the JWT template. ` +
      `See replit.md Gotchas for the exact JSON.`,
    severity: "warn",
    fields: [
      {
        title: "fallback_count",
        value: `${count} on ${day} (UTC)`,
      },
      {
        title: "threshold",
        value: `CLERK_SESSION_FALLBACK_MIN_COUNT=${MIN_FALLBACKS}`,
      },
    ],
    source: "clerkSessionFallbackMonitor",
  });
}
