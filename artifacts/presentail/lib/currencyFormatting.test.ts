/**
 * Unit tests for the currency conversion and formatting helpers in
 * lib/currencyFormatting.ts.  These are the exact functions wired into
 * CurrencyContext — any regression in convert / formatNative / formatPrice
 * will fail here before it reaches a shopper.
 *
 * The key regression guarded against is the "native flag" bug: UAE/Cyprus
 * shoppers would see raw USD amounts with a local symbol (e.g. "AED 100"
 * instead of "AED 367") when formatPrice omitted the currency-rate conversion.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CURRENCIES, getCurrency } from "@workspace/catalog-data";

import { applyFxRates } from "../data/currencies";

import { roundToNearestFive } from "@workspace/display-currency";

import {
  convertCurrency,
  formatCurrencyPrice,
  formatNativeAmount,
} from "./currencyFormatting";

// ---------------------------------------------------------------------------
// Lebanon — USD (no conversion)
// ---------------------------------------------------------------------------

describe("Lebanon / USD (rate = 1, no conversion)", () => {
  const usd = getCurrency("USD");

  it("has a rate of 1", () => {
    expect(usd.rate).toBe(1);
  });

  it("formatCurrencyPrice(100) returns '$100'", () => {
    expect(formatCurrencyPrice(usd, 100)).toBe("$100");
  });

  it("formatCurrencyPrice(0) returns '$0'", () => {
    expect(formatCurrencyPrice(usd, 0)).toBe("$0");
  });

  it("formatNativeAmount(100) returns '$100'", () => {
    expect(formatNativeAmount(usd, 100)).toBe("$100");
  });

  it("convertCurrency(100) === 100 (no scaling)", () => {
    expect(convertCurrency(usd, 100)).toBe(100);
  });

  it("formatCurrencyPrice matches formatNativeAmount(convertCurrency(…))", () => {
    const v = 79.99;
    expect(formatCurrencyPrice(usd, v)).toBe(
      formatNativeAmount(usd, convertCurrency(usd, v)),
    );
  });
});

// ---------------------------------------------------------------------------
// UAE — AED (3.673× conversion)
// ---------------------------------------------------------------------------

describe("UAE / AED (rate ≈ 3.673, spaceBetween + left symbol)", () => {
  const aed = getCurrency("AED");

  it("has a positive rate above 1", () => {
    expect(aed.rate).toBeGreaterThan(1);
  });

  it("symbol is 'AED' with left position and a space", () => {
    expect(aed.symbol).toBe("AED");
    expect(aed.symbolPosition).toBe("left");
    expect(aed.spaceBetween).toBe(true);
  });

  it("formatCurrencyPrice(100) converts USD → AED and is NOT 'AED 100'", () => {
    const result = formatCurrencyPrice(aed, 100);
    expect(result).not.toBe("AED 100");
    expect(result).toMatch(/^AED \d{3}/);
  });

  it("formatCurrencyPrice(100) produces the expected 'AED 365' (static rate, nearest-5 rounded)", () => {
    // Rate 3.673 × 100 = 367.3 → roundToNearestFive → 365
    expect(formatCurrencyPrice(aed, 100)).toBe("AED 365");
  });

  it("formatCurrencyPrice(50) → 'AED 185'", () => {
    // 3.673 × 50 = 183.65 → roundToNearestFive → 185
    expect(formatCurrencyPrice(aed, 50)).toBe("AED 185");
  });

  it("formatCurrencyPrice(0) → 'AED 0'", () => {
    expect(formatCurrencyPrice(aed, 0)).toBe("AED 0");
  });

  it("convertCurrency(100) → 365 (nearest-5 rounded)", () => {
    expect(convertCurrency(aed, 100)).toBe(365);
  });

  it("formatNativeAmount(367) → 'AED 367' (already in AED, no further conversion)", () => {
    expect(formatNativeAmount(aed, 367)).toBe("AED 367");
  });

  it("formatNativeAmount does NOT multiply by rate again (no double-conversion)", () => {
    // If formatNativeAmount accidentally called convertCurrency, 367 × 3.673 ≈ 1347 ≠ 367
    expect(formatNativeAmount(aed, 367)).toBe("AED 367");
    expect(formatNativeAmount(aed, 367)).not.toMatch(/^AED 1[0-9]{3}/);
  });
});

// ---------------------------------------------------------------------------
// Cyprus — EUR (fractional conversion, < 1×)
// ---------------------------------------------------------------------------

describe("Cyprus / EUR (rate ≈ 0.855, no space, left symbol)", () => {
  const eur = getCurrency("EUR");

  it("has a positive rate less than 1", () => {
    expect(eur.rate).toBeGreaterThan(0);
    expect(eur.rate).toBeLessThan(1);
  });

  it("symbol is '€' with left position and no space", () => {
    expect(eur.symbol).toBe("€");
    expect(eur.symbolPosition).toBe("left");
    expect(eur.spaceBetween).toBe(false);
  });

  it("formatCurrencyPrice(100) converts USD → EUR and is NOT '€100'", () => {
    const result = formatCurrencyPrice(eur, 100);
    expect(result).not.toBe("€100");
    // Must be less than 100 in absolute value (rate < 1)
    const numeric = parseInt(result.replace(/[^0-9]/g, ""), 10);
    expect(numeric).toBeLessThan(100);
  });

  it("formatCurrencyPrice(100) produces '€85' (static rate 0.855 × 100 = 85.5 → roundToNearestFive → 85)", () => {
    expect(formatCurrencyPrice(eur, 100)).toBe("€85");
  });

  it("formatCurrencyPrice(50) → '€45'", () => {
    // 0.855 × 50 = 42.75 → roundToNearestFive → 45
    expect(formatCurrencyPrice(eur, 50)).toBe("€45");
  });

  it("formatCurrencyPrice(0) → '€0'", () => {
    expect(formatCurrencyPrice(eur, 0)).toBe("€0");
  });

  it("convertCurrency(100) → 85 (nearest-5 rounded)", () => {
    expect(convertCurrency(eur, 100)).toBe(85);
  });

  it("formatNativeAmount(86) → '€86'", () => {
    expect(formatNativeAmount(eur, 86)).toBe("€86");
  });
});

// ---------------------------------------------------------------------------
// Cross-currency regression: the "native flag" bug
// Each currency must apply its own rate — not 1 — when called via formatCurrencyPrice
// ---------------------------------------------------------------------------

describe("cross-currency regression — formatCurrencyPrice must apply rate (not treat input as native)", () => {
  const cases: Array<{
    code: "USD" | "AED" | "EUR";
    usdInput: number;
    shouldNotEqual: string;
  }> = [
    { code: "AED", usdInput: 100, shouldNotEqual: "AED 100" },
    { code: "EUR", usdInput: 100, shouldNotEqual: "€100" },
  ];

  for (const { code, usdInput, shouldNotEqual } of cases) {
    it(`${code}: formatCurrencyPrice(${usdInput}) ≠ '${shouldNotEqual}' (conversion must occur)`, () => {
      const currency = getCurrency(code);
      expect(formatCurrencyPrice(currency, usdInput)).not.toBe(shouldNotEqual);
    });
  }

  it("only USD is a no-op conversion (rate === 1)", () => {
    const usd = getCurrency("USD");
    expect(convertCurrency(usd, 100)).toBe(100);
    // All other commonly used currencies must have a different rate
    for (const code of ["AED", "EUR", "GBP"] as const) {
      const c = getCurrency(code);
      expect(c.rate).not.toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// applyFxRates — live rate mutation and guard behaviour
// ---------------------------------------------------------------------------

describe("applyFxRates", () => {
  // Snapshot every static rate before each test and restore it afterwards so
  // mutations never bleed across tests or into the suites above.
  let savedRates: Map<string, number>;

  beforeEach(() => {
    savedRates = new Map(CURRENCIES.map((c) => [c.code, c.rate]));
  });

  afterEach(() => {
    for (const c of CURRENCIES) {
      const original = savedRates.get(c.code);
      if (original !== undefined) c.rate = original;
    }
  });

  it("applies a valid positive rate for a known currency", () => {
    applyFxRates({ AED: 4.0 });
    expect(getCurrency("AED").rate).toBe(4.0);
  });

  it("applies rates for multiple currencies in a single call", () => {
    applyFxRates({ AED: 4.1, EUR: 0.9 });
    expect(getCurrency("AED").rate).toBe(4.1);
    expect(getCurrency("EUR").rate).toBe(0.9);
  });

  it("leaves unmentioned currencies at their previous rate", () => {
    const originalEur = getCurrency("EUR").rate;
    applyFxRates({ AED: 4.2 });
    expect(getCurrency("EUR").rate).toBe(originalEur);
  });

  it("rejects a zero rate — currency keeps its prior value", () => {
    const before = getCurrency("AED").rate;
    applyFxRates({ AED: 0 });
    expect(getCurrency("AED").rate).toBe(before);
  });

  it("rejects a negative rate — currency keeps its prior value", () => {
    const before = getCurrency("AED").rate;
    applyFxRates({ AED: -3.5 });
    expect(getCurrency("AED").rate).toBe(before);
  });

  it("rejects NaN — currency keeps its prior value", () => {
    const before = getCurrency("EUR").rate;
    applyFxRates({ EUR: NaN });
    expect(getCurrency("EUR").rate).toBe(before);
  });

  it("rejects Infinity — currency keeps its prior value", () => {
    const before = getCurrency("AED").rate;
    applyFxRates({ AED: Infinity });
    expect(getCurrency("AED").rate).toBe(before);
  });

  it("ignores unknown currency codes without throwing", () => {
    expect(() =>
      applyFxRates({ XYZ: 1.5 } as Partial<Record<never, number>>),
    ).not.toThrow();
  });

  it("round-trip: applied rate drives formatCurrencyPrice output", () => {
    applyFxRates({ AED: 4.0 });
    const aed = getCurrency("AED");
    // 100 USD × 4.0 = 400 AED
    expect(formatCurrencyPrice(aed, 100)).toBe("AED 400");
  });

  it("round-trip: updated EUR rate changes formatted output", () => {
    applyFxRates({ EUR: 0.9 });
    const eur = getCurrency("EUR");
    // 100 USD × 0.9 = 90 EUR → '€90'
    expect(formatCurrencyPrice(eur, 100)).toBe("€90");
  });

  it("round-trip: invalid rate leaves static fallback in effect", () => {
    const staticRate = getCurrency("AED").rate;
    applyFxRates({ AED: 0 });
    const aed = getCurrency("AED");
    expect(formatCurrencyPrice(aed, 100)).toBe(
      `AED ${roundToNearestFive(staticRate * 100, "AED")}`,
    );
  });
});
