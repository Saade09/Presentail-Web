// Submission-time slot bookability guard (stale-selection re-validation).
//
// Reproduces the LB-2152 incident: a 9:00 AM – 2:00 PM same-day slot submitted
// at 4 PM Beirut time must be rejected, while future dates and still-open
// windows pass. August dates: Beirut is UTC+3 (EEST), Dubai UTC+4.

import { describe, it, expect } from "vitest";
import {
  isSlotStillBookable,
  isMidnightEligibleCity,
  isMidnightSlot,
  midnightWindowForOccasionDate,
  parseSlotLabelEndHour,
  slotEndHour,
} from "../src/index";

// 2026-08-18 in both Beirut and Dubai for all times used below.
const beirut = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 7, 18, hour - 3, minute)); // UTC+3
const dubai = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 7, 18, hour - 4, minute)); // UTC+4

const MORNING = { label: "9:00 AM – 2:00 PM", cutoffHour: 12, endHour: 14 };
const EVENING = { label: "3:00 PM – 8:00 PM", cutoffHour: 17, endHour: 20 };

describe("parseSlotLabelEndHour", () => {
  it("parses en-dash 12h labels", () => {
    expect(parseSlotLabelEndHour("9:00 AM – 2:00 PM")).toBe(14);
    expect(parseSlotLabelEndHour("3:00 PM – 8:00 PM")).toBe(20);
    expect(parseSlotLabelEndHour("10:00 PM – 12:00 AM")).toBe(0);
    expect(parseSlotLabelEndHour("9 AM - 12 PM")).toBe(12);
  });
  it("returns null for unparseable labels", () => {
    expect(parseSlotLabelEndHour("Express")).toBeNull();
    expect(parseSlotLabelEndHour("")).toBeNull();
    expect(parseSlotLabelEndHour(undefined)).toBeNull();
  });
});

describe("slotEndHour", () => {
  it("prefers explicit endHour over the label", () => {
    expect(slotEndHour({ label: "9:00 AM – 2:00 PM", endHour: 15 })).toBe(15);
  });
  it("falls back to label parsing", () => {
    expect(slotEndHour({ label: "9:00 AM – 2:00 PM" })).toBe(14);
  });
  it("returns null when nothing is known", () => {
    expect(slotEndHour({ label: "whenever" })).toBeNull();
    expect(slotEndHour(null)).toBeNull();
  });
});

describe("isSlotStillBookable — same-day window end", () => {
  it("rejects the LB-2152 case: 9AM–2PM slot at 4PM Beirut", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-18",
        slot: MORNING,
        countryCode: "LB",
        now: beirut(16),
      }),
    ).toEqual({ bookable: false, reason: "slot_window_ended" });
  });

  it("rejects exactly at the window end hour", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-18",
        slot: MORNING,
        countryCode: "LB",
        now: beirut(14),
      }),
    ).toEqual({ bookable: false, reason: "slot_window_ended" });
  });

  it("allows while the window is still open (1PM for a 2PM end)", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-18",
        slot: MORNING,
        countryCode: "LB",
        now: beirut(13, 59),
      }),
    ).toEqual({ bookable: true });
  });

  it("does NOT reject on the booking cutoffHour, only the window end", () => {
    // 1 PM is past the 12h booking cutoff but before the 2 PM window end:
    // an in-flight payment picked just before the cutoff must still land.
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-18",
        slot: MORNING,
        countryCode: "LB",
        now: beirut(13),
      }),
    ).toEqual({ bookable: true });
  });

  it("falls back to label parsing when endHour is absent", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-18",
        slot: { label: "9:00 AM – 2:00 PM" },
        countryCode: "LB",
        now: beirut(15),
      }),
    ).toEqual({ bookable: false, reason: "slot_window_ended" });
  });

  it("allows an unknown/unparseable slot before the cutoff (fails open on window)", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-18",
        slot: { label: "Custom window" },
        countryCode: "LB",
        now: beirut(16),
      }),
    ).toEqual({ bookable: true });
  });
});

describe("isSlotStillBookable — same-day booking cutoff", () => {
  it("rejects any same-day slot once the city cutoff has passed", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-18",
        slot: EVENING,
        countryCode: "LB",
        sameDayCutoffHour: 18,
        now: beirut(18),
      }),
    ).toEqual({ bookable: false, reason: "same_day_cutoff_passed" });
  });

  it("defaults the cutoff to 22 (EXPRESS_CLOSE_HOUR)", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-18",
        slot: { label: "8:00 PM – 11:00 PM", endHour: 23 },
        countryCode: "LB",
        now: beirut(22),
      }),
    ).toEqual({ bookable: false, reason: "same_day_cutoff_passed" });
  });

  it("cutoff applies even when the slot itself is unknown", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-18",
        slot: null,
        countryCode: "LB",
        sameDayCutoffHour: 20,
        now: beirut(21),
      }),
    ).toEqual({ bookable: false, reason: "same_day_cutoff_passed" });
  });
});

describe("isSlotStillBookable — dates and timezones", () => {
  it("always allows future dates", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-19",
        slot: MORNING,
        countryCode: "LB",
        now: beirut(23),
      }),
    ).toEqual({ bookable: true });
  });

  it("rejects past dates", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-17",
        slot: MORNING,
        countryCode: "LB",
        now: beirut(9),
      }),
    ).toEqual({ bookable: false, reason: "past_date" });
  });

  it("treats an empty deliveryDate as today", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "",
        slot: MORNING,
        countryCode: "LB",
        now: beirut(16),
      }),
    ).toEqual({ bookable: false, reason: "slot_window_ended" });
  });

  it("uses Asia/Dubai for AE: 2:30PM Dubai is only 1:30PM Beirut", () => {
    const at = dubai(14, 30);
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-18",
        slot: MORNING,
        countryCode: "AE",
        now: at,
      }),
    ).toEqual({ bookable: false, reason: "slot_window_ended" });
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-18",
        slot: MORNING,
        countryCode: "LB",
        now: at,
      }),
    ).toEqual({ bookable: true });
  });

  it("day boundary: a stale tab past local midnight yields past_date", () => {
    // 00:30 Beirut on Aug 19 with a selection still pointing at Aug 18.
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-18",
        slot: EVENING,
        countryCode: "LB",
        now: new Date(Date.UTC(2026, 7, 18, 21, 30)), // 00:30 Aug 19 Beirut
      }),
    ).toEqual({ bookable: false, reason: "past_date" });
  });
});

describe("Premium Midnight start-date semantics", () => {
  const MIDNIGHT = {
    label: "11 PM–1 AM",
    serviceType: "midnight",
    startHour: 23,
    endHour: 1,
    cutoffHour: 22,
  };

  it("is restricted to canonical Beirut and Metn without label matching", () => {
    expect(isMidnightEligibleCity("lb-beirut")).toBe(true);
    expect(isMidnightEligibleCity("lb-metn")).toBe(true);
    expect(isMidnightEligibleCity("lb-baabda")).toBe(false);
    expect(isMidnightSlot(MIDNIGHT, "lb-beirut")).toBe(true);
    expect(isMidnightSlot({ ...MIDNIGHT, label: "Livraison de minuit" }, "lb-metn")).toBe(true);
    expect(isMidnightSlot(MIDNIGHT, "lb-baabda")).toBe(false);
  });

  it("maps the selected date to 23:00 through following-day 01:00 Beirut time", () => {
    expect(midnightWindowForOccasionDate("2026-08-20")).toEqual({
      occasionDate: "2026-08-20",
      timeZone: "Asia/Beirut",
      start: "2026-08-20T20:00:00.000Z",
      end: "2026-08-20T22:00:00.000Z",
    });
  });

  it("handles month/year boundaries and Beirut winter offset", () => {
    expect(midnightWindowForOccasionDate("2026-12-31")).toEqual({
      occasionDate: "2026-12-31",
      timeZone: "Asia/Beirut",
      start: "2026-12-31T21:00:00.000Z",
      end: "2026-12-31T23:00:00.000Z",
    });
  });

  it("keeps an already-selected window valid after its booking cutoff", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-20",
        slot: MIDNIGHT,
        cityId: "lb-beirut",
        countryCode: "LB",
        now: new Date("2026-08-20T19:00:00.000Z"), // 22:00 Beirut
      }),
    ).toEqual({ bookable: true });
  });

  it("is valid before 23:00 and across midnight, then ends exactly at 01:00", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-20",
        slot: MIDNIGHT,
        cityId: "lb-beirut",
        countryCode: "LB",
        now: new Date("2026-08-20T19:59:00.000Z"), // 22:59 Beirut
      }),
    ).toEqual({ bookable: true });
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-20",
        slot: MIDNIGHT,
        cityId: "lb-beirut",
        countryCode: "LB",
        now: new Date("2026-08-20T20:00:00.000Z"), // 23:00 Beirut
      }),
    ).toEqual({ bookable: true });
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-20",
        slot: MIDNIGHT,
        cityId: "lb-beirut",
        countryCode: "LB",
        now: new Date("2026-08-20T21:00:00.000Z"), // 00:00 Beirut, Aug 21
      }),
    ).toEqual({ bookable: true });
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-20",
        slot: MIDNIGHT,
        cityId: "lb-beirut",
        countryCode: "LB",
        now: new Date("2026-08-20T22:00:00.000Z"), // 01:00 Beirut, Aug 21
      }),
    ).toEqual({ bookable: false, reason: "slot_window_ended" });
  });

  it("rejects an ordinary date from before yesterday as past", () => {
    expect(
      isSlotStillBookable({
        deliveryDate: "2026-08-18",
        slot: MIDNIGHT,
        cityId: "lb-beirut",
        countryCode: "LB",
        now: new Date("2026-08-20T21:30:00.000Z"),
      }),
    ).toEqual({ bookable: false, reason: "slot_window_ended" });
  });
});
