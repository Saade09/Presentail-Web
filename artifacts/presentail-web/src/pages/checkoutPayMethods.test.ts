import { describe, expect, it } from "vitest";

import {
  WEB_PAY_METHODS,
  webNextPaymentMethod,
  webPaymentMethodLabelKey,
  webVisiblePayMethods,
  type WebPaymentMethodId,
} from "./checkoutPayMethods";

// The matrix the task spec calls out explicitly. Captures every observable
// shape: which tiles are visible, in which order, and what the Mamo tile is
// labelled as (since it doubles as the AED card option).
describe("webVisiblePayMethods — visibility matrix", () => {
  it("LB × USD: apple_pay first, then google_pay, card, paypal, whish (no Mamo, no Western Union)", () => {
    expect(
      webVisiblePayMethods({ countryCode: "LB", activeCurrency: "USD" }),
    ).toEqual(["apple_pay", "google_pay", "card", "paypal", "whish"]);
  });

  it("AE × AED: apple_pay, google_pay, card via Gulf Stripe account (Mamo disabled; PayPal UAE-excluded)", () => {
    expect(
      webVisiblePayMethods({ countryCode: "AE", activeCurrency: "AED" }),
    ).toEqual(["apple_pay", "google_pay", "card"]);
  });

  it("AE × USD: apple_pay, google_pay, then card (PayPal UAE-excluded, Whish LB-only, Mamo AED-only)", () => {
    expect(
      webVisiblePayMethods({ countryCode: "AE", activeCurrency: "USD" }),
    ).toEqual(["apple_pay", "google_pay", "card"]);
  });

  it("CY × EUR: apple_pay, google_pay, card, paypal (Whish/Mamo hidden; PayPal supports EUR)", () => {
    expect(
      webVisiblePayMethods({ countryCode: "CY", activeCurrency: "EUR" }),
    ).toEqual(["apple_pay", "google_pay", "card", "paypal"]);
  });

  it("CY × USD: apple_pay, google_pay, card, paypal (Whish/Western LB-only, Mamo AED-only)", () => {
    expect(
      webVisiblePayMethods({ countryCode: "CY", activeCurrency: "USD" }),
    ).toEqual(["apple_pay", "google_pay", "card", "paypal"]);
  });

  it("never returns Western Union (web checkout doesn't implement it)", () => {
    for (const country of ["LB", "AE", "CY"]) {
      for (const currency of ["USD", "AED", "EUR", "GBP"]) {
        const visible = webVisiblePayMethods({
          countryCode: country,
          activeCurrency: currency,
        });
        expect(visible).not.toContain("western" as WebPaymentMethodId);
      }
    }
  });

  it("falls back to [card] if no method would otherwise be visible", () => {
    // Unsupported currency — the shared table excludes everything, so the
    // defensive fallback in `webVisiblePayMethods` should keep the picker
    // non-empty.
    expect(
      webVisiblePayMethods({ countryCode: "LB", activeCurrency: "ZZZ" }),
    ).toEqual(["card"]);
  });
});

describe("webPaymentMethodLabelKey — Mamo flips to 'Pay by card' in AED", () => {
  it("Mamo label is 'checkout.pay.payByCard' in AED", () => {
    expect(webPaymentMethodLabelKey("mamo", "AED")).toBe(
      "checkout.pay.payByCard",
    );
  });

  it("Mamo label is the regular 'checkout.pay.mamo' for any non-AED currency", () => {
    expect(webPaymentMethodLabelKey("mamo", "USD")).toBe("checkout.pay.mamo");
    expect(webPaymentMethodLabelKey("mamo", "EUR")).toBe("checkout.pay.mamo");
    expect(webPaymentMethodLabelKey("mamo", "GBP")).toBe("checkout.pay.mamo");
  });

  it("non-Mamo tiles use their fixed label keys regardless of currency", () => {
    for (const currency of ["USD", "AED", "EUR"]) {
      expect(webPaymentMethodLabelKey("card", currency)).toBe(
        "checkout.pay.card",
      );
      expect(webPaymentMethodLabelKey("paypal", currency)).toBe(
        "checkout.pay.paypal",
      );
      expect(webPaymentMethodLabelKey("apple_pay", currency)).toBe(
        "checkout.pay.apple_pay",
      );
      expect(webPaymentMethodLabelKey("google_pay", currency)).toBe(
        "checkout.pay.google_pay",
      );
      expect(webPaymentMethodLabelKey("whish", currency)).toBe(
        "checkout.pay.whish",
      );
    }
  });
});

describe("webNextPaymentMethod — auto-fallback never picks a hidden tile", () => {
  it("preserves the selection when it is still visible", () => {
    expect(
      webNextPaymentMethod("paypal", {
        countryCode: "LB",
        activeCurrency: "USD",
      }),
    ).toBe("paypal");
    expect(
      webNextPaymentMethod("whish", {
        countryCode: "LB",
        activeCurrency: "USD",
      }),
    ).toBe("whish");
    expect(
      webNextPaymentMethod("apple_pay", {
        countryCode: "LB",
        activeCurrency: "USD",
      }),
    ).toBe("apple_pay");
    expect(
      webNextPaymentMethod("google_pay", {
        countryCode: "LB",
        activeCurrency: "USD",
      }),
    ).toBe("google_pay");
  });

  it("LB→AE flip drops Whish to apple_pay (Whish is LB-only; apple_pay now works for AED)", () => {
    expect(
      webNextPaymentMethod("whish", {
        countryCode: "AE",
        activeCurrency: "AED",
      }),
    ).toBe("apple_pay");
    expect(
      webNextPaymentMethod("whish", {
        countryCode: "AE",
        activeCurrency: "USD",
      }),
    ).toBe("apple_pay");
  });

  it("AED: card is preserved (Gulf Stripe account settles AED; Mamo disabled)", () => {
    expect(
      webNextPaymentMethod("card", {
        countryCode: "AE",
        activeCurrency: "AED",
      }),
    ).toBe("card");
  });

  it("PayPal hidden in UAE/USD: falls back to apple_pay", () => {
    expect(
      webNextPaymentMethod("paypal", {
        countryCode: "AE",
        activeCurrency: "USD",
      }),
    ).toBe("apple_pay");
  });

  it("apple_pay is preserved in AED (Gulf Stripe account supports AED)", () => {
    expect(
      webNextPaymentMethod("apple_pay", {
        countryCode: "AE",
        activeCurrency: "AED",
      }),
    ).toBe("apple_pay");
  });

  it("google_pay is preserved in AED (Gulf Stripe account supports AED)", () => {
    expect(
      webNextPaymentMethod("google_pay", {
        countryCode: "AE",
        activeCurrency: "AED",
      }),
    ).toBe("google_pay");
  });

  it("auto-fallback never selects a hidden method across the LB/AE/CY × USD/AED/EUR matrix", () => {
    const countries = ["LB", "AE", "CY"] as const;
    const currencies = ["USD", "AED", "EUR"];
    for (const country of countries) {
      for (const currency of currencies) {
        const visible = webVisiblePayMethods({
          countryCode: country,
          activeCurrency: currency,
        });
        for (const current of WEB_PAY_METHODS) {
          const next = webNextPaymentMethod(current, {
            countryCode: country,
            activeCurrency: currency,
          });
          expect(visible).toContain(next);
        }
      }
    }
  });

  it("never returns Western Union even if the shared default ever did", () => {
    for (const country of ["LB", "AE", "CY"] as const) {
      for (const currency of ["USD", "AED", "EUR", "GBP"]) {
        for (const current of WEB_PAY_METHODS) {
          const next = webNextPaymentMethod(current, {
            countryCode: country,
            activeCurrency: currency,
          });
          expect(next).not.toBe("western" as WebPaymentMethodId);
        }
      }
    }
  });
});
