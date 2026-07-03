import { describe, expect, it } from "vitest";

import {
  dayLabels,
  firstAvailableSlot,
  getBeirutOffsetHours,
  getCountryHour,
  getLocalIso,
  timeSlotsForCountry,
} from "../index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function utc(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour, minute, second));
}

// ---------------------------------------------------------------------------
// dayLabels — month / year boundary edge cases
// ---------------------------------------------------------------------------

describe("dayLabels — month-end boundaries", () => {
  it("always returns exactly 10 days", () => {
    const days = dayLabels("Today", "Tomorrow", new Date(2026, 0, 31, 12, 0, 0));
    expect(days).toHaveLength(10);
  });

  it("rolls correctly from Jan 31 into February", () => {
    const days = dayLabels("Today", "Tomorrow", new Date(2026, 0, 31, 12, 0, 0));

    expect(days[0].iso).toBe("2026-01-31");
    expect(days[0].label).toBe("Today");
    expect(days[0].date).toBe("31");

    expect(days[1].iso).toBe("2026-02-01");
    expect(days[1].label).toBe("Tomorrow");
    expect(days[1].date).toBe("1");

    expect(days[2].iso).toBe("2026-02-02");
    expect(days[2].date).toBe("2");
  });

  it("rolls correctly from Dec 31 into the new year", () => {
    const days = dayLabels("Today", "Tomorrow", new Date(2025, 11, 31, 12, 0, 0));

    expect(days[0].iso).toBe("2025-12-31");
    expect(days[0].date).toBe("31");

    expect(days[1].iso).toBe("2026-01-01");
    expect(days[1].date).toBe("1");

    expect(days[9].iso).toBe("2026-01-09");
    expect(days[9].date).toBe("9");
  });

  it("handles Feb 28 on a non-leap year, rolling into March 1", () => {
    const days = dayLabels("Today", "Tomorrow", new Date(2026, 1, 28, 12, 0, 0)); // Feb 28 2026 (not a leap year)

    expect(days[0].iso).toBe("2026-02-28");
    expect(days[0].date).toBe("28");

    expect(days[1].iso).toBe("2026-03-01");
    expect(days[1].date).toBe("1");
  });

  it("handles Feb 29 on a leap year, rolling into March 1", () => {
    const days = dayLabels("Today", "Tomorrow", new Date(2028, 1, 29, 12, 0, 0)); // Feb 29 2028 (leap year)

    expect(days[0].iso).toBe("2028-02-29");
    expect(days[0].date).toBe("29");

    expect(days[1].iso).toBe("2028-03-01");
    expect(days[1].date).toBe("1");
  });

  it("uses todayLabel and tomLabel only for the first two entries", () => {
    const days = dayLabels("Today", "Tomorrow", new Date(2026, 0, 31, 12, 0, 0));

    expect(days[0].label).toBe("Today");
    expect(days[1].label).toBe("Tomorrow");
    // Day 2+ should not equal either custom label.
    for (let i = 2; i < days.length; i++) {
      expect(days[i].label).not.toBe("Today");
      expect(days[i].label).not.toBe("Tomorrow");
    }
  });

  it("each iso string is parseable and sequential", () => {
    const days = dayLabels("Today", "Tomorrow", new Date(2025, 11, 30, 12, 0, 0)); // Dec 30 2025

    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1].iso + "T00:00:00Z");
      const curr = new Date(days[i].iso + "T00:00:00Z");
      // Each day should be exactly one calendar day after the previous.
      expect(curr.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });
});

// ---------------------------------------------------------------------------
// firstAvailableSlot — extreme hour values
// ---------------------------------------------------------------------------

describe("firstAvailableSlot — extreme hour values", () => {
  const lbSlots = timeSlotsForCountry("LB"); // cutoffs: 9, 14, 18, 21
  const aeSlots = timeSlotsForCountry("AE"); // cutoffs: 7, 13, 16, 20

  // --- isToday = false -------------------------------------------------

  it("returns first slot regardless of hour when isToday is false", () => {
    expect(firstAvailableSlot(lbSlots, false, 0)).toBe(lbSlots[0]);
    expect(firstAvailableSlot(lbSlots, false, 23)).toBe(lbSlots[0]);
    expect(firstAvailableSlot(lbSlots, false, 24)).toBe(lbSlots[0]);
    expect(firstAvailableSlot(aeSlots, false, 0)).toBe(aeSlots[0]);
    expect(firstAvailableSlot(aeSlots, false, 23)).toBe(aeSlots[0]);
    expect(firstAvailableSlot(aeSlots, false, 24)).toBe(aeSlots[0]);
  });

  // --- currentHour = 0 (midnight, start of day) ------------------------

  it("returns the first slot at hour 0 (LB)", () => {
    // Earliest LB cutoff is 9, so all slots are still available at midnight.
    const slot = firstAvailableSlot(lbSlots, true, 0);
    expect(slot).not.toBeNull();
    expect(slot?.cutoffHour).toBe(9);
  });

  it("returns the first slot at hour 0 (AE)", () => {
    const slot = firstAvailableSlot(aeSlots, true, 0);
    expect(slot).not.toBeNull();
    expect(slot?.cutoffHour).toBe(7);
  });

  // --- currentHour = 23 ------------------------------------------------

  it("returns null at hour 23 for LB (last cutoff is 21, already past)", () => {
    // All LB slot cutoffs (9, 14, 18, 21) are ≤ 23, so none qualify.
    expect(firstAvailableSlot(lbSlots, true, 23)).toBeNull();
  });

  it("returns null at hour 23 for AE (last cutoff is 20, already past)", () => {
    expect(firstAvailableSlot(aeSlots, true, 23)).toBeNull();
  });

  // --- currentHour = 24 ------------------------------------------------
  //
  // Hour 24 is not a valid clock value but could be produced by a buggy
  // caller. The function must not throw and must treat the day as over.

  it("returns null at hour 24 (sentinel for day-over) — LB", () => {
    expect(firstAvailableSlot(lbSlots, true, 24)).toBeNull();
  });

  it("returns null at hour 24 (sentinel for day-over) — AE", () => {
    expect(firstAvailableSlot(aeSlots, true, 24)).toBeNull();
  });

  // --- cutoff-boundary precision ---------------------------------------

  it("slot with cutoffHour 9 is available when currentHour is 8 (LB)", () => {
    const slot = firstAvailableSlot(lbSlots, true, 8);
    expect(slot?.cutoffHour).toBe(9);
  });

  it("slot with cutoffHour 9 is NOT available when currentHour is 9 (LB)", () => {
    // cutoffHour > currentHour is the condition, so equal is considered past.
    const slot = firstAvailableSlot(lbSlots, true, 9);
    expect(slot?.cutoffHour).toBe(14);
  });

  it("slot with cutoffHour 7 is available when currentHour is 6 (AE)", () => {
    const slot = firstAvailableSlot(aeSlots, true, 6);
    expect(slot?.cutoffHour).toBe(7);
  });

  it("slot with cutoffHour 7 is NOT available when currentHour is 7 (AE)", () => {
    const slot = firstAvailableSlot(aeSlots, true, 7);
    expect(slot?.cutoffHour).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// getBeirutOffsetHours — DST transition instants
// ---------------------------------------------------------------------------

/**
 * In 2026 the Beirut DST boundaries are:
 *   Start: 00:00 local (UTC+2) on last Sunday of March.
 *          Last Sunday of March 2026 = March 29.
 *          UTC equivalent = March 28, 22:00 UTC.
 *   End:   00:00 local (UTC+3) on last Sunday of October.
 *          Last Sunday of October 2026 = October 25.
 *          UTC equivalent = October 24, 21:00 UTC.
 */
describe("getBeirutOffsetHours — 2026 DST transitions", () => {
  it("is UTC+2 one second before DST starts (March 28 21:59:59 UTC)", () => {
    expect(getBeirutOffsetHours(utc(2026, 2, 28, 21, 59, 59))).toBe(2);
  });

  it("switches to UTC+3 at the DST start moment (March 28 22:00:00 UTC)", () => {
    expect(getBeirutOffsetHours(utc(2026, 2, 28, 22, 0, 0))).toBe(3);
  });

  it("remains UTC+3 throughout summer (e.g. July 15 noon UTC)", () => {
    expect(getBeirutOffsetHours(utc(2026, 6, 15, 12, 0, 0))).toBe(3);
  });

  it("is UTC+3 one second before DST ends (October 24 20:59:59 UTC)", () => {
    expect(getBeirutOffsetHours(utc(2026, 9, 24, 20, 59, 59))).toBe(3);
  });

  it("switches back to UTC+2 at the DST end moment (October 24 21:00:00 UTC)", () => {
    expect(getBeirutOffsetHours(utc(2026, 9, 24, 21, 0, 0))).toBe(2);
  });

  it("remains UTC+2 in winter (e.g. January 15 noon UTC)", () => {
    expect(getBeirutOffsetHours(utc(2026, 0, 15, 12, 0, 0))).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getCountryHour — DST transition instants
// ---------------------------------------------------------------------------

describe("getCountryHour (LB) — Beirut DST transition hours", () => {
  it("reports 23:59→00:00 local clock jump at DST start (last second before)", () => {
    // 21:59:59 UTC = 23:59:59 local (UTC+2), so local hour is 23.
    expect(getCountryHour("LB", utc(2026, 2, 28, 21, 59, 59))).toBe(23);
  });

  it("reports 01:00 in Beirut right after DST start (22:00 UTC)", () => {
    // 22:00:00 UTC + 3 h offset = 01:00 local.
    expect(getCountryHour("LB", utc(2026, 2, 28, 22, 0, 0))).toBe(1);
  });

  it("reports 23:00 in Beirut one second before DST ends (20:59:59 UTC → local 23:59)", () => {
    // 20:59:59 UTC + 3 h DST = 23:59 local → hour 23.
    expect(getCountryHour("LB", utc(2026, 9, 24, 20, 59, 59))).toBe(23);
  });

  it("reports 23:00 in Beirut right after DST ends (21:00 UTC → local 23:00 UTC+2)", () => {
    // 21:00:00 UTC + 2 h winter = 23:00 local.
    expect(getCountryHour("LB", utc(2026, 9, 24, 21, 0, 0))).toBe(23);
  });

  it("handles midnight UTC exactly during winter (UTC+2 → 02:00 local)", () => {
    expect(getCountryHour("LB", utc(2026, 0, 31, 0, 0, 0))).toBe(2);
  });

  it("handles midnight UTC exactly during DST (UTC+3 → 03:00 local)", () => {
    expect(getCountryHour("LB", utc(2026, 6, 31, 0, 0, 0))).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getLocalIso — returns the local calendar date, not the UTC date
// ---------------------------------------------------------------------------

describe("getLocalIso — correct local date across the midnight UTC boundary", () => {
  it("returns the Beirut date (not UTC date) at 21:09 UTC on Jul 2 (= 00:09 Beirut Jul 3, UTC+3 DST)", () => {
    // This is the exact scenario from the real Jul-3 order bug:
    // UTC says July 2, but Beirut is already July 3.
    const at = utc(2026, 6, 2, 21, 9, 0); // 2026-07-02T21:09:00Z
    expect(getLocalIso("LB", at)).toBe("2026-07-03");
    // Confirm that a naive UTC slice returns the wrong date, to document the before/after.
    expect(at.toISOString().slice(0, 10)).toBe("2026-07-02");
  });

  it("returns the same date as UTC when the time is well within the working day", () => {
    // 08:00 UTC = 11:00 Beirut — unambiguously the same calendar date.
    const at = utc(2026, 6, 3, 8, 0, 0); // 2026-07-03T08:00:00Z
    expect(getLocalIso("LB", at)).toBe("2026-07-03");
    expect(at.toISOString().slice(0, 10)).toBe("2026-07-03");
  });

  it("returns the correct Beirut date across a month boundary (Jul 31 → Aug 1)", () => {
    // 21:30 UTC on Jul 31 = 00:30 Beirut on Aug 1 (UTC+3 DST)
    const at = utc(2026, 6, 31, 21, 30, 0); // 2026-07-31T21:30:00Z
    expect(getLocalIso("LB", at)).toBe("2026-08-01");
  });

  it("returns the correct UAE date at midnight UTC (AE = UTC+4 year-round)", () => {
    // 21:00 UTC on Dec 31 = 01:00 on Jan 1 in Dubai (UTC+4)
    const at = utc(2026, 11, 31, 21, 0, 0); // 2026-12-31T21:00:00Z
    expect(getLocalIso("AE", at)).toBe("2027-01-01");
  });

  it("uses Beirut as the default when no countryCode is given", () => {
    // Same as the LB test above — default is Beirut.
    const at = utc(2026, 6, 2, 21, 9, 0);
    expect(getLocalIso(undefined, at)).toBe("2026-07-03");
    expect(getLocalIso(null, at)).toBe("2026-07-03");
  });

  it("correctly handles the year-end boundary for Lebanon (LB = UTC+2 in winter)", () => {
    // 22:30 UTC on Dec 31 = 00:30 Beirut on Jan 1 (UTC+2 winter)
    const at = utc(2026, 11, 31, 22, 30, 0); // 2026-12-31T22:30:00Z
    expect(getLocalIso("LB", at)).toBe("2027-01-01");
  });
});
