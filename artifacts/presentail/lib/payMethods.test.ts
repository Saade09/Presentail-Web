import { describe, expect, it } from "vitest";

import {
  defaultPayMethodFor,
  isPayMethodSupported,
  nextPayMethodForCurrency,
  payMethodAvailability,
} from "./payMethods";

describe("isPayMethodSupported", () => {
  it("AED supports Mamo (card flow) and wallet (Apple/Google Pay via Mamo); other methods disabled", () => {
    // Wallet is allowed on AED because Mamo's hosted checkout exposes
    // Apple Pay / Google Pay. The mobile checkout routes AED+wallet
    // through Mamo's hosted link, not Stripe.
    expect(isPayMethodSupported("mamo", "AED")).toBe(true);
    expect(isPayMethodSupported("wallet", "AED")).toBe(true);
    expect(isPayMethodSupported("wallet", "AED", { country: "AE" })).toBe(true);
    expect(isPayMethodSupported("card", "AED")).toBe(false);
    expect(isPayMethodSupported("paypal", "AED")).toBe(false);
    expect(isPayMethodSupported("whish", "AED")).toBe(false);
    expect(isPayMethodSupported("western", "AED")).toBe(false);
  });

  it("USD + LB supports card, wallet, paypal, whish, western — but not mamo", () => {
    const ctx = { country: "LB" };
    expect(isPayMethodSupported("card", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("wallet", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("paypal", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("whish", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("western", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("mamo", "USD", ctx)).toBe(false);
  });

  it("USD + AE keeps card/wallet but disables PayPal (UAE excluded) and Whish/Western (LB-only)", () => {
    const ctx = { country: "AE" };
    expect(isPayMethodSupported("card", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("wallet", "USD", ctx)).toBe(true);
    // PayPal is country-excluded from UAE — even browsing in USD, Mamo
    // is the natural local option there.
    expect(isPayMethodSupported("paypal", "USD", ctx)).toBe(false);
    expect(isPayMethodSupported("whish", "USD", ctx)).toBe(false);
    expect(isPayMethodSupported("western", "USD", ctx)).toBe(false);
  });

  it("AED + AE still excludes PayPal (already USD-only, but country rule applies too)", () => {
    const ctx = { country: "AE" };
    expect(isPayMethodSupported("paypal", "AED", ctx)).toBe(false);
    expect(isPayMethodSupported("mamo", "AED", ctx)).toBe(true);
    expect(isPayMethodSupported("wallet", "AED", ctx)).toBe(true);
  });

  it("USD + CY also disables Whish & Western (LB-only)", () => {
    const ctx = { country: "CY" };
    expect(isPayMethodSupported("whish", "USD", ctx)).toBe(false);
    expect(isPayMethodSupported("western", "USD", ctx)).toBe(false);
    expect(isPayMethodSupported("card", "USD", ctx)).toBe(true);
    expect(isPayMethodSupported("paypal", "USD", ctx)).toBe(true);
  });

  it("Whish & Western require an explicit country (no LB by default)", () => {
    // Without ctx.country we cannot prove the shopper is in Lebanon, so the
    // safe default is to disable the LB-only methods. This matches the
    // checkout call site, which always passes the active country.
    expect(isPayMethodSupported("whish", "USD")).toBe(false);
    expect(isPayMethodSupported("western", "USD")).toBe(false);
  });

  it("GBP supports card/wallet only — disables PayPal and the manual flows", () => {
    const ctx = { country: "LB" };
    expect(isPayMethodSupported("card", "GBP", ctx)).toBe(true);
    expect(isPayMethodSupported("wallet", "GBP", ctx)).toBe(true);
    expect(isPayMethodSupported("paypal", "GBP", ctx)).toBe(false);
    expect(isPayMethodSupported("whish", "GBP", ctx)).toBe(false);
    expect(isPayMethodSupported("western", "GBP", ctx)).toBe(false);
    expect(isPayMethodSupported("mamo", "GBP", ctx)).toBe(false);
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
    expect(defaultPayMethodFor("ZZZ")).toBe("card");
  });
});

describe("nextPayMethodForCurrency — currency/country switch transition", () => {
  it("preserves the user's selection when it remains compatible", () => {
    expect(nextPayMethodForCurrency("paypal", "USD", { country: "LB" })).toBe("paypal");
    expect(nextPayMethodForCurrency("whish", "USD", { country: "LB" })).toBe("whish");
    expect(nextPayMethodForCurrency("card", "GBP")).toBe("card");
  });

  it("preserves card/wallet across compatible currency swaps", () => {
    expect(nextPayMethodForCurrency("card", "EUR")).toBe("card");
    expect(nextPayMethodForCurrency("wallet", "CHF")).toBe("wallet");
  });

  it("falls back to default when the selection becomes incompatible", () => {
    expect(nextPayMethodForCurrency("paypal", "GBP")).toBe("card");
    expect(nextPayMethodForCurrency("card", "AED")).toBe("mamo");
    expect(nextPayMethodForCurrency("mamo", "USD")).toBe("card");
    expect(nextPayMethodForCurrency("whish", "AED")).toBe("mamo");
  });

  it("preserves wallet on AED (routes through Mamo) instead of dropping back to mamo", () => {
    // Wallet is now compatible with AED, so a shopper who already picked
    // wallet should stay on it when the currency flips to AED.
    expect(nextPayMethodForCurrency("wallet", "AED")).toBe("wallet");
    expect(nextPayMethodForCurrency("wallet", "AED", { country: "AE" })).toBe("wallet");
  });

  it("moves PayPal off when the country flips to UAE", () => {
    // Shopper picked PayPal in LB (USD), then switched country to UAE.
    // PayPal is hidden in UAE so we must not leave them on it.
    expect(nextPayMethodForCurrency("paypal", "USD", { country: "AE" })).toBe(
      "card",
    );
    expect(nextPayMethodForCurrency("paypal", "AED", { country: "AE" })).toBe(
      "mamo",
    );
  });

  it("moves Whish/Western off when the country flips away from LB", () => {
    // A shopper in Lebanon picked Whish, then switched the country selector
    // to UAE while still browsing in USD. We must not leave them on Whish.
    expect(nextPayMethodForCurrency("whish", "USD", { country: "AE" })).toBe("card");
    expect(nextPayMethodForCurrency("western", "USD", { country: "CY" })).toBe("card");
    // And it stays put if they're still in Lebanon.
    expect(nextPayMethodForCurrency("whish", "USD", { country: "LB" })).toBe("whish");
    expect(nextPayMethodForCurrency("western", "USD", { country: "LB" })).toBe("western");
  });

  it("never returns an unsupported method for the target currency/country", () => {
    const ids = ["card", "wallet", "whish", "western", "mamo", "paypal"] as const;
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
      ["card", "mamo", "paypal", "wallet", "western", "whish"].sort(),
    );
  });

  it("AED enables Mamo and wallet (Apple/Google Pay via Mamo); other methods disabled", () => {
    const av = payMethodAvailability("AED");
    expect(av.mamo.enabled).toBe(true);
    expect(av.wallet.enabled).toBe(true);
    expect(av.card.enabled).toBe(false);
    expect(av.paypal.enabled).toBe(false);
    expect(av.whish.enabled).toBe(false);
    expect(av.western.enabled).toBe(false);
  });

  it("USD + LB enables card/wallet/paypal/whish/western, disables Mamo", () => {
    const av = payMethodAvailability("USD", { country: "LB" });
    expect(av.card.enabled).toBe(true);
    expect(av.wallet.enabled).toBe(true);
    expect(av.paypal.enabled).toBe(true);
    expect(av.whish.enabled).toBe(true);
    expect(av.western.enabled).toBe(true);
    expect(av.mamo.enabled).toBe(false);
  });

  it("USD + AE keeps card/wallet but disables PayPal (UAE-excluded) and Whish/Western (LB-only)", () => {
    const av = payMethodAvailability("USD", { country: "AE" });
    expect(av.card.enabled).toBe(true);
    expect(av.wallet.enabled).toBe(true);
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
  });

  it("GBP enables card/wallet, disables PayPal/Whish/Western/Mamo", () => {
    const av = payMethodAvailability("GBP", { country: "LB" });
    expect(av.card.enabled).toBe(true);
    expect(av.wallet.enabled).toBe(true);
    expect(av.paypal.enabled).toBe(false);
    expect(av.whish.enabled).toBe(false);
    expect(av.western.enabled).toBe(false);
    expect(av.mamo.enabled).toBe(false);
  });
});
