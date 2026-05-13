import { describe, expect, it } from "vitest";
import {
  aggregateBuckets,
  evaluateBuckets,
} from "../src/lib/socialAuthFailureMonitor";

type Row = {
  name: string;
  platform: string | null;
  action: string | null;
  errorCode: string | null;
  count: number;
};

const attempt = (
  platform: string,
  provider: "google" | "apple",
  count: number,
): Row => ({
  name: "checkout_login_prompt_action",
  platform,
  action: provider,
  errorCode: null,
  count,
});

const failure = (
  platform: string,
  provider: "google" | "apple",
  errorCode: string,
  count: number,
): Row => ({
  name: "auth_social_failed",
  platform,
  action: provider,
  errorCode,
  count,
});

describe("aggregateBuckets", () => {
  it("rolls attempts and failures into one bucket per (platform, provider) and ranks the top error codes", () => {
    const rows: Row[] = [
      attempt("ios", "google", 100),
      failure("ios", "google", "-61440", 30),
      failure("ios", "google", "-61440", 5),
      failure("ios", "google", "DEVELOPER_ERROR", 4),
      failure("ios", "google", "no_id_token", 1),
      failure("ios", "google", "module_load_failed", 2),
      attempt("android", "google", 50),
    ];
    const buckets = aggregateBuckets(rows);
    expect(buckets).toHaveLength(2);
    const ios = buckets.find(
      (b) => b.platform === "ios" && b.provider === "google",
    )!;
    expect(ios).toMatchObject({ attempts: 100, failures: 42 });
    expect(ios.topErrorCodes).toHaveLength(3);
    expect(ios.topErrorCodes[0]).toEqual({ errorCode: "-61440", count: 35 });
    expect(ios.topErrorCodes[1]).toEqual({
      errorCode: "DEVELOPER_ERROR",
      count: 4,
    });
    expect(ios.topErrorCodes[2]).toEqual({
      errorCode: "module_load_failed",
      count: 2,
    });
    const android = buckets.find((b) => b.platform === "android")!;
    expect(android).toMatchObject({ attempts: 50, failures: 0 });
    expect(android.topErrorCodes).toEqual([]);
  });

  it("ignores non-social actions and falls back to 'unknown' platform", () => {
    const rows: Row[] = [
      {
        name: "checkout_login_prompt_action",
        platform: "ios",
        action: "guest",
        errorCode: null,
        count: 50,
      },
      {
        name: "auth_social_failed",
        platform: null,
        action: "apple",
        errorCode: "no_identity_token",
        count: 3,
      },
      attempt("ios", "apple", 10),
    ];
    const buckets = aggregateBuckets(rows);
    expect(buckets).toHaveLength(2);
    const unknown = buckets.find((b) => b.platform === "unknown")!;
    expect(unknown).toMatchObject({
      provider: "apple",
      attempts: 0,
      failures: 3,
    });
    expect(unknown.topErrorCodes[0]?.errorCode).toBe("no_identity_token");
  });

  it("buckets a missing error_code as 'unknown'", () => {
    const rows: Row[] = [
      attempt("ios", "google", 30),
      {
        name: "auth_social_failed",
        platform: "ios",
        action: "google",
        errorCode: null,
        count: 4,
      },
    ];
    const [bucket] = aggregateBuckets(rows);
    expect(bucket?.topErrorCodes[0]).toEqual({
      errorCode: "unknown",
      count: 4,
    });
  });
});

describe("evaluateBuckets", () => {
  it("ignores buckets below the minimum sample size", () => {
    const breaches = evaluateBuckets([
      {
        platform: "ios",
        provider: "google",
        attempts: 5,
        failures: 5,
        topErrorCodes: [{ errorCode: "-61440", count: 5 }],
      },
    ]);
    expect(breaches).toEqual([]);
  });

  it("flags a bucket whose failure rate exceeds the threshold", () => {
    const breaches = evaluateBuckets([
      {
        platform: "ios",
        provider: "google",
        attempts: 100,
        failures: 60,
        topErrorCodes: [{ errorCode: "-61440", count: 60 }],
      },
    ]);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.failureRate).toBeCloseTo(0.6, 5);
  });

  it("returns no breaches when the failure rate is within band", () => {
    const breaches = evaluateBuckets([
      {
        platform: "android",
        provider: "google",
        attempts: 200,
        failures: 10,
        topErrorCodes: [{ errorCode: "DEVELOPER_ERROR", count: 10 }],
      },
    ]);
    expect(breaches).toEqual([]);
  });
});
