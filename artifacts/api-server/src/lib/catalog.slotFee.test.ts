// Unit tests for the server-authoritative slot-fee resolver.
//
// These cover the two payment-integrity cases raised in review:
//   1. A same-day night slot with explicit extraFee: 0 must still charge the
//      $5 fallback (matching the client display), including on the Woo
//      payment-recovery path which now calls computeSlotFeeUsd.
//   2. Duplicate-label slot configs (same-day paid vs next-day free) must be
//      resolved date-aware: a slotId that is not eligible for the submitted
//      date is normalized to the date-correct same-label variant instead of
//      being trusted.

import { describe, it, expect, vi } from "vitest";

const TODAY = "2026-08-13";
const TOMORROW = "2026-08-14";

const DUP_SLOTS = [
  {
    label: "9:00 PM – 11:00 PM",
    slotId: "night-same-day",
    cutoffHour: 21,
    startHour: 21,
    endHour: 23,
    sameDayEnabled: true,
    nextDayEnabled: false,
    extraFee: 7,
  },
  {
    label: "9:00 PM – 11:00 PM",
    slotId: "night-next-day",
    cutoffHour: 21,
    startHour: 21,
    endHour: 23,
    sameDayEnabled: false,
    nextDayEnabled: true,
    extraFee: 0,
  },
];

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
    getLocalIso: vi.fn().mockReturnValue("2026-08-13"),
  };
});

import { computeSlotFeeUsd, resolveSlotForDate } from "./catalog";
import { getDeliverySlots } from "./osLocationsCache";

const getDeliverySlotsMock = vi.mocked(getDeliverySlots);

describe("resolveSlotForDate — date-aware duplicate-label resolution", () => {
  it("today: an ineligible next-day slotId is normalized to the same-day paid variant", () => {
    const slot = resolveSlotForDate(DUP_SLOTS, {
      deliverySlot: "9:00 PM – 11:00 PM",
      deliverySlotId: "night-next-day", // not eligible today
      dateIso: TODAY,
      todayIso: TODAY,
    });
    expect(slot?.slotId).toBe("night-same-day");
  });

  it("tomorrow: an ineligible same-day slotId is normalized to the next-day free variant", () => {
    const slot = resolveSlotForDate(DUP_SLOTS, {
      deliverySlot: "9:00 PM – 11:00 PM",
      deliverySlotId: "night-same-day", // not eligible tomorrow
      dateIso: TOMORROW,
      todayIso: TODAY,
    });
    expect(slot?.slotId).toBe("night-next-day");
  });

  it("matching eligible slotId is used directly", () => {
    const slot = resolveSlotForDate(DUP_SLOTS, {
      deliverySlot: "9:00 PM – 11:00 PM",
      deliverySlotId: "night-same-day",
      dateIso: TODAY,
      todayIso: TODAY,
    });
    expect(slot?.slotId).toBe("night-same-day");
  });

  it("legacy slots without same/next-day flags skip the date filter", () => {
    const legacy = [{ label: "Morning", cutoffHour: 8, extraFee: 3 }];
    const slot = resolveSlotForDate(legacy, {
      deliverySlot: "Morning",
      dateIso: TOMORROW,
      todayIso: TODAY,
    });
    expect(slot?.label).toBe("Morning");
  });
});

describe("computeSlotFeeUsd — payment-recovery fee integrity", () => {
  it("same-day night slot with explicit extraFee: 0 still charges the $5 fallback", () => {
    getDeliverySlotsMock.mockReturnValue([
      { label: "9:00 PM – 11:00 PM", slotId: "night-zero", cutoffHour: 21, startHour: 21, endHour: 23, extraFee: 0 },
    ]);
    const fee = computeSlotFeeUsd({
      deliverySlot: "9:00 PM – 11:00 PM",
      deliverySlotId: "night-zero",
      cityId: "1",
      deliveryDate: TODAY,
      district: "Beirut",
    });
    expect(fee).toBe(5);
  });

  it("next-day night slot with explicit extraFee: 0 stays free", () => {
    getDeliverySlotsMock.mockReturnValue([
      { label: "9:00 PM – 11:00 PM", slotId: "night-zero", cutoffHour: 21, startHour: 21, endHour: 23, extraFee: 0 },
    ]);
    const fee = computeSlotFeeUsd({
      deliverySlot: "9:00 PM – 11:00 PM",
      deliverySlotId: "night-zero",
      cityId: "1",
      deliveryDate: TOMORROW,
      district: "Beirut",
    });
    expect(fee).toBe(0);
  });

  it("conflicting duplicate-label slotId submitted for today charges the same-day paid fee", () => {
    getDeliverySlotsMock.mockReturnValue(DUP_SLOTS);
    const fee = computeSlotFeeUsd({
      deliverySlot: "9:00 PM – 11:00 PM",
      deliverySlotId: "night-next-day", // free variant, but not valid today
      cityId: "1",
      deliveryDate: TODAY,
      district: "Beirut",
    });
    expect(fee).toBe(7);
  });

  it("conflicting duplicate-label slotId submitted for tomorrow charges the free next-day fee", () => {
    getDeliverySlotsMock.mockReturnValue(DUP_SLOTS);
    const fee = computeSlotFeeUsd({
      deliverySlot: "9:00 PM – 11:00 PM",
      deliverySlotId: "night-same-day", // paid variant, but not valid tomorrow
      cityId: "1",
      deliveryDate: TOMORROW,
      district: "Beirut",
    });
    expect(fee).toBe(0);
  });

  it("express delivery never charges a slot fee", () => {
    getDeliverySlotsMock.mockReturnValue(DUP_SLOTS);
    const fee = computeSlotFeeUsd({
      expressDelivery: true,
      deliverySlot: "9:00 PM – 11:00 PM",
      cityId: "1",
      district: "Beirut",
    });
    expect(fee).toBe(0);
  });
});
