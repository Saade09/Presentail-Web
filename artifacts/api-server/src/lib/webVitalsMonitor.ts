import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert } from "./alerts";

// ── Configuration ──────────────────────────────────────────────────────────
//
// Runs once per UTC day (with a 1-minute delayed first run so DB is warm).
// Queries the previous full UTC day's `web_vital` events, computes the p50
// LCP (ms) across all web sessions, and fires a Slack alert when the median
// exceeds WEB_VITALS_LCP_WARN_MS.
//
// Google's CrUX thresholds:
//   LCP ≤ 2500 ms = good
//   LCP ≤ 4000 ms = needs improvement
//   LCP > 4000 ms = poor  ← default alert threshold
//
// All env vars default to safe values so the monitor works without config.

const ENABLED = (() => {
  const v = (process.env.WEB_VITALS_MONITOR_ENABLED ?? "1").toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1 h

const LCP_WARN_MS = (() => {
  const raw = Number(process.env.WEB_VITALS_LCP_WARN_MS);
  if (!Number.isFinite(raw) || raw <= 0) return 4000;
  return raw;
})();

const MIN_SAMPLES = (() => {
  const raw = Number(process.env.WEB_VITALS_MIN_SAMPLES);
  if (!Number.isFinite(raw) || raw <= 0) return 20;
  return Math.floor(raw);
})();

// ── Module state ───────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastEvaluatedDay: string | null = null;

/** Reset in-process state. Only call this from tests. */
export function __resetForTest(): void {
  running = false;
  lastEvaluatedDay = null;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function startWebVitalsMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("webVitalsMonitor: disabled");
    return;
  }
  if (timer) return;

  const baseline = setTimeout(() => {
    runOnce().catch((err: unknown) => {
      logger.warn(
        { err: (err as Error)?.message },
        "webVitalsMonitor: baseline run failed",
      );
    });
  }, 60_000);
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err: unknown) => {
      logger.warn(
        { err: (err as Error)?.message },
        "webVitalsMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    { tickMs: TICK_MS, lcpWarnMs: LCP_WARN_MS, minSamples: MIN_SAMPLES },
    "webVitalsMonitor: started",
  );
}

export function stopWebVitalsMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
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

export type WebVitalSummary = {
  metric: string;
  count: number;
  p50: number;
  p75: number;
  p95: number;
};

export type DailyWebVitalSummary = WebVitalSummary & { day: string };

// ── Shared query internals ──────────────────────────────────────────────────

// The shared aggregate SELECT columns used by both public load functions.
// Keeping them in one place ensures both functions compute percentiles the
// same way — adding a p99 or changing a percentile level only needs one edit.
const VITAL_AGGREGATES = {
  metric: analyticsEventsTable.action,
  count: sql<number>`count(*)::int`,
  p50: sql<number>`percentile_cont(0.5) within group (order by ${analyticsEventsTable.metricValue})::float`,
  p75: sql<number>`percentile_cont(0.75) within group (order by ${analyticsEventsTable.metricValue})::float`,
  p95: sql<number>`percentile_cont(0.95) within group (order by ${analyticsEventsTable.metricValue})::float`,
} as const;

function vitalWhere(start: Date, end: Date) {
  return and(
    sql`${analyticsEventsTable.name} = 'web_vital'`,
    sql`${analyticsEventsTable.metricValue} is not null`,
    gte(analyticsEventsTable.createdAt, start),
    lt(analyticsEventsTable.createdAt, end),
  )!;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Per-day p50/p75/p95 for every web vital metric in the given window.
 * Reuses the shared `VITAL_AGGREGATES` and `vitalWhere` helpers so
 * the percentile definitions stay in sync with `loadWebVitalSummaries`.
 */
export async function loadDailyWebVitalSummaries(
  start: Date,
  end: Date,
): Promise<DailyWebVitalSummary[]> {
  type Row = { day: string; metric: string; count: number; p50: number; p75: number; p95: number };

  const DAY_EXPR = sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
  const DAY_TRUNC = sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`;

  const rows = (await db
    .select({ day: DAY_EXPR, ...VITAL_AGGREGATES })
    .from(analyticsEventsTable)
    .where(vitalWhere(start, end))
    .groupBy(DAY_TRUNC, analyticsEventsTable.action)) as Array<
    Row & { day: string | null; metric: string | null }
  >;

  return rows
    .filter((r): r is Row => typeof r.day === "string" && typeof r.metric === "string")
    .sort((a, b) => a.day.localeCompare(b.day) || a.metric.localeCompare(b.metric));
}

/**
 * Window-level p50/p75/p95 across the full start→end range (no day split).
 * Used by the daily alert monitor to evaluate the previous full UTC day.
 */
export async function loadWebVitalSummaries(
  start: Date,
  end: Date,
): Promise<WebVitalSummary[]> {
  type Row = { metric: string; count: number; p50: number; p75: number; p95: number };

  const rows = (await db
    .select(VITAL_AGGREGATES)
    .from(analyticsEventsTable)
    .where(vitalWhere(start, end))
    .groupBy(analyticsEventsTable.action)) as Array<Row & { metric: string | null }>;

  return rows
    .filter((r): r is Row => typeof r.metric === "string")
    .sort((a, b) => a.metric.localeCompare(b.metric));
}

export async function runOnce(now: Date = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const day = previousUtcDay(now);
    if (lastEvaluatedDay === day.iso) return;

    const summaries = await loadWebVitalSummaries(day.start, day.end);

    if (summaries.length === 0) {
      lastEvaluatedDay = day.iso;
      logger.info(
        { day: day.iso },
        "webVitalsMonitor: no web_vital events for day, skipping",
      );
      return;
    }

    const lcp = summaries.find((s) => s.metric === "LCP");

    if (lcp && lcp.count >= MIN_SAMPLES && lcp.p50 > LCP_WARN_MS) {
      await sendAlert({
        title: `Web Vitals — LCP regression on ${day.iso} (UTC)`,
        body:
          `Median LCP ${Math.round(lcp.p50)} ms exceeds the ${LCP_WARN_MS} ms threshold ` +
          `(n=${lcp.count}). p75=${Math.round(lcp.p75)} ms, p95=${Math.round(lcp.p95)} ms.`,
        severity: "warn",
        fields: formatSummaryFields(summaries),
        source: "webVitalsMonitor",
      });
    } else {
      await sendAlert({
        title: `Web Vitals — ${day.iso} (UTC)`,
        body: buildDigestBody(lcp, day.iso),
        severity: "info",
        fields: formatSummaryFields(summaries),
        source: "webVitalsMonitor",
      });
    }

    lastEvaluatedDay = day.iso;
  } finally {
    running = false;
  }
}

function buildDigestBody(lcp: WebVitalSummary | undefined, day: string): string {
  if (!lcp || lcp.count < MIN_SAMPLES) {
    return `Web Vitals digest for ${day}. Insufficient LCP samples (need ≥ ${MIN_SAMPLES}) — no threshold check performed.`;
  }
  return (
    `Web Vitals digest for ${day}. Median LCP ${Math.round(lcp.p50)} ms ` +
    `is within the ${LCP_WARN_MS} ms threshold (n=${lcp.count}).`
  );
}

function formatSummaryFields(summaries: WebVitalSummary[]) {
  return summaries.map((s) => ({
    title: s.metric,
    value:
      `n=${s.count} · p50=${fmtVal(s.metric, s.p50)} · ` +
      `p75=${fmtVal(s.metric, s.p75)} · p95=${fmtVal(s.metric, s.p95)}`,
  }));
}

function fmtVal(metric: string, val: number): string {
  if (metric === "CLS") return val.toFixed(3);
  return `${Math.round(val)} ms`;
}
