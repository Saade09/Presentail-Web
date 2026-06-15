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

describe("isPayMethodSupported – apple_pay / google_pay", () => {
  it("apple_pay is enabled for USD (LB)", () => {
    expect(isPayMethodSupported("apple_pay", "USD", { country: "LB" })).toBe(true);
  });

  it("google_pay is enabled for USD (LB)", () => {
    expect(isPayMethodSupported("google_pay", "USD", { country: "LB" })).toBe(true);
  });

  it("apple_pay is enabled for EUR", () => {
    expect(isPayMethodSupported("apple_pay", "EUR", { country: "LB" })).toBe(true);
  });

  it("google_pay is enabled for EUR", () => {
    expect(isPayMethodSupported("google_pay", "EUR", { country: "LB" })).toBe(true);
  });

  it("apple_pay is disabled for AED (Stripe does not settle AED)", () => {
    expect(isPayMethodSupported("apple_pay", "AED", { country: "AE" })).toBe(false);
  });

  it("google_pay is disabled for AED (Stripe does not settle AED)", () => {
    expect(isPayMethodSupported("google_pay", "AED", { country: "AE" })).toBe(false);
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

describe("payMethodAvailability – apple_pay / google_pay fields", () => {
  it("apple_pay is enabled in USD (LB)", () => {
    expect(payMethodAvailability("USD", { country: "LB" }).apple_pay.enabled).toBe(true);
  });

  it("google_pay is enabled in USD (LB)", () => {
    expect(payMethodAvailability("USD", { country: "LB" }).google_pay.enabled).toBe(true);
  });

  it("apple_pay is disabled in AED (AE)", () => {
    expect(payMethodAvailability("AED", { country: "AE" }).apple_pay.enabled).toBe(false);
  });

  it("google_pay is disabled in AED (AE)", () => {
    expect(payMethodAvailability("AED", { country: "AE" }).google_pay.enabled).toBe(false);
  });

  it("legacy wallet remains in the availability map for AED (AE) — Mamo path", () => {
    expect(payMethodAvailability("AED", { country: "AE" }).wallet.enabled).toBe(true);
  });
});

describe("defaultPayMethodFor", () => {
  it("defaults to apple_pay (not wallet or card) for USD", () => {
    const method = defaultPayMethodFor("USD", { country: "LB" });
    expect(method).toBe("apple_pay");
  });

  it("defaults to mamo for AED in UAE (no Stripe wallet, no card in UAE)", () => {
    const method = defaultPayMethodFor("AED", { country: "AE" });
    expect(method).toBe("mamo");
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

  it("preserves apple_pay when switching from USD to EUR", () => {
    expect(nextPayMethodForCurrency("apple_pay", "EUR", { country: "LB" })).toBe("apple_pay");
  });

  it("preserves google_pay when switching from USD to EUR", () => {
    expect(nextPayMethodForCurrency("google_pay", "EUR", { country: "LB" })).toBe("google_pay");
  });

  it("switches away from apple_pay when moving to AED in UAE", () => {
    const result = nextPayMethodForCurrency("apple_pay", "AED", { country: "AE" });
    expect(result).not.toBe("apple_pay");
  });

  it("switches away from google_pay when moving to AED in UAE", () => {
    const result = nextPayMethodForCurrency("google_pay", "AED", { country: "AE" });
    expect(result).not.toBe("google_pay");
  });
});
