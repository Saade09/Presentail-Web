import { describe, it, expect } from "vitest";
import { roundToNearestFive } from "../index";

describe("roundToNearestFive — LBP (nearest 500)", () => {
  it("rounds down when remainder < 250", () => {
    expect(roundToNearestFive(895123, "LBP")).toBe(895000);
  });

  it("rounds up when remainder >= 250", () => {
    expect(roundToNearestFive(895300, "LBP")).toBe(895500);
  });

  it("already-round multiple is unchanged", () => {
    expect(roundToNearestFive(900000, "LBP")).toBe(900000);
  });

  it("rounds exact midpoint (250) up", () => {
    expect(roundToNearestFive(895250, "LBP")).toBe(895500);
  });

  it("is case-insensitive", () => {
    expect(roundToNearestFive(895123, "lbp")).toBe(895000);
  });
});

describe("roundToNearestFive — USD (nearest 1, 2-decimal standard)", () => {
  it("preserves cents", () => {
    expect(roundToNearestFive(49.99, "USD")).toBeCloseTo(49.99, 5);
  });

  it("does not snap to nearest 5", () => {
    expect(roundToNearestFive(47.50, "USD")).toBeCloseTo(47.50, 5);
  });

  it("rounds to nearest cent (2 decimals)", () => {
    expect(roundToNearestFive(49.995, "USD")).toBeCloseTo(50.00, 2);
  });

  it("is case-insensitive", () => {
    expect(roundToNearestFive(10.25, "usd")).toBeCloseTo(10.25, 5);
  });
});

describe("roundToNearestFive — non-USD / non-LBP currencies (nearest 5)", () => {
  const cases: Array<{ input: number; expected: number; label: string }> = [
    { input: 367,    expected: 365, label: "367 → 365 (round down)" },
    { input: 368,    expected: 370, label: "368 → 370 (round up)" },
    { input: 362,    expected: 360, label: "362 → 360 (round down)" },
    { input: 365,    expected: 365, label: "365 unchanged (already multiple of 5)" },
    { input: 370,    expected: 370, label: "370 unchanged" },
    { input: 1,      expected: 0,   label: "1 → 0 (round down from half-step)" },
    { input: 3,      expected: 5,   label: "3 → 5 (round up)" },
    { input: 2.5,    expected: 5,   label: "2.5 → 5 (exact midpoint rounds up)" },
    { input: 100,    expected: 100, label: "100 unchanged" },
    { input: 0,      expected: 0,   label: "0 unchanged" },
  ];

  for (const { input, expected, label } of cases) {
    it(`AED: ${label}`, () => {
      expect(roundToNearestFive(input, "AED")).toBe(expected);
    });
  }

  it("EUR: 367 → 365", () => {
    expect(roundToNearestFive(367, "EUR")).toBe(365);
  });

  it("GBP: 368 → 370", () => {
    expect(roundToNearestFive(368, "GBP")).toBe(370);
  });

  it("CAD: 142 → 140", () => {
    expect(roundToNearestFive(142, "CAD")).toBe(140);
  });

  it("AUD: 153 → 155", () => {
    expect(roundToNearestFive(153, "AUD")).toBe(155);
  });

  it("CHF: 88 → 90", () => {
    expect(roundToNearestFive(88, "CHF")).toBe(90);
  });

  it("is case-insensitive", () => {
    expect(roundToNearestFive(368, "eur")).toBe(370);
  });
});
