import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isKlarnaEligibleCountry,
  isKlarnaEnabled,
  cohortBucket,
  KLARNA_PAYER_COUNTRIES,
} from "./klarnaRollout";

describe("isKlarnaEligibleCountry", () => {
  it("returns true for supported payer countries", () => {
    expect(isKlarnaEligibleCountry("US")).toBe(true);
    expect(isKlarnaEligibleCountry("GB")).toBe(true);
    expect(isKlarnaEligibleCountry("DE")).toBe(true);
    expect(isKlarnaEligibleCountry("FR")).toBe(true);
    expect(isKlarnaEligibleCountry("SE")).toBe(true);
    expect(isKlarnaEligibleCountry("AU")).toBe(true);
    expect(isKlarnaEligibleCountry("CA")).toBe(true);
  });

  it("returns false for Presentail delivery markets (LB, AE, CY)", () => {
    expect(isKlarnaEligibleCountry("LB")).toBe(false);
    expect(isKlarnaEligibleCountry("AE")).toBe(false);
    expect(isKlarnaEligibleCountry("CY")).toBe(false);
  });

  it("returns false for null/undefined/empty", () => {
    expect(isKlarnaEligibleCountry(null)).toBe(false);
    expect(isKlarnaEligibleCountry(undefined)).toBe(false);
    expect(isKlarnaEligibleCountry("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isKlarnaEligibleCountry("us")).toBe(true);
    expect(isKlarnaEligibleCountry("gb")).toBe(true);
  });

  it("KLARNA_PAYER_COUNTRIES contains expected set size (at least 20)", () => {
    expect(KLARNA_PAYER_COUNTRIES.size).toBeGreaterThanOrEqual(20);
  });
});

describe("cohortBucket", () => {
  it("returns a number between 0 and 99 inclusive", () => {
    const ids = ["order-abc", "order-def", "order-xyz", "session-001", "test"];
    for (const id of ids) {
      const bucket = cohortBucket(id);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    }
  });

  it("is deterministic — same input always maps to same bucket", () => {
    const id = "stable-session-id-123";
    expect(cohortBucket(id)).toBe(cohortBucket(id));
    expect(cohortBucket(id)).toBe(cohortBucket(id));
  });

  it("distributes reasonably across 0–99", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      seen.add(cohortBucket(`session-${i}`));
    }
    // With 200 sessions we should hit at least 80 distinct buckets
    expect(seen.size).toBeGreaterThan(80);
  });
});

describe("isKlarnaEnabled", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.KLARNA_ROLLOUT;
    delete process.env.KLARNA_ROLLOUT_PCT;
  });

  afterEach(() => {
    process.env = origEnv;
  });

  describe('mode: "off" (default)', () => {
    it("returns false regardless of country", () => {
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: "US", isTestMode: false }),
      ).toBe(false);
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: "GB", isTestMode: true }),
      ).toBe(false);
    });

    it("returns false for ineligible country", () => {
      process.env.KLARNA_ROLLOUT = "off";
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: "LB", isTestMode: false }),
      ).toBe(false);
    });
  });

  describe('mode: "on"', () => {
    beforeEach(() => {
      process.env.KLARNA_ROLLOUT = "on";
    });

    it("returns true for eligible payer countries", () => {
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: "US", isTestMode: false }),
      ).toBe(true);
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: "DE", isTestMode: false }),
      ).toBe(true);
    });

    it("returns false for ineligible countries (LB, AE, CY)", () => {
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: "LB", isTestMode: false }),
      ).toBe(false);
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: "AE", isTestMode: false }),
      ).toBe(false);
    });

    it("returns false when payerCountry is null", () => {
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: null, isTestMode: false }),
      ).toBe(false);
    });
  });

  describe('mode: "test"', () => {
    beforeEach(() => {
      process.env.KLARNA_ROLLOUT = "test";
    });

    it("returns true for eligible country when isTestMode=true", () => {
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: "US", isTestMode: true }),
      ).toBe(true);
    });

    it("returns false for eligible country when isTestMode=false", () => {
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: "US", isTestMode: false }),
      ).toBe(false);
    });

    it("returns false for ineligible country even in test mode", () => {
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: "LB", isTestMode: true }),
      ).toBe(false);
    });
  });

  describe('mode: "percentage"', () => {
    it("returns false when KLARNA_ROLLOUT_PCT=0", () => {
      process.env.KLARNA_ROLLOUT = "percentage";
      process.env.KLARNA_ROLLOUT_PCT = "0";
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: "US", isTestMode: false }),
      ).toBe(false);
    });

    it("returns true when KLARNA_ROLLOUT_PCT=100", () => {
      process.env.KLARNA_ROLLOUT = "percentage";
      process.env.KLARNA_ROLLOUT_PCT = "100";
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: "US", isTestMode: false }),
      ).toBe(true);
    });

    it("is deterministic — same sessionId always returns same result", () => {
      process.env.KLARNA_ROLLOUT = "percentage";
      process.env.KLARNA_ROLLOUT_PCT = "50";
      const result = isKlarnaEnabled({
        sessionId: "deterministic-session",
        payerCountry: "US",
        isTestMode: false,
      });
      expect(
        isKlarnaEnabled({
          sessionId: "deterministic-session",
          payerCountry: "US",
          isTestMode: false,
        }),
      ).toBe(result);
    });

    it("distributes roughly 50/50 at 50%", () => {
      process.env.KLARNA_ROLLOUT = "percentage";
      process.env.KLARNA_ROLLOUT_PCT = "50";
      let enabled = 0;
      for (let i = 0; i < 1000; i++) {
        if (
          isKlarnaEnabled({
            sessionId: `session-${i}`,
            payerCountry: "US",
            isTestMode: false,
          })
        ) {
          enabled++;
        }
      }
      // 50% ± 5%
      expect(enabled).toBeGreaterThan(450);
      expect(enabled).toBeLessThan(550);
    });

    it("returns false for ineligible country regardless of pct", () => {
      process.env.KLARNA_ROLLOUT = "percentage";
      process.env.KLARNA_ROLLOUT_PCT = "100";
      expect(
        isKlarnaEnabled({ sessionId: "s1", payerCountry: "LB", isTestMode: false }),
      ).toBe(false);
    });
  });
});
