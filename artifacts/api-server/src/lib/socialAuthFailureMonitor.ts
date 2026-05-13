import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert, type AlertField } from "./alerts";

// Watches the `auth_social_failed` rows that the mobile app emits
// whenever the native Google / Apple SDK rejects a sign-in attempt
// (Task #321 wired the persistence). The denominator is the matching
// `checkout_login_prompt_action` rows for action=google/apple — i.e.
// the number of shoppers who actually tapped "Continue with Google /
// Apple" on the login prompt. When the failure rate against attempts
// exceeds the configured threshold, Slack-alert with the top
// `error_code` buckets so ops can immediately see e.g. `-61440`
// (`errSecMissingEntitlement`) or Android `DEVELOPER_ERROR` spiking.
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

const SOCIAL_PROVIDERS = ["google", "apple"] as const;
type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastEvaluatedDay: string | null = null;

export function startSocialAuthFailureMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("socialAuthFailureMonitor: disabled");
    return;
  }
  if (timer) return;

  const baseline = setTimeout(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: err?.message },
        "socialAuthFailureMonitor: baseline run failed",
      );
    });
  }, 60_000);
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err) => {
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
    },
    "socialAuthFailureMonitor: started",
  );
}

export function stopSocialAuthFailureMonitor(): void {
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
        "socialAuthFailureMonitor: no attempts for day, nothing to evaluate",
      );
      return;
    }

    const breaches = evaluateBuckets(buckets);
    if (breaches.length > 0) {
      await sendBreachAlert(day.iso, breaches, buckets);
    } else {
      logger.info(
        { day: day.iso, buckets: buckets.length },
        "socialAuthFailureMonitor: failure rate within band",
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

export type ErrorCodeCount = {
  errorCode: string;
  count: number;
};

export type SocialAuthBucket = {
  platform: string;
  provider: SocialProvider;
  attempts: number;
  failures: number;
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

export function aggregateBuckets(rows: RawRow[]): SocialAuthBucket[] {
  type Mut = {
    platform: string;
    provider: SocialProvider;
    attempts: number;
    failures: number;
    errorCodes: Map<string, number>;
  };
  const map = new Map<string, Mut>();
  const get = (platform: string, provider: SocialProvider): Mut => {
    const key = `${platform}::${provider}`;
    let b = map.get(key);
    if (!b) {
      b = {
        platform,
        provider,
        attempts: 0,
        failures: 0,
        errorCodes: new Map(),
      };
      map.set(key, b);
    }
    return b;
  };

  for (const row of rows) {
    if (!isSocialProvider(row.action)) continue;
    const platform = row.platform ?? "unknown";
    const b = get(platform, row.action);
    if (row.name === "checkout_login_prompt_action") {
      b.attempts += row.count;
    } else if (row.name === "auth_social_failed") {
      b.failures += row.count;
      const code = row.errorCode ?? "unknown";
      b.errorCodes.set(code, (b.errorCodes.get(code) ?? 0) + row.count);
    }
  }

  return Array.from(map.values())
    .map((b) => ({
      platform: b.platform,
      provider: b.provider,
      attempts: b.attempts,
      failures: b.failures,
      topErrorCodes: Array.from(b.errorCodes.entries())
        .map(([errorCode, count]) => ({ errorCode, count }))
        .sort((a, b2) =>
          b2.count - a.count ||
          (a.errorCode < b2.errorCode ? -1 : a.errorCode > b2.errorCode ? 1 : 0),
        )
        .slice(0, 3),
    }))
    .sort((a, b) => {
      if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
      return a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0;
    });
}

export type SocialAuthBreach = {
  bucket: SocialAuthBucket;
  failureRate: number;
};

export function evaluateBuckets(
  buckets: SocialAuthBucket[],
): SocialAuthBreach[] {
  const breaches: SocialAuthBreach[] = [];
  for (const b of buckets) {
    if (b.attempts < MIN_ATTEMPTS) continue;
    const rate = b.failures / b.attempts;
    if (rate > FAILURE_RATE_MAX) {
      breaches.push({ bucket: b, failureRate: rate });
    }
  }
  return breaches;
}

async function sendBreachAlert(
  day: string,
  breaches: SocialAuthBreach[],
  allBuckets: SocialAuthBucket[],
): Promise<void> {
  const fields: AlertField[] = breaches.map(({ bucket, failureRate }) => {
    const codes =
      bucket.topErrorCodes.length > 0
        ? bucket.topErrorCodes
            .map((c) => `${c.errorCode}×${c.count}`)
            .join(", ")
        : "no error codes recorded";
    return {
      title: `${bucket.platform} / ${bucket.provider}`,
      value: `attempts ${bucket.attempts}, failures ${bucket.failures} (${(
        failureRate * 100
      ).toFixed(1)}%) — top codes: ${codes}`,
    };
  });

  const body =
    `Social sign-in failure rate exceeded ${(FAILURE_RATE_MAX * 100).toFixed(
      0,
    )}% on ${day} (UTC). ${breaches.length} (platform, provider) bucket(s) ` +
    `breached out of ${allBuckets.length} active. Check the top error codes ` +
    `against the Google/Apple sign-in gotchas in replit.md.`;

  await sendAlert({
    title: "Social sign-in failures spiking",
    body,
    severity: "warn",
    fields,
    source: "socialAuthFailureMonitor",
  });
}
