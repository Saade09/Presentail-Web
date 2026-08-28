import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert } from "./alerts";

// ── Configuration ──────────────────────────────────────────────────────────
//
// Runs once per UTC day (with a 1-minute delayed first run so DB is warm).
// Queries the previous full UTC day's `web_vital` events and fires Slack
// warn alerts when any of the following p-tile thresholds are breached:
//   LCP p50 > WEB_VITALS_LCP_WARN_MS   (default 4000 ms — Google "poor")
//   INP p75 > WEB_VITALS_INP_WARN_MS   (default 500 ms  — Google "needs improvement")
//   CLS p75 > WEB_VITALS_CLS_WARN      (default 0.25    — Google "poor")
//
// Also queries `mobile_ttid` events and fires Slack warn alerts when any
// (platform, screen) pair's p50 exceeds its per-screen threshold:
//   MOBILE_TTID_HOME_WARN_MS      (default 3000 ms; set to 0 to disable)
//   MOBILE_TTID_PRODUCT_WARN_MS   (default 3000 ms; set to 0 to disable)
//   MOBILE_TTID_BRAND_WARN_MS     (default 3000 ms; set to 0 to disable)
//   MOBILE_TTID_CATEGORY_WARN_MS  (default 3000 ms; set to 0 to disable)
//   MOBILE_TTID_OCCASION_WARN_MS  (default 3000 ms; set to 0 to disable)
//   MOBILE_TTID_MIN_SAMPLES       (default 20 — skip screen when fewer samples)
//
// All per-screen TTID checks and web vitals checks fire as one consolidated
// Slack alert so the team gets a single digest per day.
//
// Google's CrUX thresholds:
//   LCP ≤ 2500 ms = good · ≤ 4000 ms = needs improvement · > 4000 ms = poor
//   INP ≤ 200 ms  = good · ≤ 500 ms  = needs improvement · > 500 ms  = poor
//   CLS ≤ 0.1     = good · ≤ 0.25    = needs improvement · > 0.25    = poor
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

const INP_WARN_MS = (() => {
  const raw = Number(process.env.WEB_VITALS_INP_WARN_MS);
  if (!Number.isFinite(raw) || raw <= 0) return 500;
  return raw;
})();

const CLS_WARN = (() => {
  const raw = Number(process.env.WEB_VITALS_CLS_WARN);
  if (!Number.isFinite(raw) || raw <= 0) return 0.25;
  return raw;
})();

const MIN_SAMPLES = (() => {
  const raw = Number(process.env.WEB_VITALS_MIN_SAMPLES);
  if (!Number.isFinite(raw) || raw <= 0) return 20;
  return Math.floor(raw);
})();

const OUTLIER_WARN_COUNT = (() => {
  const raw = Number(process.env.WEB_VITALS_OUTLIER_WARN_COUNT);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.floor(raw);
})();

// ── Mobile TTID threshold config ────────────────────────────────────────────

const TTID_SCREENS = ["home", "product", "brand", "category", "occasion"] as const;
type TtidScreen = (typeof TTID_SCREENS)[number];

/** Parse a per-screen TTID threshold env var.  Returns null when disabled (0). */
function parseTtidThreshold(raw: string | undefined, defaultMs: number): number | null {
  const n = Number(raw);
  if (raw !== undefined && Number.isFinite(n) && n === 0) return null; // explicitly disabled
  if (!Number.isFinite(n) || n < 0) return defaultMs;
  return n;
}

const TTID_WARN_MS: Record<TtidScreen, number | null> = {
  home: parseTtidThreshold(process.env.MOBILE_TTID_HOME_WARN_MS, 3000),
  product: parseTtidThreshold(process.env.MOBILE_TTID_PRODUCT_WARN_MS, 3000),
  brand: parseTtidThreshold(process.env.MOBILE_TTID_BRAND_WARN_MS, 3000),
  category: parseTtidThreshold(process.env.MOBILE_TTID_CATEGORY_WARN_MS, 3000),
  occasion: parseTtidThreshold(process.env.MOBILE_TTID_OCCASION_WARN_MS, 3000),
};

const TTID_MIN_SAMPLES = (() => {
  const raw = Number(process.env.MOBILE_TTID_MIN_SAMPLES);
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
    {
      tickMs: TICK_MS,
      lcpWarnMs: LCP_WARN_MS,
      inpWarnMs: INP_WARN_MS,
      clsWarn: CLS_WARN,
      minSamples: MIN_SAMPLES,
      ttidWarnMs: TTID_WARN_MS,
      ttidMinSamples: TTID_MIN_SAMPLES,
    },
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
  /** Estimated population count after applying the stored sample weight. */
  count: number;
  /** Number of retained poor/error rows excluded from percentile calculations. */
  outlierCount?: number;
  /** Sessionless rows retained for diagnostics and excluded from percentiles. */
  unattributedCount?: number;
  p50: number | null;
  p75: number | null;
  p95: number | null;
};

export type DailyWebVitalSummary = WebVitalSummary & {
  day: string;
  /** `mobile_web`, `desktop_web`, `web`, or `null` for rows without a platform value. */
  platform: string | null;
};

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
  type Row = {
    day: string;
    platform: string | null;
    metric: string;
    count: number;
    outlierCount: number;
    unattributedCount: number;
    p50: number | null;
    p75: number | null;
    p95: number | null;
  };

  const result = await db.execute<Row>(sql`
    with sample_rows as (
      select
        to_char(date_trunc('day', created_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
        platform,
        action as metric,
        metric_value,
        case
          when properties_json::jsonb #>> '{analyticsSampling,mode}' = 'shadow'
            then 1::double precision
          else greatest(
            1,
            coalesce(
              nullif(
                properties_json::jsonb #>> '{analyticsSampling,weight}',
                ''
              )::double precision,
              1
            )
          )
        end as sample_weight
      from analytics_events
      where name = 'web_vital'
        and metric_value is not null
        and created_at >= ${start}
        and created_at < ${end}
    ),
    value_weights as (
      select day, platform, metric, metric_value, sum(sample_weight) as sample_weight
      from sample_rows
      group by day, platform, metric, metric_value
    ),
    ranked as (
      select
        *,
        sum(sample_weight) over (
          partition by day, platform, metric
          order by metric_value
          rows between unbounded preceding and current row
        ) as cumulative_weight,
        sum(sample_weight) over (
          partition by day, platform, metric
        ) as total_weight
      from value_weights
    ),
    sample_summaries as (
      select
        day,
        platform,
        metric,
        round(max(total_weight))::int as count,
        min(metric_value) filter (
          where cumulative_weight >= total_weight * 0.50
        )::float as p50,
        min(metric_value) filter (
          where cumulative_weight >= total_weight * 0.75
        )::float as p75,
        min(metric_value) filter (
          where cumulative_weight >= total_weight * 0.95
        )::float as p95
      from ranked
      group by day, platform, metric
    ),
    exceptions as (
      select
        to_char(date_trunc('day', created_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
        platform,
        action as metric,
        count(*) filter (where name = 'web_vital_outlier')::int as "outlierCount",
        count(*) filter (where name = 'web_vital_unattributed')::int as "unattributedCount"
      from analytics_events
      where name in ('web_vital_outlier', 'web_vital_unattributed')
        and created_at >= ${start}
        and created_at < ${end}
      group by day, platform, metric
    ),
    dimensions as (
      select day, platform, metric from sample_summaries
      union
      select day, platform, metric from exceptions
    )
    select
      dimensions.day,
      dimensions.platform,
      dimensions.metric,
      coalesce(sample_summaries.count, 0)::int as count,
      coalesce(exceptions."outlierCount", 0)::int as "outlierCount",
      coalesce(exceptions."unattributedCount", 0)::int as "unattributedCount",
      sample_summaries.p50,
      sample_summaries.p75,
      sample_summaries.p95
    from dimensions
    left join sample_summaries
      on sample_summaries.day = dimensions.day
      and sample_summaries.platform is not distinct from dimensions.platform
      and sample_summaries.metric = dimensions.metric
    left join exceptions
      on exceptions.day = dimensions.day
      and exceptions.platform is not distinct from dimensions.platform
      and exceptions.metric = dimensions.metric
    order by dimensions.day, dimensions.platform nulls first, dimensions.metric
  `);
  const rows = result.rows as Array<
    Row & { day: string | null; metric: string | null }
  >;

  return rows
    .filter((r): r is Row => typeof r.day === "string" && typeof r.metric === "string")
    .sort((a, b) => {
      if (a.day !== b.day) return a.day.localeCompare(b.day);
      const pa = a.platform ?? "";
      const pb = b.platform ?? "";
      if (pa !== pb) return pa.localeCompare(pb);
      return a.metric.localeCompare(b.metric);
    });
}

/**
 * Window-level p50/p75/p95 across the full start→end range (no day split).
 * Used by the daily alert monitor to evaluate the previous full UTC day.
 */
export async function loadWebVitalSummaries(
  start: Date,
  end: Date,
): Promise<WebVitalSummary[]> {
  type Row = WebVitalSummary;

  const result = await db.execute<Row>(sql`
    with sample_rows as (
      select
        action as metric,
        metric_value,
        case
          when properties_json::jsonb #>> '{analyticsSampling,mode}' = 'shadow'
            then 1::double precision
          else greatest(
            1,
            coalesce(
              nullif(
                properties_json::jsonb #>> '{analyticsSampling,weight}',
                ''
              )::double precision,
              1
            )
          )
        end as sample_weight
      from analytics_events
      where name = 'web_vital'
        and metric_value is not null
        and created_at >= ${start}
        and created_at < ${end}
    ),
    value_weights as (
      select metric, metric_value, sum(sample_weight) as sample_weight
      from sample_rows
      group by metric, metric_value
    ),
    ranked as (
      select
        *,
        sum(sample_weight) over (
          partition by metric
          order by metric_value
          rows between unbounded preceding and current row
        ) as cumulative_weight,
        sum(sample_weight) over (partition by metric) as total_weight
      from value_weights
    ),
    sample_summaries as (
      select
        metric,
        round(max(total_weight))::int as count,
        min(metric_value) filter (
          where cumulative_weight >= total_weight * 0.50
        )::float as p50,
        min(metric_value) filter (
          where cumulative_weight >= total_weight * 0.75
        )::float as p75,
        min(metric_value) filter (
          where cumulative_weight >= total_weight * 0.95
        )::float as p95
      from ranked
      group by metric
    ),
    exceptions as (
      select
        action as metric,
        count(*) filter (where name = 'web_vital_outlier')::int as "outlierCount",
        count(*) filter (where name = 'web_vital_unattributed')::int as "unattributedCount"
      from analytics_events
      where name in ('web_vital_outlier', 'web_vital_unattributed')
        and created_at >= ${start}
        and created_at < ${end}
      group by metric
    ),
    dimensions as (
      select metric from sample_summaries
      union
      select metric from exceptions
    )
    select
      dimensions.metric,
      coalesce(sample_summaries.count, 0)::int as count,
      coalesce(exceptions."outlierCount", 0)::int as "outlierCount",
      coalesce(exceptions."unattributedCount", 0)::int as "unattributedCount",
      sample_summaries.p50,
      sample_summaries.p75,
      sample_summaries.p95
    from dimensions
    left join sample_summaries using (metric)
    left join exceptions using (metric)
    order by dimensions.metric
  `);
  const rows = result.rows as Array<Row & { metric: string | null }>;

  return rows
    .filter((r): r is Row => typeof r.metric === "string")
    .sort((a, b) => a.metric.localeCompare(b.metric));
}

export type MobileTtidSummary = {
  platform: string;
  screen: string;
  count: number;
  p50: number;
  p75: number;
  p95: number;
};

export type DailyMobileTtidSummary = MobileTtidSummary & {
  day: string;
};

/**
 * Load `mobile_ttid` event summaries for the given UTC window, grouped by
 * (platform, screen). Only rows with a non-null metricValue are included.
 */
export async function loadMobileTtidSummaries(
  start: Date,
  end: Date,
): Promise<MobileTtidSummary[]> {
  type Row = {
    platform: string;
    screen: string;
    count: number;
    p50: number;
    p75: number;
    p95: number;
  };

  const rows = (await db
    .select({
      platform: analyticsEventsTable.platform,
      screen: analyticsEventsTable.action,
      count: sql<number>`count(*)::int`,
      p50: sql<number>`percentile_cont(0.5) within group (order by ${analyticsEventsTable.metricValue})::float`,
      p75: sql<number>`percentile_cont(0.75) within group (order by ${analyticsEventsTable.metricValue})::float`,
      p95: sql<number>`percentile_cont(0.95) within group (order by ${analyticsEventsTable.metricValue})::float`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} = 'mobile_ttid'`,
        sql`${analyticsEventsTable.metricValue} is not null`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(analyticsEventsTable.platform, analyticsEventsTable.action)) as Array<
    Row & { platform: string | null; screen: string | null }
  >;

  return rows
    .filter(
      (r): r is Row =>
        typeof r.platform === "string" && typeof r.screen === "string",
    )
    .sort((a, b) =>
      a.platform !== b.platform
        ? a.platform.localeCompare(b.platform)
        : a.screen.localeCompare(b.screen),
    );
}

/**
 * Per-day p50/p75/p95 for `mobile_ttid` events in the given UTC window,
 * grouped by (day, platform, screen). Reuses the same query shape as
 * `loadMobileTtidSummaries` but adds a day dimension so the dashboard can
 * show sparklines and a per-day breakdown table.
 */
export async function loadDailyMobileTtidSummaries(
  start: Date,
  end: Date,
): Promise<DailyMobileTtidSummary[]> {
  type Row = {
    day: string;
    platform: string;
    screen: string;
    count: number;
    p50: number;
    p75: number;
    p95: number;
  };

  const DAY_EXPR = sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
  const DAY_TRUNC = sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`;

  const rows = (await db
    .select({
      day: DAY_EXPR,
      platform: analyticsEventsTable.platform,
      screen: analyticsEventsTable.action,
      count: sql<number>`count(*)::int`,
      p50: sql<number>`percentile_cont(0.5) within group (order by ${analyticsEventsTable.metricValue})::float`,
      p75: sql<number>`percentile_cont(0.75) within group (order by ${analyticsEventsTable.metricValue})::float`,
      p95: sql<number>`percentile_cont(0.95) within group (order by ${analyticsEventsTable.metricValue})::float`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} = 'mobile_ttid'`,
        sql`${analyticsEventsTable.metricValue} is not null`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(
      DAY_TRUNC,
      analyticsEventsTable.platform,
      analyticsEventsTable.action,
    )) as Array<Row & { day: string | null; platform: string | null; screen: string | null }>;

  return rows
    .filter(
      (r): r is Row =>
        typeof r.day === "string" &&
        typeof r.platform === "string" &&
        typeof r.screen === "string",
    )
    .sort((a, b) => {
      if (a.day !== b.day) return a.day.localeCompare(b.day);
      if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
      return a.screen.localeCompare(b.screen);
    });
}

export async function runOnce(now: Date = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const day = previousUtcDay(now);
    if (lastEvaluatedDay === day.iso) return;

    const [summaries, mobileSummaries] = await Promise.all([
      loadWebVitalSummaries(day.start, day.end),
      loadMobileTtidSummaries(day.start, day.end),
    ]);

    if (summaries.length === 0 && mobileSummaries.length === 0) {
      lastEvaluatedDay = day.iso;
      logger.info(
        { day: day.iso },
        "webVitalsMonitor: no web_vital or mobile_ttid events for day, skipping",
      );
      return;
    }

    const lcp = summaries.find((s) => s.metric === "LCP");
    const inp = summaries.find((s) => s.metric === "INP");
    const cls = summaries.find((s) => s.metric === "CLS");

    const allFields = [
      ...formatSummaryFields(summaries),
      ...formatMobileTtidFields(mobileSummaries),
    ];

    // Collect any threshold breaches so we can send one consolidated alert.
    const regressions: string[] = [];

    if (
      lcp &&
      lcp.count >= MIN_SAMPLES &&
      lcp.p50 !== null &&
      lcp.p75 !== null &&
      lcp.p95 !== null &&
      lcp.p50 > LCP_WARN_MS
    ) {
      regressions.push(
        `LCP p50=${Math.round(lcp.p50)} ms > ${LCP_WARN_MS} ms threshold ` +
          `(n=${lcp.count}, p75=${Math.round(lcp.p75)} ms, p95=${Math.round(lcp.p95)} ms)`,
      );
    }

    if (
      inp &&
      inp.count >= MIN_SAMPLES &&
      inp.p50 !== null &&
      inp.p75 !== null &&
      inp.p95 !== null &&
      inp.p75 > INP_WARN_MS
    ) {
      regressions.push(
        `INP p75=${Math.round(inp.p75)} ms > ${INP_WARN_MS} ms threshold ` +
          `(n=${inp.count}, p50=${Math.round(inp.p50)} ms, p95=${Math.round(inp.p95)} ms)`,
      );
    }

    if (
      cls &&
      cls.count >= MIN_SAMPLES &&
      cls.p50 !== null &&
      cls.p75 !== null &&
      cls.p95 !== null &&
      cls.p75 > CLS_WARN
    ) {
      regressions.push(
        `CLS p75=${cls.p75.toFixed(3)} > ${CLS_WARN} threshold ` +
          `(n=${cls.count}, p50=${cls.p50.toFixed(3)}, p95=${cls.p95.toFixed(3)})`,
      );
    }

    for (const summary of summaries) {
      if ((summary.outlierCount ?? 0) >= OUTLIER_WARN_COUNT) {
        regressions.push(
          `${summary.metric} retained ${summary.outlierCount} poor/error outlier(s) ` +
            `outside the weighted percentile cohort`,
        );
      }
    }

    // ── Mobile TTID threshold checks ──────────────────────────────────────
    for (const row of mobileSummaries) {
      const screen = row.screen as TtidScreen;
      const warnMs = TTID_SCREENS.includes(screen) ? TTID_WARN_MS[screen] : null;
      if (warnMs === null) continue; // disabled for this screen
      if (row.count < TTID_MIN_SAMPLES) continue; // insufficient data
      if (row.p50 > warnMs) {
        regressions.push(
          `Mobile TTID ${row.platform} ${row.screen} p50=${Math.round(row.p50)} ms > ${warnMs} ms threshold ` +
            `(n=${row.count}, p75=${Math.round(row.p75)} ms, p95=${Math.round(row.p95)} ms)`,
        );
      }
    }

    if (regressions.length > 0) {
      const hasWebRegression = regressions.some((r) => !r.startsWith("Mobile TTID"));
      const hasTtidRegression = regressions.some((r) => r.startsWith("Mobile TTID"));
      const titleParts: string[] = [];
      if (hasWebRegression) titleParts.push("Web Vitals");
      if (hasTtidRegression) titleParts.push("Mobile TTID");
      await sendAlert({
        title: `${titleParts.join(" / ")} — regression(s) on ${day.iso} (UTC)`,
        body: regressions.join(" | "),
        severity: "warn",
        fields: allFields,
        source: "webVitalsMonitor",
      });
    } else {
      await sendAlert({
        title: `Web Vitals — ${day.iso} (UTC)`,
        body: buildDigestBody(lcp, inp, cls, mobileSummaries, day.iso),
        severity: "info",
        fields: allFields,
        source: "webVitalsMonitor",
      });
    }

    lastEvaluatedDay = day.iso;
  } finally {
    running = false;
  }
}

function buildDigestBody(
  lcp: WebVitalSummary | undefined,
  inp: WebVitalSummary | undefined,
  cls: WebVitalSummary | undefined,
  mobile: MobileTtidSummary[],
  day: string,
): string {
  const lcpLine =
    !lcp || lcp.count < MIN_SAMPLES || lcp.p50 === null
      ? `Insufficient LCP samples (need ≥ ${MIN_SAMPLES}) — no threshold check performed.`
      : `LCP p50=${Math.round(lcp.p50)} ms within the ${LCP_WARN_MS} ms threshold (n=${lcp.count}).`;

  const inpLine =
    !inp || inp.count < MIN_SAMPLES || inp.p75 === null
      ? `Insufficient INP samples (need ≥ ${MIN_SAMPLES}) — no threshold check performed.`
      : `INP p75=${Math.round(inp.p75)} ms within the ${INP_WARN_MS} ms threshold (n=${inp.count}).`;

  const clsLine =
    !cls || cls.count < MIN_SAMPLES || cls.p75 === null
      ? `Insufficient CLS samples (need ≥ ${MIN_SAMPLES}) — no threshold check performed.`
      : `CLS p75=${cls.p75.toFixed(3)} within the ${CLS_WARN} threshold (n=${cls.count}).`;

  const mobileLine =
    mobile.length === 0
      ? "No mobile TTID samples."
      : TTID_SCREENS.flatMap((screen) => {
          const threshold = TTID_WARN_MS[screen];
          const rows = mobile.filter((r) => r.screen === screen);
          return rows.map((r) => {
            const p50 = Math.round(r.p50);
            if (threshold === null) {
              return `${r.platform} ${screen} p50=${p50} ms (n=${r.count}, threshold disabled)`;
            }
            if (r.count < TTID_MIN_SAMPLES) {
              return `${r.platform} ${screen} p50=${p50} ms (n=${r.count}, need ≥ ${TTID_MIN_SAMPLES} for check)`;
            }
            return `${r.platform} ${screen} p50=${p50} ms within ${threshold} ms threshold (n=${r.count})`;
          });
        }).join(", ") + ".";

  return `Web Vitals digest for ${day}. ${lcpLine} ${inpLine} ${clsLine} Mobile TTID: ${mobileLine}`;
}

function formatSummaryFields(summaries: WebVitalSummary[]) {
  return summaries.map((s) => ({
    title: `web · ${s.metric}`,
    value:
      `weighted n=${s.count} · retained outliers=${s.outlierCount ?? 0} · ` +
      `unattributed=${s.unattributedCount ?? 0} · ` +
      `p50=${fmtVal(s.metric, s.p50)} · ` +
      `p75=${fmtVal(s.metric, s.p75)} · p95=${fmtVal(s.metric, s.p95)}`,
  }));
}

function formatMobileTtidFields(summaries: MobileTtidSummary[]) {
  return summaries.map((s) => ({
    title: `${s.platform} · ${s.screen} TTID`,
    value:
      `n=${s.count} · p50=${Math.round(s.p50)} ms · ` +
      `p75=${Math.round(s.p75)} ms · p95=${Math.round(s.p95)} ms`,
  }));
}

function fmtVal(metric: string, val: number | null): string {
  if (val === null) return "n/a";
  if (metric === "CLS") return val.toFixed(3);
  return `${Math.round(val)} ms`;
}
