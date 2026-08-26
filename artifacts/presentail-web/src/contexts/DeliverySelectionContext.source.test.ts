// @vitest-environment jsdom
//
// Selection-source semantics of sanitize(): legacy payloads without a source,
// restoration mapping (user_selected → restored_user_selection), and system
// re-picks when the stored selection is no longer available.

import { describe, it, expect, vi, afterEach } from "vitest";
import { sanitize, restoredSource } from "./DeliverySelectionContext";

function isoDaysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("restoredSource", () => {
  it("maps explicit and legacy sources to restored_user_selection", () => {
    expect(restoredSource("user_selected")).toBe("restored_user_selection");
    expect(restoredSource("restored_user_selection")).toBe("restored_user_selection");
    expect(restoredSource(undefined)).toBe("restored_user_selection"); // legacy payload
    expect(restoredSource("garbage")).toBe("restored_user_selection");
  });

  it("keeps system provenance", () => {
    expect(restoredSource("system_default")).toBe("system_default");
    expect(restoredSource("system_reselected")).toBe("system_reselected");
  });
});

describe("sanitize — source handling", () => {
  it("legacy stored payload without a source restores as restored_user_selection", () => {
    const future = isoDaysFromNow(2);
    const out = sanitize({ mode: "schedule", date: future, slotLabel: null, slotId: null }, "LB");
    expect(out.mode).toBe("schedule");
    expect(out.date).toBe(future);
    expect(out.source).toBe("restored_user_selection");
  });

  it("stored system_default selection stays system-sourced on restore", () => {
    const future = isoDaysFromNow(2);
    const out = sanitize(
      { mode: "schedule", date: future, slotLabel: null, slotId: null, source: "system_default" },
      "LB",
    );
    expect(out.source).toBe("system_default");
  });

  it("a stored date in the past forces a system_reselected source", () => {
    const past = isoDaysFromNow(-3);
    const out = sanitize(
      { mode: "schedule", date: past, slotLabel: null, slotId: null, source: "user_selected" },
      "LB",
    );
    expect(out.date).not.toBe(past);
    expect(out.source).toBe("system_reselected");
  });

  it("empty/invalid payloads have a null source", () => {
    expect(sanitize(null).source).toBeNull();
    expect(sanitize({}).source).toBeNull();
  });

  it("express restores with a source and today's date", () => {
    const out = sanitize({ mode: "express", source: "user_selected" }, "LB");
    expect(out.mode).toBe("express");
    expect(out.source).toBe("restored_user_selection");
  });

  it("keeps yesterday's Midnight start date while its window is active after local midnight", () => {
    const out = sanitize(
      {
        mode: "today_slot",
        date: "2026-08-20",
        slotLabel: "11 PM – 1 AM",
        slotId: "midnight",
        serviceType: "midnight",
        cityId: "lb-beirut",
        source: "user_selected",
      },
      "LB",
      new Date("2026-08-20T21:30:00.000Z"), // Aug 21, 00:30 Beirut
    );
    expect(out.date).toBe("2026-08-20");
    expect(out.mode).toBe("today_slot");
    expect(out.serviceType).toBe("midnight");
    expect(out.source).toBe("restored_user_selection");
  });

  it("defers an exact ordinary overnight selection to live validation", () => {
    const out = sanitize(
      {
        mode: "schedule",
        date: "2026-08-20",
        slotLabel: "10 PM – 6 AM",
        slotId: "overnight",
        cityId: "lb-beirut",
        source: "user_selected",
      },
      "LB",
      new Date("2026-08-20T21:30:00.000Z"),
    );
    expect(out.date).toBe("2026-08-20");
    expect(out.slotId).toBe("overnight");
    expect(out.source).toBe("restored_user_selection");
  });

  it("clears yesterday's Midnight start date once the window ends at 01:00", () => {
    const out = sanitize(
      {
        mode: "today_slot",
        date: "2026-08-20",
        slotLabel: "11 PM – 1 AM",
        slotId: "midnight",
        serviceType: "midnight",
        cityId: "lb-beirut",
        source: "user_selected",
      },
      "LB",
      new Date("2026-08-20T22:00:00.000Z"), // Aug 21, 01:00 Beirut
    );
    expect(out.date).toBeNull();
    expect(out.source).toBe("system_reselected");
  });
});
