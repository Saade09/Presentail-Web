import { describe, it, expect, beforeEach } from "vitest";
import {
  getUsdAmount,
  setFxRates,
  getFxRates,
  __resetFxRatesForTest,
} from "./fxRateCache";

describe("getUsdAmount", () => {
  beforeEach(() => {
    __resetFxRatesForTest();
  });

  it("returns the amount unchanged for USD", () => {
    expect(getUsdAmount(100, "USD")).toBe(100);
  });

  it("returns the amount unchanged when currency is undefined", () => {
    expect(getUsdAmount(50, undefined)).toBe(50);
  });

  it("converts AED using the static fallback rate before webhook fires", () => {
    // AED is pegged to USD at 3.6725 (static fallback)
    const result = getUsdAmount(36.725, "AED");
    expect(result).toBeCloseTo(10, 5);
  });

  it("converts AED using live rates after setFxRates", () => {
    setFxRates({ AED: 4.0 });
    const result = getUsdAmount(8, "AED");
    expect(result).toBeCloseTo(2, 5);
  });

  it("handles lowercase currency codes", () => {
    setFxRates({ EUR: 0.92 });
    const result = getUsdAmount(0.92, "eur");
    expect(result).toBeCloseTo(1, 5);
  });

  it("returns the amount unchanged for an unknown currency (1:1 fallback)", () => {
    // XYZ has no known rate → treated as 1:1 with USD
    expect(getUsdAmount(42, "XYZ")).toBe(42);
  });

  it("updates rates when setFxRates is called again", () => {
    setFxRates({ GBP: 0.79 });
    expect(getUsdAmount(0.79, "GBP")).toBeCloseTo(1, 5);
    setFxRates({ GBP: 0.80 });
    expect(getUsdAmount(0.80, "GBP")).toBeCloseTo(1, 5);
  });
});

describe("setFxRates / getFxRates", () => {
  beforeEach(() => {
    __resetFxRatesForTest();
  });

  it("merges live rates over static fallback", () => {
    setFxRates({ EUR: 0.92 });
    const rates = getFxRates();
    // Static AED fallback still present
    expect(rates["AED"]).toBe(3.6725);
    // Live EUR rate present
    expect(rates["EUR"]).toBe(0.92);
  });

  it("overwrites previous live rates on second call", () => {
    setFxRates({ AED: 3.5 });
    setFxRates({ AED: 4.0 });
    expect(getFxRates()["AED"]).toBe(4.0);
  });

  it("ignores non-object arguments", () => {
    setFxRates(null as any);
    // AED fallback is still present from static rates
    expect(getFxRates()["AED"]).toBe(3.6725);
  });
});
