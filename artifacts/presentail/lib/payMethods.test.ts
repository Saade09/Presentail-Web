import { describe, expect, it } from "vitest";

import {
  defaultPayMethodFor,
  isPayMethodSupported,
  nextPayMethodForCurrency,
  payMethodAvailability,
} from "./payMethods";

describe("isPayMethodSupported", () => {
  it("AED only routes through Mamo", () => {
    expect(isPayMethodSupported("mamo", "AED")).toBe(true);
    expect(isPayMethodSupported("card", "AED")).toBe(false);
    expect(isPayMethodSupported("wallet", "AED")).toBe(false);
    expect(isPayMethodSupported("paypal", "AED")).toBe(false);
    expect(isPayMethodSupported("whish", "AED")).toBe(false);
    expect(isPayMethodSupported("western", "AED")).toBe(false);
  });

  it("USD supports card, wallet, paypal, whish, western — but not mamo", () => {
    expect(isPayMethodSupported("card", "USD")).toBe(true);
    expect(isPayMethodSupported("wallet", "USD")).toBe(true);
    expect(isPayMethodSupported("paypal", "USD")).toBe(true);
    expect(isPayMethodSupported("whish", "USD")).toBe(true);
    expect(isPayMethodSupported("western", "USD")).toBe(true);
    expect(isPayMethodSupported("mamo", "USD")).toBe(false);
  });

  it("GBP supports card/wallet only — disables PayPal and the manual flows", () => {
    expect(isPayMethodSupported("card", "GBP")).toBe(true);
    expect(isPayMethodSupported("wallet", "GBP")).toBe(true);
    expect(isPayMethodSupported("paypal", "GBP")).toBe(false);
    expect(isPayMethodSupported("whish", "GBP")).toBe(false);
    expect(isPayMethodSupported("western", "GBP")).toBe(false);
    expect(isPayMethodSupported("mamo", "GBP")).toBe(false);
  });

  it("returns false for an unknown currency across the board", () => {
    expect(isPayMethodSupported("card", "ZZZ")).toBe(false);
    expect(isPayMethodSupported("paypal", "ZZZ")).toBe(false);
    expect(isPayMethodSupported("mamo", "ZZZ")).toBe(false);
  });
});

describe("defaultPayMethodFor", () => {
  it("picks card for USD/GBP (anything Stripe handles)", () => {
    expect(defaultPayMethodFor("USD")).toBe("card");
    expect(defaultPayMethodFor("GBP")).toBe("card");
    expect(defaultPayMethodFor("EUR")).toBe("card");
  });

  it("falls back to mamo for AED (card is unavailable)", () => {
    expect(defaultPayMethodFor("AED")).toBe("mamo");
  });

  it("returns card as a final safe default for unsupported currencies", () => {
    // No method supports ZZZ, but the helper must still return *something*
    // valid so the UI doesn't render with a null selection.
    expect(defaultPayMethodFor("ZZZ")).toBe("card");
  });
});

describe("nextPayMethodForCurrency — currency-switch state transition", () => {
  it("preserves the user's selection when it remains compatible", () => {
    // USD shopper on PayPal switches to USD again (no-op): keep PayPal.
    expect(nextPayMethodForCurrency("paypal", "USD")).toBe("paypal");
    // USD shopper on Whish stays on Whish.
    expect(nextPayMethodForCurrency("whish", "USD")).toBe("whish");
    // GBP shopper on card stays on card.
    expect(nextPayMethodForCurrency("card", "GBP")).toBe("card");
  });

  it("preserves card/wallet across compatible currency swaps", () => {
    // Card works in EUR/GBP/USD/etc, so swapping among them keeps card.
    expect(nextPayMethodForCurrency("card", "EUR")).toBe("card");
    expect(nextPayMethodForCurrency("wallet", "CHF")).toBe("wallet");
  });

  it("falls back to default when the selection becomes incompatible", () => {
    // PayPal is USD-only — switch to GBP and we must move off PayPal.
    expect(nextPayMethodForCurrency("paypal", "GBP")).toBe("card");
    // Card is unavailable in AED — must fall back to Mamo.
    expect(nextPayMethodForCurrency("card", "AED")).toBe("mamo");
    // Mamo is unavailable in USD — must fall back to card.
    expect(nextPayMethodForCurrency("mamo", "USD")).toBe("card");
    // Whish is USD-only — switching to AED moves to Mamo.
    expect(nextPayMethodForCurrency("whish", "AED")).toBe("mamo");
  });

  it("never returns an unsupported method for the target currency", () => {
    const ids = ["card", "wallet", "whish", "western", "mamo", "paypal"] as const;
    for (const id of ids) {
      for (const cur of ["USD", "AED", "GBP", "EUR"]) {
        const next = nextPayMethodForCurrency(id, cur);
        expect(isPayMethodSupported(next, cur)).toBe(true);
      }
    }
  });
});

describe("payMethodAvailability — disabled (not hidden) for incompatible", () => {
  it("returns an entry for every method so the UI can render them all", () => {
    const av = payMethodAvailability("AED");
    expect(Object.keys(av).sort()).toEqual(
      ["card", "mamo", "paypal", "wallet", "western", "whish"].sort(),
    );
  });

  it("AED enables only Mamo; everything else is disabled (still rendered)", () => {
    const av = payMethodAvailability("AED");
    expect(av.mamo.enabled).toBe(true);
    expect(av.card.enabled).toBe(false);
    expect(av.wallet.enabled).toBe(false);
    expect(av.paypal.enabled).toBe(false);
    expect(av.whish.enabled).toBe(false);
    expect(av.western.enabled).toBe(false);
  });

  it("USD enables card/wallet/paypal/whish/western, disables Mamo", () => {
    const av = payMethodAvailability("USD");
    expect(av.card.enabled).toBe(true);
    expect(av.wallet.enabled).toBe(true);
    expect(av.paypal.enabled).toBe(true);
    expect(av.whish.enabled).toBe(true);
    expect(av.western.enabled).toBe(true);
    expect(av.mamo.enabled).toBe(false);
  });

  it("GBP enables card/wallet, disables PayPal/Whish/Western/Mamo", () => {
    const av = payMethodAvailability("GBP");
    expect(av.card.enabled).toBe(true);
    expect(av.wallet.enabled).toBe(true);
    expect(av.paypal.enabled).toBe(false);
    expect(av.whish.enabled).toBe(false);
    expect(av.western.enabled).toBe(false);
    expect(av.mamo.enabled).toBe(false);
  });
});
