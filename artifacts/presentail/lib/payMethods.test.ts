import { describe, expect, it } from "vitest";

import {
  defaultPayMethodFor,
  isPayMethodSupported,
  nextPayMethodForCurrency,
  payMethodAvailability,
} from "@workspace/pay-methods";

describe("isPayMethodSupported", () => {
  it("AED supports apple_pay, google_pay, card, and legacy wallet via Gulf Stripe account; mamo is disabled", () => {
    // Mamo is disabled — its currency list is empty
    expect(isPayMethodSupported("mamo", "AED")).toBe(false);
    // Legacy wallet still supports AED (Stripe PlatformPay sheet)
    expect(isPayMethodSupported("wallet", "AED")).toBe(true);
    expect(isPayMethodSupported("wallet", "AED", { country: "AE" })).toBe(true);
    // apple_pay, google_pay, and card are enabled for AED via Gulf Stripe account
    expect(isPayMethodSupported("apple_pay", "AED")).toBe(true);
    expect(isPayMethodSupported("google_pay", "AED")).toBe(true);
    expect(isPayMethodSupported("card", "AED")).toBe(true);
    expect(isPayMethodSupported("paypal", "AED")).toBe(false);
    expect(isPayMethodSupported("whish", "AED")).toBe(false);
    expect(isPayMethodSupported("western", "AED")).toBe(false);
  });

  it("USD + LB supports card, apple_pay, google_pay, paypal, whish, western — but not mamo", () => {
    const ctx = { country: "LB" };
    expect(isPayMethodSupported("card", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("apple_pay", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("google_pay", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("paypal", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("whish", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("western", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("mamo", "USD", ctx)).toBe(false);
  });

  it("USD + AE keeps card/apple_pay/google_pay but disables PayPal (UAE excluded) and Whish/Western (LB-only)", () => {
    const ctx = { country: "AE" };
    expect(isPayMethodSupported("card", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("apple_pay", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("google_pay", "USD", ctx)).toBe(true);
    // PayPal is country-excluded from UAE — even browsing in USD, Mamo
    // is the natural local option there.
    expect(isPayMethodSupported("paypal", "USD", ctx)).toBe(false);
    expect(isPayMethodSupported("whish", "USD", ctx)).toBe(false);
    expect(isPayMethodSupported("western", "USD", ctx)).toBe(false);
  });

  it("AED + AE excludes PayPal and mamo (disabled); apple_pay, google_pay, and legacy wallet enabled", () => {
    const ctx = { country: "AE" };
    expect(isPayMethodSupported("paypal", "AED", ctx)).toBe(false);
    // apple_pay and google_pay are enabled for AED via Gulf Stripe account
    expect(isPayMethodSupported("apple_pay", "AED", ctx)).toBe(true);
    expect(isPayMethodSupported("google_pay", "AED", ctx)).toBe(true);
    // Mamo is disabled
    expect(isPayMethodSupported("mamo", "AED", ctx)).toBe(false);
    expect(isPayMethodSupported("wallet", "AED", ctx)).toBe(true);
  });

  it("USD + CY also disables Whish & Western (LB-only)", () => {
    const ctx = { country: "CY" };
    expect(isPayMethodSupported("whish", "USD", ctx)).toBe(false);
    expect(isPayMethodSupported("western", "USD", ctx)).toBe(false);
    expect(isPayMethodSupported("card", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("apple_pay", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("google_pay", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("paypal", "USD", ctx)).toBe(true);
  });

  it("Whish & Western require an explicit country (no LB by default)", () => {
    expect(isPayMethodSupported("whish", "USD")).toBe(false);
    expect(isPayMethodSupported("western", "USD")).toBe(false);
  });

  it("GBP supports card/apple_pay/google_pay/paypal — disables Whish/Western/Mamo", () => {
    const ctx = { country: "LB" };
    expect(isPayMethodSupported("card", "GBP", ctx)).toBe(true);
    expect(isPayMethodSupported("apple_pay", "GBP", ctx)).toBe(true);
    expect(isPayMethodSupported("google_pay", "GBP", ctx)).toBe(true);
    // PayPal supports GBP (it is in paypal's currency list)
    expect(isPayMethodSupported("paypal", "GBP", ctx)).toBe(true);
    expect(isPayMethodSupported("whish", "GBP", ctx)).toBe(false);
    expect(isPayMethodSupported("western", "GBP", ctx)).toBe(false);
    expect(isPayMethodSupported("mamo", "GBP", ctx)).toBe(false);
  });

  it("returns false for an unknown currency across the board", () => {
    expect(isPayMethodSupported("card", "ZZZ")).toBe(false);
    expect(isPayMethodSupported("apple_pay", "ZZZ")).toBe(false);
    expect(isPayMethodSupported("google_pay", "ZZZ")).toBe(false);
    expect(isPayMethodSupported("paypal", "ZZZ")).toBe(false);
    expect(isPayMethodSupported("mamo", "ZZZ")).toBe(false);
  });
});

describe("defaultPayMethodFor", () => {
  it("picks apple_pay for USD/GBP/EUR (Stripe-settled currencies — iOS-primary default)", () => {
    expect(defaultPayMethodFor("USD")).toBe("apple_pay");
    expect(defaultPayMethodFor("GBP")).toBe("apple_pay");
    expect(defaultPayMethodFor("EUR")).toBe("apple_pay");
  });

  it("defaults to apple_pay for AED (Gulf Stripe account; mamo is disabled)", () => {
    expect(defaultPayMethodFor("AED")).toBe("apple_pay");
  });

  it("returns card as a final safe default for unsupported currencies", () => {
    expect(defaultPayMethodFor("ZZZ")).toBe("card");
  });
});

describe("nextPayMethodForCurrency — currency/country switch transition", () => {
  it("preserves the user's selection when it remains compatible", () => {
    expect(nextPayMethodForCurrency("paypal", "USD", { country: "LB" })).toBe("paypal");
    expect(nextPayMethodForCurrency("whish", "USD", { country: "LB" })).toBe("whish");
    expect(nextPayMethodForCurrency("card", "GBP")).toBe("card");
  });

  it("preserves apple_pay/google_pay/card across compatible currency swaps", () => {
    expect(nextPayMethodForCurrency("card", "EUR")).toBe("card");
    expect(nextPayMethodForCurrency("apple_pay", "CHF")).toBe("apple_pay");
    expect(nextPayMethodForCurrency("google_pay", "GBP")).toBe("google_pay");
  });

  it("falls back to default when the selection becomes incompatible", () => {
    // QAR is not in paypal's supported currencies, so paypal→apple_pay
    expect(nextPayMethodForCurrency("paypal", "QAR")).toBe("apple_pay");
    // card/apple_pay/google_pay are compatible with AED (Gulf Stripe account) — preserved
    expect(nextPayMethodForCurrency("card", "AED")).toBe("card");
    expect(nextPayMethodForCurrency("apple_pay", "AED")).toBe("apple_pay");
    expect(nextPayMethodForCurrency("google_pay", "AED")).toBe("google_pay");
    // mamo is disabled so it has no supported currencies — falls to apple_pay for USD
    expect(nextPayMethodForCurrency("mamo", "USD")).toBe("apple_pay");
    // whish is LB-only and AED has no country, so falls to apple_pay (default for AED)
    expect(nextPayMethodForCurrency("whish", "AED")).toBe("apple_pay");
  });

  it("preserves legacy wallet on AED (routes through Mamo) instead of dropping back to mamo", () => {
    // Legacy wallet is still compatible with AED so a shopper already on it stays.
    expect(nextPayMethodForCurrency("wallet", "AED")).toBe("wallet");
    expect(nextPayMethodForCurrency("wallet", "AED", { country: "AE" })).toBe("wallet");
  });

  it("moves PayPal off when the country flips to UAE", () => {
    // PayPal is country-excluded from UAE; apple_pay supports USD in AE
    expect(nextPayMethodForCurrency("paypal", "USD", { country: "AE" })).toBe(
      "apple_pay",
    );
    // AED+AE: apple_pay supports AED via Gulf Stripe account — falls back to apple_pay
    expect(nextPayMethodForCurrency("paypal", "AED", { country: "AE" })).toBe(
      "apple_pay",
    );
  });

  it("moves Whish/Western off when the country flips away from LB", () => {
    expect(nextPayMethodForCurrency("whish", "USD", { country: "AE" })).toBe("apple_pay");
    expect(nextPayMethodForCurrency("western", "USD", { country: "CY" })).toBe("apple_pay");
    // Stays put in Lebanon.
    expect(nextPayMethodForCurrency("whish", "USD", { country: "LB" })).toBe("whish");
    expect(nextPayMethodForCurrency("western", "USD", { country: "LB" })).toBe("western");
  });

  it("never returns an unsupported method for the target currency/country", () => {
    const ids = ["card", "wallet", "apple_pay", "google_pay", "whish", "western", "mamo", "paypal"] as const;
    for (const id of ids) {
      for (const cur of ["USD", "AED", "GBP", "EUR"]) {
        for (const country of ["LB", "AE", "CY", undefined] as const) {
          const ctx = country ? { country } : undefined;
          const next = nextPayMethodForCurrency(id, cur, ctx);
          expect(isPayMethodSupported(next, cur, ctx)).toBe(true);
        }
      }
    }
  });
});

describe("payMethodAvailability — disabled (not hidden) for incompatible", () => {
  it("returns an entry for every method so the UI can render them all", () => {
    const av = payMethodAvailability("AED");
    expect(Object.keys(av).sort()).toEqual(
      ["apple_pay", "card", "google_pay", "mamo", "paypal", "wallet", "western", "whish"].sort(),
    );
  });

  it("AED enables apple_pay, google_pay, card, and legacy wallet; mamo is disabled", () => {
    const av = payMethodAvailability("AED");
    // Mamo is disabled (empty currency list)
    expect(av.mamo.enabled).toBe(false);
    expect(av.wallet.enabled).toBe(true);
    // apple_pay/google_pay/card are enabled for AED via Gulf Stripe account
    expect(av.apple_pay.enabled).toBe(true);
    expect(av.google_pay.enabled).toBe(true);
    expect(av.card.enabled).toBe(true);
    expect(av.paypal.enabled).toBe(false);
    expect(av.whish.enabled).toBe(false);
    expect(av.western.enabled).toBe(false);
  });

  it("USD + LB enables card/apple_pay/google_pay/paypal/whish/western, disables Mamo", () => {
    const av = payMethodAvailability("USD", { country: "LB" });
    expect(av.card.enabled).toBe(true);
    expect(av.apple_pay.enabled).toBe(true);
    expect(av.google_pay.enabled).toBe(true);
    expect(av.paypal.enabled).toBe(true);
    expect(av.whish.enabled).toBe(true);
    expect(av.western.enabled).toBe(true);
    expect(av.mamo.enabled).toBe(false);
  });

  it("USD + AE keeps card/apple_pay/google_pay but disables PayPal (UAE-excluded) and Whish/Western (LB-only)", () => {
    const av = payMethodAvailability("USD", { country: "AE" });
    expect(av.card.enabled).toBe(true);
    expect(av.apple_pay.enabled).toBe(true);
    expect(av.google_pay.enabled).toBe(true);
    expect(av.paypal.enabled).toBe(false);
    expect(av.whish.enabled).toBe(false);
    expect(av.western.enabled).toBe(false);
    expect(av.mamo.enabled).toBe(false);
  });

  it("USD + CY disables Whish/Western (LB-only)", () => {
    const av = payMethodAvailability("USD", { country: "CY" });
    expect(av.whish.enabled).toBe(false);
    expect(av.western.enabled).toBe(false);
    expect(av.card.enabled).toBe(true);
    expect(av.apple_pay.enabled).toBe(true);
    expect(av.google_pay.enabled).toBe(true);
  });

  it("GBP enables card/apple_pay/google_pay/paypal, disables Whish/Western/Mamo", () => {
    const av = payMethodAvailability("GBP", { country: "LB" });
    expect(av.card.enabled).toBe(true);
    expect(av.apple_pay.enabled).toBe(true);
    expect(av.google_pay.enabled).toBe(true);
    // PayPal supports GBP (it is in paypal's currency list)
    expect(av.paypal.enabled).toBe(true);
    expect(av.whish.enabled).toBe(false);
    expect(av.western.enabled).toBe(false);
    expect(av.mamo.enabled).toBe(false);
  });
});
