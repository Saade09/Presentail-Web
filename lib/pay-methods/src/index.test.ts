import { describe, it, expect } from "vitest";
import {
  isPayMethodSupported,
  payMethodAvailability,
  nextPayMethodForCurrency,
  defaultPayMethodFor,
} from "./index.js";

describe("isPayMethodSupported – PayPal", () => {
  const supportedCurrencies = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF"];
  const unsupportedCurrencies = ["AED", "QAR", "SAR", "KWD", "OMR"];

  for (const currency of supportedCurrencies) {
    it(`is enabled for ${currency} (LB)`, () => {
      expect(isPayMethodSupported("paypal", currency, { country: "LB" })).toBe(true);
    });

    it(`is enabled for ${currency} with no country context`, () => {
      expect(isPayMethodSupported("paypal", currency, {})).toBe(true);
    });
  }

  it("is disabled for AED (currency not in list)", () => {
    expect(isPayMethodSupported("paypal", "AED", { country: "LB" })).toBe(false);
  });

  for (const currency of unsupportedCurrencies) {
    it(`is disabled for ${currency}`, () => {
      expect(isPayMethodSupported("paypal", currency, { country: "LB" })).toBe(false);
    });
  }

  it("is disabled for UAE shoppers regardless of currency (country exclusion)", () => {
    expect(isPayMethodSupported("paypal", "USD", { country: "AE" })).toBe(false);
    expect(isPayMethodSupported("paypal", "EUR", { country: "AE" })).toBe(false);
    expect(isPayMethodSupported("paypal", "GBP", { country: "AE" })).toBe(false);
  });
});

describe("payMethodAvailability – PayPal field", () => {
  it("is enabled in USD", () => {
    expect(payMethodAvailability("USD", { country: "LB" }).paypal.enabled).toBe(true);
  });

  it("is enabled in EUR", () => {
    expect(payMethodAvailability("EUR", { country: "LB" }).paypal.enabled).toBe(true);
  });

  it("is enabled in GBP", () => {
    expect(payMethodAvailability("GBP", { country: "LB" }).paypal.enabled).toBe(true);
  });

  it("is enabled in CAD", () => {
    expect(payMethodAvailability("CAD", { country: "LB" }).paypal.enabled).toBe(true);
  });

  it("is enabled in AUD", () => {
    expect(payMethodAvailability("AUD", { country: "LB" }).paypal.enabled).toBe(true);
  });

  it("is enabled in CHF", () => {
    expect(payMethodAvailability("CHF", { country: "LB" }).paypal.enabled).toBe(true);
  });

  it("is disabled in AED (no PayPal in UAE)", () => {
    expect(payMethodAvailability("AED", { country: "AE" }).paypal.enabled).toBe(false);
  });

  it("is disabled in QAR", () => {
    expect(payMethodAvailability("QAR", { country: "LB" }).paypal.enabled).toBe(false);
  });

  it("is disabled in SAR", () => {
    expect(payMethodAvailability("SAR", { country: "LB" }).paypal.enabled).toBe(false);
  });
});

describe("defaultPayMethodFor", () => {
  it("does not default to PayPal (wallet/card preferred) for USD", () => {
    const method = defaultPayMethodFor("USD", { country: "LB" });
    expect(method).toBe("wallet");
  });
});

describe("nextPayMethodForCurrency", () => {
  it("preserves PayPal when switching from USD to EUR", () => {
    expect(nextPayMethodForCurrency("paypal", "EUR", { country: "LB" })).toBe("paypal");
  });

  it("preserves PayPal when switching from USD to GBP", () => {
    expect(nextPayMethodForCurrency("paypal", "GBP", { country: "LB" })).toBe("paypal");
  });

  it("switches away from PayPal when moving to QAR", () => {
    const result = nextPayMethodForCurrency("paypal", "QAR", { country: "LB" });
    expect(result).not.toBe("paypal");
  });

  it("switches away from PayPal when moving to AED in UAE", () => {
    const result = nextPayMethodForCurrency("paypal", "AED", { country: "AE" });
    expect(result).not.toBe("paypal");
  });
});
