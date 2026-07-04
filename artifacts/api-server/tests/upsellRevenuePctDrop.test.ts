import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  evaluateRevenuePctDropPerPlatform,
  sendRevenuePctDropAlert,
  type PlatformRevenuePct,
  type PlatformRevenuePctBreach,
} from "../src/lib/upsellFunnelMonitor";
import * as alertsModule from "../src/lib/alerts";

// ── Alert mock ────────────────────────────────────────────────────────────────

vi.mock("../src/lib/alerts", () => ({ sendAlert: vi.fn() }));

// ── Helpers ──────────────────────────────────────────────────────────────────

// Relative-date helper — keeps tests green on any calendar date.
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
// TODAY represents the "current" evaluation day passed to sendRevenuePctDropAlert.
const TODAY = daysAgo(0);

/** Build a current-day row for a platform. */
const cur = (
  platform: string,
  pct: number,
  orderCount: number,
): PlatformRevenuePct => ({ day: TODAY, platform, pct, orderCount });

/** Build a baseline-day row for a platform. */
const base = (
  platform: string,
  day: string,
  pct: number,
): PlatformRevenuePct => ({ day, platform, pct, orderCount: 10 });

/** Seven baseline days at a constant pct for a platform (days 7..1 ago). */
const sevenDays = (platform: string, pct: number): PlatformRevenuePct[] =>
  Array.from({ length: 7 }, (_, i) =>
    base(platform, daysAgo(7 - i), pct),
  );

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("evaluateRevenuePctDropPerPlatform", () => {
  describe("happy path — breaching vs healthy platform", () => {
    it("fires a breach for a platform whose drop exceeds dropMax", () => {
      const currentRows = [cur("ios", 5, 10)];
      const baselineRows = sevenDays("ios", 15); // avg 15 %, drop = 10 pp

      const { breaches, eligibleCount } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5, // minOrders
        5, // dropMax pp
      );

      expect(eligibleCount).toBe(1);
      expect(breaches).toHaveLength(1);
      expect(breaches[0]?.platform).toBe("ios");
    });

    it("does not breach for a platform whose drop is within the threshold", () => {
      const currentRows = [cur("android", 12, 10)];
      const baselineRows = sevenDays("android", 15); // avg 15 %, drop = 3 pp

      const { breaches, eligibleCount } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5, // minOrders
        5, // dropMax pp
      );

      expect(eligibleCount).toBe(1);
      expect(breaches).toHaveLength(0);
    });

    it("fires only for the breaching platform when two platforms are evaluated", () => {
      const currentRows = [
        cur("ios", 3, 10),     // drop = 12 pp — breach
        cur("android", 13, 10), // drop = 2 pp — healthy
      ];
      const baselineRows = [
        ...sevenDays("ios", 15),     // avg 15 %
        ...sevenDays("android", 15), // avg 15 %
      ];

      const { breaches, eligibleCount } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5, // minOrders
        5, // dropMax pp
      );

      expect(eligibleCount).toBe(2);
      expect(breaches).toHaveLength(1);
      expect(breaches[0]?.platform).toBe("ios");
    });

    it("does not breach when the current pct is above the trailing average", () => {
      const currentRows = [cur("ios", 20, 10)];
      const baselineRows = sevenDays("ios", 15); // avg 15 %, drop = -5 pp (gain)

      const { breaches } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5,
        5,
      );

      expect(breaches).toHaveLength(0);
    });
  });

  describe("breach record fields — current %, trailing avg, drop", () => {
    it("exposes the correct currentPct, trailingAvg, and drop on the breach object", () => {
      // Baseline: 3 days at 20 % and 4 days at 10 % → avg = (3*20 + 4*10)/7 = 100/7 ≈ 14.29 %
      const baselineRows = [
        base("ios", daysAgo(7), 20),
        base("ios", daysAgo(6), 20),
        base("ios", daysAgo(5), 20),
        base("ios", daysAgo(4), 10),
        base("ios", daysAgo(3), 10),
        base("ios", daysAgo(2), 10),
        base("ios", daysAgo(1), 10),
      ];
      const currentRows = [cur("ios", 2, 10)];

      const { breaches } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5,
        5,
      );

      expect(breaches).toHaveLength(1);
      const b = breaches[0]!;
      expect(b.currentPct).toBeCloseTo(2, 5);
      expect(b.trailingAvg).toBeCloseTo((3 * 20 + 4 * 10) / 7, 5);
      expect(b.drop).toBeCloseTo((3 * 20 + 4 * 10) / 7 - 2, 5);
      expect(b.baselineDays).toBe(7);
    });

    it("records baselineDays equal to the number of rows supplied for the platform", () => {
      const baselineRows = [
        base("ios", daysAgo(3), 15),
        base("ios", daysAgo(2), 15),
        base("ios", daysAgo(1), 15),
      ];
      const currentRows = [cur("ios", 5, 10)];

      const { breaches } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5,
        5,
      );

      expect(breaches[0]?.baselineDays).toBe(3);
    });

    it("breach includes platform name from currentRows", () => {
      const currentRows = [cur("web", 0, 20)];
      const baselineRows = sevenDays("web", 20);

      const { breaches } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5,
        5,
      );

      expect(breaches).toHaveLength(1);
      expect(breaches[0]?.platform).toBe("web");
    });
  });

  describe("REVENUE_PCT_MIN_ORDERS guard", () => {
    it("returns eligibleCount 0 and no breaches when all platforms are below minOrders", () => {
      const currentRows = [cur("ios", 0, 3)]; // orderCount 3 < minOrders 5

      const { breaches, eligibleCount } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        sevenDays("ios", 20),
        5, // minOrders
        5,
      );

      expect(eligibleCount).toBe(0);
      expect(breaches).toHaveLength(0);
    });

    it("excludes only the platform below minOrders when mixed order counts are present", () => {
      const currentRows = [
        cur("ios", 2, 3),     // orderCount 3 < minOrders 5 → excluded
        cur("android", 2, 10), // orderCount 10 ≥ minOrders 5 → eligible, drop = 13 pp
      ];
      const baselineRows = [
        ...sevenDays("ios", 20),
        ...sevenDays("android", 15),
      ];

      const { breaches, eligibleCount } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5, // minOrders
        5,
      );

      expect(eligibleCount).toBe(1);
      expect(breaches).toHaveLength(1);
      expect(breaches[0]?.platform).toBe("android");
    });

    it("treats orderCount exactly at minOrders as eligible", () => {
      const currentRows = [cur("ios", 2, 5)]; // orderCount === minOrders

      const { breaches, eligibleCount } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        sevenDays("ios", 20),
        5, // minOrders
        5,
      );

      expect(eligibleCount).toBe(1);
      expect(breaches).toHaveLength(1);
    });

    it("returns no breaches with empty currentRows", () => {
      const { breaches, eligibleCount } = evaluateRevenuePctDropPerPlatform(
        [],
        sevenDays("ios", 20),
        5,
        5,
      );

      expect(eligibleCount).toBe(0);
      expect(breaches).toHaveLength(0);
    });
  });

  describe("baseline days guard (< 2 days → skip)", () => {
    it("skips a platform with zero baseline days", () => {
      const currentRows = [cur("ios", 0, 10)];

      const { breaches, eligibleCount } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        [], // no baseline rows at all
        5,
        5,
      );

      expect(eligibleCount).toBe(1); // passed the min-orders check
      expect(breaches).toHaveLength(0); // skipped due to insufficient baseline
    });

    it("skips a platform with exactly 1 baseline day", () => {
      const currentRows = [cur("ios", 0, 10)];
      const baselineRows = [base("ios", daysAgo(1), 20)]; // only 1 day

      const { breaches, eligibleCount } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5,
        5,
      );

      expect(eligibleCount).toBe(1);
      expect(breaches).toHaveLength(0);
    });

    it("evaluates a platform with exactly 2 baseline days", () => {
      const currentRows = [cur("ios", 0, 10)];
      const baselineRows = [
        base("ios", daysAgo(2), 20),
        base("ios", daysAgo(1), 20),
      ];

      const { breaches, eligibleCount } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5,
        5,
      );

      expect(eligibleCount).toBe(1);
      expect(breaches).toHaveLength(1); // drop = 20 pp > 5 pp threshold
    });

    it("skips platform without baseline while evaluating sibling platform that has baseline", () => {
      const currentRows = [
        cur("ios", 0, 10),     // has baseline → breach
        cur("android", 0, 10), // no baseline → skipped
      ];
      const baselineRows = sevenDays("ios", 20); // only ios has history

      const { breaches, eligibleCount } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5,
        5,
      );

      expect(eligibleCount).toBe(2);
      expect(breaches).toHaveLength(1);
      expect(breaches[0]?.platform).toBe("ios");
    });
  });

  describe("edge cases", () => {
    it("does not breach when dropMax is 0 and the drop is also 0", () => {
      const currentRows = [cur("ios", 15, 10)];
      const baselineRows = sevenDays("ios", 15); // avg 15, drop = 0

      const { breaches } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5,
        0, // dropMax = 0: alert on any positive drop
      );

      expect(breaches).toHaveLength(0); // drop is not > 0
    });

    it("breaches when dropMax is 0 and any positive drop exists", () => {
      const currentRows = [cur("ios", 14.9, 10)];
      const baselineRows = sevenDays("ios", 15); // avg 15, drop = 0.1 pp

      const { breaches } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5,
        0, // dropMax = 0
      );

      expect(breaches).toHaveLength(1);
    });

    it("handles multiple platforms all breaching independently", () => {
      const currentRows = [
        cur("ios", 1, 10),
        cur("android", 1, 10),
        cur("web", 1, 10),
      ];
      const baselineRows = [
        ...sevenDays("ios", 20),
        ...sevenDays("android", 20),
        ...sevenDays("web", 20),
      ];

      const { breaches, eligibleCount } = evaluateRevenuePctDropPerPlatform(
        currentRows,
        baselineRows,
        5,
        5,
      );

      expect(eligibleCount).toBe(3);
      expect(breaches).toHaveLength(3);
      const platforms = breaches.map((b) => b.platform).sort();
      expect(platforms).toEqual(["android", "ios", "web"]);
    });
  });
});

// ── Alert message format ───────────────────────────────────────────────────────

describe("sendRevenuePctDropAlert", () => {
  const mockSendAlert = () => vi.mocked(alertsModule.sendAlert);
  beforeEach(() => vi.mocked(alertsModule.sendAlert).mockReset());

  const breach = (
    platform: string,
    currentPct: number,
    trailingAvg: number,
    baselineDays = 7,
  ): PlatformRevenuePctBreach => ({
    platform,
    currentPct,
    trailingAvg,
    drop: trailingAvg - currentPct,
    baselineDays,
  });

  it("calls sendAlert with the correct title and source", async () => {
    await sendRevenuePctDropAlert(TODAY, [breach("ios", 5, 15)]);
    expect(mockSendAlert()).toHaveBeenCalledOnce();
    const arg = mockSendAlert().mock.calls[0]![0];
    expect(arg.title).toBe("Upsell revenue contribution drop");
    expect(arg.source).toBe("upsellFunnelMonitor");
    expect(arg.severity).toBe("warn");
  });

  it("includes each platform's current %, trailing avg, and drop (pp) in the field value", async () => {
    await sendRevenuePctDropAlert(TODAY, [breach("ios", 5.3, 17.8, 7)]);
    const { fields } = mockSendAlert().mock.calls[0]![0];
    expect(fields).toHaveLength(1);
    const field = fields![0];
    expect(field.title).toBe("ios");
    // currentPct formatted to 1 dp
    expect(field.value).toContain("5.3%");
    // trailingAvg formatted to 1 dp with baseline-days label
    expect(field.value).toContain("17.8%");
    expect(field.value).toContain("7-day avg");
    // drop formatted to 1 dp in pp
    expect(field.value).toContain("↓ 12.5 pp");
  });

  it("produces one field per breaching platform with the correct values", async () => {
    await sendRevenuePctDropAlert(TODAY, [
      breach("ios", 3, 20, 7),
      breach("android", 8, 15, 5),
    ]);
    const { fields } = mockSendAlert().mock.calls[0]![0];
    expect(fields).toHaveLength(2);

    const iosField = fields!.find((f: { title: string }) => f.title === "ios")!;
    expect(iosField.value).toContain("3.0%");
    expect(iosField.value).toContain("20.0%");
    expect(iosField.value).toContain("↓ 17.0 pp");

    const androidField = fields!.find(
      (f: { title: string }) => f.title === "android",
    )!;
    expect(androidField.value).toContain("8.0%");
    expect(androidField.value).toContain("15.0%");
    expect(androidField.value).toContain("↓ 7.0 pp");
  });

  it("mentions the breaching platform in the alert body", async () => {
    await sendRevenuePctDropAlert(TODAY, [breach("web", 2, 14, 7)]);
    const { body } = mockSendAlert().mock.calls[0]![0];
    expect(body).toContain("web");
    expect(body).toContain(TODAY);
  });

  it("lists all breaching platforms in the body when multiple platforms breach", async () => {
    await sendRevenuePctDropAlert(TODAY, [
      breach("ios", 1, 20, 7),
      breach("android", 2, 18, 7),
    ]);
    const { body } = mockSendAlert().mock.calls[0]![0];
    expect(body).toContain("ios");
    expect(body).toContain("android");
    expect(body).toContain("2 platform(s)");
  });

  it("uses the correct baselineDays count in the field value", async () => {
    await sendRevenuePctDropAlert(TODAY, [breach("ios", 5, 15, 3)]);
    const { fields } = mockSendAlert().mock.calls[0]![0];
    expect(fields![0].value).toContain("3-day avg");
    expect(fields![0].value).not.toContain("7-day avg");
  });
});
