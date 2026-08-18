// Client-side stale-slot re-check used by Checkout.handleSubmit: a stale
// selection must trigger the re-pick prompt (bookable: false) BEFORE any
// payment is initiated. August dates: Beirut is UTC+3.

import { describe, it, expect } from "vitest";
import { checkStaleSlotSelection } from "./staleSlotCheck";
import type { TimeSlot } from "@workspace/delivery";

const beirut = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 7, 18, hour - 3, minute));
const TODAY = "2026-08-18";
const TOMORROW = "2026-08-19";

const SLOTS: TimeSlot[] = [
  { label: "9:00 AM – 2:00 PM", slotId: "morning", cutoffHour: 12, startHour: 9, endHour: 14 },
  { label: "3:00 PM – 8:00 PM", slotId: "evening", cutoffHour: 17, startHour: 15, endHour: 20 },
];

describe("checkStaleSlotSelection", () => {
  it("flags a same-day slot whose window ended (triggers the re-pick prompt)", () => {
    const r = checkStaleSlotSelection({
      deliveryMode: "schedule",
      deliverySlot: "9:00 AM – 2:00 PM",
      deliverySlotId: "morning",
      deliveryDate: TODAY,
      timeSlots: SLOTS,
      countryCode: "LB",
      now: beirut(16),
    });
    expect(r.bookable).toBe(false);
    if (!r.bookable) expect(r.reason).toBe("slot_window_ended");
  });

  it("passes a still-open same-day slot", () => {
    expect(
      checkStaleSlotSelection({
        deliveryMode: "schedule",
        deliverySlot: "3:00 PM – 8:00 PM",
        deliverySlotId: "evening",
        deliveryDate: TODAY,
        timeSlots: SLOTS,
        countryCode: "LB",
        now: beirut(16),
      }),
    ).toEqual({ bookable: true });
  });

  it("passes future-date selections at any hour", () => {
    expect(
      checkStaleSlotSelection({
        deliveryMode: "schedule",
        deliverySlot: "9:00 AM – 2:00 PM",
        deliverySlotId: "morning",
        deliveryDate: TOMORROW,
        timeSlots: SLOTS,
        countryCode: "LB",
        now: beirut(23),
      }),
    ).toEqual({ bookable: true });
  });

  it("flags a stale tab past local midnight (past date)", () => {
    const r = checkStaleSlotSelection({
      deliveryMode: "schedule",
      deliverySlot: "3:00 PM – 8:00 PM",
      deliveryDate: TODAY,
      timeSlots: SLOTS,
      countryCode: "LB",
      now: new Date(Date.UTC(2026, 7, 18, 21, 30)), // 00:30 Aug 19 Beirut
    });
    expect(r.bookable).toBe(false);
    if (!r.bookable) expect(r.reason).toBe("past_date");
  });

  it("honours the city same-day cutoff even for a later slot", () => {
    const r = checkStaleSlotSelection({
      deliveryMode: "schedule",
      deliverySlot: "3:00 PM – 8:00 PM",
      deliverySlotId: "evening",
      deliveryDate: TODAY,
      timeSlots: SLOTS,
      countryCode: "LB",
      sameDayCutoffHour: 16,
      now: beirut(16, 30),
    });
    expect(r.bookable).toBe(false);
    if (!r.bookable) expect(r.reason).toBe("same_day_cutoff_passed");
  });

  it("skips express mode entirely", () => {
    expect(
      checkStaleSlotSelection({
        deliveryMode: "express",
        deliverySlot: "",
        deliveryDate: TODAY,
        timeSlots: SLOTS,
        countryCode: "LB",
        now: beirut(23),
      }),
    ).toEqual({ bookable: true });
  });

  it("falls back to label parsing when the label is not in the city list", () => {
    const r = checkStaleSlotSelection({
      deliveryMode: "schedule",
      deliverySlot: "10:00 AM – 1:00 PM",
      deliveryDate: TODAY,
      timeSlots: SLOTS,
      countryCode: "LB",
      now: beirut(15),
    });
    expect(r.bookable).toBe(false);
    if (!r.bookable) expect(r.reason).toBe("slot_window_ended");
  });
});
