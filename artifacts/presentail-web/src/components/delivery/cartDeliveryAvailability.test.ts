import { describe, expect, it } from "vitest";
import { classifyCartDeliverySelection } from "./cartDeliveryAvailability";

const slot = {
  label: "4:00 PM – 8:00 PM",
  slotId: "evening",
  startHour: 16,
  endHour: 20,
  cutoffHour: 16,
};

const selected = (overrides: Record<string, unknown> = {}) => ({
  mode: "schedule" as const,
  date: "2026-08-14",
  slotLabel: slot.label,
  slotId: slot.slotId,
  serviceType: null,
  cityId: "city",
  source: "restored_user_selection" as const,
  ...overrides,
});

describe("classifyCartDeliverySelection", () => {
  it("classifies a Beirut cutoff that passed while the cart was open as time expiry", () => {
    expect(classifyCartDeliverySelection({
      selection: selected(),
      countryCode: "LB",
      city: { id: "city", name: "Beirut", timeSlots: [slot], expressAvailable: true },
      // 18:00 in Beirut in August: the 16:00 booking cutoff has passed.
      now: new Date("2026-08-14T15:00:00.000Z"),
    })).toEqual({ valid: false, reason: "expired" });
  });

  it("keeps a still-bookable Dubai window valid in the destination market timezone", () => {
    expect(classifyCartDeliverySelection({
      selection: selected(),
      countryCode: "AE",
      city: { id: "city", name: "Dubai", timeSlots: [slot], expressAvailable: true },
      // 19:00 Dubai: the 16:00 cutoff is already past, so use a later cutoff.
      now: new Date("2026-08-14T11:00:00.000Z"),
    })).toEqual({ valid: true });
  });

  it("distinguishes a removed OS slot from a passed clock window", () => {
    expect(classifyCartDeliverySelection({
      selection: selected({ date: "2026-08-20" }),
      countryCode: "LB",
      city: { id: "city", name: "Beirut", timeSlots: [], expressAvailable: true },
      now: new Date("2026-08-14T12:00:00.000Z"),
    })).toEqual({ valid: false, reason: "unavailable" });
  });

  it("does not keep an express selection when the city turned it off", () => {
    expect(classifyCartDeliverySelection({
      selection: selected({ mode: "express", date: "2026-08-14", slotLabel: null, slotId: null }),
      countryCode: "AE",
      city: { id: "city", name: "Dubai", timeSlots: [slot], expressAvailable: false },
      now: new Date("2026-08-14T11:00:00.000Z"),
    })).toEqual({ valid: false, reason: "unavailable" });
  });

  it("keeps yesterday's Midnight start date valid while the cross-midnight window is active", () => {
    const midnightSlot = {
      label: "11 PM – 1 AM",
      slotId: "midnight",
      serviceType: "midnight" as const,
      startHour: 23,
      endHour: 1,
      cutoffHour: 20,
      sameDayEnabled: true,
      nextDayEnabled: false,
    };
    expect(classifyCartDeliverySelection({
      selection: selected({
        date: "2026-08-14",
        slotLabel: midnightSlot.label,
        slotId: midnightSlot.slotId,
        serviceType: "midnight",
        cityId: "lb-beirut",
      }),
      countryCode: "LB",
      city: {
        id: "lb-beirut",
        name: "Beirut",
        timeSlots: [{ ...midnightSlot, slotId: "flat-list-variant" }],
        slotsByDay: { friday: [midnightSlot] },
        expressAvailable: true,
      },
      // 00:30 Beirut on Aug 15: the Aug 14 start-date window is still active.
      now: new Date("2026-08-14T21:30:00.000Z"),
    })).toEqual({ valid: true });
  });

  it("expires yesterday's Midnight start date when the window reaches 01:00", () => {
    const midnightSlot = {
      label: "11 PM – 1 AM",
      slotId: "midnight",
      serviceType: "midnight" as const,
      startHour: 23,
      endHour: 1,
      cutoffHour: 20,
      sameDayEnabled: true,
      nextDayEnabled: false,
    };
    expect(classifyCartDeliverySelection({
      selection: selected({
        date: "2026-08-14",
        slotLabel: midnightSlot.label,
        slotId: midnightSlot.slotId,
        serviceType: "midnight",
        cityId: "lb-beirut",
      }),
      countryCode: "LB",
      city: {
        id: "lb-beirut",
        name: "Beirut",
        timeSlots: [{ ...midnightSlot, slotId: "flat-list-variant" }],
        slotsByDay: { friday: [midnightSlot] },
        expressAvailable: true,
      },
      now: new Date("2026-08-14T22:00:00.000Z"),
    })).toEqual({ valid: false, reason: "expired" });
  });
});