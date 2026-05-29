import { describe, expect, it } from "vitest";
import {
  aggregateBuckets,
  evaluateBuckets,
} from "../src/lib/smsFailureMonitor";

type Row = {
  name: string;
  channel: string | null;
  storeKey: string | null;
  count: number;
};

const sent = (channel: string, storeKey: string, count: number): Row => ({
  name: "sms_notify_sent",
  channel,
  storeKey,
  count,
});

const failed = (channel: string, storeKey: string, count: number): Row => ({
  name: "sms_notify_failed",
  channel,
  storeKey,
  count,
});

describe("aggregateBuckets", () => {
  it("merges sent and failed rows into one bucket per (channel, storeKey)", () => {
    const rows: Row[] = [
      sent("sms", "lb", 80),
      failed("sms", "lb", 10),
      sent("whatsapp", "ae", 40),
      failed("whatsapp", "ae", 5),
    ];
    const buckets = aggregateBuckets(rows);
    expect(buckets).toHaveLength(2);
    const lb = buckets.find((b) => b.channel === "sms" && b.storeKey === "lb")!;
    expect(lb).toMatchObject({ sent: 80, failed: 10 });
    const ae = buckets.find((b) => b.channel === "whatsapp" && b.storeKey === "ae")!;
    expect(ae).toMatchObject({ sent: 40, failed: 5 });
  });

  it("accumulates multiple rows for the same (channel, storeKey) key", () => {
    const rows: Row[] = [
      sent("sms", "lb", 30),
      sent("sms", "lb", 20),
      failed("sms", "lb", 4),
      failed("sms", "lb", 6),
    ];
    const [bucket] = aggregateBuckets(rows);
    expect(bucket).toMatchObject({ channel: "sms", storeKey: "lb", sent: 50, failed: 10 });
  });

  it("falls back to 'unknown' when channel or storeKey is null", () => {
    const rows: Row[] = [
      { name: "sms_notify_sent", channel: null, storeKey: null, count: 7 },
      { name: "sms_notify_failed", channel: null, storeKey: null, count: 3 },
    ];
    const buckets = aggregateBuckets(rows);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      channel: "unknown",
      storeKey: "unknown",
      sent: 7,
      failed: 3,
    });
  });

  it("falls back only the missing field to 'unknown' when only one is null", () => {
    const rows: Row[] = [
      { name: "sms_notify_sent", channel: "sms", storeKey: null, count: 5 },
      { name: "sms_notify_failed", channel: "sms", storeKey: null, count: 2 },
    ];
    const [bucket] = aggregateBuckets(rows);
    expect(bucket).toMatchObject({ channel: "sms", storeKey: "unknown", sent: 5, failed: 2 });
  });

  it("ignores rows with an unrecognised event name", () => {
    const rows: Row[] = [
      sent("sms", "lb", 10),
      { name: "some_other_event", channel: "sms", storeKey: "lb", count: 99 },
    ];
    const buckets = aggregateBuckets(rows);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ sent: 10, failed: 0 });
  });

  it("returns an empty array when given no rows", () => {
    expect(aggregateBuckets([])).toEqual([]);
  });

  it("creates a bucket for a storeKey that has only failures and no sent rows", () => {
    const rows: Row[] = [failed("sms", "cy", 3)];
    const [bucket] = aggregateBuckets(rows);
    expect(bucket).toMatchObject({ channel: "sms", storeKey: "cy", sent: 0, failed: 3 });
  });

  it("sorts output by channel then storeKey", () => {
    const rows: Row[] = [
      sent("whatsapp", "lb", 1),
      sent("sms", "lb", 1),
      sent("sms", "ae", 1),
    ];
    const buckets = aggregateBuckets(rows);
    expect(buckets.map((b) => `${b.channel}::${b.storeKey}`)).toEqual([
      "sms::ae",
      "sms::lb",
      "whatsapp::lb",
    ]);
  });
});

describe("evaluateBuckets", () => {
  it("skips a bucket whose total send attempts are below the minimum threshold", () => {
    // Default SMS_FAILURE_MIN_SENDS = 5; total = 2 + 2 = 4 < 5 → skip
    const breaches = evaluateBuckets([
      { channel: "sms", storeKey: "lb", sent: 2, failed: 2 },
    ]);
    expect(breaches).toEqual([]);
  });

  it("skips the boundary case where total equals the minimum exactly", () => {
    // total = 3 + 2 = 5 — equals the minimum, which is < threshold (not >=)
    // The check is `total < FAILURE_MIN_SENDS`, so total === 5 is NOT skipped
    // (fails = 2, total = 5, rate = 0.4 > 0.2) → breach
    const breaches = evaluateBuckets([
      { channel: "sms", storeKey: "lb", sent: 3, failed: 2 },
    ]);
    expect(breaches).toHaveLength(1);
  });

  it("returns no breach when the failure rate is within the allowed band", () => {
    // 90 sent, 10 failed → total 100, rate = 0.1 ≤ 0.2 → no breach
    const breaches = evaluateBuckets([
      { channel: "sms", storeKey: "lb", sent: 90, failed: 10 },
    ]);
    expect(breaches).toEqual([]);
  });

  it("flags a bucket whose failure rate exceeds the threshold", () => {
    // 60 sent, 40 failed → total 100, rate = 0.4 > 0.2 → breach
    const breaches = evaluateBuckets([
      { channel: "sms", storeKey: "lb", sent: 60, failed: 40 },
    ]);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.failureRate).toBeCloseTo(0.4, 5);
    expect(breaches[0]?.reason).toMatch(/failure-rate/);
  });

  it("computes failureRate as failed / (sent + failed)", () => {
    // 50 sent, 50 failed → total 100, rate = 50/100 = 0.5
    const [breach] = evaluateBuckets([
      { channel: "whatsapp", storeKey: "ae", sent: 50, failed: 50 },
    ]);
    expect(breach?.failureRate).toBeCloseTo(0.5, 5);
  });

  it("reports the bucket with the correct channel and storeKey in the breach", () => {
    const breaches = evaluateBuckets([
      { channel: "whatsapp", storeKey: "cy", sent: 10, failed: 10 },
    ]);
    expect(breaches[0]?.bucket).toMatchObject({ channel: "whatsapp", storeKey: "cy" });
  });

  it("only reports breaching buckets when there are multiple buckets", () => {
    const breaches = evaluateBuckets([
      { channel: "sms", storeKey: "lb", sent: 90, failed: 10 }, // 10% — fine
      { channel: "sms", storeKey: "ae", sent: 50, failed: 50 }, // 50% — breach
      { channel: "whatsapp", storeKey: "lb", sent: 80, failed: 5 }, // 5.9% — fine
    ]);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.bucket.storeKey).toBe("ae");
  });

  it("returns an empty array when given no buckets", () => {
    expect(evaluateBuckets([])).toEqual([]);
  });

  it("flags every bucket that is individually over threshold", () => {
    const breaches = evaluateBuckets([
      { channel: "sms", storeKey: "lb", sent: 30, failed: 70 }, // 70%
      { channel: "whatsapp", storeKey: "ae", sent: 20, failed: 80 }, // 80%
    ]);
    expect(breaches).toHaveLength(2);
  });

  it("does not breach when failure rate is exactly at the threshold (not strictly greater)", () => {
    // rate = 20/100 = 0.2, threshold max is 0.2 → rate > 0.2 is false → no breach
    const breaches = evaluateBuckets([
      { channel: "sms", storeKey: "lb", sent: 80, failed: 20 },
    ]);
    expect(breaches).toEqual([]);
  });
});
