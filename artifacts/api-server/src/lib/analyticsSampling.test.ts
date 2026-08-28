import { describe, expect, it } from "vitest";
import {
  decideViewSampling,
  decideWebVitalSampling,
  getAnalyticsSamplingConfig,
  stableSamplingBucket,
} from "./analyticsSampling";

const ENFORCE_ZERO = {
  mode: "enforce" as const,
  webVitalRate: 0,
  viewRate: 0,
};

describe("analytics sampling policy", () => {
  it("assigns a stable bucket for the same session", () => {
    expect(stableSamplingBucket("session-123")).toBe(
      stableSamplingBucket("session-123"),
    );
  });

  it("drops ordinary views outside the configured cohort", () => {
    expect(decideViewSampling("session-123", ENFORCE_ZERO)).toMatchObject({
      persist: false,
      selected: false,
      reason: "sampled_out",
    });
  });

  it("keeps every event in shadow mode while reporting the future decision", () => {
    expect(
      decideViewSampling("session-123", {
        ...ENFORCE_ZERO,
        mode: "shadow",
      }),
    ).toMatchObject({
      persist: true,
      selected: false,
      reason: "sampled_out",
      mode: "shadow",
      sampleWeight: 1,
    });
  });

  it("retains poor vitals outside the sample without biasing sampled percentiles", () => {
    expect(
      decideWebVitalSampling(
        {
          sessionId: "session-123",
          action: "LCP",
          metricValue: 5_000,
        },
        ENFORCE_ZERO,
      ),
    ).toMatchObject({
      persist: true,
      selected: false,
      retainedByException: true,
      storedName: "web_vital_outlier",
      reason: "outlier",
    });
  });

  it("keeps events without a stable ID instead of silently losing them", () => {
    expect(decideViewSampling(undefined, ENFORCE_ZERO)).toMatchObject({
      persist: true,
      selected: false,
      retainedByException: true,
      reason: "missing_stable_id",
    });
  });

  it("keeps sessionless vitals outside the percentile cohort", () => {
    expect(
      decideWebVitalSampling(
        { action: "LCP", metricValue: 1_500 },
        ENFORCE_ZERO,
      ),
    ).toMatchObject({
      persist: true,
      selected: false,
      retainedByException: true,
      storedName: "web_vital_unattributed",
      reason: "missing_stable_id",
    });
  });

  it("uses the approved default rates", () => {
    expect(getAnalyticsSamplingConfig({})).toEqual({
      mode: "enforce",
      webVitalRate: 0.1,
      viewRate: 0.5,
    });
  });
});