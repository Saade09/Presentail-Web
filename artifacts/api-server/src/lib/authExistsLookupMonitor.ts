import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert, type AlertField } from "./alerts";

// Monitors the structured `auth_exists_outcome` rows persisted by
// /api/auth/exists. The lookup has two upstream dependencies (WC REST +
// the WP JWT plugin); when either rotates / breaks, returning shoppers
// stop being recognised and silently get routed to sign-up. The
// inconclusive-rate (`lookup_failed` + `lookup_unavailable` /
// `wc_not_configured` over total) is the canary for that regression.
//
// Same shape as checkoutLoginFunnelMonitor: hourly tick, evaluate the
// previous full UTC day exactly once, idempotent log + Slack alert. We
// rely on the login-prompt monitor to prune the shared
// `analytics_events` table, so this file owns evaluation only.

const ENABLED = (() => {
  const v = (
    process.env.AUTH_EXISTS_LOOKUP_MONITOR_ENABLED ?? "1"
  ).toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1h

const MIN_LOOKUPS = (() => {
  const raw = Number(process.env.AUTH_EXISTS_MIN_LOOKUPS);
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.floor(raw);
})();

function envRatio(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return fallback;
  return raw;
}

// 5 % default — anything more than that for a full UTC day means the
// lookup is materially unreliable (vs. the typical sub-1 % from
// transient WC blips).
const INCONCLUSIVE_RATE_MAX = envRatio(
  "AUTH_EXISTS_INCONCLUSIVE_RATE_MAX",
  0.05,
);

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastEvaluatedDay: string | null = null;

export function startAuthExistsLookupMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("authExistsLookupMonitor: disabled");
    return;
  }
  if (timer) return;

  const baseline = setTimeout(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "authExistsLookupMonitor: baseline run failed",
      );
    });
  }, 60_000);
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "authExistsLookupMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    { tickMs: TICK_MS, minLookups: MIN_LOOKUPS, inconclusiveRateMax: INCONCLUSIVE_RATE_MAX },
    "authExistsLookupMonitor: started",
  );
}

export function stopAuthExistsLookupMonitor(): void {
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
        "authExistsLookupMonitor: no lookups for day, nothing to evaluate",
      );
      return;
    }

    const breaches = evaluateBuckets(buckets);
    if (breaches.length > 0) {
      await sendBreachAlert(day.iso, breaches, buckets);
    } else {
      logger.info(
        { day: day.iso, buckets: buckets.length },
        "authExistsLookupMonitor: inconclusive rate within band",
      );
    }
    lastEvaluatedDay = day.iso;
  } finally {
    running = false;
  }
}

function previousUtcDay(now: Date): { iso: string; start: Date; end: Date } {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const iso = start.toISOString().slice(0, 10);
  return { iso, start, end };
}

export type LookupBucket = {
  platform: string;
  total: number;
  existsTrue: number;
  existsFalse: number;
  invalidEmail: number;
  inconclusive: number;
};

type RawRow = {
  platform: string | null;
  action: string | null;
  count: number;
};

async function loadBuckets(start: Date, end: Date): Promise<LookupBucket[]> {
  const rows = (await db
    .select({
      platform: analyticsEventsTable.platform,
      action: analyticsEventsTable.action,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        eq(analyticsEventsTable.name, "auth_exists_outcome"),
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(
      analyticsEventsTable.platform,
      analyticsEventsTable.action,
    )) as RawRow[];

  return aggregateBuckets(rows);
}

const INCONCLUSIVE_OUTCOMES = new Set([
  "lookup_failed",
  "lookup_unavailable",
  "wc_not_configured",
]);

export function aggregateBuckets(rows: RawRow[]): LookupBucket[] {
  const map = new Map<string, LookupBucket>();
  for (const row of rows) {
    const platform = row.platform ?? "unknown";
    let b = map.get(platform);
    if (!b) {
      b = {
        platform,
        total: 0,
        existsTrue: 0,
        existsFalse: 0,
        invalidEmail: 0,
        inconclusive: 0,
      };
      map.set(platform, b);
    }
    b.total += row.count;
    const action = row.action ?? "";
    if (action === "exists_true_wc" || action === "exists_true_wp_probe") {
      b.existsTrue += row.count;
    } else if (action === "exists_false") {
      b.existsFalse += row.count;
    } else if (action === "invalid_email") {
      b.invalidEmail += row.count;
    } else if (INCONCLUSIVE_OUTCOMES.has(action)) {
      b.inconclusive += row.count;
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : 0,
  );
}

export type LookupBreach = {
  bucket: LookupBucket;
  inconclusiveRate: number;
};

export function evaluateBuckets(buckets: LookupBucket[]): LookupBreach[] {
  const breaches: LookupBreach[] = [];
  for (const b of buckets) {
    // Exclude `invalid_email` from the denominator: those are client-side
    // rejects, not upstream failures. They're noise for this signal.
    const denom = b.total - b.invalidEmail;
    if (denom < MIN_LOOKUPS) continue;
    const rate = b.inconclusive / denom;
    if (rate > INCONCLUSIVE_RATE_MAX) {
      breaches.push({ bucket: b, inconclusiveRate: rate });
    }
  }
  return breaches;
}

async function sendBreachAlert(
  day: string,
  breaches: LookupBreach[],
  allBuckets: LookupBucket[],
): Promise<void> {
  const fields: AlertField[] = breaches.map(({ bucket, inconclusiveRate }) => ({
    title: bucket.platform,
    value: `total ${bucket.total}, inconclusive ${bucket.inconclusive} (${(
      inconclusiveRate * 100
    ).toFixed(1)}%) — exists ${bucket.existsTrue}, missing ${bucket.existsFalse}`,
  }));
  await sendAlert({
    title: "Auth-exists lookup unreliable",
    body: `/api/auth/exists inconclusive rate exceeded ${(
      INCONCLUSIVE_RATE_MAX * 100
    ).toFixed(0)}% on ${day} (UTC). Returning shoppers may be silently routed to sign-up — check WC creds and the WP JWT plugin via GET /api/auth/diagnostics. ${breaches.length} platform(s) breached out of ${allBuckets.length}.`,
    severity: "warn",
    fields,
    source: "authExistsLookupMonitor",
  });
}
