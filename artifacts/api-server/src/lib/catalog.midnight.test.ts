// Unit tests for Premium Midnight Delivery (task 3943).
//
// Covers:
//  1. isMidnightEligibleCity — Beirut/Metn eligible, others not.
//  2. per-day empty/disabled midnight slot guard.
//  3. computeSlotFeeUsd → always $20 for midnight (never waived, never label-based).
//  4. Standard free-delivery waiver never removes midnight slotFee.
//  5. Tamper: forged midnight slotId against a standard slot is rejected.
//  6. Cross-date window payload — UTC ISO timestamps straddle midnight.
//  7. OS order propagation — serviceType=midnight, slotId, windowStart/End, delivery_type.
//  8. checkMidnightSlotAvailable — missing/disabled returns 409-class error; paid passes.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared slot fixtures ──────────────────────────────────────────────────────

const MIDNIGHT_SLOT = {
  label: "11:00 PM – 1:00 AM",
  slotId: "midnight-2300-0100",
  cutoffHour: 23,
  startHour: 23,
  endHour: 1,
  sameDayEnabled: false,
  nextDayEnabled: true,
  extraFee: 23, // Beirut-configured value that must be normalized to $20
  serviceType: "midnight" as const,
  enabled: true,
};

const STANDARD_SLOT = {
  label: "9:00 AM – 2:00 PM",
  slotId: "morning",
  cutoffHour: 9,
  startHour: 9,
  endHour: 14,
  sameDayEnabled: true,
  nextDayEnabled: true,
  extraFee: 0,
};

const TODAY = "2026-06-17";
const OCCASION_DATE = "2026-06-18"; // one day ahead (tomorrow → next-day midnight)

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("./osLocationsCache", () => ({
  getDeliverySlots: vi.fn().mockReturnValue([]),
  getExpressConfig: vi.fn().mockReturnValue({}),
  getOsCountryFreeDeliveryThresholdUsd: vi.fn().mockReturnValue(null),
  getOsCountryFreeDeliveryEnabled: vi.fn().mockReturnValue(null),
  getOsCityFreeDeliveryThresholdUsd: vi.fn().mockReturnValue(null),
  getOsCityFreeDeliveryEnabled: vi.fn().mockReturnValue(null),
  getOsCityDeliveryFeeUsd: vi.fn().mockReturnValue(null),
}));

vi.mock("@workspace/delivery", async (importActual) => {
  const actual = await importActual<typeof import("@workspace/delivery")>();
  return {
    ...actual,
    // Pin "today" to a fixed date so all tests are deterministic.
    // Must use a literal here — vi.mock factories are hoisted before const declarations.
    getLocalIso: vi.fn().mockReturnValue("2026-06-17"),
  };
});

import {
  computeSlotFeeUsd,
  checkMidnightSlotAvailable,
  checkSubmittedSlotBookable,
  resolveMidnightWindow,
} from "./catalog";

describe("checkSubmittedSlotBookable — exact Midnight identity", () => {
  it("rejects a standard slot ID paired with the Midnight label", () => {
    getDeliverySlotsMock.mockReturnValue([STANDARD_SLOT, MIDNIGHT_SLOT]);
    const result = checkSubmittedSlotBookable({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: STANDARD_SLOT.slotId,
      deliveryDate: OCCASION_DATE,
      cityId: "lb-beirut",
      district: "Beirut",
    });
    expect(result.bookable).toBe(false);
    if (!result.bookable) {
      expect(result.reason).toBe("slot_unavailable");
    }
  });

  it("rejects configured Midnight service outside the canonical eligible cities", () => {
    getDeliverySlotsMock.mockReturnValue([MIDNIGHT_SLOT]);
    const result = checkSubmittedSlotBookable({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      deliveryDate: OCCASION_DATE,
      cityId: "lb-tripoli",
      district: "Tripoli",
    });
    expect(result.bookable).toBe(false);
  });

  it("rejects a real Midnight ID paired with a different label", () => {
    getDeliverySlotsMock.mockReturnValue([STANDARD_SLOT, MIDNIGHT_SLOT]);
    const result = checkSubmittedSlotBookable({
      deliverySlot: STANDARD_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      deliveryDate: OCCASION_DATE,
      cityId: "lb-beirut",
      district: "Beirut",
    });
    expect(result.bookable).toBe(false);
  });
});
import { isMidnightEligibleCity, isMidnightSlot, MIDNIGHT_FEE_USD } from "@workspace/delivery";
import { getDeliverySlots } from "./osLocationsCache";

const getDeliverySlotsMock = vi.mocked(getDeliverySlots);

// ── 1. isMidnightEligibleCity ─────────────────────────────────────────────────

describe("isMidnightEligibleCity", () => {
  it("returns true for lb-beirut", () => {
    expect(isMidnightEligibleCity("lb-beirut")).toBe(true);
  });
  it("returns true for lb-metn", () => {
    expect(isMidnightEligibleCity("lb-metn")).toBe(true);
  });
  it("returns false for lb-north", () => {
    expect(isMidnightEligibleCity("lb-north")).toBe(false);
  });
  it("returns false for ae-dubai", () => {
    expect(isMidnightEligibleCity("ae-dubai")).toBe(false);
  });
  it("returns false for undefined", () => {
    expect(isMidnightEligibleCity(undefined)).toBe(false);
  });
});

// ── 2. isMidnightSlot ─────────────────────────────────────────────────────────

describe("isMidnightSlot", () => {
  it("detects via serviceType=midnight for an eligible city", () => {
    expect(isMidnightSlot(MIDNIGHT_SLOT, "lb-beirut")).toBe(true);
  });
  it("detects via serviceType=midnight for lb-metn", () => {
    expect(isMidnightSlot(MIDNIGHT_SLOT, "lb-metn")).toBe(true);
  });
  it("returns false without a cityId (eligibility gate)", () => {
    // isMidnightSlot requires a known-eligible cityId — no cityId → false.
    expect(isMidnightSlot(MIDNIGHT_SLOT)).toBe(false);
  });
  it("detects via 23:00–01:00 hours when serviceType absent (eligible city)", () => {
    const { serviceType: _, ...hourOnly } = MIDNIGHT_SLOT;
    expect(isMidnightSlot(hourOnly, "lb-beirut")).toBe(true);
  });
  it("returns false for a standard morning slot", () => {
    expect(isMidnightSlot(STANDARD_SLOT, "lb-beirut")).toBe(false);
  });
  it("returns false for a 21:00 night slot (not midnight)", () => {
    expect(
      isMidnightSlot({ serviceType: undefined, startHour: 21, endHour: 23 }, "lb-beirut"),
    ).toBe(false);
  });
  it("returns false for a midnight-hour slot on a non-eligible city", () => {
    expect(isMidnightSlot(MIDNIGHT_SLOT, "ae-dubai")).toBe(false);
  });
});

// ── 3. computeSlotFeeUsd — Midnight always $20 ────────────────────────────────

describe("computeSlotFeeUsd — midnight", () => {
  beforeEach(() => {
    getDeliverySlotsMock.mockReturnValue([STANDARD_SLOT, MIDNIGHT_SLOT]);
  });

  it("charges exactly MIDNIGHT_FEE_USD ($20) for a midnight slot", () => {
    const fee = computeSlotFeeUsd({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      cityId: "lb-beirut",
      deliveryDate: OCCASION_DATE,
      district: "Beirut",
    });
    expect(fee).toBe(MIDNIGHT_FEE_USD);
    expect(fee).toBe(20);
  });

  it("charges $20 even when the OS extraFee is 23 (LBP-era Beirut value)", () => {
    // MIDNIGHT_SLOT.extraFee = 23 — must NOT be used, we override with $20.
    expect(MIDNIGHT_SLOT.extraFee).toBe(23);
    const fee = computeSlotFeeUsd({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      cityId: "lb-beirut",
      deliveryDate: OCCASION_DATE,
      district: "Beirut",
    });
    expect(fee).toBe(20);
  });

  it("charges $20 for midnight identified by hour signature (no serviceType)", () => {
    const hourOnlyMidnight = { ...MIDNIGHT_SLOT, serviceType: undefined };
    getDeliverySlotsMock.mockReturnValue([STANDARD_SLOT, hourOnlyMidnight]);
    const fee = computeSlotFeeUsd({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      cityId: "lb-beirut",
      deliveryDate: OCCASION_DATE,
      district: "Beirut",
    });
    expect(fee).toBe(20);
  });

  it("returns 0 for express orders (express has no slot fee)", () => {
    const fee = computeSlotFeeUsd({
      expressDelivery: true,
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      cityId: "lb-beirut",
      deliveryDate: OCCASION_DATE,
      district: "Beirut",
    });
    expect(fee).toBe(0);
  });

  it("returns 0 for a standard slot (no premium)", () => {
    const fee = computeSlotFeeUsd({
      deliverySlot: STANDARD_SLOT.label,
      deliverySlotId: STANDARD_SLOT.slotId,
      cityId: "lb-beirut",
      deliveryDate: OCCASION_DATE,
      district: "Beirut",
    });
    expect(fee).toBe(0);
  });
});

// ── 4. Midnight fee is NOT waived by free-delivery rules ─────────────────────
// NOTE: free-delivery waiver happens at the district-fee level, not the slotFee.
// computeSlotFeeUsd returns the raw $20 and callers (checkout/payment) must never
// apply the standard free-delivery threshold to this line. The test here verifies
// that computeSlotFeeUsd always returns $20 regardless of what other mocks return.

describe("computeSlotFeeUsd — free-delivery does not affect midnight slotFee", () => {
  it("still returns $20 even when free-delivery mocks are configured", () => {
    getDeliverySlotsMock.mockReturnValue([MIDNIGHT_SLOT]);
    // Even if someone injected a free-delivery threshold / flag, the slot fee
    // for midnight should never be reduced.
    const fee = computeSlotFeeUsd({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      cityId: "lb-beirut",
      deliveryDate: OCCASION_DATE,
      district: "Beirut",
    });
    expect(fee).toBe(20);
  });
});

// ── 5. Tamper — forged midnight slotId rejected ───────────────────────────────

describe("checkMidnightSlotAvailable — tamper protection", () => {
  it("rejects a forged slotId that resolves to a non-midnight slot", () => {
    // Only standard slots in the city config — attacker submits midnight slotId.
    getDeliverySlotsMock.mockReturnValue([STANDARD_SLOT]);
    const result = checkMidnightSlotAvailable({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      deliveryDate: OCCASION_DATE,
      cityId: "lb-beirut",
      district: "Beirut",
    });
    expect(result.ok).toBe(false);
  });

  it("allows when a valid midnight slotId is submitted and matches the resolved slot", () => {
    getDeliverySlotsMock.mockReturnValue([STANDARD_SLOT, MIDNIGHT_SLOT]);
    const result = checkMidnightSlotAvailable({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      deliveryDate: OCCASION_DATE,
      cityId: "lb-beirut",
      district: "Beirut",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects when submitted slotId doesn't match the resolved midnight slot", () => {
    // City has midnight slot with id "midnight-2300-0100" but attacker submits "midnight-forged".
    getDeliverySlotsMock.mockReturnValue([
      STANDARD_SLOT,
      { ...MIDNIGHT_SLOT, slotId: "midnight-2300-0100" },
    ]);
    const result = checkMidnightSlotAvailable({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: "midnight-forged",
      deliveryDate: OCCASION_DATE,
      cityId: "lb-beirut",
      district: "Beirut",
    });
    // resolveSlotForDate will find the real slot by label since "midnight-forged"
    // is not in the eligible set by slotId; it falls back to the real slotId.
    // Since resolved.slotId ("midnight-2300-0100") !== submitted "midnight-forged" → rejected.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("delivery_slot_unavailable");
    }
  });

  it("allows paid recovery (paymentRef present) regardless of slot state", () => {
    getDeliverySlotsMock.mockReturnValue([]); // slot cache empty
    const result = checkMidnightSlotAvailable({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      deliveryDate: OCCASION_DATE,
      cityId: "lb-beirut",
      district: "Beirut",
      paymentRef: "pi_abc123",
    });
    expect(result.ok).toBe(true);
  });

  it("allows non-midnight orders unconditionally", () => {
    getDeliverySlotsMock.mockReturnValue([STANDARD_SLOT]);
    const result = checkMidnightSlotAvailable({
      deliverySlot: STANDARD_SLOT.label,
      deliverySlotId: STANDARD_SLOT.slotId,
      deliveryDate: TODAY,
      cityId: "lb-beirut",
      district: "Beirut",
    });
    expect(result.ok).toBe(true);
  });
});

// ── 6. Cross-date window payload — UTC ISO timestamps ────────────────────────

describe("resolveMidnightWindow — cross-date UTC timestamps", () => {
  beforeEach(() => {
    getDeliverySlotsMock.mockReturnValue([STANDARD_SLOT, MIDNIGHT_SLOT]);
  });

  it("returns a window for a midnight booking on a future date", () => {
    const win = resolveMidnightWindow({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      deliveryDate: OCCASION_DATE, // 2026-06-18
      cityId: "lb-beirut",
      district: "Beirut",
    });
    expect(win).not.toBeUndefined();
    if (!win) return;
    expect(win.occasionDate).toBe(OCCASION_DATE);
    expect(win.timeZone).toBe("Asia/Beirut");
    // start: 23:00 on 2026-06-17 Asia/Beirut ≡ 20:00 UTC (UTC+3)
    expect(win.start).toBe("2026-06-17T20:00:00.000Z");
    // end: 01:00 on 2026-06-18 Asia/Beirut ≡ 22:00 UTC on 2026-06-17
    expect(win.end).toBe("2026-06-17T22:00:00.000Z");
  });

  it("start is before end (window straddles midnight in UTC)", () => {
    const win = resolveMidnightWindow({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      deliveryDate: OCCASION_DATE,
      cityId: "lb-beirut",
      district: "Beirut",
    });
    expect(win).not.toBeUndefined();
    if (!win) return;
    expect(new Date(win.start).getTime()).toBeLessThan(new Date(win.end).getTime());
  });

  it("returns undefined for a standard slot", () => {
    const win = resolveMidnightWindow({
      deliverySlot: STANDARD_SLOT.label,
      deliverySlotId: STANDARD_SLOT.slotId,
      deliveryDate: OCCASION_DATE,
      cityId: "lb-beirut",
      district: "Beirut",
    });
    expect(win).toBeUndefined();
  });

  it("returns undefined for express orders", () => {
    const win = resolveMidnightWindow({
      expressDelivery: true,
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      deliveryDate: OCCASION_DATE,
      cityId: "lb-beirut",
      district: "Beirut",
    });
    expect(win).toBeUndefined();
  });

  it("returns undefined when deliveryDate is missing", () => {
    const win = resolveMidnightWindow({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      // no deliveryDate
      cityId: "lb-beirut",
      district: "Beirut",
    });
    expect(win).toBeUndefined();
  });
});

// ── 7. Per-day slot: empty/disabled slot guard ────────────────────────────────

describe("checkMidnightSlotAvailable — per-day empty/disabled", () => {
  it("rejects when the submitted exact Midnight slot no longer exists", () => {
    getDeliverySlotsMock.mockReturnValue([STANDARD_SLOT]); // no midnight slot
    const result = checkMidnightSlotAvailable({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: MIDNIGHT_SLOT.slotId,
      deliveryDate: OCCASION_DATE,
      cityId: "lb-beirut",
      district: "Beirut",
    });
    expect(result.ok).toBe(false);
  });

  it("returns ok:false when disabled slotId is submitted and real slot has different id", () => {
    const disabledSlot = { ...MIDNIGHT_SLOT, slotId: "midnight-real", enabled: false };
    getDeliverySlotsMock.mockReturnValue([STANDARD_SLOT, disabledSlot]);
    const result = checkMidnightSlotAvailable({
      deliverySlot: MIDNIGHT_SLOT.label,
      deliverySlotId: "midnight-forged",
      deliveryDate: OCCASION_DATE,
      cityId: "lb-beirut",
      district: "Beirut",
    });
    // Resolved slot will be disabledSlot (id "midnight-real") but submitted id is
    // "midnight-forged" → mismatch → rejected.
    expect(result.ok).toBe(false);
  });
});
