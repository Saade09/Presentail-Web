export type AnalyticsSamplingMode = "shadow" | "enforce";

export type AnalyticsSamplingConfig = {
  mode: AnalyticsSamplingMode;
  webVitalRate: number;
  viewRate: number;
};

export type AnalyticsSamplingDecision = {
  persist: boolean;
  /** True only when the stable session hash is inside the configured cohort. */
  selected: boolean;
  /** True when a non-cohort event is preserved as an operational exception. */
  retainedByException: boolean;
  storedName: string;
  reason:
    | "sampled_in"
    | "sampled_out"
    | "outlier"
    | "error"
    | "missing_stable_id";
  mode: AnalyticsSamplingMode;
  sampleRate: number;
  sampleWeight: number;
  bucket: number | null;
};

const DEFAULT_WEB_VITAL_RATE = 0.1;
const DEFAULT_VIEW_RATE = 0.5;

function parseRate(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

export function getAnalyticsSamplingConfig(
  env: NodeJS.ProcessEnv = process.env,
): AnalyticsSamplingConfig {
  return {
    mode: env.ANALYTICS_SAMPLING_MODE === "shadow" ? "shadow" : "enforce",
    webVitalRate: parseRate(
      env.ANALYTICS_WEB_VITAL_SAMPLE_RATE,
      DEFAULT_WEB_VITAL_RATE,
    ),
    viewRate: parseRate(env.ANALYTICS_VIEW_SAMPLE_RATE, DEFAULT_VIEW_RATE),
  };
}

/**
 * Stable FNV-1a bucket in [0, 1). A session always lands in the same cohort,
 * which prevents route-by-route random sampling from biasing funnels.
 */
export function stableSamplingBucket(stableId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < stableId.length; i += 1) {
    hash ^= stableId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

const WEB_VITAL_POOR_THRESHOLDS: Readonly<Record<string, number>> = {
  LCP: 4_000,
  INP: 500,
  CLS: 0.25,
  TTFB: 1_800,
  FCP: 3_000,
};

export function isPoorWebVital(
  action: string | undefined,
  metricValue: number | undefined,
): boolean {
  if (!action || metricValue === undefined || !Number.isFinite(metricValue)) {
    return false;
  }
  const threshold = WEB_VITAL_POOR_THRESHOLDS[action];
  return threshold !== undefined && metricValue > threshold;
}

function decideCohort(
  stableId: string | undefined,
  sampleRate: number,
): { selected: boolean; bucket: number | null } {
  if (!stableId) return { selected: false, bucket: null };
  const bucket = stableSamplingBucket(stableId);
  return { selected: bucket < sampleRate, bucket };
}

function applyMode(
  selected: boolean,
  mode: AnalyticsSamplingMode,
): boolean {
  return mode === "shadow" ? true : selected;
}

export function decideViewSampling(
  stableId: string | undefined,
  config: AnalyticsSamplingConfig = getAnalyticsSamplingConfig(),
): AnalyticsSamplingDecision {
  const cohort = decideCohort(stableId, config.viewRate);
  const retainedByException = !stableId;
  const retained = cohort.selected || retainedByException;
  const reason = !stableId
    ? "missing_stable_id"
    : cohort.selected
      ? "sampled_in"
      : "sampled_out";
  return {
    persist: applyMode(retained, config.mode),
    selected: cohort.selected,
    retainedByException,
    storedName: "",
    reason,
    mode: config.mode,
    sampleRate: config.viewRate,
    sampleWeight:
      cohort.selected && config.viewRate > 0 ? 1 / config.viewRate : 1,
    bucket: cohort.bucket,
  };
}

/**
 * Normal vitals use the stable session cohort. Poor/error vitals outside that
 * cohort are retained under web_vital_outlier so percentile dashboards remain
 * based on an unbiased sample while operational regressions keep full fidelity.
 */
export function decideWebVitalSampling(
  input: {
    sessionId?: string;
    action?: string;
    metricValue?: number;
    errorCode?: string;
  },
  config: AnalyticsSamplingConfig = getAnalyticsSamplingConfig(),
): AnalyticsSamplingDecision {
  const cohort = decideCohort(input.sessionId, config.webVitalRate);
  const isError = Boolean(input.errorCode);
  const isOutlier = isPoorWebVital(input.action, input.metricValue);
  const retainedByException =
    !input.sessionId || (!cohort.selected && (isError || isOutlier));
  const retained = cohort.selected || retainedByException;
  const reason = !input.sessionId
    ? "missing_stable_id"
    : cohort.selected
      ? "sampled_in"
      : isError
        ? "error"
        : isOutlier
          ? "outlier"
          : "sampled_out";

  return {
    persist: applyMode(retained, config.mode),
    selected: cohort.selected,
    retainedByException,
    storedName:
      config.mode === "enforce" && !input.sessionId
        ? "web_vital_unattributed"
        : config.mode === "enforce" &&
            !cohort.selected &&
            (isError || isOutlier)
          ? "web_vital_outlier"
          : "web_vital",
    reason,
    mode: config.mode,
    sampleRate: config.webVitalRate,
    sampleWeight:
      cohort.selected && config.webVitalRate > 0 ? 1 / config.webVitalRate : 1,
    bucket: cohort.bucket,
  };
}

export function analyticsSamplingMetadata(
  decision: AnalyticsSamplingDecision,
): Record<string, unknown> {
  return {
    mode: decision.mode,
    rate: decision.sampleRate,
    selected: decision.selected,
    retainedByException: decision.retainedByException,
    reason: decision.reason,
    weight: decision.sampleWeight,
  };
}