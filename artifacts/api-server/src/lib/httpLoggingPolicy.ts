export type HttpLogLevel = "silent" | "info" | "warn" | "error";

export type HttpLoggingConfig = {
  successSampleRate: number;
  slowRequestMs: number;
  debug: boolean;
};

const httpLogStats: Record<HttpLogLevel, number> = {
  silent: 0,
  info: 0,
  warn: 0,
  error: 0,
};

export function recordHttpLogDecision(level: HttpLogLevel): HttpLogLevel {
  httpLogStats[level] += 1;
  return level;
}

export function getHttpLoggingStats() {
  const config = getHttpLoggingConfig();
  const total = Object.values(httpLogStats).reduce(
    (sum, count) => sum + count,
    0,
  );
  return {
    ...httpLogStats,
    emitted: httpLogStats.info + httpLogStats.warn + httpLogStats.error,
    total,
    configuredSuccessSampleRate: config.successSampleRate,
    slowRequestMs: config.slowRequestMs,
    debug: config.debug,
  };
}

function boundedRate(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getHttpLoggingConfig(
  env: NodeJS.ProcessEnv = process.env,
): HttpLoggingConfig {
  return {
    successSampleRate: boundedRate(env.REQUEST_SUCCESS_LOG_RATE, 0.05),
    slowRequestMs: positiveNumber(env.SLOW_REQUEST_LOG_MS, 1_000),
    debug:
      env.DEBUG_REQUEST_LOGGING === "1" ||
      env.DEBUG_REQUEST_LOGGING === "true",
  };
}

export function stableRequestBucket(requestId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < requestId.length; index += 1) {
    hash ^= requestId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function isOperationallySensitivePath(url: string): boolean {
  return /\/(?:auth|checkout|payment|stripe|webhook|admin|security|healthz\/metrics)(?:\/|$)/i.test(
    url,
  );
}

export function resolveHttpLogLevel(
  input: {
    requestId: string;
    url: string;
    statusCode: number;
    durationMs: number;
    error?: Error;
  },
  config: HttpLoggingConfig = getHttpLoggingConfig(),
): HttpLogLevel {
  if (config.debug) return input.error ? "error" : "info";
  if (input.error || input.statusCode >= 500) return "error";
  if (input.statusCode >= 400) return "warn";
  if (
    input.durationMs >= config.slowRequestMs ||
    isOperationallySensitivePath(input.url.split("?")[0] ?? "")
  ) {
    return "info";
  }
  return stableRequestBucket(input.requestId) < config.successSampleRate
    ? "info"
    : "silent";
}