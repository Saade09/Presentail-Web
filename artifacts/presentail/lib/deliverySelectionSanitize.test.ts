import { describe, expect, it } from "vitest";

import { sanitize, todayIso } from "./deliverySelectionSanitize";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pastDate(): string {
  return "2020-01-01";
}

function futureDate(): string {
  return "2099-12-31";
}

// Known valid slot labels (from timeSlotsForCountry)
const LB_SLOT = "9:00 AM – 2:00 PM";
const AE_SLOT = "7:00 AM – 1:00 PM";
const UNKNOWN_SLOT = "3:00 PM – 5:00 PM";

// ---------------------------------------------------------------------------
// null / non-object inputs — must be lenient
// ---------------------------------------------------------------------------

describe("sanitize — null / non-object inputs", () => {
  it("returns empty selection for null", () => {
    expect(sanitize(null)).toEqual({ mode: null, date: null, slotLabel: null });
  });

  it("returns empty selection for undefined", () => {
    expect(sanitize(undefined)).toEqual({ mode: null, date: null, slotLabel: null });
  });

  it("returns empty selection for a string", () => {
    expect(sanitize("express")).toEqual({ mode: null, date: null, slotLabel: null });
  });

  it("returns empty selection for a number", () => {
    expect(sanitize(42)).toEqual({ mode: null, date: null, slotLabel: null });
  });

  it("returns empty selection for an array", () => {
    expect(sanitize([])).toEqual({ mode: null, date: null, slotLabel: null });
  });

  it("returns empty selection for false", () => {
    expect(sanitize(false)).toEqual({ mode: null, date: null, slotLabel: null });
  });

  it("returns empty selection for an empty object (no mode)", () => {
    expect(sanitize({})).toEqual({ mode: null, date: null, slotLabel: null });
  });
});

// ---------------------------------------------------------------------------
// Unknown / bogus modes — must clear entire selection
// ---------------------------------------------------------------------------

describe("sanitize — unknown mode clears everything", () => {
  it("drops a completely unknown mode string", () => {
    expect(sanitize({ mode: "next_day", date: futureDate(), slotLabel: LB_SLOT })).toEqual(
      { mode: null, date: null, slotLabel: null },
    );
  });

  it("drops a null mode even with valid date and slot", () => {
    expect(sanitize({ mode: null, date: futureDate(), slotLabel: LB_SLOT })).toEqual(
      { mode: null, date: null, slotLabel: null },
    );
  });

  it("drops a numeric mode", () => {
    expect(sanitize({ mode: 1, date: futureDate(), slotLabel: LB_SLOT })).toEqual(
      { mode: null, date: null, slotLabel: null },
    );
  });
});

// ---------------------------------------------------------------------------
// Past dates are dropped
// ---------------------------------------------------------------------------

describe("sanitize — past dates are dropped", () => {
  it("clears a date that is strictly in the past", () => {
    const result = sanitize({ mode: "schedule", date: pastDate(), slotLabel: LB_SLOT });
    expect(result.date).toBe(todayIso());
    expect(result.mode).toBe("schedule");
  });

  it("clears a past date and defaults date to today", () => {
    const result = sanitize({ mode: "today_slot", date: pastDate(), slotLabel: LB_SLOT });
    expect(result.date).toBe(todayIso());
  });

  it("preserves a future date", () => {
    const result = sanitize({ mode: "schedule", date: futureDate(), slotLabel: LB_SLOT });
    expect(result.date).toBe(futureDate());
  });

  it("preserves today's date", () => {
    const today = todayIso();
    const result = sanitize({ mode: "schedule", date: today, slotLabel: LB_SLOT });
    expect(result.date).toBe(today);
  });

  it("treats a missing date as today", () => {
    const result = sanitize({ mode: "schedule", slotLabel: LB_SLOT });
    expect(result.date).toBe(todayIso());
  });

  it("treats a date with wrong length as missing and defaults to today", () => {
    const result = sanitize({ mode: "schedule", date: "2099-1-1", slotLabel: LB_SLOT });
    expect(result.date).toBe(todayIso());
  });
});

// ---------------------------------------------------------------------------
// Express mode always uses today's date and clears slotLabel
// ---------------------------------------------------------------------------

describe("sanitize — express mode", () => {
  it("always sets date to today regardless of stored date", () => {
    const result = sanitize({ mode: "express", date: futureDate(), slotLabel: LB_SLOT });
    expect(result.mode).toBe("express");
    expect(result.date).toBe(todayIso());
    expect(result.slotLabel).toBeNull();
  });

  it("sets date to today even when no date is stored", () => {
    const result = sanitize({ mode: "express" });
    expect(result.mode).toBe("express");
    expect(result.date).toBe(todayIso());
    expect(result.slotLabel).toBeNull();
  });

  it("clears slotLabel even when a valid one is stored", () => {
    const result = sanitize({ mode: "express", date: todayIso(), slotLabel: AE_SLOT });
    expect(result.slotLabel).toBeNull();
  });

  it("sets date to today even when a past date is stored", () => {
    const result = sanitize({ mode: "express", date: pastDate() });
    expect(result.date).toBe(todayIso());
  });
});

// ---------------------------------------------------------------------------
// Out-of-range slot labels are cleared
// ---------------------------------------------------------------------------

describe("sanitize — out-of-range slot labels are cleared", () => {
  it("clears a slot label not in any country's list", () => {
    const result = sanitize({ mode: "schedule", date: futureDate(), slotLabel: UNKNOWN_SLOT });
    expect(result.slotLabel).toBeNull();
  });

  it("preserves a valid LB slot label", () => {
    const result = sanitize({ mode: "schedule", date: futureDate(), slotLabel: LB_SLOT });
    expect(result.slotLabel).toBe(LB_SLOT);
  });

  it("preserves a valid AE slot label", () => {
    const result = sanitize({ mode: "schedule", date: futureDate(), slotLabel: AE_SLOT });
    expect(result.slotLabel).toBe(AE_SLOT);
  });

  it("clears an empty string slot label", () => {
    const result = sanitize({ mode: "schedule", date: futureDate(), slotLabel: "" });
    expect(result.slotLabel).toBeNull();
  });

  it("clears a numeric slot label", () => {
    const result = sanitize({ mode: "schedule", date: futureDate(), slotLabel: 99 });
    expect(result.slotLabel).toBeNull();
  });

  it("accepts null slot label without clearing the rest", () => {
    const result = sanitize({ mode: "schedule", date: futureDate(), slotLabel: null });
    expect(result.mode).toBe("schedule");
    expect(result.date).toBe(futureDate());
    expect(result.slotLabel).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Valid complete selections pass through unchanged
// ---------------------------------------------------------------------------

describe("sanitize — valid data passes through", () => {
  it("preserves a complete valid schedule selection", () => {
    const result = sanitize({ mode: "schedule", date: futureDate(), slotLabel: LB_SLOT });
    expect(result).toEqual({ mode: "schedule", date: futureDate(), slotLabel: LB_SLOT });
  });

  it("preserves a valid today_slot selection", () => {
    const result = sanitize({ mode: "today_slot", date: todayIso(), slotLabel: AE_SLOT });
    expect(result).toEqual({ mode: "today_slot", date: todayIso(), slotLabel: AE_SLOT });
  });

  it("ignores extra unknown keys on the stored object", () => {
    const result = sanitize({
      mode: "schedule",
      date: futureDate(),
      slotLabel: LB_SLOT,
      bogusKey: "should be ignored",
    });
    expect(result).toEqual({ mode: "schedule", date: futureDate(), slotLabel: LB_SLOT });
  });
});
