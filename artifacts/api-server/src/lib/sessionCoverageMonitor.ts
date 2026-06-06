import { and, gte, lt, sql, inArray } from "drizzle-orm";
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
// Additionally monitors session_id coverage for key funnel event types:
// `cart_viewed`, `checkout_started`, and `order_placed`. A regression that
// stops sending session_id on those events would silently degrade conversion
// funnel attribution without triggering any alert.
//
// Environment variables (upsell_item_added — existing):
//   UPSELL_SESSION_COVERAGE_MONITOR_ENABLED   — "0"/"false" to disable (default: on)
//   UPSELL_SESSION_COVERAGE_MIN_EVENTS        — minimum total events before check fires (default: 50)
//   UPSELL_SESSION_COVERAGE_MIN_RATE          — minimum acceptable coverage 0–1 (default: 0.8)
//
// Environment variables (funnel events: cart_viewed, checkout_started, order_placed):
//   FUNNEL_SESSION_COVERAGE_MONITOR_ENABLED   — "0"/"false" to disable (default: on)
//   FUNNEL_SESSION_COVERAGE_MIN_EVENTS        — shared minimum events for all funnel event types (default: 50)
//   FUNNEL_SESSION_COVERAGE_MIN_RATE          — shared minimum coverage for all funnel event types (default: 0.8)
//
//   Per-event-type overrides (fall back to the shared values above when unset):
//   FUNNEL_SESSION_COVERAGE_CART_VIEWED_MIN_EVENTS
//   FUNNEL_SESSION_COVERAGE_CART_VIEWED_MIN_RATE
//   FUNNEL_SESSION_COVERAGE_CHECKOUT_STARTED_MIN_EVENTS
//   FUNNEL_SESSION_COVERAGE_CHECKOUT_STARTED_MIN_RATE
//   FUNNEL_SESSION_COVERAGE_ORDER_PLACED_MIN_EVENTS
//   FUNNEL_SESSION_COVERAGE_ORDER_PLACED_MIN_RATE

const ENABLED = (() => {
  const v = (
    process.env.UPSELL_SESSION_COVERAGE_MONITOR_ENABLED ?? "1"
  ).toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const FUNNEL_ENABLED = (() => {
  const v = (
    process.env.FUNNEL_SESSION_COVERAGE_MONITOR_ENABLED ?? "1"
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

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

function envRate(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return fallback;
  return raw;
}

const FUNNEL_SHARED_MIN_EVENTS = envInt("FUNNEL_SESSION_COVERAGE_MIN_EVENTS", 50);
const FUNNEL_SHARED_MIN_RATE = envRate("FUNNEL_SESSION_COVERAGE_MIN_RATE", 0.8);

type FunnelEventConfig = {
  eventName: string;
  minEvents: number;
  minRate: number;
};

const FUNNEL_EVENT_CONFIGS: FunnelEventConfig[] = [
  {
    eventName: "cart_viewed",
    minEvents: envInt("FUNNEL_SESSION_COVERAGE_CART_VIEWED_MIN_EVENTS", FUNNEL_SHARED_MIN_EVENTS),
    minRate: envRate("FUNNEL_SESSION_COVERAGE_CART_VIEWED_MIN_RATE", FUNNEL_SHARED_MIN_RATE),
  },
  {
    eventName: "checkout_started",
    minEvents: envInt("FUNNEL_SESSION_COVERAGE_CHECKOUT_STARTED_MIN_EVENTS", FUNNEL_SHARED_MIN_EVENTS),
    minRate: envRate("FUNNEL_SESSION_COVERAGE_CHECKOUT_STARTED_MIN_RATE", FUNNEL_SHARED_MIN_RATE),
  },
  {
    eventName: "order_placed",
    minEvents: envInt("FUNNEL_SESSION_COVERAGE_ORDER_PLACED_MIN_EVENTS", FUNNEL_SHARED_MIN_EVENTS),
    minRate: envRate("FUNNEL_SESSION_COVERAGE_ORDER_PLACED_MIN_RATE", FUNNEL_SHARED_MIN_RATE),
  },
];

// ── Module state ─────────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastEvaluatedDay: string | null = null;

// ── Public API ───────────────────────────────────────────────────────────────

export function startSessionCoverageMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED && !FUNNEL_ENABLED) {
    logger.info("sessionCoverageMonitor: both upsell and funnel coverage monitors disabled");
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
      upsellEnabled: ENABLED,
      minEvents: MIN_EVENTS,
      minRate: MIN_RATE,
      funnelEnabled: FUNNEL_ENABLED,
      funnelSharedMinEvents: FUNNEL_SHARED_MIN_EVENTS,
      funnelSharedMinRate: FUNNEL_SHARED_MIN_RATE,
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

    await Promise.all([
      ENABLED ? runUpsellCoverageCheck(day) : Promise.resolve(),
      FUNNEL_ENABLED ? runFunnelCoverageChecks(day) : Promise.resolve(),
    ]);

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

export type FunnelSessionCoverageDailyBucket = {
  eventName: string;
  day: string;
  platform: string;
  total: number;
  withSessionId: number;
  coveragePct: number | null;
};

// ── Dashboard helpers ─────────────────────────────────────────────────────────

/**
 * Load per-(day, platform) session ID coverage for `upsell_item_added` events
 * in the given window. Used by the admin funnels dashboard so the coverage
 * trend is visible alongside the session-level conversion numbers.
 */
export async function loadDailySessionCoverage(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<SessionCoverageDailyBucket[]> {
  const rows = await loadCoverageRows("upsell_item_added", startDayUtc, endDayUtcExclusive, true);
  return rows;
}

/**
 * Load per-(eventName, day, platform) session ID coverage for the key funnel
 * event types: `cart_viewed`, `checkout_started`, and `order_placed`.
 * Used by the admin funnels dashboard so ops can see exactly which event
 * stream has a session_id coverage regression.
 */
export async function loadDailyFunnelSessionCoverage(
  startDayUtc: Date,
  endDayUtcExclusive: Date,
): Promise<FunnelSessionCoverageDailyBucket[]> {
  const eventNames = FUNNEL_EVENT_CONFIGS.map((c) => c.eventName);
  const rows = await loadCoverageRowsMulti(eventNames, startDayUtc, endDayUtcExclusive);
  return rows;
}

// ── Internal checks ───────────────────────────────────────────────────────────

async function runUpsellCoverageCheck(day: { iso: string; start: Date; end: Date }): Promise<void> {
  const rows = await loadCoverageRows("upsell_item_added", day.start, day.end);

  if (rows.length === 0) {
    logger.info(
      { day: day.iso },
      "sessionCoverageMonitor: no upsell_item_added events for day, nothing to evaluate",
    );
    return;
  }

  const totalEvents = rows.reduce((s, r) => s + r.total, 0);
  const totalWithSession = rows.reduce((s, r) => s + r.withSessionId, 0);

  if (totalEvents < MIN_EVENTS) {
    logger.info(
      { day: day.iso, totalEvents, minEvents: MIN_EVENTS },
      "sessionCoverageMonitor: too few upsell_item_added events for reliable check, skipping",
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
      "sessionCoverageMonitor: upsell_item_added session ID coverage within threshold",
    );
  }
}

async function runFunnelCoverageChecks(day: { iso: string; start: Date; end: Date }): Promise<void> {
  await Promise.all(
    FUNNEL_EVENT_CONFIGS.map((cfg) => runSingleFunnelCoverageCheck(day, cfg)),
  );
}

async function runSingleFunnelCoverageCheck(
  day: { iso: string; start: Date; end: Date },
  cfg: FunnelEventConfig,
): Promise<void> {
  const rows = await loadCoverageRows(cfg.eventName, day.start, day.end);

  if (rows.length === 0) {
    logger.info(
      { day: day.iso, eventName: cfg.eventName },
      "sessionCoverageMonitor: no events for day, nothing to evaluate",
    );
    return;
  }

  const totalEvents = rows.reduce((s, r) => s + r.total, 0);
  const totalWithSession = rows.reduce((s, r) => s + r.withSessionId, 0);

  if (totalEvents < cfg.minEvents) {
    logger.info(
      { day: day.iso, eventName: cfg.eventName, totalEvents, minEvents: cfg.minEvents },
      "sessionCoverageMonitor: too few events for reliable check, skipping",
    );
    return;
  }

  const coverageRate = totalWithSession / totalEvents;
  const coveragePct = Math.round(coverageRate * 1000) / 10;

  if (coverageRate < cfg.minRate) {
    await sendAlert({
      title: `Session ID coverage below threshold — ${cfg.eventName}`,
      body:
        `Session ID coverage for \`${cfg.eventName}\` events on ${day.iso} (UTC) ` +
        `was ${coveragePct}% (${totalWithSession}/${totalEvents} events), ` +
        `below the ${(cfg.minRate * 100).toFixed(0)}% threshold. ` +
        `A client build or code path may have stopped sending session_id on this event type, ` +
        `which silently degrades funnel attribution accuracy.`,
      severity: "warn",
      fields: rows.map((r) => ({
        title: r.platform,
        value: `${r.withSessionId}/${r.total} events with session_id (${r.coveragePct !== null ? r.coveragePct.toFixed(1) : "—"}%)`,
      })),
      source: "sessionCoverageMonitor",
    });
  } else {
    logger.info(
      { day: day.iso, eventName: cfg.eventName, coveragePct, totalEvents, minRate: cfg.minRate },
      "sessionCoverageMonitor: session ID coverage within threshold",
    );
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

type RawCoverageRow = {
  day: string;
  platform: string | null;
  total: number;
  withSessionId: number;
};

/**
 * Query coverage rows for a single event name. When `perDay` is true the
 * result is grouped by (day, platform); when false (single-day alert path)
 * grouping is just by platform to keep the result compact.
 */
async function loadCoverageRows(
  eventName: string,
  start: Date,
  end: Date,
  perDay = false,
): Promise<SessionCoverageDailyBucket[]> {
  const dayExpr = sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;

  const rows = (await db
    .select({
      day: perDay
        ? dayExpr
        : sql<string>`${start.toISOString().slice(0, 10)}`,
      platform: analyticsEventsTable.platform,
      total: sql<number>`count(*)::int`,
      withSessionId: sql<number>`count(${analyticsEventsTable.sessionId})::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} = ${eventName}`,
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

type RawMultiCoverageRow = {
  eventName: string;
  day: string;
  platform: string | null;
  total: number;
  withSessionId: number;
};

/**
 * Query per-(eventName, day, platform) coverage rows for multiple event names
 * in a single pass. Used by the dashboard to avoid N separate queries.
 */
async function loadCoverageRowsMulti(
  eventNames: string[],
  start: Date,
  end: Date,
): Promise<FunnelSessionCoverageDailyBucket[]> {
  if (!eventNames.length) return [];

  const dayExpr = sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;

  const rows = (await db
    .select({
      eventName: analyticsEventsTable.name,
      day: dayExpr,
      platform: analyticsEventsTable.platform,
      total: sql<number>`count(*)::int`,
      withSessionId: sql<number>`count(${analyticsEventsTable.sessionId})::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        inArray(analyticsEventsTable.name, eventNames as [string, ...string[]]),
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(
      analyticsEventsTable.name,
      sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`,
      analyticsEventsTable.platform,
    )) as RawMultiCoverageRow[];

  return rows
    .map((r) => {
      const total = r.total ?? 0;
      const withSessionId = r.withSessionId ?? 0;
      return {
        eventName: r.eventName ?? "unknown",
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
      if (a.eventName !== b.eventName) return a.eventName < b.eventName ? -1 : 1;
      return a.platform < b.platform ? -1 : 1;
    });
}
