/**
 * Unit tests for the district-change revalidation rules (Task: revalidate
 * delivery selection when the district changes).
 *
 * classifyDistrictChange decides — from pure inputs — whether the current
 * delivery selection survives a district switch:
 *   - "kept":    still valid in the new city (optionally with a re-pointed
 *                slot id and the new district+slot fee)
 *   - "invalid": must be cleared (express unavailable / slot not offered /
 *                past date / no schedule at all)
 *   - "none":    nothing was selected, nothing to do
 */

import { describe, it, expect } from "vitest";
import { getLocalIso, type TimeSlot } from "@workspace/delivery";
import {
  classifyDistrictChange,
  feesDiffer,
  slotCatalogueForCity,
  type ClassifyDistrictChangeInput,
  type DistrictCityInput,
} from "./checkoutDistrictChange";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COUNTRY = "LB"; // Beirut timezone (UTC+3 in summer)

const TODAY = getLocalIso(COUNTRY);

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const FUTURE = addDaysIso(TODAY, 3);
const YESTERDAY = addDaysIso(TODAY, -1);

/** A `now` whose Beirut local hour is `hour` on TODAY (Beirut is UTC+2/+3;
 *  derive from getLocalIso's own view of today to stay DST-proof). */
function beirutNowAtHour(hour: number): Date {
  // Probe: find the UTC offset by comparing TODAY at noon UTC.
  for (let utcHour = 0; utcHour < 24; utcHour++) {
    const candidate = new Date(`${TODAY}T${String(utcHour).padStart(2, "0")}:30:00Z`);
    const beirutHour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: "Asia/Beirut",
      }).format(candidate),
    );
    const beirutDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Beirut",
    }).format(candidate);
    if (beirutHour === hour && beirutDay === TODAY) return candidate;
  }
  throw new Error(`no UTC instant maps to Beirut hour ${hour} on ${TODAY}`);
}

const MORNING_SLOT: TimeSlot = { label: "9:00 AM – 2:00 PM", cutoffHour: 9, slotId: "s-morning" };
const AFTERNOON_SLOT: TimeSlot = { label: "2:00 PM – 6:00 PM", cutoffHour: 14, slotId: "s-afternoon", extraFee: 3 };

function mkCity(overrides: Partial<DistrictCityInput> = {}): DistrictCityInput {
  return {
    id: "lb-city",
    name: "Some City",
    fee: 10,
    expressAvailable: false,
    timeSlots: [MORNING_SLOT, AFTERNOON_SLOT],
    ...overrides,
  };
}

function mkInput(
  overrides: Partial<ClassifyDistrictChangeInput> = {},
): ClassifyDistrictChangeInput {
  return {
    mode: "schedule",
    slotLabel: MORNING_SLOT.label,
    slotId: MORNING_SLOT.slotId ?? null,
    dateIso: FUTURE,
    countryCode: COUNTRY,
    subtotal: 50,
    noAddress: false,
    city: mkCity(),
    now: beirutNowAtHour(12),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Express mode
// ---------------------------------------------------------------------------

describe("classifyDistrictChange — express mode", () => {
  it("invalidates express when the new city does not offer it", () => {
    const outcome = classifyDistrictChange(
      mkInput({ mode: "express", city: mkCity({ expressAvailable: false }) }),
    );
    expect(outcome).toEqual({ kind: "invalid", reason: "express" });
  });

  it("invalidates express outside the market's express hours even when the city offers it", () => {
    const outcome = classifyDistrictChange(
      mkInput({
        mode: "express",
        city: mkCity({ expressAvailable: true }),
        now: beirutNowAtHour(23), // express closes at 22:00
      }),
    );
    expect(outcome).toEqual({ kind: "invalid", reason: "express" });
  });

  it("keeps express when the new city offers it during express hours, with the new district fee", () => {
    const outcome = classifyDistrictChange(
      mkInput({
        mode: "express",
        slotLabel: "",
        slotId: null,
        city: mkCity({ expressAvailable: true, fee: 14 }),
      }),
    );
    // Express surcharge is a country constant — excluded from the comparison fee.
    expect(outcome).toEqual({ kind: "kept", slotId: null, newFeeUsd: 14 });
  });
});

// ---------------------------------------------------------------------------
// Scheduled mode
// ---------------------------------------------------------------------------

describe("classifyDistrictChange — scheduled mode", () => {
  it("returns none when no slot was selected", () => {
    const outcome = classifyDistrictChange(mkInput({ slotLabel: "", slotId: null }));
    expect(outcome).toEqual({ kind: "none" });
  });

  it("invalidates when the new city has no schedule at all", () => {
    const outcome = classifyDistrictChange(
      mkInput({ city: mkCity({ timeSlots: [], slotsByDay: undefined }) }),
    );
    expect(outcome).toEqual({ kind: "invalid", reason: "slot" });
  });

  it("invalidates a past delivery date instead of silently re-dating", () => {
    const outcome = classifyDistrictChange(mkInput({ dateIso: YESTERDAY }));
    expect(outcome).toEqual({ kind: "invalid", reason: "slot" });
  });

  it("keeps a slot the new city also offers (matched by id) and returns the new district+slot fee", () => {
    const outcome = classifyDistrictChange(
      mkInput({
        slotLabel: AFTERNOON_SLOT.label,
        slotId: AFTERNOON_SLOT.slotId ?? null,
        city: mkCity({ fee: 6 }),
      }),
    );
    // fee 6 + afternoon extraFee 3
    expect(outcome).toEqual({ kind: "kept", slotId: "s-afternoon", newFeeUsd: 9 });
  });

  it("re-points a same-label slot at the new city's slot id", () => {
    const newCitySlot: TimeSlot = { ...MORNING_SLOT, slotId: "other-city-morning" };
    const outcome = classifyDistrictChange(
      mkInput({
        slotId: "stale-old-city-id",
        city: mkCity({ timeSlots: [newCitySlot, AFTERNOON_SLOT] }),
      }),
    );
    expect(outcome).toMatchObject({ kind: "kept", slotId: "other-city-morning" });
  });

  it("keeps the selected weekday's slot id instead of a same-label flat fallback id", () => {
    const weekday = new Date(`${TODAY}T12:00:00Z`)
      .toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })
      .toLowerCase();
    const todaySlot: TimeSlot = {
      ...AFTERNOON_SLOT,
      slotId: "today-afternoon",
    };
    const outcome = classifyDistrictChange(
      mkInput({
        dateIso: TODAY,
        slotLabel: AFTERNOON_SLOT.label,
        slotId: todaySlot.slotId ?? null,
        now: beirutNowAtHour(10),
        city: mkCity({
          timeSlots: [{ ...AFTERNOON_SLOT, slotId: "flat-other-day-afternoon" }],
          slotsByDay: { [weekday]: [todaySlot] },
        }),
      }),
    );
    expect(outcome).toMatchObject({
      kind: "kept",
      slotId: "today-afternoon",
    });
  });

  it("invalidates when neither the slot id nor the label exists in the new city", () => {
    const outcome = classifyDistrictChange(
      mkInput({
        slotLabel: "6:00 PM – 9:00 PM",
        slotId: "s-evening",
        city: mkCity({ timeSlots: [MORNING_SLOT] }),
      }),
    );
    expect(outcome).toEqual({ kind: "invalid", reason: "slot" });
  });

  it("invalidates a same-day slot whose order cutoff already passed in the new city", () => {
    const outcome = classifyDistrictChange(
      mkInput({
        dateIso: TODAY,
        slotLabel: MORNING_SLOT.label,
        slotId: MORNING_SLOT.slotId ?? null,
        now: beirutNowAtHour(10), // past the 9:00 cutoff
        city: mkCity({ timeSlots: [MORNING_SLOT] }),
      }),
    );
    expect(outcome).toEqual({ kind: "invalid", reason: "slot" });
  });

  it("keeps a same-day slot still before its cutoff", () => {
    const outcome = classifyDistrictChange(
      mkInput({
        dateIso: TODAY,
        slotLabel: AFTERNOON_SLOT.label,
        slotId: AFTERNOON_SLOT.slotId ?? null,
        now: beirutNowAtHour(10), // before the 14:00 cutoff
      }),
    );
    expect(outcome).toMatchObject({ kind: "kept", slotId: "s-afternoon" });
  });

  it("treats an empty dateIso as today", () => {
    const outcome = classifyDistrictChange(
      mkInput({
        dateIso: null,
        slotLabel: MORNING_SLOT.label,
        slotId: MORNING_SLOT.slotId ?? null,
        now: beirutNowAtHour(10), // morning cutoff passed
        city: mkCity({ timeSlots: [MORNING_SLOT] }),
      }),
    );
    expect(outcome).toEqual({ kind: "invalid", reason: "slot" });
  });

  it("zeroes the district fee when the new city qualifies for free delivery", () => {
    const outcome = classifyDistrictChange(
      mkInput({
        subtotal: 100,
        city: mkCity({ fee: 12, freeDeliveryEnabled: true, freeDeliveryThresholdUsd: 90 }),
      }),
    );
    expect(outcome).toEqual({ kind: "kept", slotId: "s-morning", newFeeUsd: 0 });
  });

  it("charges the district fee when free delivery is disabled for the new city", () => {
    const outcome = classifyDistrictChange(
      mkInput({
        subtotal: 100,
        city: mkCity({ fee: 12, freeDeliveryEnabled: false }),
      }),
    );
    expect(outcome).toEqual({ kind: "kept", slotId: "s-morning", newFeeUsd: 12 });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe("slotCatalogueForCity", () => {
  it("prefers the flat OS timeSlots list", () => {
    expect(slotCatalogueForCity(mkCity())).toEqual([MORNING_SLOT, AFTERNOON_SLOT]);
  });

  it("prefers the selected weekday schedule when a date is provided", () => {
    const weekday = new Date(`${FUTURE}T12:00:00Z`)
      .toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })
      .toLowerCase();
    const weekdaySlot = { ...AFTERNOON_SLOT, slotId: "weekday-afternoon" };
    expect(
      slotCatalogueForCity(
        mkCity({ slotsByDay: { [weekday]: [weekdaySlot] } }),
        FUTURE,
      ),
    ).toEqual([weekdaySlot]);
  });

  it("flattens slotsByDay (deduped by cutoffHour) when no flat list exists", () => {
    const catalogue = slotCatalogueForCity({
      timeSlots: [],
      slotsByDay: {
        mon: [MORNING_SLOT],
        tue: [{ ...MORNING_SLOT }, AFTERNOON_SLOT],
      },
    });
    expect(catalogue).toHaveLength(2);
    expect(catalogue.map((s) => s.cutoffHour).sort((a, b) => a - b)).toEqual([9, 14]);
  });

  it("returns empty (never a country fallback) when the city has no schedule", () => {
    expect(slotCatalogueForCity({ timeSlots: [], slotsByDay: {} })).toEqual([]);
  });
});

describe("feesDiffer", () => {
  it("detects a >= 1 cent difference", () => {
    expect(feesDiffer(8, 8.01)).toBe(true);
    expect(feesDiffer(8, 12)).toBe(true);
  });

  it("ignores sub-cent float noise", () => {
    expect(feesDiffer(8, 8.004)).toBe(false);
    expect(feesDiffer(0.1 + 0.2, 0.3)).toBe(false);
  });
});
