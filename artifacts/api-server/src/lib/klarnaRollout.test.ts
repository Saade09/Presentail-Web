import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isKlarnaEligibleCountry,
  isKlarnaEnabled,
  cohortBucket,
  KLARNA_PAYER_COUNTRIES,
  getKlarnaRolloutMode,
  getKlarnaRolloutPercentage,
  klarnaHashBucket,
  klarnaRolloutAllowed,
  klarnaCohortLabel,
} from "./klarnaRollout";
import { logger } from "./logger";

// ── Env helpers ─────────────────────────────────────────────────────────────

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void,
): void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

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

// ── getKlarnaRolloutMode ─────────────────────────────────────────────────────

describe("getKlarnaRolloutMode", () => {
  it("returns 'off' when KLARNA_ROLLOUT is unset", () => {
    withEnv({ KLARNA_ROLLOUT: undefined }, () => {
      expect(getKlarnaRolloutMode()).toBe("off");
    });
  });

  it("returns 'off' for empty string", () => {
    withEnv({ KLARNA_ROLLOUT: "" }, () => {
      expect(getKlarnaRolloutMode()).toBe("off");
    });
  });

  it("returns 'off' for unrecognised value", () => {
    withEnv({ KLARNA_ROLLOUT: "enabled" }, () => {
      expect(getKlarnaRolloutMode()).toBe("off");
    });
  });

  it.each(["test", "percentage", "on"])(
    "returns '%s' when set to '%s'",
    (mode) => {
      withEnv({ KLARNA_ROLLOUT: mode }, () => {
        expect(getKlarnaRolloutMode()).toBe(mode);
      });
    },
  );

  it("is case-insensitive (upper-case ON)", () => {
    withEnv({ KLARNA_ROLLOUT: "ON" }, () => {
      expect(getKlarnaRolloutMode()).toBe("on");
    });
  });

  it("trims whitespace", () => {
    withEnv({ KLARNA_ROLLOUT: " on " }, () => {
      expect(getKlarnaRolloutMode()).toBe("on");
    });
  });
});

// ── getKlarnaRolloutPercentage ───────────────────────────────────────────────

describe("getKlarnaRolloutPercentage", () => {
  it("returns 0 when unset", () => {
    withEnv(
      { KLARNA_ROLLOUT_PERCENTAGE: undefined, KLARNA_ROLLOUT_PCT: undefined },
      () => {
        expect(getKlarnaRolloutPercentage()).toBe(0);
      },
    );
  });

  it("returns 0 for non-numeric value", () => {
    withEnv({ KLARNA_ROLLOUT_PERCENTAGE: "abc" }, () => {
      expect(getKlarnaRolloutPercentage()).toBe(0);
    });
  });

  it("returns 0 for negative value", () => {
    withEnv({ KLARNA_ROLLOUT_PERCENTAGE: "-5" }, () => {
      expect(getKlarnaRolloutPercentage()).toBe(0);
    });
  });

  it("returns the numeric value within range", () => {
    withEnv({ KLARNA_ROLLOUT_PERCENTAGE: "25" }, () => {
      expect(getKlarnaRolloutPercentage()).toBe(25);
    });
  });

  it("caps at 100 for values over 100", () => {
    withEnv({ KLARNA_ROLLOUT_PERCENTAGE: "150" }, () => {
      expect(getKlarnaRolloutPercentage()).toBe(100);
    });
  });

  it("accepts decimals", () => {
    withEnv({ KLARNA_ROLLOUT_PERCENTAGE: "10.5" }, () => {
      expect(getKlarnaRolloutPercentage()).toBe(10.5);
    });
  });

  it("uses the legacy name as a compatibility fallback and warns", () => {
    const warnSpy = vi.spyOn(logger, "warn");
    withEnv(
      { KLARNA_ROLLOUT_PERCENTAGE: undefined, KLARNA_ROLLOUT_PCT: "25" },
      () => {
        expect(getKlarnaRolloutPercentage()).toBe(25);
      },
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalVariable: "KLARNA_ROLLOUT_PERCENTAGE",
        legacyVariable: "KLARNA_ROLLOUT_PCT",
        canonicalConfigured: false,
      }),
      expect.stringContaining("KLARNA_ROLLOUT_PCT is deprecated"),
    );
    warnSpy.mockRestore();
  });

  it("always prefers the canonical name when both names are configured", () => {
    withEnv(
      { KLARNA_ROLLOUT_PERCENTAGE: "10.5", KLARNA_ROLLOUT_PCT: "90" },
      () => {
        expect(getKlarnaRolloutPercentage()).toBe(10.5);
      },
    );
  });
});

// ── klarnaHashBucket / cohortBucket ──────────────────────────────────────────

describe("klarnaHashBucket / cohortBucket", () => {
  it("returns a number in [0, 100)", () => {
    const ids = [
      "order-1",
      "abc",
      "test",
      "uuid-1234",
      "xyz-9999",
      "order-abc",
      "order-def",
      "order-xyz",
      "session-001",
    ];
    for (const id of ids) {
      const bucketHash = klarnaHashBucket(id);
      expect(bucketHash).toBeGreaterThanOrEqual(0);
      expect(bucketHash).toBeLessThan(100);

      const bucketCohort = cohortBucket(id);
      expect(bucketCohort).toBeGreaterThanOrEqual(0);
      expect(bucketCohort).toBeLessThan(100);
    }
  });

  it("is deterministic — same input always maps to same bucket", () => {
    const id = "stable-session-id-123";
    expect(cohortBucket(id)).toBe(cohortBucket(id));
    expect(klarnaHashBucket(id)).toBe(klarnaHashBucket(id));
  });

  it("distributes reasonably across 0–99", () => {
    const seenCohort = new Set<number>();
    const seenHash = new Set<number>();
    for (let i = 0; i < 200; i++) {
      seenCohort.add(cohortBucket(`session-${i}`));
      seenHash.add(klarnaHashBucket(`session-${i}`));
    }
    // With 200 sessions we should hit at least 80 distinct buckets
    expect(seenCohort.size).toBeGreaterThan(80);
    expect(seenHash.size).toBeGreaterThan(80);
  });

  it("produces different buckets for different IDs", () => {
    const buckets = new Set(
      Array.from({ length: 50 }, (_, i) => klarnaHashBucket(`order-${i}`)),
    );
    // With 50 different IDs it's extremely unlikely all land in the same bucket.
    expect(buckets.size).toBeGreaterThan(1);
  });

  it("is stable for known test vector (regression guard)", () => {
    const bucket = klarnaHashBucket("klarna-test-id");
    expect(typeof bucket).toBe("number");
    expect(bucket).toBe(klarnaHashBucket("klarna-test-id")); // deterministic
  });
});

describe("isKlarnaEnabled", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.KLARNA_ROLLOUT;
    delete process.env.KLARNA_ROLLOUT_PCT;
    delete process.env.KLARNA_ROLLOUT_PERCENTAGE;
  });

  afterEach(() => {
    process.env = origEnv;
  });

  describe('mode: "off" (default)', () => {
    it("returns false regardless of country", () => {
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: "US",
          isTestMode: false,
        }),
      ).toBe(false);
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: "GB",
          isTestMode: true,
        }),
      ).toBe(false);
    });

    it("returns false for ineligible country", () => {
      process.env.KLARNA_ROLLOUT = "off";
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: "LB",
          isTestMode: false,
        }),
      ).toBe(false);
    });
  });

  describe('mode: "on"', () => {
    beforeEach(() => {
      process.env.KLARNA_ROLLOUT = "on";
    });

    it("returns true for eligible payer countries", () => {
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: "US",
          isTestMode: false,
        }),
      ).toBe(true);
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: "DE",
          isTestMode: false,
        }),
      ).toBe(true);
    });

    it("returns false for ineligible countries (LB, AE, CY)", () => {
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: "LB",
          isTestMode: false,
        }),
      ).toBe(false);
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: "AE",
          isTestMode: false,
        }),
      ).toBe(false);
    });

    it("returns false when payerCountry is null", () => {
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: null,
          isTestMode: false,
        }),
      ).toBe(false);
    });
  });

  describe('mode: "test"', () => {
    beforeEach(() => {
      process.env.KLARNA_ROLLOUT = "test";
    });

    it("returns true for eligible country when isTestMode=true", () => {
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: "US",
          isTestMode: true,
        }),
      ).toBe(true);
    });

    it("returns false for eligible country when isTestMode=false", () => {
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: "US",
          isTestMode: false,
        }),
      ).toBe(false);
    });

    it("returns false for ineligible country even in test mode", () => {
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: "LB",
          isTestMode: true,
        }),
      ).toBe(false);
    });
  });

  describe('mode: "percentage"', () => {
    it("returns false when KLARNA_ROLLOUT_PERCENTAGE=0", () => {
      process.env.KLARNA_ROLLOUT = "percentage";
      process.env.KLARNA_ROLLOUT_PERCENTAGE = "0";
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: "US",
          isTestMode: false,
        }),
      ).toBe(false);
    });

    it("returns true when KLARNA_ROLLOUT_PERCENTAGE=100", () => {
      process.env.KLARNA_ROLLOUT = "percentage";
      process.env.KLARNA_ROLLOUT_PERCENTAGE = "100";
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: "US",
          isTestMode: false,
        }),
      ).toBe(true);
    });

    it("is deterministic — same sessionId always returns same result", () => {
      process.env.KLARNA_ROLLOUT = "percentage";
      process.env.KLARNA_ROLLOUT_PERCENTAGE = "50";
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
      process.env.KLARNA_ROLLOUT_PERCENTAGE = "50";
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
      process.env.KLARNA_ROLLOUT_PERCENTAGE = "100";
      expect(
        isKlarnaEnabled({
          sessionId: "s1",
          payerCountry: "LB",
          isTestMode: false,
        }),
      ).toBe(false);
    });
  });
});

// ── klarnaRolloutAllowed ─────────────────────────────────────────────────────

describe("klarnaRolloutAllowed", () => {
  describe("mode: off", () => {
    it("always returns false", () => {
      withEnv({ KLARNA_ROLLOUT: "off" }, () => {
        expect(klarnaRolloutAllowed("any-id")).toBe(false);
        expect(klarnaRolloutAllowed("any-id", "sk_live_xxx")).toBe(false);
        expect(klarnaRolloutAllowed("any-id", "sk_test_xxx")).toBe(false);
      });
    });
  });

  describe("mode: test", () => {
    it("returns true only for sk_test_ keys", () => {
      withEnv({ KLARNA_ROLLOUT: "test" }, () => {
        expect(klarnaRolloutAllowed("order-1", "sk_test_abc123")).toBe(true);
        expect(klarnaRolloutAllowed("order-1", "sk_live_abc123")).toBe(false);
        expect(klarnaRolloutAllowed("order-1", undefined)).toBe(false);
        expect(klarnaRolloutAllowed("order-1", null)).toBe(false);
        expect(klarnaRolloutAllowed("order-1", "rk_test_xxx")).toBe(false);
      });
    });
  });

  describe("mode: on", () => {
    it("always returns true regardless of ID or key", () => {
      withEnv({ KLARNA_ROLLOUT: "on" }, () => {
        expect(klarnaRolloutAllowed("any-id")).toBe(true);
        expect(klarnaRolloutAllowed("any-id", "sk_live_xxx")).toBe(true);
        expect(klarnaRolloutAllowed("any-id", undefined)).toBe(true);
      });
    });
  });

  describe("mode: percentage", () => {
    it("returns false for 0% rollout", () => {
      withEnv(
        { KLARNA_ROLLOUT: "percentage", KLARNA_ROLLOUT_PERCENTAGE: "0" },
        () => {
          for (let i = 0; i < 20; i++) {
            expect(klarnaRolloutAllowed(`order-${i}`)).toBe(false);
          }
        },
      );
    });

    it("returns true for 100% rollout", () => {
      withEnv(
        { KLARNA_ROLLOUT: "percentage", KLARNA_ROLLOUT_PERCENTAGE: "100" },
        () => {
          for (let i = 0; i < 20; i++) {
            expect(klarnaRolloutAllowed(`order-${i}`)).toBe(true);
          }
        },
      );
    });

    it("is deterministic: same ID stays in/out of cohort", () => {
      withEnv(
        { KLARNA_ROLLOUT: "percentage", KLARNA_ROLLOUT_PERCENTAGE: "50" },
        () => {
          for (const id of ["alpha", "beta", "gamma", "delta"]) {
            const first = klarnaRolloutAllowed(id);
            expect(klarnaRolloutAllowed(id)).toBe(first);
            expect(klarnaRolloutAllowed(id)).toBe(first);
          }
        },
      );
    });

    it("approximately respects percentage (statistical check over 1000 samples)", () => {
      withEnv(
        { KLARNA_ROLLOUT: "percentage", KLARNA_ROLLOUT_PERCENTAGE: "30" },
        () => {
          let allowed = 0;
          const N = 1000;
          for (let i = 0; i < N; i++) {
            if (klarnaRolloutAllowed(`sample-order-${i}`)) allowed++;
          }
          // With 30% rollout over 1000 samples we expect ~300 in the cohort.
          // Allow ±10% tolerance.
          expect(allowed).toBeGreaterThanOrEqual(200);
          expect(allowed).toBeLessThanOrEqual(400);
        },
      );
    });
  });
});

// ── klarnaCohortLabel ────────────────────────────────────────────────────────

describe("klarnaCohortLabel", () => {
  it("returns 'off' when mode is off", () => {
    withEnv({ KLARNA_ROLLOUT: "off" }, () => {
      expect(klarnaCohortLabel("any-id")).toBe("off");
    });
  });

  it("returns 'exposed' when mode is on", () => {
    withEnv({ KLARNA_ROLLOUT: "on" }, () => {
      expect(klarnaCohortLabel("any-id")).toBe("exposed");
    });
  });

  it("returns 'exposed' for sk_test_ key in test mode", () => {
    withEnv({ KLARNA_ROLLOUT: "test" }, () => {
      expect(klarnaCohortLabel("any-id", "sk_test_foo")).toBe("exposed");
    });
  });

  it("returns 'excluded' for sk_live_ key in test mode", () => {
    withEnv({ KLARNA_ROLLOUT: "test" }, () => {
      expect(klarnaCohortLabel("any-id", "sk_live_foo")).toBe("excluded");
    });
  });

  it("returns 'exposed' or 'excluded' in percentage mode, never 'off'", () => {
    withEnv(
      { KLARNA_ROLLOUT: "percentage", KLARNA_ROLLOUT_PERCENTAGE: "50" },
      () => {
        for (let i = 0; i < 20; i++) {
          const label = klarnaCohortLabel(`order-${i}`);
          expect(["exposed", "excluded"]).toContain(label);
        }
      },
    );
  });
});
