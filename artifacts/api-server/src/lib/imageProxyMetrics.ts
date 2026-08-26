import { sendAlert } from "./alerts";
import { logger } from "./logger";

export type ImageProxyOutcome =
  | "cache_hit"
  | "cache_miss"
  | "coalesced"
  | "success"
  | "not_found"
  | "bad_request"
  | "non_image"
  | "oversized"
  | "empty"
  | "invalid_image"
  | "upstream_error"
  | "timeout"
  | "queue_full";

export type ImageProxyMetrics = {
  started: number;
  completed: number;
  cacheHits: number;
  cacheMisses: number;
  coalesced: number;
  queueRejected: number;
  activeLoads: number;
  waitingLoads: number;
  activeTransforms: number;
  waitingTransforms: number;
  maxActiveLoads: number;
  maxWaitingLoads: number;
  maxActiveTransforms: number;
  maxWaitingTransforms: number;
  upstreamStatus: Record<string, number>;
  outcomes: Record<string, number>;
  totalDurationMs: number;
  maxDurationMs: number;
  last5xxAt: string | null;
};

const metrics: ImageProxyMetrics = {
  started: 0,
  completed: 0,
  cacheHits: 0,
  cacheMisses: 0,
  coalesced: 0,
  queueRejected: 0,
  activeLoads: 0,
  waitingLoads: 0,
  activeTransforms: 0,
  waitingTransforms: 0,
  maxActiveLoads: 0,
  maxWaitingLoads: 0,
  maxActiveTransforms: 0,
  maxWaitingTransforms: 0,
  upstreamStatus: {},
  outcomes: {},
  totalDurationMs: 0,
  maxDurationMs: 0,
  last5xxAt: null,
};

let recent5xx = 0;
let recentRequests = 0;
let alertInFlight = false;
let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

export function recordImageProxyRequestStart(): void {
  metrics.started += 1;
}

export function recordImageProxyCacheEvent(state: "hit" | "miss" | "coalesced"): void {
  if (state === "hit") metrics.cacheHits += 1;
  if (state === "miss") metrics.cacheMisses += 1;
  if (state === "coalesced") metrics.coalesced += 1;
}

export function recordImageProxyLoadState(state: {
  activeLoads: number;
  waitingLoads: number;
}): void {
  metrics.activeLoads = state.activeLoads;
  metrics.waitingLoads = state.waitingLoads;
  metrics.maxActiveLoads = Math.max(metrics.maxActiveLoads, state.activeLoads);
  metrics.maxWaitingLoads = Math.max(metrics.maxWaitingLoads, state.waitingLoads);
}

export function recordImageTransformState(state: {
  activeTransforms: number;
  waitingTransforms: number;
}): void {
  metrics.activeTransforms = state.activeTransforms;
  metrics.waitingTransforms = state.waitingTransforms;
  metrics.maxActiveTransforms = Math.max(metrics.maxActiveTransforms, state.activeTransforms);
  metrics.maxWaitingTransforms = Math.max(metrics.maxWaitingTransforms, state.waitingTransforms);
}

export function recordImageProxyOutcome(
  outcome: ImageProxyOutcome,
  durationMs: number,
  upstreamStatus?: number,
): void {
  metrics.completed += 1;
  metrics.outcomes[outcome] = (metrics.outcomes[outcome] ?? 0) + 1;
  metrics.totalDurationMs += durationMs;
  metrics.maxDurationMs = Math.max(metrics.maxDurationMs, durationMs);
  if (upstreamStatus != null) {
    const key = String(upstreamStatus);
    metrics.upstreamStatus[key] = (metrics.upstreamStatus[key] ?? 0) + 1;
  }
  if (outcome === "queue_full") metrics.queueRejected += 1;

  recentRequests += 1;
  if (outcome === "upstream_error" || outcome === "timeout" || outcome === "queue_full") {
    recent5xx += 1;
    metrics.last5xxAt = new Date().toISOString();
  }
  if (recentRequests >= 100) {
    const rate = recent5xx / recentRequests;
    if (rate >= 0.1 && !alertInFlight && Date.now() - lastAlertAt > ALERT_COOLDOWN_MS) {
      alertInFlight = true;
      lastAlertAt = Date.now();
      void sendAlert({
        title: "Product image proxy 5xx rate elevated",
        body: "The image proxy has exceeded the 10% transient-failure threshold in its latest sample. Check upstream storage health and the proxy metrics endpoint.",
        severity: "critical",
        fields: [
          { title: "Sample", value: `${recentRequests} requests` },
          { title: "Failures", value: `${recent5xx} transient failures` },
        ],
        source: "imageProxyMetrics",
      }).catch((err: unknown) => {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, "image proxy alert failed");
      }).finally(() => {
        alertInFlight = false;
      });
    }
    recentRequests = 0;
    recent5xx = 0;
  }
}

export function getImageProxyMetrics(): ImageProxyMetrics & { averageDurationMs: number } {
  return {
    ...metrics,
    upstreamStatus: { ...metrics.upstreamStatus },
    outcomes: { ...metrics.outcomes },
    averageDurationMs: metrics.completed ? Math.round(metrics.totalDurationMs / metrics.completed) : 0,
  };
}

export function resetImageProxyMetricsForTest(): void {
  metrics.started = 0;
  metrics.completed = 0;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.coalesced = 0;
  metrics.queueRejected = 0;
  metrics.activeLoads = 0;
  metrics.waitingLoads = 0;
  metrics.activeTransforms = 0;
  metrics.waitingTransforms = 0;
  metrics.maxActiveLoads = 0;
  metrics.maxWaitingLoads = 0;
  metrics.maxActiveTransforms = 0;
  metrics.maxWaitingTransforms = 0;
  metrics.upstreamStatus = {};
  metrics.outcomes = {};
  metrics.totalDurationMs = 0;
  metrics.maxDurationMs = 0;
  metrics.last5xxAt = null;
  recent5xx = 0;
  recentRequests = 0;
  alertInFlight = false;
  lastAlertAt = 0;
}