import { describe, expect, it } from "vitest";

import {
  defaultPayMethodFor,
  isPayMethodSupported,
  nextPayMethodForCurrency,
  payMethodAvailability,
} from "@workspace/pay-methods";

describe("isPayMethodSupported", () => {
  it("AED supports Mamo (card flow) and legacy wallet (Mamo-hosted); apple_pay/google_pay excluded", () => {
    expect(isPayMethodSupported("mamo", "AED")).toBe(true);
    // Legacy wallet still supports AED (Mamo's hosted checkout exposes Apple/Google Pay)
    expect(isPayMethodSupported("wallet", "AED")).toBe(true);
    expect(isPayMethodSupported("wallet", "AED", { country: "AE" })).toBe(true);
    // apple_pay and google_pay go through Stripe's native sheet — AED excluded
    expect(isPayMethodSupported("apple_pay", "AED")).toBe(false);
    expect(isPayMethodSupported("google_pay", "AED")).toBe(false);
    expect(isPayMethodSupported("card", "AED")).toBe(false);
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

  it("AED + AE still excludes PayPal, apple_pay, google_pay; enables mamo and legacy wallet", () => {
    const ctx = { country: "AE" };
    expect(isPayMethodSupported("paypal", "AED", ctx)).toBe(false);
    expect(isPayMethodSupported("apple_pay", "AED", ctx)).toBe(false);
    expect(isPayMethodSupported("google_pay", "AED", ctx)).toBe(false);
    expect(isPayMethodSupported("mamo", "AED", ctx)).toBe(true);
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

  it("falls back to mamo for AED (apple_pay/google_pay/card unavailable)", () => {
    expect(defaultPayMethodFor("AED")).toBe("mamo");
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
    expect(nextPayMethodForCurrency("card", "AED")).toBe("mamo");
    expect(nextPayMethodForCurrency("apple_pay", "AED")).toBe("mamo");
    expect(nextPayMethodForCurrency("google_pay", "AED")).toBe("mamo");
    expect(nextPayMethodForCurrency("mamo", "USD")).toBe("apple_pay");
    expect(nextPayMethodForCurrency("whish", "AED")).toBe("mamo");
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
    // AED+AE: apple_pay doesn't support AED, so falls back through to mamo
    expect(nextPayMethodForCurrency("paypal", "AED", { country: "AE" })).toBe(
      "mamo",
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

  it("AED enables mamo and legacy wallet; apple_pay/google_pay and other methods disabled", () => {
    const av = payMethodAvailability("AED");
    expect(av.mamo.enabled).toBe(true);
    expect(av.wallet.enabled).toBe(true);
    expect(av.apple_pay.enabled).toBe(false);
    expect(av.google_pay.enabled).toBe(false);
    expect(av.card.enabled).toBe(false);
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
