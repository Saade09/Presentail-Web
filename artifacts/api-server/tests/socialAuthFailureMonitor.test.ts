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
  it("ignores buckets below the minimum sample size when there's no new code", () => {
    const breaches = evaluateBuckets(
      [
        {
          platform: "ios",
          provider: "google",
          attempts: 5,
          failures: 5,
          errorCodes: [{ errorCode: "-61440", count: 5 }],
          topErrorCodes: [{ errorCode: "-61440", count: 5 }],
        },
      ],
      new Map([["ios::google", new Set(["-61440"])]]),
    );
    expect(breaches).toEqual([]);
  });

  it("flags a bucket whose failure rate exceeds the threshold", () => {
    const breaches = evaluateBuckets(
      [
        {
          platform: "ios",
          provider: "google",
          attempts: 100,
          failures: 60,
          errorCodes: [{ errorCode: "-61440", count: 60 }],
          topErrorCodes: [{ errorCode: "-61440", count: 60 }],
        },
      ],
      new Map([["ios::google", new Set(["-61440"])]]),
    );
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.failureRate).toBeCloseTo(0.6, 5);
    expect(breaches[0]?.reasons.join(" ")).toMatch(/failure-rate/);
  });

  it("returns no breaches when both rate and count are within band", () => {
    const breaches = evaluateBuckets(
      [
        {
          platform: "android",
          provider: "google",
          attempts: 200,
          failures: 10,
          errorCodes: [{ errorCode: "DEVELOPER_ERROR", count: 10 }],
          topErrorCodes: [{ errorCode: "DEVELOPER_ERROR", count: 10 }],
        },
      ],
      new Map([["android::google", new Set(["DEVELOPER_ERROR"])]]),
    );
    expect(breaches).toEqual([]);
  });

  it("flags a bucket whose absolute failure count exceeds the threshold even when the rate looks fine", () => {
    // 5000 attempts, 200 failures = 4 % rate (well under 20 %), but 200
    // > the default 100-failure absolute cap → still alert.
    const breaches = evaluateBuckets([
      {
        platform: "android",
        provider: "google",
        attempts: 5000,
        failures: 200,
        errorCodes: [{ errorCode: "DEVELOPER_ERROR", count: 200 }], topErrorCodes: [{ errorCode: "DEVELOPER_ERROR", count: 200 }],
      },
    ]);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.reasons.join(" ")).toMatch(/failure-count/);
    expect(breaches[0]?.reasons.join(" ")).not.toMatch(/failure-rate/);
  });

  it("flags a previously-unseen error code with non-trivial volume even on a small sample", () => {
    const known = new Map([
      ["ios::google", new Set(["DEVELOPER_ERROR"])],
    ]);
    const breaches = evaluateBuckets(
      [
        {
          platform: "ios",
          provider: "google",
          attempts: 8, // below MIN_ATTEMPTS — rate check skipped
          failures: 6,
          errorCodes: [{ errorCode: "totally_new_native_code", count: 6 }],
          topErrorCodes: [
            { errorCode: "totally_new_native_code", count: 6 },
          ],
        },
      ],
      known,
    );
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.newErrorCodes).toEqual([
      { errorCode: "totally_new_native_code", count: 6 },
    ]);
    expect(breaches[0]?.reasons.join(" ")).toMatch(/new error code/);
  });

  it("does not flag a new error code below the minimum count gate", () => {
    const known = new Map([["ios::google", new Set<string>()]]);
    const breaches = evaluateBuckets(
      [
        {
          platform: "ios",
          provider: "google",
          attempts: 8,
          failures: 2,
          errorCodes: [{ errorCode: "rare_one_off", count: 2 }], topErrorCodes: [{ errorCode: "rare_one_off", count: 2 }],
        },
      ],
      known,
    );
    expect(breaches).toEqual([]);
  });

  it("flags a previously-unseen error code that ranks 4th+ for the day (outside the top-3 alert slice)", () => {
    const known = new Map([
      [
        "ios::google",
        new Set(["-61440", "DEVELOPER_ERROR", "no_id_token", "module_load_failed"]),
      ],
    ]);
    const breaches = evaluateBuckets(
      [
        {
          platform: "ios",
          provider: "google",
          attempts: 50,
          failures: 30,
          // Top-3 alert slice would be `-61440`, `DEVELOPER_ERROR`,
          // `no_id_token` (all known); the 4th-ranked code is the
          // previously-unseen one and must still trip the alert.
          errorCodes: [
            { errorCode: "-61440", count: 12 },
            { errorCode: "DEVELOPER_ERROR", count: 8 },
            { errorCode: "no_id_token", count: 4 },
            { errorCode: "fresh_native_code", count: 6 },
            { errorCode: "module_load_failed", count: 0 },
          ],
          topErrorCodes: [
            { errorCode: "-61440", count: 12 },
            { errorCode: "DEVELOPER_ERROR", count: 8 },
            { errorCode: "fresh_native_code", count: 6 },
          ],
        },
      ],
      known,
    );
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.newErrorCodes.map((c) => c.errorCode)).toEqual([
      "fresh_native_code",
    ]);
  });

  it("treats an empty baseline as no-known-codes-yet and still flags new codes (cold-start warmup)", () => {
    const breaches = evaluateBuckets(
      [
        {
          platform: "ios",
          provider: "google",
          attempts: 8, // small sample, rate/count checks suppressed
          failures: 6,
          errorCodes: [{ errorCode: "first_ever_code", count: 6 }],
          topErrorCodes: [{ errorCode: "first_ever_code", count: 6 }],
        },
      ],
      new Map(), // baseline window had zero historical rows
    );
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.reasons.join(" ")).toMatch(/new error code/);
    expect(breaches[0]?.newErrorCodes).toEqual([
      { errorCode: "first_ever_code", count: 6 },
    ]);
  });

  it("does not flag known error codes as new", () => {
    const known = new Map([
      ["ios::google", new Set(["-61440", "DEVELOPER_ERROR"])],
    ]);
    const breaches = evaluateBuckets(
      [
        {
          platform: "ios",
          provider: "google",
          attempts: 10,
          failures: 8,
          errorCodes: [{ errorCode: "-61440", count: 8 }],
          topErrorCodes: [{ errorCode: "-61440", count: 8 }],
        },
      ],
      known,
    );
    expect(breaches).toEqual([]);
  });
});
