/**
 * Unit tests for the checkout price-total and delivery-fee calculation logic.
 *
 * The fee helpers live in `./checkoutFees.ts` and are imported directly by
 * `Checkout.tsx`, so these tests validate the exact production logic — not a
 * local re-implementation.
 *
 * All amounts are in USD (the cart's internal currency).
 */

import { describe, it, expect } from "vitest";
import {
  calcCheckoutFees,
  activeCurrencyForCountry,
} from "./checkoutFees";
import {
  freeDeliveryThresholdUsd,
  expressSurchargeForCountry,
  getLocalIso,
  timeSlotsForCountry,
  type TimeSlot,
} from "@workspace/delivery";

// ---------------------------------------------------------------------------
// freeDeliveryThresholdUsd
// ---------------------------------------------------------------------------

describe("freeDeliveryThresholdUsd — per-country free-delivery thresholds in USD", () => {
  it("LB threshold is $90", () => {
    expect(freeDeliveryThresholdUsd("LB")).toBe(90);
  });

  it("AE threshold is $89.84 (≈ AED 330 / ~3.67 rate)", () => {
    expect(freeDeliveryThresholdUsd("AE")).toBe(89.84);
  });

  it("CY threshold is $120", () => {
    expect(freeDeliveryThresholdUsd("CY")).toBe(120);
  });

  it("unknown country falls back to the LB default ($90)", () => {
    expect(freeDeliveryThresholdUsd("XX")).toBe(90);
    expect(freeDeliveryThresholdUsd(null)).toBe(90);
    expect(freeDeliveryThresholdUsd(undefined)).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// expressSurchargeForCountry
// ---------------------------------------------------------------------------

describe("expressSurchargeForCountry — per-country express surcharge", () => {
  it("LB surcharge is $15", () => {
    expect(expressSurchargeForCountry("LB")).toBe(15);
  });

  it("AE surcharge is $4.90", () => {
    expect(expressSurchargeForCountry("AE")).toBeCloseTo(4.9);
  });

  it("CY falls back to the LB default ($15)", () => {
    expect(expressSurchargeForCountry("CY")).toBe(15);
  });

  it("unknown country falls back to $15", () => {
    expect(expressSurchargeForCountry(null)).toBe(15);
    expect(expressSurchargeForCountry(undefined)).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// calcCheckoutFees — district fee (free-delivery threshold logic)
// ---------------------------------------------------------------------------

describe("calcCheckoutFees: districtFee — waived when subtotal meets the free-delivery threshold", () => {
  const cityFee = 8;

  it("LB: charges the city fee when subtotal is below $90", () => {
    const { districtFee } = calcCheckoutFees({
      subtotal: 60,
      countryCode: "LB",
      noAddress: false,
      cityFee,
      deliveryMode: "schedule",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(districtFee).toBe(cityFee);
  });

  it("LB: waives the fee when subtotal equals the threshold exactly ($90)", () => {
    const { districtFee } = calcCheckoutFees({
      subtotal: 90,
      countryCode: "LB",
      noAddress: false,
      cityFee,
      deliveryMode: "schedule",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(districtFee).toBe(0);
  });

  it("LB: waives the fee when subtotal exceeds the threshold", () => {
    const { districtFee } = calcCheckoutFees({
      subtotal: 200,
      countryCode: "LB",
      noAddress: false,
      cityFee,
      deliveryMode: "schedule",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(districtFee).toBe(0);
  });

  it("AE: charges the city fee below $89.84", () => {
    const { districtFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "AE",
      noAddress: false,
      cityFee,
      deliveryMode: "schedule",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(districtFee).toBe(cityFee);
  });

  it("AE: waives the fee at $89.84", () => {
    const { districtFee } = calcCheckoutFees({
      subtotal: 89.84,
      countryCode: "AE",
      noAddress: false,
      cityFee,
      deliveryMode: "schedule",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(districtFee).toBe(0);
  });

  it("no-address toggle preserves the city fee (does not override to $35)", () => {
    const { districtFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: true,
      cityFee: 5,
      deliveryMode: "schedule",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(districtFee).toBe(5);
  });

  it("no-address fee is waived when subtotal meets the threshold (same as addressed orders)", () => {
    const { districtFee } = calcCheckoutFees({
      subtotal: 90,
      countryCode: "LB",
      noAddress: true,
      cityFee: 8,
      deliveryMode: "schedule",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(districtFee).toBe(0);
  });

  it("city fee of 0 produces $0 district fee regardless of subtotal", () => {
    const { districtFee } = calcCheckoutFees({
      subtotal: 10,
      countryCode: "LB",
      noAddress: false,
      cityFee: 0,
      deliveryMode: "schedule",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(districtFee).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calcCheckoutFees — express fee
// ---------------------------------------------------------------------------

describe("calcCheckoutFees: expressFee — added only in express mode", () => {
  it("LB express adds $15 surcharge", () => {
    const { expressFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "express",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(expressFee).toBe(15);
  });

  it("AE express adds $4.90 surcharge", () => {
    const { expressFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "AE",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "express",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(expressFee).toBeCloseTo(4.9);
  });

  it("scheduled delivery has zero express fee", () => {
    const { expressFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "schedule",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(expressFee).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calcCheckoutFees — slot fee
// ---------------------------------------------------------------------------

describe("calcCheckoutFees: slotFee — extra fee for premium time slots", () => {
  const slots: TimeSlot[] = [
    { label: "9:00 AM – 2:00 PM", cutoffHour: 9 },
    { label: "6:00 PM – 9:00 PM", cutoffHour: 18, extraFee: 5 },
    { label: "9:00 PM – 11:00 PM", cutoffHour: 21, extraFee: 10 },
  ];

  it("adds the slot's extraFee when a premium slot is selected", () => {
    const { slotFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "schedule",
      timeSlots: slots,
      deliverySlot: "6:00 PM – 9:00 PM",
    });
    expect(slotFee).toBe(5);
  });

  it("adds the higher fee for the latest slot", () => {
    const { slotFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "schedule",
      timeSlots: slots,
      deliverySlot: "9:00 PM – 11:00 PM",
    });
    expect(slotFee).toBe(10);
  });

  it("returns 0 for a slot with no extraFee defined", () => {
    const { slotFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "schedule",
      timeSlots: slots,
      deliverySlot: "9:00 AM – 2:00 PM",
    });
    expect(slotFee).toBe(0);
  });

  it("returns 0 for an unknown slot label (safe fallback)", () => {
    const { slotFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "schedule",
      timeSlots: slots,
      deliverySlot: "Unrecognised label",
    });
    expect(slotFee).toBe(0);
  });

  it("always returns 0 in express mode regardless of slot label", () => {
    const { slotFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "express",
      timeSlots: slots,
      deliverySlot: "9:00 PM – 11:00 PM",
    });
    expect(slotFee).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calcCheckoutFees — same-day night-slot surcharge ($5 hardcoded fallback)
// ---------------------------------------------------------------------------

describe("calcCheckoutFees: slotFee — same-day night surcharge when OS sends extraFee 0", () => {
  // Night slot the OS returns with fee_override = 0 (no explicit surcharge configured).
  const nightSlotZeroFee: TimeSlot = { label: "Night", startHour: 21, endHour: 23, cutoffHour: 21, extraFee: 0 };
  const nightSlotNoFee: TimeSlot = { label: "Night", startHour: 21, endHour: 23, cutoffHour: 21 };
  const morningSlot: TimeSlot = { label: "Morning", startHour: 9, endHour: 14, cutoffHour: 9 };

  it("returns $5 for a night slot with extraFee 0 when no deliveryDate is provided (assumes today)", () => {
    const { slotFee } = calcCheckoutFees({
      subtotal: 50, countryCode: "LB", noAddress: false, cityFee: 0,
      deliveryMode: "schedule",
      timeSlots: [morningSlot, nightSlotZeroFee],
      deliverySlot: "Night",
    });
    expect(slotFee).toBe(5);
  });

  it("returns $5 for a night slot with no extraFee field when no deliveryDate is provided", () => {
    const { slotFee } = calcCheckoutFees({
      subtotal: 50, countryCode: "LB", noAddress: false, cityFee: 0,
      deliveryMode: "schedule",
      timeSlots: [nightSlotNoFee],
      deliverySlot: "Night",
    });
    expect(slotFee).toBe(5);
  });

  it("returns $5 when deliveryDate equals today's Lebanese date", () => {
    const today = getLocalIso("LB");
    const { slotFee } = calcCheckoutFees({
      subtotal: 50, countryCode: "LB", noAddress: false, cityFee: 0,
      deliveryMode: "schedule",
      timeSlots: [nightSlotZeroFee],
      deliverySlot: "Night",
      deliveryDate: today,
    });
    expect(slotFee).toBe(5);
  });

  it("returns $0 when deliveryDate is a future date (next-day or later — no same-day surcharge)", () => {
    const { slotFee } = calcCheckoutFees({
      subtotal: 50, countryCode: "LB", noAddress: false, cityFee: 0,
      deliveryMode: "schedule",
      timeSlots: [nightSlotZeroFee],
      deliverySlot: "Night",
      deliveryDate: "2099-12-31",
    });
    expect(slotFee).toBe(0);
  });

  it("uses the OS-configured fee when extraFee > 0, ignoring the $5 fallback", () => {
    const nightSlotOsFee: TimeSlot = { label: "Night", startHour: 21, endHour: 23, cutoffHour: 21, extraFee: 8 };
    const { slotFee } = calcCheckoutFees({
      subtotal: 50, countryCode: "LB", noAddress: false, cityFee: 0,
      deliveryMode: "schedule",
      timeSlots: [nightSlotOsFee],
      deliverySlot: "Night",
    });
    expect(slotFee).toBe(8);
  });

  it("does not apply the night surcharge to a daytime slot (startHour < 21)", () => {
    const lateSlot: TimeSlot = { label: "Afternoon", startHour: 18, endHour: 22, cutoffHour: 18 };
    const { slotFee } = calcCheckoutFees({
      subtotal: 50, countryCode: "LB", noAddress: false, cityFee: 0,
      deliveryMode: "schedule",
      timeSlots: [lateSlot],
      deliverySlot: "Afternoon",
    });
    expect(slotFee).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calcCheckoutFees — total
// ---------------------------------------------------------------------------

describe("calcCheckoutFees: total = subtotal + districtFee + expressFee + slotFee", () => {
  it("standard scheduled order: subtotal + city fee", () => {
    const { total } = calcCheckoutFees({
      subtotal: 80,
      countryCode: "LB",
      noAddress: false,
      cityFee: 8,
      deliveryMode: "schedule",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(total).toBe(88);
  });

  it("free delivery order: only subtotal (no fee)", () => {
    const { total } = calcCheckoutFees({
      subtotal: 150,
      countryCode: "LB",
      noAddress: false,
      cityFee: 8,
      deliveryMode: "schedule",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(total).toBe(150);
  });

  it("express order above threshold: subtotal + express surcharge (district fee waived)", () => {
    const { total } = calcCheckoutFees({
      subtotal: 200,
      countryCode: "LB",
      noAddress: false,
      cityFee: 8,
      deliveryMode: "express",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(total).toBe(215);
  });

  it("express order below threshold: subtotal + district fee + express surcharge", () => {
    const { total } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 8,
      deliveryMode: "express",
      timeSlots: [],
      deliverySlot: "",
    });
    expect(total).toBe(73);
  });

  it("scheduled with premium slot: subtotal + city fee + slot fee", () => {
    const slots: TimeSlot[] = [
      { label: "9:00 PM – 11:00 PM", cutoffHour: 21, extraFee: 10 },
    ];
    const { total } = calcCheckoutFees({
      subtotal: 80,
      countryCode: "LB",
      noAddress: false,
      cityFee: 8,
      deliveryMode: "schedule",
      timeSlots: slots,
      deliverySlot: "9:00 PM – 11:00 PM",
    });
    expect(total).toBe(98);
  });

  it("no-address express below threshold: express surcharge is waived, only city fee charged", () => {
    const { total, expressFee } = calcCheckoutFees({
      subtotal: 60,
      countryCode: "LB",
      noAddress: true,
      cityFee: 8,
      deliveryMode: "express",
      timeSlots: [],
      deliverySlot: "",
    });
    // Express surcharge is waived when the recipient provides their own address
    // (noAddress=true). Only the standard city fee applies.
    expect(expressFee).toBe(0);
    expect(total).toBe(68); // 60 + 8 (city fee) + 0 (express surcharge waived)
  });
});

// ---------------------------------------------------------------------------
// activeCurrencyForCountry
// ---------------------------------------------------------------------------

describe("activeCurrencyForCountry — derived from countryCode", () => {
  it("AE → AED", () => expect(activeCurrencyForCountry("AE")).toBe("AED"));
  it("CY → EUR", () => expect(activeCurrencyForCountry("CY")).toBe("EUR"));
  it("LB → USD", () => expect(activeCurrencyForCountry("LB")).toBe("USD"));
  it("unknown country → USD", () => expect(activeCurrencyForCountry("XX")).toBe("USD"));
  it("empty string → USD", () => expect(activeCurrencyForCountry("")).toBe("USD"));
});

// ---------------------------------------------------------------------------
// calcCheckoutFees — slotFee with slotId-based lookup (same-day / next-day dedup fix)
// ---------------------------------------------------------------------------

describe("calcCheckoutFees: slotFee — ID-first lookup and $0 override guard", () => {
  /**
   * Two "Night 9 PM–11 PM" slots that share the same label but have different
   * configs: the same-day variant charges $5; the next-day variant is free
   * (explicit $0 extraFee override). The deduplication fix means both coexist
   * in the timeSlots list, distinguished by slotId.
   */
  const sameDayNight: TimeSlot = {
    label: "9:00 PM – 11:00 PM",
    cutoffHour: 21,
    extraFee: 5,
    slotId: "night-same-day",
    sameDayEnabled: true,
    nextDayEnabled: false,
  };
  const nextDayNight: TimeSlot = {
    label: "9:00 PM – 11:00 PM",
    cutoffHour: 21,
    extraFee: 0,
    slotId: "night-next-day",
    sameDayEnabled: false,
    nextDayEnabled: true,
  };
  const slots: TimeSlot[] = [sameDayNight, nextDayNight];

  it("ID lookup: same-day Night slot charges $5 when deliverySlotId matches", () => {
    const { slotFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "schedule",
      timeSlots: slots,
      deliverySlot: "9:00 PM – 11:00 PM",
      deliverySlotId: "night-same-day",
    });
    expect(slotFee).toBe(5);
  });

  it("ID lookup: next-day Night slot charges $0 when deliverySlotId matches", () => {
    const { slotFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "schedule",
      timeSlots: slots,
      deliverySlot: "9:00 PM – 11:00 PM",
      deliverySlotId: "night-next-day",
    });
    expect(slotFee).toBe(0);
  });

  it("$0 extraFee override is treated as free (not charged)", () => {
    const freeSlot: TimeSlot = { label: "Morning", cutoffHour: 8, extraFee: 0, slotId: "morning-free" };
    const { slotFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "schedule",
      timeSlots: [freeSlot],
      deliverySlot: "Morning",
      deliverySlotId: "morning-free",
    });
    expect(slotFee).toBe(0);
  });

  it("label fallback: resolves by label when no deliverySlotId supplied", () => {
    // Without an ID, the first slot whose label matches is used.
    // sameDayNight is first → $5
    const { slotFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "schedule",
      timeSlots: slots,
      deliverySlot: "9:00 PM – 11:00 PM",
    });
    expect(slotFee).toBe(5);
  });

  it("express mode: always returns $0 even when a matching slot has $5 fee", () => {
    const { slotFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "express",
      timeSlots: slots,
      deliverySlot: "9:00 PM – 11:00 PM",
      deliverySlotId: "night-same-day",
    });
    expect(slotFee).toBe(0);
  });

  it("ID lookup: unknown slotId falls back to label match", () => {
    const simpleSlot: TimeSlot = { label: "9:00 PM – 11:00 PM", cutoffHour: 21, extraFee: 7, slotId: "night-x" };
    const { slotFee } = calcCheckoutFees({
      subtotal: 50,
      countryCode: "LB",
      noAddress: false,
      cityFee: 5,
      deliveryMode: "schedule",
      timeSlots: [simpleSlot],
      deliverySlot: "9:00 PM – 11:00 PM",
      deliverySlotId: "nonexistent-id",
    });
    expect(slotFee).toBe(7);
  });

  it("both Night slots coexist in the list without collision (slotId uniqueness)", () => {
    // Verify both are present and have distinct IDs — this guards against
    // label-based deduplication silently dropping one of them.
    expect(slots.filter((s) => s.label === "9:00 PM – 11:00 PM").length).toBe(2);
    expect(slots[0].slotId).not.toBe(slots[1].slotId);
  });
});

// ---------------------------------------------------------------------------
// timeSlotsForCountry — hardcoded slots used when OS provides none
// ---------------------------------------------------------------------------

describe("timeSlotsForCountry — default slot catalogue", () => {
  it("LB has 4 slots starting at 9 AM", () => {
    const slots = timeSlotsForCountry("LB");
    expect(slots.length).toBe(4);
    expect(slots[0].label).toBe("9:00 AM – 2:00 PM");
    expect(slots[0].cutoffHour).toBe(9);
  });

  it("AE has 4 slots starting at 7 AM", () => {
    const slots = timeSlotsForCountry("AE");
    expect(slots.length).toBe(4);
    expect(slots[0].label).toBe("7:00 AM – 1:00 PM");
    expect(slots[0].cutoffHour).toBe(7);
  });

  it("unknown country falls back to LB slots", () => {
    expect(timeSlotsForCountry("XX")).toEqual(timeSlotsForCountry("LB"));
    expect(timeSlotsForCountry(null)).toEqual(timeSlotsForCountry("LB"));
  });
});
