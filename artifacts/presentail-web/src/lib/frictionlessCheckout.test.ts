import { describe, it, expect } from "vitest";
import { cartCheckoutCtaDecision } from "./frictionlessCheckout";

describe("cartCheckoutCtaDecision — cart checkout CTA routing", () => {
  it("flag on: guests navigate straight to /checkout (no popup)", () => {
    expect(
      cartCheckoutCtaDecision({ frictionlessEnabled: true, isSignedIn: false, authLoading: false }),
    ).toBe("navigate");
  });

  it("flag on: signed-in shoppers navigate", () => {
    expect(
      cartCheckoutCtaDecision({ frictionlessEnabled: true, isSignedIn: true, authLoading: false }),
    ).toBe("navigate");
  });

  it("flag on: navigates even while auth is still resolving", () => {
    expect(
      cartCheckoutCtaDecision({ frictionlessEnabled: true, isSignedIn: false, authLoading: true }),
    ).toBe("navigate");
  });

  it("flag off (legacy): signed-out shoppers get the login prompt", () => {
    expect(
      cartCheckoutCtaDecision({ frictionlessEnabled: false, isSignedIn: false, authLoading: false }),
    ).toBe("prompt");
  });

  it("flag off (legacy): signed-in shoppers navigate", () => {
    expect(
      cartCheckoutCtaDecision({ frictionlessEnabled: false, isSignedIn: true, authLoading: false }),
    ).toBe("navigate");
  });

  it("flag off (legacy): navigates optimistically while auth loads", () => {
    expect(
      cartCheckoutCtaDecision({ frictionlessEnabled: false, isSignedIn: false, authLoading: true }),
    ).toBe("navigate");
  });
});
