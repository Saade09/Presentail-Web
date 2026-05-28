import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert } from "./alerts";

// ── Configuration ────────────────────────────────────────────────────────────
//
// Evaluates the prior UTC day's `upsell_item_added` events and checks what
// percentage of them carry a non-null `session_id`. A drop in coverage means
// a client build or code path is silently omitting the field, which causes the
// session-level conversion metric to degrade back toward the (platform, day)
// approximation without anyone noticing.
//
// Environment variables:
//   UPSELL_SESSION_COVERAGE_MONITOR_ENABLED   — "0"/"false" to disable (default: on)
//   UPSELL_SESSION_COVERAGE_MIN_EVENTS        — minimum total events required before the
//                                               check fires; too few events → noisy alert
//                                               (default: 50)
//   UPSELL_SESSION_COVERAGE_MIN_RATE          — minimum acceptable coverage (0–1);
//                                               anything below fires a Slack alert
//                                               (default: 0.8 = 80%)

const ENABLED = (() => {
  const v = (
    process.env.UPSELL_SESSION_COVERAGE_MONITOR_ENABLED ?? "1"
  ).toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1 h

const MIN_EVENTS = (() => {
  const raw = Number(process.env.UPSELL_SESSION_COVERAGE_MIN_EVENTS);
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.floor(raw);
})();

const MIN_RATE = (() => {
  const raw = Number(process.env.UPSELL_SESSION_COVERAGE_MIN_RATE);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return 0.8;
  return raw;
})();

// ── Module state ─────────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastEvaluatedDay: string | null = null;

// ── Public API ───────────────────────────────────────────────────────────────

export function startSessionCoverageMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("sessionCoverageMonitor: disabled");
    return;
  }
  if (timer) return;

  const baseline = setTimeout(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "sessionCoverageMonitor: baseline run failed",
      );
    });
  }, 60_000);
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "sessionCoverageMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    {
      tickMs: TICK_MS,
      minEvents: MIN_EVENTS,
      minRate: MIN_RATE,
    },
    "sessionCoverageMonitor: started",
  );
}

export function stopSessionCoverageMonitor(): void {
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

    const rows = await loadCoverageRows(day.start, day.end);

    if (rows.length === 0) {
      lastEvaluatedDay = day.iso;
      logger.info(
        { day: day.iso },
        "sessionCoverageMonitor: no upsell_item_added events for day, nothing to evaluate",
      );
      return;
    }

    // Aggregate across all platforms for the day-level check. Per-platform
    // alerts are too noisy when a single small-volume platform dips; the
    // aggregate gives a reliable health signal for the session pipeline.
    const totalEvents = rows.reduce((s, r) => s + r.total, 0);
    const totalWithSession = rows.reduce((s, r) => s + r.withSessionId, 0);

    if (totalEvents < MIN_EVENTS) {
      lastEvaluatedDay = day.iso;
      logger.info(
        { day: day.iso, totalEvents, minEvents: MIN_EVENTS },
        "sessionCoverageMonitor: too few events for reliable check, skipping",
      );
      return;
    }

    const coverageRate = totalWithSession / totalEvents;
    const coveragePct = Math.round(coverageRate * 1000) / 10;

    if (coverageRate < MIN_RATE) {
      await sendAlert({
        title: "Upsell session ID coverage below threshold",
        body:
          `Session ID coverage for \`upsell_item_added\` events on ${day.iso} (UTC) ` +
          `was ${coveragePct}% (${totalWithSession}/${totalEvents} events), ` +
          `below the ${(MIN_RATE * 100).toFixed(0)}% threshold. ` +
          `A client build or code path may have stopped sending session_id, ` +
          `which silently degrades session-level conversion accuracy.`,
        severity: "warn",
        fields: rows.map((r) => ({
          title: r.platform,
          value: `${r.withSessionId}/${r.total} events with session_id (${r.coveragePct !== null ? r.coveragePct.toFixed(1) : "—"}%)`,
        })),
        source: "sessionCoverageMonitor",
      });
    } else {
      logger.info(
        { day: day.iso, coveragePct, totalEvents, minRate: MIN_RATE },
        "sessionCoverageMonitor: session ID coverage within threshold",
      );
    }

    lastEvaluatedDay = day.iso;
  } finally {
    running = false;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export type SessionCoverageDailyBucket = {
  day: string;
  platform: string;
  total: number;
  withSessionId: number;
  coveragePct: number | null;
};

// ── Dashboard helper ─────────────────────────────────────────────────────────

/**
 * Load per-(day, platform) session ID coverage for `upsell_item_added` events
 * in the given window. Used by the admin funnels dashboard so the coverage
 * trend is visible alongside the session-level conversion numbers.
 */
export async function loadDailySessionCoverage(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<SessionCoverageDailyBucket[]> {
  const rows = await loadCoverageRows(startDayUtc, endDayUtcExclusive, true);
  return rows;
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

type RawCoverageRow = {
  day: string;
  platform: string | null;
  total: number;
  withSessionId: number;
};

/**
 * Query coverage rows. When `perDay` is true the result is grouped by
 * (day, platform); when false (single-day alert path) grouping is just by
 * platform to keep the result compact.
 */
async function loadCoverageRows(
  start: Date,
  end: Date,
  perDay = false,
): Promise<SessionCoverageDailyBucket[]> {
  const dayExpr = sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;

  const rows = (await db
    .select({
      day: perDay
        ? dayExpr
        : sql<string>`to_char(${start}, 'YYYY-MM-DD')`,
      platform: analyticsEventsTable.platform,
      total: sql<number>`count(*)::int`,
      withSessionId: sql<number>`count(${analyticsEventsTable.sessionId})::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} = 'upsell_item_added'`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(
      ...(perDay
        ? [
            sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`,
            analyticsEventsTable.platform,
          ]
        : [analyticsEventsTable.platform]),
    )) as RawCoverageRow[];

  return rows
    .map((r) => {
      const total = r.total ?? 0;
      const withSessionId = r.withSessionId ?? 0;
      return {
        day: r.day,
        platform: r.platform ?? "unknown",
        total,
        withSessionId,
        coveragePct:
          total > 0
            ? Math.round((withSessionId / total) * 1000) / 10
            : null,
      };
    })
    .sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      return a.platform < b.platform ? -1 : 1;
    });
}
