import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  WEB_PAY_METHODS,
  isApplePayBrowser,
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

describe("webVisiblePayMethods — platform gating", () => {
  it("Apple platform: google_pay is hidden, apple_pay is visible (LB × USD)", () => {
    const visible = webVisiblePayMethods({
      countryCode: "LB",
      activeCurrency: "USD",
      isApplePlatform: true,
    });
    expect(visible).not.toContain("google_pay");
    expect(visible).toContain("apple_pay");
    expect(visible).toEqual(["apple_pay", "card", "paypal", "whish"]);
  });

  it("Non-Apple platform (Windows / Android): apple_pay is hidden, google_pay is visible (LB × USD)", () => {
    const visible = webVisiblePayMethods({
      countryCode: "LB",
      activeCurrency: "USD",
      isApplePlatform: false,
    });
    expect(visible).not.toContain("apple_pay");
    expect(visible).toContain("google_pay");
    expect(visible).toEqual(["google_pay", "card", "paypal", "whish"]);
  });

  it("No platform context: both apple_pay and google_pay are visible (graceful SSR fallback)", () => {
    const visible = webVisiblePayMethods({
      countryCode: "LB",
      activeCurrency: "USD",
    });
    expect(visible).toContain("apple_pay");
    expect(visible).toContain("google_pay");
  });

  it("Apple platform: google_pay hidden across all countries and currencies", () => {
    for (const country of ["LB", "AE", "CY"]) {
      for (const currency of ["USD", "AED", "EUR"]) {
        const visible = webVisiblePayMethods({
          countryCode: country,
          activeCurrency: currency,
          isApplePlatform: true,
        });
        expect(visible).not.toContain("google_pay" as WebPaymentMethodId);
      }
    }
  });

  it("Non-Apple platform: apple_pay hidden across all countries and currencies", () => {
    for (const country of ["LB", "AE", "CY"]) {
      for (const currency of ["USD", "AED", "EUR"]) {
        const visible = webVisiblePayMethods({
          countryCode: country,
          activeCurrency: currency,
          isApplePlatform: false,
        });
        expect(visible).not.toContain("apple_pay" as WebPaymentMethodId);
      }
    }
  });

  it("defensive fallback to [card] still works on non-Apple when no method is visible", () => {
    expect(
      webVisiblePayMethods({
        countryCode: "LB",
        activeCurrency: "ZZZ",
        isApplePlatform: false,
      }),
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

// ---------------------------------------------------------------------------
// isApplePayBrowser — UA-level Safari gating
// ---------------------------------------------------------------------------
// These tests mock navigator to simulate real-world UA strings so the Safari
// detection logic (absent from higher-level context tests) is exercised.
describe("isApplePayBrowser — Safari gating", () => {
  let originalNavigator: Navigator;

  beforeEach(() => {
    originalNavigator = globalThis.navigator;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  function mockNavigator(ua: string, platform: string) {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: ua, platform },
      configurable: true,
      writable: true,
    });
  }

  it("Safari on Mac returns true (Apple Pay supported)", () => {
    mockNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      "MacIntel",
    );
    expect(isApplePayBrowser()).toBe(true);
  });

  it("Chrome on Mac returns false (Google Pay opens, not Apple Pay)", () => {
    mockNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "MacIntel",
    );
    expect(isApplePayBrowser()).toBe(false);
  });

  it("Chrome on iOS (CriOS) returns true (WebKit-backed, supports Apple Pay)", () => {
    mockNavigator(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1",
      "iPhone",
    );
    expect(isApplePayBrowser()).toBe(true);
  });

  it("Safari on iPhone returns true", () => {
    mockNavigator(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "iPhone",
    );
    expect(isApplePayBrowser()).toBe(true);
  });

  it("Firefox on Mac returns false (not WebKit/Safari)", () => {
    mockNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0",
      "MacIntel",
    );
    expect(isApplePayBrowser()).toBe(false);
  });

  it("Edge on Mac returns false (Chromium-based, opens Google Pay)", () => {
    mockNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
      "MacIntel",
    );
    expect(isApplePayBrowser()).toBe(false);
  });

  it("Chrome on Windows returns false (non-Apple platform)", () => {
    mockNavigator(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Win32",
    );
    expect(isApplePayBrowser()).toBe(false);
  });

  it("SSR (navigator undefined) returns false safely", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(isApplePayBrowser()).toBe(false);
  });
});

describe("webNextPaymentMethod — platform-aware auto-fallback", () => {
  it("Apple platform: default falls back away from google_pay to first visible method", () => {
    // On Apple, google_pay is hidden; if the current method becomes google_pay
    // (e.g. from a shared-default path), it should fall back to apple_pay.
    expect(
      webNextPaymentMethod("google_pay", {
        countryCode: "LB",
        activeCurrency: "USD",
        isApplePlatform: true,
      }),
    ).toBe("apple_pay");
  });

  it("Non-Apple platform: default falls back away from apple_pay to google_pay", () => {
    expect(
      webNextPaymentMethod("apple_pay", {
        countryCode: "LB",
        activeCurrency: "USD",
        isApplePlatform: false,
      }),
    ).toBe("google_pay");
  });

  it("Apple platform: auto-fallback never selects google_pay across full matrix", () => {
    const countries = ["LB", "AE", "CY"] as const;
    const currencies = ["USD", "AED", "EUR"];
    for (const country of countries) {
      for (const currency of currencies) {
        const visible = webVisiblePayMethods({
          countryCode: country,
          activeCurrency: currency,
          isApplePlatform: true,
        });
        for (const current of WEB_PAY_METHODS) {
          const next = webNextPaymentMethod(current, {
            countryCode: country,
            activeCurrency: currency,
            isApplePlatform: true,
          });
          expect(next).not.toBe("google_pay" as WebPaymentMethodId);
          expect(visible).toContain(next);
        }
      }
    }
  });

  it("Non-Apple platform: auto-fallback never selects apple_pay across full matrix", () => {
    const countries = ["LB", "AE", "CY"] as const;
    const currencies = ["USD", "AED", "EUR"];
    for (const country of countries) {
      for (const currency of currencies) {
        const visible = webVisiblePayMethods({
          countryCode: country,
          activeCurrency: currency,
          isApplePlatform: false,
        });
        for (const current of WEB_PAY_METHODS) {
          const next = webNextPaymentMethod(current, {
            countryCode: country,
            activeCurrency: currency,
            isApplePlatform: false,
          });
          expect(next).not.toBe("apple_pay" as WebPaymentMethodId);
          expect(visible).toContain(next);
        }
      }
    }
  });

  it("apple_pay preserved on Apple platform when already selected and visible", () => {
    expect(
      webNextPaymentMethod("apple_pay", {
        countryCode: "LB",
        activeCurrency: "USD",
        isApplePlatform: true,
      }),
    ).toBe("apple_pay");
  });

  it("google_pay preserved on non-Apple platform when already selected and visible", () => {
    expect(
      webNextPaymentMethod("google_pay", {
        countryCode: "LB",
        activeCurrency: "USD",
        isApplePlatform: false,
      }),
    ).toBe("google_pay");
  });
});
