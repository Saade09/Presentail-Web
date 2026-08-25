import { describe, expect, it } from "vitest";

import {
  classifyStandardDeliveryDay,
  type DeliveryDay,
  formatDeliveryRow,
  formatSlotTimeRange,
  resolveSlotLabel,
  slotTimeRangeForLabel,
  timeSlotsForCountry,
  type TimeSlot,
} from "../index.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const lbSlots = timeSlotsForCountry("LB");
// LB slots: cutoffs 9, 14, 18, 21
// labels:   "9:00 AM – 2:00 PM" | "2:00 PM – 6:00 PM" | "6:00 PM – 9:00 PM" | "9:00 PM – 11:00 PM"

const FIRST_LABEL = lbSlots[0].label; // "9:00 AM – 2:00 PM"
const SECOND_LABEL = lbSlots[1].label; // "2:00 PM – 6:00 PM"

/** Minimal DeliveryDay array for formatDeliveryRow tests (not time-dependent). */
function makedays(): DeliveryDay[] {
  return [
    { iso: "2026-06-01", label: "Today", day: "Mon", date: "1", full: "Monday, June 1, 2026" },
    { iso: "2026-06-02", label: "Tomorrow", day: "Tue", date: "2", full: "Tuesday, June 2, 2026" },
    { iso: "2026-06-03", label: "Wed", day: "Wed", date: "3", full: "Wednesday, June 3, 2026" },
  ];
}

// ---------------------------------------------------------------------------
// resolveSlotLabel
// ---------------------------------------------------------------------------

describe("resolveSlotLabel", () => {
  // --- stored slot still valid -------------------------------------------

  it("returns the stored slot label unchanged when the date is not today", () => {
    // isToday = false → cutoff irrelevant; the stored slot is always valid.
    const result = resolveSlotLabel(FIRST_LABEL, lbSlots, false, 23);
    expect(result).toBe(FIRST_LABEL);
  });

  it("returns the stored slot label when isToday and current hour is before its cutoff", () => {
    // FIRST_LABEL cutoff is 9; hour 8 is before it → still valid.
    const result = resolveSlotLabel(FIRST_LABEL, lbSlots, true, 8);
    expect(result).toBe(FIRST_LABEL);
  });

  it("returns a later-in-day slot label that is still valid on today", () => {
    // SECOND_LABEL cutoff is 14; hour 10 is before it → still valid.
    const result = resolveSlotLabel(SECOND_LABEL, lbSlots, true, 10);
    expect(result).toBe(SECOND_LABEL);
  });

  // --- stored slot expired -----------------------------------------------

  it("falls back to the next available slot when the stored slot's cutoff has passed", () => {
    // FIRST_LABEL cutoff 9 — currentHour 9 means it is past (cutoffHour > currentHour fails).
    // The next available slot has cutoff 14 (SECOND_LABEL).
    const result = resolveSlotLabel(FIRST_LABEL, lbSlots, true, 9);
    expect(result).toBe(SECOND_LABEL);
  });

  it("falls back when the stored slot's cutoff is well into the past", () => {
    // Hour 18: cutoffs 9 & 14 are past; cutoff 18 is also past (not >18).
    // Next: cutoff 21 ("9:00 PM – 11:00 PM").
    const result = resolveSlotLabel(FIRST_LABEL, lbSlots, true, 18);
    expect(result).toBe(lbSlots[3].label);
  });

  // --- stored slot not in the list ---------------------------------------

  it("falls back to the first available slot when the stored label is not in the slot list", () => {
    // Hour 0: all slots still available → returns first slot.
    const result = resolveSlotLabel("nonexistent label", lbSlots, true, 0);
    expect(result).toBe(FIRST_LABEL);
  });

  it("falls back when stored label is not in list and isToday is false", () => {
    const result = resolveSlotLabel("nonexistent label", lbSlots, false, 12);
    expect(result).toBe(FIRST_LABEL);
  });

  // --- null / undefined slot --------------------------------------------

  it("returns the first available slot when slotLabel is null", () => {
    const result = resolveSlotLabel(null, lbSlots, true, 0);
    expect(result).toBe(FIRST_LABEL);
  });

  it("returns the first available slot when slotLabel is undefined", () => {
    const result = resolveSlotLabel(undefined, lbSlots, false, 12);
    expect(result).toBe(FIRST_LABEL);
  });

  // --- no slots remain for today -----------------------------------------

  it("returns null when all slot cutoffs have passed for today", () => {
    // All LB cutoffs (9, 14, 18, 21) are ≤ 23 → none qualify.
    const result = resolveSlotLabel(null, lbSlots, true, 23);
    expect(result).toBeNull();
  });

  it("returns null even when a stored label exists but all cutoffs are past", () => {
    const result = resolveSlotLabel(FIRST_LABEL, lbSlots, true, 23);
    expect(result).toBeNull();
  });

  it("returns null when slot list is empty", () => {
    const result = resolveSlotLabel(null, [], true, 10);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatDeliveryRow
// ---------------------------------------------------------------------------

describe("formatDeliveryRow", () => {
  const days = makedays();
  const EXPRESS_LABEL = "Express Delivery";

  // --- express mode -------------------------------------------------------

  it("returns expressLabel when mode is 'express'", () => {
    const result = formatDeliveryRow({
      mode: "express",
      date: null,
      slotLabel: null,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBe(EXPRESS_LABEL);
  });

  it("returns expressLabel for express mode even when date and slotLabel are provided", () => {
    const result = formatDeliveryRow({
      mode: "express",
      date: "2026-06-01",
      slotLabel: SECOND_LABEL,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBe(EXPRESS_LABEL);
  });

  // --- scheduled mode with a date that is in the days list ---------------

  it("uses day.label (Today) as prefix when the date is the first entry in the list", () => {
    // days[0] has label "Today" and is also the 0th element → use its label directly.
    const result = formatDeliveryRow({
      mode: "schedule",
      date: "2026-06-01",
      slotLabel: FIRST_LABEL,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBe(`Today · ${FIRST_LABEL}`);
  });

  it("uses 'Tomorrow' prefix when date matches days[1] (not today)", () => {
    // days[1] is not days[0], so prefix is `${day.day} ${day.date}` = "Tue 2".
    const result = formatDeliveryRow({
      mode: "schedule",
      date: "2026-06-02",
      slotLabel: SECOND_LABEL,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBe(`Tue 2 · ${SECOND_LABEL}`);
  });

  it("uses 'day.day day.date' prefix when the date is a later entry in the list", () => {
    // days[2]: day="Wed", date="3" → "Wed 3 · <slot>"
    const result = formatDeliveryRow({
      mode: "schedule",
      date: "2026-06-03",
      slotLabel: FIRST_LABEL,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBe(`Wed 3 · ${FIRST_LABEL}`);
  });

  it("also works for mode 'today_slot' with date in the list", () => {
    const result = formatDeliveryRow({
      mode: "today_slot",
      date: "2026-06-01",
      slotLabel: SECOND_LABEL,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBe(`Today · ${SECOND_LABEL}`);
  });

  // --- scheduled mode with an iso date NOT in the days list --------------

  it("falls back to the raw iso date string as prefix when date is not in the list", () => {
    const result = formatDeliveryRow({
      mode: "schedule",
      date: "2026-07-04",
      slotLabel: FIRST_LABEL,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBe(`2026-07-04 · ${FIRST_LABEL}`);
  });

  // --- null / missing mode -----------------------------------------------
  //
  // formatDeliveryRow only fast-returns null when date or slotLabel is
  // absent. A null/undefined mode just skips the "express" branch and
  // falls through to the normal day-prefix + slot formatting — useful for
  // callers that haven't set a mode yet but already have a date and slot.

  it("still formats a row when mode is null but date and slotLabel are present", () => {
    const result = formatDeliveryRow({
      mode: null,
      date: "2026-06-01",
      slotLabel: FIRST_LABEL,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBe(`Today · ${FIRST_LABEL}`);
  });

  it("still formats a row when mode is undefined but date and slotLabel are present", () => {
    const result = formatDeliveryRow({
      mode: undefined,
      date: "2026-06-01",
      slotLabel: FIRST_LABEL,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBe(`Today · ${FIRST_LABEL}`);
  });

  it("returns null when mode is null and slotLabel is also null", () => {
    const result = formatDeliveryRow({
      mode: null,
      date: "2026-06-01",
      slotLabel: null,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBeNull();
  });

  // --- missing slotLabel -------------------------------------------------

  it("returns null when slotLabel is null (non-express mode)", () => {
    const result = formatDeliveryRow({
      mode: "schedule",
      date: "2026-06-01",
      slotLabel: null,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBeNull();
  });

  it("returns null when slotLabel is undefined (non-express mode)", () => {
    const result = formatDeliveryRow({
      mode: "schedule",
      date: "2026-06-01",
      slotLabel: undefined,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBeNull();
  });

  // --- missing date ------------------------------------------------------

  it("returns null when date is null (non-express mode)", () => {
    const result = formatDeliveryRow({
      mode: "schedule",
      date: null,
      slotLabel: FIRST_LABEL,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBeNull();
  });

  it("returns null when date is undefined (non-express mode)", () => {
    const result = formatDeliveryRow({
      mode: "schedule",
      date: undefined,
      slotLabel: FIRST_LABEL,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBeNull();
  });

  // --- both date and slotLabel missing -----------------------------------

  it("returns null when both date and slotLabel are null", () => {
    const result = formatDeliveryRow({
      mode: "schedule",
      date: null,
      slotLabel: null,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBeNull();
  });

  // --- slotTimeRange overrides slotLabel in the display string -----------

  it("uses slotTimeRange instead of slotLabel when both are provided", () => {
    const result = formatDeliveryRow({
      mode: "schedule",
      date: "2026-06-01",
      slotLabel: "Afternoon",
      slotTimeRange: "12:00–16:00",
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBe("Today · 12:00–16:00");
  });

  it("falls back to slotLabel when slotTimeRange is undefined", () => {
    const result = formatDeliveryRow({
      mode: "schedule",
      date: "2026-06-01",
      slotLabel: "Afternoon",
      slotTimeRange: undefined,
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBe("Today · Afternoon");
  });

  it("slotTimeRange does not affect express mode (expressLabel is still returned)", () => {
    const result = formatDeliveryRow({
      mode: "express",
      date: "2026-06-01",
      slotLabel: "Afternoon",
      slotTimeRange: "12:00–16:00",
      days,
      expressLabel: EXPRESS_LABEL,
    });
    expect(result).toBe(EXPRESS_LABEL);
  });
});

// ---------------------------------------------------------------------------
// formatSlotTimeRange
// ---------------------------------------------------------------------------

describe("formatSlotTimeRange", () => {
  it("returns formatted 'HH:MM–HH:MM' string for a slot with startHour and endHour", () => {
    const slot: TimeSlot = { label: "Afternoon", cutoffHour: 16, startHour: 12, endHour: 16 };
    expect(formatSlotTimeRange(slot)).toBe("12:00–16:00");
  });

  it("zero-pads single-digit hours", () => {
    const slot: TimeSlot = { label: "Morning", cutoffHour: 9, startHour: 9, endHour: 12 };
    expect(formatSlotTimeRange(slot)).toBe("09:00–12:00");
  });

  it("returns undefined when startHour is missing", () => {
    const slot: TimeSlot = { label: "Morning", cutoffHour: 9, endHour: 12 };
    expect(formatSlotTimeRange(slot)).toBeUndefined();
  });

  it("returns undefined when endHour is missing", () => {
    const slot: TimeSlot = { label: "Morning", cutoffHour: 9, startHour: 9 };
    expect(formatSlotTimeRange(slot)).toBeUndefined();
  });

  it("returns undefined for a legacy label-only slot", () => {
    const slot: TimeSlot = { label: "9:00 AM – 2:00 PM", cutoffHour: 9 };
    expect(formatSlotTimeRange(slot)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// slotTimeRangeForLabel
// ---------------------------------------------------------------------------

describe("slotTimeRangeForLabel", () => {
  const slots: TimeSlot[] = [
    { label: "Morning", cutoffHour: 9, startHour: 9, endHour: 12 },
    { label: "Afternoon", cutoffHour: 16, startHour: 12, endHour: 16 },
    { label: "Evening", cutoffHour: 21 },
  ];

  it("returns the formatted time range for a matched slot with hours", () => {
    expect(slotTimeRangeForLabel("Afternoon", slots)).toBe("12:00–16:00");
  });

  it("returns undefined for a matched slot without hours (legacy)", () => {
    expect(slotTimeRangeForLabel("Evening", slots)).toBeUndefined();
  });

  it("returns undefined when slotLabel is not in the list", () => {
    expect(slotTimeRangeForLabel("Unknown", slots)).toBeUndefined();
  });

  it("returns undefined when slotLabel is null", () => {
    expect(slotTimeRangeForLabel(null, slots)).toBeUndefined();
  });

  it("returns undefined when slotLabel is undefined", () => {
    expect(slotTimeRangeForLabel(undefined, slots)).toBeUndefined();
  });

  it("works with LB legacy slots (no startHour/endHour) — always undefined", () => {
    const lbSlots = timeSlotsForCountry("LB");
    for (const s of lbSlots) {
      expect(slotTimeRangeForLabel(s.label, lbSlots)).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// classifyStandardDeliveryDay
// ---------------------------------------------------------------------------

describe("classifyStandardDeliveryDay", () => {
  const todayIso = "2026-08-14";

  it("keeps a 5:59 PM same-day standard slot as today but switches at 6 PM", () => {
    expect(
      classifyStandardDeliveryDay({
        dateIso: todayIso,
        todayIso,
        slot: { label: "5:59 PM – 8:00 PM" },
      }),
    ).toBe("today");
    expect(
      classifyStandardDeliveryDay({
        dateIso: todayIso,
        todayIso,
        slot: { label: "6:00 PM – 9:00 PM" },
      }),
    ).toBe("tonight");
  });

  it("uses explicit slot bounds for later evening windows", () => {
    expect(
      classifyStandardDeliveryDay({
        dateIso: todayIso,
        todayIso,
        slot: { label: "Late evening", startHour: 21 },
      }),
    ).toBe("tonight");
  });

  it("keeps tomorrow and future selections independent of their slot hour", () => {
    expect(
      classifyStandardDeliveryDay({
        dateIso: "2026-08-15",
        todayIso,
        slot: { label: "9:00 PM – 11:00 PM" },
      }),
    ).toBe("tomorrow");
    expect(
      classifyStandardDeliveryDay({
        dateIso: "2026-08-16",
        todayIso,
        slot: { label: "9:00 PM – 11:00 PM" },
      }),
    ).toBe("date");
  });

  it("uses the delivery market date instead of the device's UTC date", () => {
    // 21:30 UTC on Aug 13 is already 00:30 on Aug 14 in Beirut (DST).
    expect(
      classifyStandardDeliveryDay({
        dateIso: "2026-08-14",
        slot: { label: "6:00 PM – 9:00 PM" },
        countryCode: "LB",
        now: new Date("2026-08-13T21:30:00Z"),
      }),
    ).toBe("tonight");
  });
});
