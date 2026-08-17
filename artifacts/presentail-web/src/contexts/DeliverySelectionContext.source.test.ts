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
});
