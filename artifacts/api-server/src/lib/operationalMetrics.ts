import type { NextFunction, Request, Response } from "express";
import { getPoolStats } from "@workspace/db";
import { getImageProxyMetrics } from "./imageProxyMetrics";
import { getAnalyticsSamplingStats } from "./analyticsSampling";
import { getHttpLoggingStats } from "./httpLoggingPolicy";

type CacheResult = "hit" | "miss" | "bypass" | "unknown";

type RequestCounter = {
  count: number;
  status: Record<string, number>;
  totalDurationMs: number;
  maxDurationMs: number;
  responseBytes: number;
  bytesKnown: number;
  cache: Record<CacheResult, number>;
};

type WorkerCounter = {
  runs: number;
  skips: number;
  failures: number;
  unownedCompletions: number;
  totalDurationMs: number;
  maxDurationMs: number;
  skipReasons: Record<string, number>;
};

type OutboundCounter = {
  calls: number;
  successes: number;
  failures: number;
  retries: number;
  totalDurationMs: number;
  maxDurationMs: number;
  status: Record<string, number>;
};

const startedAt = new Date();
const requestCounters = new Map<string, RequestCounter>();
const workerCounters = new Map<string, WorkerCounter>();
const outboundCounters = new Map<string, OutboundCounter>();
const MAX_ROUTE_COUNTERS = 250;
const MAX_WORKER_COUNTERS = 100;
const MAX_OUTBOUND_COUNTERS = 50;
const MAX_SKIP_REASONS = 20;

const emptyCacheCounts = (): Record<CacheResult, number> => ({
  hit: 0,
  miss: 0,
  bypass: 0,
  unknown: 0,
});

function routeLabel(method: string, route: string): string {
  const sanitized = route
    .split("?")[0]
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .slice(0, 120);
  return `${method.toUpperCase()} ${sanitized || "/"}`;
}

function cacheResult(res: Response): CacheResult {
  const age = Number(res.getHeader("age"));
  if (Number.isFinite(age) && age > 0) return "hit";

  const cacheHeaders = [
    res.getHeader("x-cache"),
    res.getHeader("x-cache-status"),
    res.getHeader("cf-cache-status"),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (/\b(hit|cached)\b/.test(cacheHeaders)) return "hit";
  if (/\b(miss|uncached|bypass)\b/.test(cacheHeaders)) return "miss";

  const cacheControl = String(res.getHeader("cache-control") ?? "").toLowerCase();
  if (cacheControl.includes("no-store") || cacheControl.includes("private")) {
    return "bypass";
  }
  return "unknown";
}

function getRequestCounter(label: string): RequestCounter {
  let counter = requestCounters.get(label);
  if (!counter) {
    const key =
      requestCounters.size < MAX_ROUTE_COUNTERS - 1 ? label : "OTHER /:route";
    counter = requestCounters.get(key);
    if (!counter) {
      counter = {
        count: 0,
        status: {},
        totalDurationMs: 0,
        maxDurationMs: 0,
        responseBytes: 0,
        bytesKnown: 0,
        cache: emptyCacheCounts(),
      };
      requestCounters.set(key, counter);
    }
  }
  return counter;
}

export function recordHttpRequest(input: {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  responseBytes: number | null;
  cache: CacheResult;
}): void {
  const counter = getRequestCounter(routeLabel(input.method, input.route));
  counter.count += 1;
  const status = String(input.statusCode);
  counter.status[status] = (counter.status[status] ?? 0) + 1;
  counter.totalDurationMs += input.durationMs;
  counter.maxDurationMs = Math.max(counter.maxDurationMs, input.durationMs);
  counter.cache[input.cache] += 1;
  if (input.responseBytes !== null && Number.isFinite(input.responseBytes)) {
    counter.responseBytes += input.responseBytes;
    counter.bytesKnown += 1;
  }
}

export function recordWorkerRun(
  jobName: string,
  outcome: "success" | "failure" | "unowned",
  durationMs: number,
): void {
  const requestedJobName =
    jobName.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80) || "unknown";
  const normalizedJobName =
    workerCounters.has(requestedJobName) ||
    workerCounters.size < MAX_WORKER_COUNTERS - 1
      ? requestedJobName
      : "other";
  const counter = workerCounters.get(normalizedJobName) ?? {
    runs: 0,
    skips: 0,
    failures: 0,
    unownedCompletions: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    skipReasons: {},
  };
  counter.runs += 1;
  if (outcome === "failure") counter.failures += 1;
  if (outcome === "unowned") counter.unownedCompletions += 1;
  counter.totalDurationMs += durationMs;
  counter.maxDurationMs = Math.max(counter.maxDurationMs, durationMs);
  workerCounters.set(normalizedJobName, counter);
}

export function recordWorkerSkip(jobName: string, reason: string): void {
  const requestedJobName =
    jobName.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80) || "unknown";
  const normalizedJobName =
    workerCounters.has(requestedJobName) ||
    workerCounters.size < MAX_WORKER_COUNTERS - 1
      ? requestedJobName
      : "other";
  const counter = workerCounters.get(normalizedJobName) ?? {
    runs: 0,
    skips: 0,
    failures: 0,
    unownedCompletions: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    skipReasons: {},
  };
  counter.skips += 1;
  const requestedReason =
    reason.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80) || "unknown";
  const normalizedReason =
    Object.hasOwn(counter.skipReasons, requestedReason) ||
    Object.keys(counter.skipReasons).length < MAX_SKIP_REASONS - 1
      ? requestedReason
      : "other";
  counter.skipReasons[normalizedReason] =
    (counter.skipReasons[normalizedReason] ?? 0) + 1;
  workerCounters.set(normalizedJobName, counter);
}

export function recordOutboundCall(input: {
  service: string;
  outcome: "success" | "failure";
  statusCode?: number;
  retries?: number;
  durationMs: number;
}): void {
  const requestedService =
    input.service
      .split(/[/?#]/, 1)[0]
      .replace(/[^a-zA-Z0-9_.:-]/g, "")
      .slice(0, 80) || "unknown";
  const service =
    outboundCounters.has(requestedService) ||
    outboundCounters.size < MAX_OUTBOUND_COUNTERS - 1
      ? requestedService
      : "other";
  const counter = outboundCounters.get(service) ?? {
    calls: 0,
    successes: 0,
    failures: 0,
    retries: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    status: {},
  };
  counter.calls += 1;
  if (input.outcome === "success") counter.successes += 1;
  else counter.failures += 1;
  counter.retries += Math.max(0, Math.floor(input.retries ?? 0));
  counter.totalDurationMs += input.durationMs;
  counter.maxDurationMs = Math.max(counter.maxDurationMs, input.durationMs);
  if (input.statusCode !== undefined) {
    const status =
      Number.isInteger(input.statusCode) &&
      input.statusCode >= 100 &&
      input.statusCode <= 599
        ? String(input.statusCode)
        : "other";
    counter.status[status] = (counter.status[status] ?? 0) + 1;
  }
  outboundCounters.set(service, counter);
}

function average(total: number, count: number): number {
  return count ? Math.round((total / count) * 100) / 100 : 0;
}

export function getOperationalMetrics() {
  const memory = process.memoryUsage();
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    process: {
      pid: process.pid,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.round(process.uptime() * 100) / 100,
      memoryBytes: memory,
    },
    requests: Object.fromEntries(
      [...requestCounters.entries()].map(([route, counter]) => [
        route,
        {
          ...counter,
          averageDurationMs: average(counter.totalDurationMs, counter.count),
        },
      ]),
    ),
    workers: Object.fromEntries(
      [...workerCounters.entries()].map(([jobName, counter]) => [
        jobName,
        {
          ...counter,
          averageDurationMs: average(counter.totalDurationMs, counter.runs),
        },
      ]),
    ),
    outbound: Object.fromEntries(
      [...outboundCounters.entries()].map(([service, counter]) => [
        service,
        {
          ...counter,
          averageDurationMs: average(counter.totalDurationMs, counter.calls),
        },
      ]),
    ),
    database: {
      capturedAt: new Date().toISOString(),
      pool: getPoolStats(),
    },
    analyticsSampling: getAnalyticsSamplingStats(),
    logging: {
      httpRequests: getHttpLoggingStats(),
    },
    imageProxy: getImageProxyMetrics(),
  };
}

export function operationalMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const started = process.hrtime.bigint();
  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const contentLength = res.getHeader("content-length");
    const bytes =
      typeof contentLength === "string" || typeof contentLength === "number"
        ? Number(contentLength)
        : null;
    recordHttpRequest({
      method: req.method,
      route:
        typeof req.route?.path === "string"
          ? `${req.baseUrl}${req.route.path}`
          : "/:unmatched",
      statusCode: res.statusCode,
      durationMs,
      responseBytes: Number.isFinite(bytes) ? bytes : null,
      cache: cacheResult(res),
    });
  });
  next();
}

export function resetOperationalMetricsForTest(): void {
  requestCounters.clear();
  workerCounters.clear();
  outboundCounters.clear();
}