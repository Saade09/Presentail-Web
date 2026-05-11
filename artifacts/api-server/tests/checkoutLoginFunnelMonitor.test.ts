import { describe, expect, it } from "vitest";
import {
  aggregateBuckets,
  evaluateBuckets,
} from "../src/lib/checkoutLoginFunnelMonitor";

type Row = {
  name: string;
  platform: string | null;
  surface: string | null;
  action: string | null;
  count: number;
};

const v = (
  platform: string,
  surface: string,
  count: number,
): Row => ({
  name: "checkout_login_prompt_viewed",
  platform,
  surface,
  action: null,
  count,
});

const a = (
  platform: string,
  surface: string,
  action: string,
  count: number,
): Row => ({
  name: "checkout_login_prompt_action",
  platform,
  surface,
  action,
  count,
});

describe("aggregateBuckets", () => {
  it("rolls viewed and per-action counts into one bucket per (platform, surface)", () => {
    const rows: Row[] = [
      v("ios", "cart", 100),
      a("ios", "cart", "guest", 30),
      a("ios", "cart", "continue", 10),
      a("ios", "cart", "google", 5),
      a("ios", "cart", "apple", 5),
      a("ios", "cart", "dismissed", 50),
      v("web", "checkout-direct", 80),
      a("web", "checkout-direct", "guest", 20),
    ];
    const buckets = aggregateBuckets(rows);
    expect(buckets).toHaveLength(2);
    const ios = buckets.find((b) => b.platform === "ios")!;
    expect(ios).toMatchObject({
      surface: "cart",
      viewed: 100,
      guest: 30,
      signin: 20,
      dismissed: 50,
    });
    const web = buckets.find((b) => b.platform === "web")!;
    expect(web).toMatchObject({ guest: 20, viewed: 80 });
  });

  it("falls back to 'unknown' when platform/surface are missing", () => {
    const rows: Row[] = [v(null as any, null as any, 5)];
    const buckets = aggregateBuckets(rows);
    expect(buckets[0]).toMatchObject({
      platform: "unknown",
      surface: "unknown",
      viewed: 5,
    });
  });
});

describe("evaluateBuckets", () => {
  it("ignores buckets below the minimum sample size", () => {
    const breaches = evaluateBuckets([
      {
        platform: "ios",
        surface: "cart",
        viewed: 5,
        guest: 5,
        signin: 0,
        dismissed: 0,
        other: 0,
      },
    ]);
    expect(breaches).toEqual([]);
  });

  it("flags a guest-rate spike", () => {
    const breaches = evaluateBuckets([
      {
        platform: "ios",
        surface: "cart",
        viewed: 100,
        guest: 90,
        signin: 5,
        dismissed: 5,
        other: 0,
      },
    ]);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.reasons.some((r) => r.includes("guest-rate"))).toBe(
      true,
    );
  });

  it("flags a sign-in collapse", () => {
    const breaches = evaluateBuckets([
      {
        platform: "android",
        surface: "checkout-direct",
        viewed: 100,
        guest: 40,
        signin: 2,
        dismissed: 30,
        other: 0,
      },
    ]);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]?.reasons.some((r) => r.includes("sign-in rate"))).toBe(
      true,
    );
  });

  it("returns no breaches when ratios are within band", () => {
    const breaches = evaluateBuckets([
      {
        platform: "ios",
        surface: "cart",
        viewed: 100,
        guest: 50,
        signin: 30,
        dismissed: 20,
        other: 0,
      },
    ]);
    expect(breaches).toEqual([]);
  });
});
