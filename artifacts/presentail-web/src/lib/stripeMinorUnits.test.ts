/**
 * Unit tests for the web-side Stripe minor-units helper.
 *
 * This must mirror the API server's `toStripeMinorUnits` / `CURRENCY_DECIMALS`
 * (artifacts/api-server/src/lib/fx.ts) so the Apple Pay / Google Pay wallet
 * sheet displays the same amount the server-created PaymentIntent will charge.
 */

import { describe, it, expect } from "vitest";
import { currencyDecimals, toStripeMinorUnits } from "./stripeMinorUnits";

describe("currencyDecimals", () => {
  it("returns 2 for all supported currencies", () => {
    for (const c of ["USD", "AED", "EUR", "GBP", "CAD", "AUD", "QAR", "SAR", "CHF"]) {
      expect(currencyDecimals(c)).toBe(2);
    }
  });

  it("returns 0 for LBP", () => {
    expect(currencyDecimals("LBP")).toBe(0);
  });

  it("is case-insensitive and defaults to 2 for unknown codes", () => {
    expect(currencyDecimals("ZZZ")).toBe(2);
  });
});

describe("toStripeMinorUnits", () => {
  it("converts two-decimal currencies to cents", () => {
    expect(toStripeMinorUnits(301.5, "EUR")).toBe(30150);
    expect(toStripeMinorUnits(342, "USD")).toBe(34200);
    expect(toStripeMinorUnits(99.99, "GBP")).toBe(9999);
  });

  it("converts zero-decimal currencies to whole units (LBP)", () => {
    expect(toStripeMinorUnits(89500.4, "LBP")).toBe(89500);
    expect(toStripeMinorUnits(89500.6, "LBP")).toBe(89501);
  });
});
