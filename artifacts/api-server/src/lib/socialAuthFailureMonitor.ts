import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { trackWorkerExecution } from "./inFlightWorkerExecutions";
import { sendAlert, type AlertField } from "./alerts";
import {
  aggregateBuckets as aggregateFailureBuckets,
  type SocialFailureRawRow,
} from "./socialAuthFailureAggregator";

// Watches the `auth_social_failed` rows that the mobile app emits
// whenever the native Google / Apple SDK rejects a sign-in attempt
// (Task #321 wired the persistence). The denominator is the matching
// `checkout_login_prompt_action` rows for action=google/apple — i.e.
// the number of shoppers who actually tapped "Continue with Google /
// Apple" on the login prompt.
//
// Three independent breach reasons can fire on the previous full UTC
// day, per (platform, provider) bucket:
//   1. failure-rate vs attempts exceeds `SOCIAL_AUTH_FAILURE_RATE_MAX`
//   2. absolute failure count exceeds `SOCIAL_AUTH_FAILURE_COUNT_MAX`
//   3. a previously-unseen error code appears with non-trivial volume
//      (≥ `SOCIAL_AUTH_NEW_ERROR_MIN_COUNT`), comparing against a
//      historical baseline window of `SOCIAL_AUTH_NEW_ERROR_BASELINE_DAYS`
//      preceding days (the evaluated day itself is excluded).
//
// Same shape as authExistsLookupMonitor / checkoutLoginFunnelMonitor:
// hourly tick, evaluate the previous full UTC day exactly once,
// idempotent log + Slack alert. Pruning of the shared analytics_events
// table is handled by the login-prompt monitor.

const ENABLED = (() => {
  const v = (
    process.env.SOCIAL_AUTH_FAILURE_MONITOR_ENABLED ?? "1"
  ).toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const TICK_MS = 60 * 60 * 1000; // 1h

const MIN_ATTEMPTS = (() => {
  const raw = Number(process.env.SOCIAL_AUTH_MIN_ATTEMPTS);
  if (!Number.isFinite(raw) || raw <= 0) return 20;
  return Math.floor(raw);
})();

function envRatio(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return fallback;
  return raw;
}

// 20 % default — a healthy day is well under 5 % (mostly cancels, which
// don't even produce `auth_social_failed`). Anything above 20 % across a
// full UTC day means a config / signing / SDK regression rather than
// noise.
const FAILURE_RATE_MAX = envRatio("SOCIAL_AUTH_FAILURE_RATE_MAX", 0.2);

function envPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

// Absolute failure-count threshold per (platform, provider) per day. Catches
// the case where a single platform racks up a lot of failures even though
// the rate looks fine because attempts also spiked (e.g. a Black-Friday
// volume day where 25 % rate is fine but 5 000 failures still warrants a
// page).
const FAILURE_COUNT_MAX = envPositiveInt("SOCIAL_AUTH_FAILURE_COUNT_MAX", 100);

// "Previously unseen error code" detection. Compare the evaluated day's
// error codes against the baseline window of preceding days (excluding the
// evaluated day itself). Any code with at least
// `SOCIAL_AUTH_NEW_ERROR_MIN_COUNT` failures that did not appear in the
// baseline is treated as a regression — a fresh native SDK error often
// means a config / signing change broke a path we've never seen fail
// before.
const NEW_ERROR_MIN_COUNT = envPositiveInt(
  "SOCIAL_AUTH_NEW_ERROR_MIN_COUNT",
  5,
);
const NEW_ERROR_BASELINE_DAYS = envPositiveInt(
  "SOCIAL_AUTH_NEW_ERROR_BASELINE_DAYS",
  14,
);

type SocialProvider = "google" | "apple";

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let running = false;
let lastEvaluatedDay: string | null = null;

export function startSocialAuthFailureMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("socialAuthFailureMonitor: disabled");
    return;
  }
  if (timer) return;

  startupTimer = setTimeout(() => {
    startupTimer = null;
    trackWorkerExecution("social-auth-failure", runOnce()).catch((err) => {
      logger.warn(
        { err: err?.message },
        "socialAuthFailureMonitor: baseline run failed",
      );
    });
  }, 60_000);
  startupTimer.unref?.();

  timer = setInterval(() => {
    trackWorkerExecution("social-auth-failure", runOnce()).catch((err) => {
      logger.warn(
        { err: err?.message },
        "socialAuthFailureMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    {
      tickMs: TICK_MS,
      minAttempts: MIN_ATTEMPTS,
      failureRateMax: FAILURE_RATE_MAX,
      failureCountMax: FAILURE_COUNT_MAX,
      newErrorMinCount: NEW_ERROR_MIN_COUNT,
      newErrorBaselineDays: NEW_ERROR_BASELINE_DAYS,
    },
    "socialAuthFailureMonitor: started",
  );
}

export function stopSocialAuthFailureMonitor(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
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

    const [buckets, baselineCodes] = await Promise.all([
      loadBuckets(day.start, day.end),
      loadKnownErrorCodes(day.start, NEW_ERROR_BASELINE_DAYS),
    ]);
    if (buckets.length === 0) {
      lastEvaluatedDay = day.iso;
      logger.info(
        { day: day.iso },
        "socialAuthFailureMonitor: no attempts for day, nothing to evaluate",
      );
      return;
    }

    const breaches = evaluateBuckets(buckets, baselineCodes);
    if (breaches.length > 0) {
      await sendBreachAlert(day.iso, breaches, buckets);
    } else {
      logger.info(
        { day: day.iso, buckets: buckets.length },
        "socialAuthFailureMonitor: all checks within band",
      );
    }
    lastEvaluatedDay = day.iso;
  } finally {
    running = false;
  }
}

/**
 * Returns a per-(platform, provider) set of `error_code`s seen in the
 * `baselineDays` preceding the evaluated day. Used to flag previously
 * unseen codes appearing on the evaluated day.
 */
export async function loadKnownErrorCodes(
  evaluatedDayStart: Date,
  baselineDays: number,
): Promise<Map<string, Set<string>>> {
  const start = new Date(
    evaluatedDayStart.getTime() - baselineDays * 24 * 60 * 60 * 1000,
  );
  const rows = (await db
    .selectDistinct({
      platform: analyticsEventsTable.platform,
      action: analyticsEventsTable.action,
      errorCode: analyticsEventsTable.errorCode,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} = 'auth_social_failed'`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, evaluatedDayStart),
      )!,
    )) as Array<{
    platform: string | null;
    action: string | null;
    errorCode: string | null;
  }>;

  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!isSocialProvider(r.action)) continue;
    const platform = r.platform ?? "unknown";
    const key = `${platform}::${r.action}`;
    const code = r.errorCode ?? "unknown";
    let set = out.get(key);
    if (!set) {
      set = new Set();
      out.set(key, set);
    }
    set.add(code);
  }
  return out;
}

function previousUtcDay(now: Date): { iso: string; start: Date; end: Date } {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const iso = start.toISOString().slice(0, 10);
  return { iso, start, end };
}

export type ErrorCodeCount = {
  errorCode: string;
  count: number;
};

export type SocialAuthBucket = {
  platform: string;
  provider: SocialProvider;
  attempts: number;
  failures: number;
  // Full per-code breakdown (sorted by count desc, then code asc) — used by
  // the new-error-code detector so a code ranked 4th+ for the day is still
  // visible. Inherits the sort from `socialAuthFailureAggregator`.
  errorCodes: ErrorCodeCount[];
  // Convenience slice (top 3) used purely for alert presentation. Always a
  // prefix of `errorCodes`.
  topErrorCodes: ErrorCodeCount[];
};

type RawRow = {
  name: string;
  platform: string | null;
  action: string | null;
  errorCode: string | null;
  count: number;
};

async function loadBuckets(start: Date, end: Date): Promise<SocialAuthBucket[]> {
  const rows = (await db
    .select({
      name: analyticsEventsTable.name,
      platform: analyticsEventsTable.platform,
      action: analyticsEventsTable.action,
      errorCode: analyticsEventsTable.errorCode,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} in ('auth_social_failed', 'checkout_login_prompt_action')`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(
      analyticsEventsTable.name,
      analyticsEventsTable.platform,
      analyticsEventsTable.action,
      analyticsEventsTable.errorCode,
    )) as RawRow[];

  return aggregateBuckets(rows);
}

function isSocialProvider(action: string | null): action is SocialProvider {
  return action === "google" || action === "apple";
}

const TOP_ERROR_CODES = 3;

export function aggregateBuckets(rows: RawRow[]): SocialAuthBucket[] {
  // Failures go through the shared aggregator so the dashboard summary and
  // this monitor can never disagree on per-(platform, provider) totals or
  // top error codes.
  const failureRows: SocialFailureRawRow[] = [];
  const attempts = new Map<string, number>();

  for (const row of rows) {
    if (!isSocialProvider(row.action)) continue;
    const platform = row.platform ?? "unknown";
    const key = `${platform}::${row.action}`;
    if (row.name === "auth_social_failed") {
      failureRows.push({
        platform,
        action: row.action,
        errorCode: row.errorCode,
        count: row.count,
      });
    } else if (row.name === "checkout_login_prompt_action") {
      attempts.set(key, (attempts.get(key) ?? 0) + row.count);
    }
  }

  const failureBuckets = aggregateFailureBuckets(failureRows);
  const out = new Map<string, SocialAuthBucket>();

  for (const fb of failureBuckets) {
    if (!isSocialProvider(fb.provider)) continue;
    const key = `${fb.platform}::${fb.provider}`;
    out.set(key, {
      platform: fb.platform,
      provider: fb.provider,
      attempts: attempts.get(key) ?? 0,
      failures: fb.total,
      errorCodes: fb.errorCodes,
      topErrorCodes: fb.errorCodes.slice(0, TOP_ERROR_CODES),
    });
  }

  // Surface attempt-only buckets (no failures recorded) so the dashboard /
  // alert footer can still show "android / google: 0 failures over N attempts".
  for (const [key, count] of attempts) {
    if (out.has(key)) continue;
    const [platform, providerRaw] = key.split("::");
    if (!isSocialProvider(providerRaw)) continue;
    out.set(key, {
      platform: platform!,
      provider: providerRaw,
      attempts: count,
      failures: 0,
      errorCodes: [],
      topErrorCodes: [],
    });
  }

  return Array.from(out.values()).sort((a, b) => {
    if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
    return a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0;
  });
}

export type SocialAuthBreach = {
  bucket: SocialAuthBucket;
  failureRate: number;
  reasons: string[];
  newErrorCodes: ErrorCodeCount[];
};

/**
 * Evaluate the per-(platform, provider) buckets for the day under three
 * independent rules. A bucket is reported as a breach if any reason fires.
 *
 * `knownErrorCodes` keys are `${platform}::${provider}`; values are the
 * sets of error codes seen across the baseline window. An empty Map
 * (or a missing key for a bucket) is treated as "no codes seen yet" —
 * cold-start warmup, where every code with sufficient volume is treated
 * as new. We accept the one-time first-deploy page in exchange for never
 * silently missing a real regression.
 */
export function evaluateBuckets(
  buckets: SocialAuthBucket[],
  knownErrorCodes: Map<string, Set<string>> = new Map(),
): SocialAuthBreach[] {
  const breaches: SocialAuthBreach[] = [];
  for (const b of buckets) {
    const reasons: string[] = [];
    const rate = b.attempts > 0 ? b.failures / b.attempts : 0;
    // Evaluate against the FULL per-code list, not the top-3 alert slice,
    // so a previously-unseen code ranked 4th+ for the day still trips.
    const known = knownErrorCodes.get(`${b.platform}::${b.provider}`);
    const newCodes = b.errorCodes.filter(
      (c) => c.count >= NEW_ERROR_MIN_COUNT && !(known?.has(c.errorCode) ?? false),
    );

    // Rate check needs a meaningful denominator; tiny samples are
    // suppressed so the % isn't dominated by a handful of outliers.
    if (b.attempts >= MIN_ATTEMPTS && rate > FAILURE_RATE_MAX) {
      reasons.push(
        `failure-rate ${(rate * 100).toFixed(1)}% > ${(
          FAILURE_RATE_MAX * 100
        ).toFixed(0)}%`,
      );
    }
    // Absolute failure-count check is intentionally INDEPENDENT of
    // MIN_ATTEMPTS — if ops sets a low cap, they probably want to be
    // paged on absolute pain even when attempts are small.
    if (b.failures > FAILURE_COUNT_MAX) {
      reasons.push(`failure-count ${b.failures} > ${FAILURE_COUNT_MAX}`);
    }

    // New-code detection runs even on small samples — a never-before-seen
    // native SDK error code with ≥ NEW_ERROR_MIN_COUNT hits is a strong
    // signal in its own right (e.g. a fresh `-61440` after a signing
    // change). Note: an empty baseline (cold start, or first time we see
    // this platform/provider) intentionally treats every code as new — we
    // would rather page once on first deploy than miss a real regression.
    if (newCodes.length > 0) {
      reasons.push(
        `new error code(s): ${newCodes
          .map((c) => `${c.errorCode}×${c.count}`)
          .join(", ")}`,
      );
    }

    if (reasons.length > 0) {
      breaches.push({ bucket: b, failureRate: rate, reasons, newErrorCodes: newCodes });
    }
  }
  return breaches;
}

async function sendBreachAlert(
  day: string,
  breaches: SocialAuthBreach[],
  allBuckets: SocialAuthBucket[],
): Promise<void> {
  const fields: AlertField[] = breaches.map(
    ({ bucket, failureRate, reasons }) => {
      const codes =
        bucket.topErrorCodes.length > 0
          ? bucket.topErrorCodes
              .map((c) => `${c.errorCode}×${c.count}`)
              .join(", ")
          : "no error codes recorded";
      return {
        title: `${bucket.platform} / ${bucket.provider}`,
        value:
          `attempts ${bucket.attempts}, failures ${bucket.failures} (${(
            failureRate * 100
          ).toFixed(1)}%) — top codes: ${codes} → ${reasons.join("; ")}`,
      };
    },
  );

  const body =
    `Social sign-in failure check tripped on ${day} (UTC). ` +
    `${breaches.length} (platform, provider) bucket(s) breached out of ` +
    `${allBuckets.length} active. Check the top error codes against the ` +
    `Google/Apple sign-in gotchas in replit.md.`;

  await sendAlert({
    title: "Social sign-in failures spiking",
    body,
    severity: "warn",
    fields,
    source: "socialAuthFailureMonitor",
  });
}
