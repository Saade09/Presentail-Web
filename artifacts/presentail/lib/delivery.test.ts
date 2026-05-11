import { describe, expect, it } from "vitest";

import {
  AE_EXPRESS_SURCHARGE,
  LB_EXPRESS_SURCHARGE,
  expressSurchargeForCountry,
  firstAvailableSlot,
  getBeirutHour,
  getBeirutOffsetHours,
  isExpressDeliveryAvailable,
  resolveSlotLabel,
  timeSlotsForCountry,
} from "@workspace/delivery";

describe("getBeirutOffsetHours (DST edges)", () => {
  it("returns +2 in winter (mid-January)", () => {
    expect(getBeirutOffsetHours(new Date("2026-01-15T10:00:00Z"))).toBe(2);
  });

  it("returns +3 in summer (mid-July)", () => {
    expect(getBeirutOffsetHours(new Date("2026-07-15T10:00:00Z"))).toBe(3);
  });

  it("is +2 just before DST start (last Sunday of March 00:00 local = 22:00 UTC the prior day)", () => {
    // 2026 last Sunday of March = March 29; DST starts at 00:00 local (UTC+2) → 2026-03-28T22:00Z.
    expect(
      getBeirutOffsetHours(new Date("2026-03-28T21:59:59Z")),
    ).toBe(2);
  });

  it("is +3 at the moment DST starts (last Sunday of March)", () => {
    expect(getBeirutOffsetHours(new Date("2026-03-28T22:00:00Z"))).toBe(3);
  });

  it("is +3 just before DST ends (last Sunday of October 00:00 local = 21:00 UTC the prior day)", () => {
    // 2026 last Sunday of October = October 25; DST ends at 00:00 local (UTC+3) → 2026-10-24T21:00Z.
    expect(
      getBeirutOffsetHours(new Date("2026-10-24T20:59:59Z")),
    ).toBe(3);
  });

  it("is +2 at the moment DST ends (last Sunday of October)", () => {
    expect(getBeirutOffsetHours(new Date("2026-10-24T21:00:00Z"))).toBe(2);
  });

  it("handles the 2025 DST edges (different last-Sunday dates)", () => {
    // 2025 last Sunday of March = March 30 → DST starts 2025-03-29T22:00Z.
    expect(getBeirutOffsetHours(new Date("2025-03-29T21:59:59Z"))).toBe(2);
    expect(getBeirutOffsetHours(new Date("2025-03-29T22:00:00Z"))).toBe(3);
    // 2025 last Sunday of October = October 26 → DST ends 2025-10-25T21:00Z.
    expect(getBeirutOffsetHours(new Date("2025-10-25T20:59:59Z"))).toBe(3);
    expect(getBeirutOffsetHours(new Date("2025-10-25T21:00:00Z"))).toBe(2);
  });
});

describe("getBeirutHour", () => {
  it("returns the correct wall-clock hour in winter (UTC+2)", () => {
    expect(getBeirutHour(new Date("2026-01-15T10:00:00Z"))).toBe(12);
  });

  it("returns the correct wall-clock hour in summer (UTC+3)", () => {
    expect(getBeirutHour(new Date("2026-07-15T10:00:00Z"))).toBe(13);
  });

  it("rolls cleanly across midnight", () => {
    // 22:30 UTC in winter = 00:30 Beirut.
    expect(getBeirutHour(new Date("2026-01-15T22:30:00Z"))).toBe(0);
  });

  it("springs forward at the DST start boundary (00:00 local jumps to 01:00)", () => {
    // 2026-03-28T22:00Z = 00:00 local just-before, then immediately +3 → 01:00 local.
    expect(getBeirutHour(new Date("2026-03-28T22:00:00Z"))).toBe(1);
    // A few hours into DST: 02:00 UTC → 05:00 local.
    expect(getBeirutHour(new Date("2026-03-29T02:00:00Z"))).toBe(5);
  });

  it("falls back at the DST end boundary (00:00 local DST falls to 23:00 local std)", () => {
    // 2026-10-24T21:00Z = 00:00 local DST ends → clock falls to 23:00 local std.
    expect(getBeirutHour(new Date("2026-10-24T21:00:00Z"))).toBe(23);
    // Well past the transition: same date a few hours later, +2 offset.
    expect(getBeirutHour(new Date("2026-10-25T08:00:00Z"))).toBe(10);
  });
});

describe("expressSurchargeForCountry", () => {
  it("returns $15 for Lebanon", () => {
    expect(expressSurchargeForCountry("LB")).toBe(15);
    expect(expressSurchargeForCountry("LB")).toBe(LB_EXPRESS_SURCHARGE);
  });

  it("returns $15 for Cyprus (falls back to LB)", () => {
    expect(expressSurchargeForCountry("CY")).toBe(15);
  });

  it("returns $4.90 for the UAE", () => {
    expect(expressSurchargeForCountry("AE")).toBe(4.9);
    expect(expressSurchargeForCountry("AE")).toBe(AE_EXPRESS_SURCHARGE);
  });

  it("falls back to the LB surcharge for unknown / null / undefined codes", () => {
    expect(expressSurchargeForCountry("ZZ")).toBe(15);
    expect(expressSurchargeForCountry(null)).toBe(15);
    expect(expressSurchargeForCountry(undefined)).toBe(15);
    expect(expressSurchargeForCountry()).toBe(15);
  });
});

describe("timeSlotsForCountry", () => {
  it("returns the LB slot table for Lebanon", () => {
    const slots = timeSlotsForCountry("LB");
    expect(slots.map((s) => s.label)).toEqual([
      "9:00 AM – 2:00 PM",
      "2:00 PM – 6:00 PM",
      "6:00 PM – 9:00 PM",
      "9:00 PM – 11:00 PM",
    ]);
    expect(slots.map((s) => s.cutoffHour)).toEqual([9, 14, 18, 21]);
  });

  it("returns the AE slot table for the UAE", () => {
    const slots = timeSlotsForCountry("AE");
    expect(slots.map((s) => s.label)).toEqual([
      "7:00 AM – 1:00 PM",
      "1:00 PM – 4:00 PM",
      "4:00 PM – 8:00 PM",
      "8:00 PM – 11:00 PM",
    ]);
    expect(slots.map((s) => s.cutoffHour)).toEqual([7, 13, 16, 20]);
  });

  it("falls back to the LB slot table for Cyprus and unknown / null codes", () => {
    const lb = timeSlotsForCountry("LB");
    expect(timeSlotsForCountry("CY")).toEqual(lb);
    expect(timeSlotsForCountry("ZZ")).toEqual(lb);
    expect(timeSlotsForCountry(null)).toEqual(lb);
    expect(timeSlotsForCountry(undefined)).toEqual(lb);
    expect(timeSlotsForCountry()).toEqual(lb);
  });
});

describe("firstAvailableSlot", () => {
  const lb = timeSlotsForCountry("LB");

  it("returns the first slot for a future date regardless of current hour", () => {
    expect(firstAvailableSlot(lb, false, 23)?.label).toBe("9:00 AM – 2:00 PM");
    expect(firstAvailableSlot(lb, false, 0)?.label).toBe("9:00 AM – 2:00 PM");
  });

  it("returns the first non-past slot when today and early in the day", () => {
    // 8 AM local: the 9 AM cutoff slot is still in the future.
    expect(firstAvailableSlot(lb, true, 8)?.label).toBe("9:00 AM – 2:00 PM");
  });

  it("skips slots whose cutoff has passed today", () => {
    // 15:00 local: 9 and 14 cutoffs are past, next available is 18.
    expect(firstAvailableSlot(lb, true, 15)?.label).toBe("6:00 PM – 9:00 PM");
  });

  it("returns null when all of today's slots are already past", () => {
    expect(firstAvailableSlot(lb, true, 22)).toBeNull();
    expect(firstAvailableSlot(lb, true, 23)).toBeNull();
  });

  it("returns null for an empty slot list", () => {
    expect(firstAvailableSlot([], false, 10)).toBeNull();
    expect(firstAvailableSlot([], true, 10)).toBeNull();
  });
});

describe("resolveSlotLabel", () => {
  const lb = timeSlotsForCountry("LB");

  it("keeps a stored label when it is still bookable today", () => {
    expect(resolveSlotLabel("6:00 PM – 9:00 PM", lb, true, 10)).toBe(
      "6:00 PM – 9:00 PM",
    );
  });

  it("keeps any stored label for a future date", () => {
    expect(resolveSlotLabel("9:00 AM – 2:00 PM", lb, false, 23)).toBe(
      "9:00 AM – 2:00 PM",
    );
  });

  it("replaces a stored label whose cutoff is now past with the next available one", () => {
    // 15:00 local, stored "2:00 PM – 6:00 PM" (cutoff 14) is past → next is 18.
    expect(resolveSlotLabel("2:00 PM – 6:00 PM", lb, true, 15)).toBe(
      "6:00 PM – 9:00 PM",
    );
  });

  it("falls back to the next available slot when no label is stored", () => {
    expect(resolveSlotLabel(null, lb, true, 15)).toBe("6:00 PM – 9:00 PM");
    expect(resolveSlotLabel(undefined, lb, false, 0)).toBe(
      "9:00 AM – 2:00 PM",
    );
    expect(resolveSlotLabel("", lb, true, 8)).toBe("9:00 AM – 2:00 PM");
  });

  it("ignores an unknown stored label and returns the next available slot", () => {
    expect(resolveSlotLabel("not-a-real-slot", lb, true, 8)).toBe(
      "9:00 AM – 2:00 PM",
    );
  });

  it("returns null when nothing is bookable today and no future fallback", () => {
    expect(resolveSlotLabel("9:00 AM – 2:00 PM", lb, true, 23)).toBeNull();
    expect(resolveSlotLabel(null, lb, true, 22)).toBeNull();
  });
});

describe("isExpressDeliveryAvailable (8 AM – 10 PM in recipient country)", () => {
  // Lebanon — winter UTC+2. Use 2026-01-15 (no DST) so UTC + 2 = local hour.
  // 07:59 local = 05:59 UTC, 08:00 local = 06:00 UTC,
  // 21:59 local = 19:59 UTC, 22:00 local = 20:00 UTC.
  it("LB: closed at 07:59 local, open at 08:00 local", () => {
    expect(isExpressDeliveryAvailable("LB", new Date("2026-01-15T05:59:00Z"))).toBe(
      false,
    );
    expect(isExpressDeliveryAvailable("LB", new Date("2026-01-15T06:00:00Z"))).toBe(
      true,
    );
  });

  it("LB: open at 21:59 local, closed at 22:00 local", () => {
    expect(isExpressDeliveryAvailable("LB", new Date("2026-01-15T19:59:00Z"))).toBe(
      true,
    );
    expect(isExpressDeliveryAvailable("LB", new Date("2026-01-15T20:00:00Z"))).toBe(
      false,
    );
  });

  // UAE — UTC+4 always. 07:59 local = 03:59 UTC, 08:00 local = 04:00 UTC,
  // 21:59 local = 17:59 UTC, 22:00 local = 18:00 UTC.
  it("AE: closed at 07:59 local, open at 08:00 local", () => {
    expect(isExpressDeliveryAvailable("AE", new Date("2026-01-15T03:59:00Z"))).toBe(
      false,
    );
    expect(isExpressDeliveryAvailable("AE", new Date("2026-01-15T04:00:00Z"))).toBe(
      true,
    );
  });

  it("AE: open at 21:59 local, closed at 22:00 local", () => {
    expect(isExpressDeliveryAvailable("AE", new Date("2026-01-15T17:59:00Z"))).toBe(
      true,
    );
    expect(isExpressDeliveryAvailable("AE", new Date("2026-01-15T18:00:00Z"))).toBe(
      false,
    );
  });
});
