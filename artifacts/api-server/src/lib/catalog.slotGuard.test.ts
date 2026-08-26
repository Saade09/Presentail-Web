// Submission-time stale-slot guard (server side).
//
// Covers:
//  1. checkSubmittedSlotBookable — resolves the booked slot from the OS city
//     config (slotId-first) and rejects a same-day slot whose window ended or
//     whose delivery window ended, in the store's local timezone.
//  2. evaluateOrderSlotGuard — order-creation policy: unpaid submissions with
//     a stale slot are rejected; paid submissions (paymentRef present — the
//     webhook/sweeper/recovery rescue paths) are ALLOWED and only flagged, so
//     a charged order can never become charged-but-lost.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getDeliverySlotsMock, getExpressConfigMock } = vi.hoisted(() => ({
  getDeliverySlotsMock: vi.fn().mockReturnValue([]),
  getExpressConfigMock: vi.fn().mockReturnValue({}),
}));

vi.mock("./osLocationsCache", () => ({
  getDeliverySlots: getDeliverySlotsMock,
  getExpressConfig: getExpressConfigMock,
  getOsCountryFreeDeliveryThresholdUsd: vi.fn().mockReturnValue(null),
  getOsCountryFreeDeliveryEnabled: vi.fn().mockReturnValue(null),
  getOsCityFreeDeliveryThresholdUsd: vi.fn().mockReturnValue(null),
  getOsCityFreeDeliveryEnabled: vi.fn().mockReturnValue(null),
  getOsCityDeliveryFeeUsd: vi.fn().mockReturnValue(null),
}));

import { checkSubmittedSlotBookable, evaluateOrderSlotGuard } from "./catalog";

// August dates: Beirut is UTC+3.
const beirut = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 7, 18, hour - 3, minute));
const TODAY = "2026-08-18";
const TOMORROW = "2026-08-19";

const CITY_SLOTS = [
  {
    label: "9:00 AM – 2:00 PM",
    slotId: "morning",
    cutoffHour: 12,
    startHour: 9,
    endHour: 14,
  },
  {
    label: "3:00 PM – 8:00 PM",
    slotId: "evening",
    cutoffHour: 17,
    startHour: 15,
    endHour: 20,
  },
];

const LATE_SLOT = {
  label: "11:00 PM – 1:00 AM",
  slotId: "beirut-late",
  cutoffHour: 23,
  cutoffMinute: 30,
  startHour: 23,
  endHour: 25,
  enabled: true,
  sameDayEnabled: true,
};

beforeEach(() => {
  getDeliverySlotsMock.mockReturnValue(CITY_SLOTS);
  getExpressConfigMock.mockReturnValue({ sameDayCutoffHour: 22 });
});

describe("checkSubmittedSlotBookable", () => {
  it("rejects a same-day slot whose window ended (LB-2152 case)", () => {
    const r = checkSubmittedSlotBookable({
      deliverySlot: "9:00 AM – 2:00 PM",
      deliverySlotId: "morning",
      deliveryDate: TODAY,
      cityId: "beirut",
      district: "Beirut",
      now: beirut(16),
    });
    expect(r).toEqual({ bookable: false, reason: "slot_window_ended" });
  });

  it("allows the same slot while the window is still open", () => {
    const r = checkSubmittedSlotBookable({
      deliverySlot: "9:00 AM – 2:00 PM",
      deliverySlotId: "morning",
      deliveryDate: TODAY,
      cityId: "beirut",
      district: "Beirut",
      now: beirut(13),
    });
    expect(r).toEqual({ bookable: true });
  });

  it("keeps an ordinary same-day slot valid after the city cutoff", () => {
    getExpressConfigMock.mockReturnValue({ sameDayCutoffHour: 11 });
    const r = checkSubmittedSlotBookable({
      deliverySlot: "3:00 PM – 8:00 PM",
      deliverySlotId: "evening",
      deliveryDate: TODAY,
      cityId: "beirut",
      district: "Beirut",
      now: beirut(11, 25),
    });
    expect(r).toEqual({ bookable: true });
  });

  it("enforces the exact Beirut late-slot cutoff before payment", () => {
    getDeliverySlotsMock.mockReturnValue([LATE_SLOT]);
    getExpressConfigMock.mockReturnValue({
      sameDayCutoffHour: 23,
      sameDayCutoffMinute: 30,
    });
    const base = {
      deliverySlot: LATE_SLOT.label,
      deliverySlotId: LATE_SLOT.slotId,
      deliveryDate: TODAY,
      cityId: "lb-beirut",
      district: "Beirut",
    };
    expect(checkSubmittedSlotBookable({ ...base, now: beirut(23, 29) })).toEqual({
      bookable: true,
    });
    expect(checkSubmittedSlotBookable({ ...base, now: beirut(23, 30) })).toEqual({
      bookable: false,
      reason: "same_day_cutoff_passed",
    });
    expect(checkSubmittedSlotBookable({ ...base, now: beirut(23, 31) })).toEqual({
      bookable: false,
      reason: "same_day_cutoff_passed",
    });
    expect(
      checkSubmittedSlotBookable({
        ...base,
        now: new Date("2026-08-18T21:10:00.000Z"),
      }),
    ).toEqual({
      bookable: false,
      reason: "same_day_cutoff_passed",
    });
  });

  it("uses an earlier verified slot cutoff for the Beirut late slot", () => {
    getDeliverySlotsMock.mockReturnValue([
      { ...LATE_SLOT, cutoffHour: 23, cutoffMinute: 15 },
    ]);
    getExpressConfigMock.mockReturnValue({
      sameDayCutoffHour: 23,
      sameDayCutoffMinute: 30,
    });
    expect(
      checkSubmittedSlotBookable({
        deliverySlot: LATE_SLOT.label,
        deliverySlotId: LATE_SLOT.slotId,
        deliveryDate: TODAY,
        cityId: "lb-beirut",
        district: "Beirut",
        now: beirut(23, 15),
      }),
    ).toEqual({ bookable: false, reason: "same_day_cutoff_passed" });
  });

  it("preserves the verified campaign cutoff for an 18:00 late window", () => {
    const campaignSlot = {
      ...LATE_SLOT,
      label: "6:00 PM – 11:00 PM",
      startHour: 18,
      endHour: 23,
      cutoffHour: 22,
      cutoffMinute: 0,
    };
    getDeliverySlotsMock.mockReturnValue([campaignSlot]);
    getExpressConfigMock.mockReturnValue({
      sameDayCutoffHour: 23,
      sameDayCutoffMinute: 30,
    });
    expect(
      checkSubmittedSlotBookable({
        deliverySlot: campaignSlot.label,
        deliverySlotId: campaignSlot.slotId,
        deliveryDate: TODAY,
        cityId: "lb-beirut",
        district: "Beirut",
        now: beirut(22),
      }),
    ).toEqual({ bookable: false, reason: "same_day_cutoff_passed" });
  });

  it("does not apply the campaign cutoff to an ordinary 18:00–22:00 window", () => {
    const ordinaryEvening = {
      ...LATE_SLOT,
      label: "6:00 PM – 10:00 PM",
      startHour: 18,
      endHour: 22,
      cutoffHour: 18,
      cutoffMinute: 0,
    };
    getDeliverySlotsMock.mockReturnValue([ordinaryEvening]);
    expect(
      checkSubmittedSlotBookable({
        deliverySlot: ordinaryEvening.label,
        deliverySlotId: ordinaryEvening.slotId,
        deliveryDate: TODAY,
        cityId: "lb-beirut",
        district: "Beirut",
        now: beirut(18, 30),
      }),
    ).toEqual({ bookable: true });
  });

  it("rejects a disabled same-day slot submitted by label only", () => {
    getDeliverySlotsMock.mockReturnValue([
      {
        ...CITY_SLOTS[1],
        enabled: false,
        sameDayEnabled: true,
      },
    ]);
    expect(
      checkSubmittedSlotBookable({
        deliverySlot: CITY_SLOTS[1]!.label,
        deliveryDate: TODAY,
        cityId: "beirut",
        district: "Beirut",
        now: beirut(11),
      }),
    ).toEqual({ bookable: false, reason: "slot_unavailable" });
  });

  it("rejects a disabled future slot submitted by label only", () => {
    getDeliverySlotsMock.mockReturnValue([
      {
        ...CITY_SLOTS[1],
        enabled: false,
        nextDayEnabled: true,
      },
    ]);
    expect(
      checkSubmittedSlotBookable({
        deliverySlot: CITY_SLOTS[1]!.label,
        deliveryDate: TOMORROW,
        cityId: "beirut",
        district: "Beirut",
        now: beirut(11),
      }),
    ).toEqual({ bookable: false, reason: "slot_unavailable" });
  });

  it("allows future-date orders regardless of the hour", () => {
    const r = checkSubmittedSlotBookable({
      deliverySlot: "9:00 AM – 2:00 PM",
      deliverySlotId: "morning",
      deliveryDate: TOMORROW,
      cityId: "beirut",
      district: "Beirut",
      now: beirut(23),
    });
    expect(r).toEqual({ bookable: true });
  });

  it("skips express orders and empty slot labels", () => {
    expect(
      checkSubmittedSlotBookable({
        expressDelivery: true,
        deliverySlot: "9:00 AM – 2:00 PM",
        deliveryDate: TODAY,
        cityId: "beirut",
        now: beirut(23),
      }),
    ).toEqual({ bookable: true });
    expect(
      checkSubmittedSlotBookable({
        deliverySlot: "",
        deliveryDate: TODAY,
        cityId: "beirut",
        now: beirut(23),
      }),
    ).toEqual({ bookable: true });
  });

  it("rejects a scheduled order when its city schedule is unavailable", () => {
    getDeliverySlotsMock.mockReturnValue([]);
    getExpressConfigMock.mockReturnValue({});
    const r = checkSubmittedSlotBookable({
      deliverySlot: "9:00 AM – 2:00 PM",
      deliveryDate: TODAY,
      district: "Beirut",
      now: beirut(15),
    });
    expect(r).toEqual({ bookable: false, reason: "slot_unavailable" });
  });

  it("uses Asia/Dubai for AE districts", () => {
    // 15:30 Beirut is 16:30 Dubai — past a 2 PM window end in Dubai,
    // and would also be past in Beirut; instead verify the opposite:
    // 13:30 Dubai (12:30 Beirut) is still open for a 2 PM end.
    const at = new Date(Date.UTC(2026, 7, 18, 9, 30)); // 13:30 Dubai / 12:30 Beirut
    expect(
      checkSubmittedSlotBookable({
        deliverySlot: "9:00 AM – 2:00 PM",
        deliverySlotId: "morning",
        deliveryDate: TODAY,
        cityId: "dubai",
        district: "Dubai",
        now: at,
      }),
    ).toEqual({ bookable: true });
    // 14:30 Dubai — window ended in Dubai even though it's 13:30 in Beirut.
    expect(
      checkSubmittedSlotBookable({
        deliverySlot: "9:00 AM – 2:00 PM",
        deliverySlotId: "morning",
        deliveryDate: TODAY,
        cityId: "dubai",
        district: "Dubai",
        now: new Date(Date.UTC(2026, 7, 18, 10, 30)),
      }),
    ).toEqual({ bookable: false, reason: "slot_window_ended" });
  });
});

describe("evaluateOrderSlotGuard — paid-recovery exemption", () => {
  const staleInput = {
    deliverySlot: "9:00 AM – 2:00 PM",
    deliverySlotId: "morning",
    deliveryDate: TODAY,
    cityId: "beirut",
    district: "Beirut",
    now: beirut(16),
  };

  it("rejects an unpaid submission with a stale slot", () => {
    expect(evaluateOrderSlotGuard(staleInput)).toEqual({
      action: "reject",
      reason: "slot_window_ended",
    });
  });

  it("allows (flags) a PAID submission — webhook/sweeper/recovery must not be blocked", () => {
    expect(evaluateOrderSlotGuard({ ...staleInput, paymentRef: "pi_123" })).toEqual({
      action: "allow_paid",
      reason: "slot_window_ended",
    });
  });

  it("allows a valid submission outright", () => {
    expect(
      evaluateOrderSlotGuard({ ...staleInput, now: beirut(10) }),
    ).toEqual({ action: "allow" });
  });

  it("allows an ordinary overnight slot after midnight, including paid recovery", () => {
    const overnight = {
      label: "10 PM – 6 AM",
      slotId: "overnight",
      startHour: 22,
      endHour: 6,
      enabled: true,
      sameDayEnabled: true,
      nextDayEnabled: false,
    };
    getDeliverySlotsMock.mockReturnValue([overnight]);
    const input = {
      deliverySlot: overnight.label,
      deliverySlotId: overnight.slotId,
      deliveryDate: TODAY,
      cityId: "beirut",
      district: "Beirut",
      now: new Date("2026-08-18T21:30:00.000Z"),
    };
    expect(evaluateOrderSlotGuard(input)).toEqual({ action: "allow" });
    expect(
      evaluateOrderSlotGuard({ ...input, paymentRef: "pi_paid" }),
    ).toEqual({ action: "allow" });
  });
});
