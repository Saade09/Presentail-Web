// Regression tests for the payment redirect-URL validator.
//
// Incident (July 2026): the "payment-return" kind required the path to start
// with /api/payment/return. Mobile sends that bridge URL, but the WEB checkout
// has always sent ordinary page URLs (e.g. https://presentail.com/order-confirmed),
// so every web PayPal/Mamo/Tabby payment was rejected with an instant 400 and
// live customers could not pay. The open-redirect protection comes from the
// host allowlist, not the path — these tests pin the corrected contract.

import { describe, it, expect } from "vitest";
import { validateRedirectUrl } from "../src/lib/validateRedirectUrl";

describe("validateRedirectUrl", () => {
  describe('kind "payment-return" (PayPal / Mamo / Tabby)', () => {
    it("accepts a web page return URL on presentail.com (web checkout)", () => {
      expect(
        validateRedirectUrl("https://presentail.com/order-confirmed?status=success", "payment-return"),
      ).toBeNull();
    });

    it("accepts a locale-prefixed web page URL", () => {
      expect(
        validateRedirectUrl("https://presentail.com/en-lb/beirut/order-confirmed?status=failed", "payment-return"),
      ).toBeNull();
    });

    it("accepts the mobile deep-link bridge URL", () => {
      expect(
        validateRedirectUrl(
          "https://presentail.com/api/payment/return?deeplink=presentail%3A%2F%2Fpayment-return",
          "payment-return",
        ),
      ).toBeNull();
    });

    it("rejects non-allowlisted hosts (open-redirect protection)", () => {
      expect(validateRedirectUrl("https://evil.example.com/order-confirmed", "payment-return")).toMatch(
        /not permitted/,
      );
    });

    it("rejects plain HTTP on non-localhost hosts", () => {
      expect(validateRedirectUrl("http://presentail.com/order-confirmed", "payment-return")).toMatch(/HTTPS/);
    });

    it("rejects unparseable URLs and empty strings", () => {
      expect(validateRedirectUrl("not a url", "payment-return")).toMatch(/Invalid redirect URL/);
      expect(validateRedirectUrl("", "payment-return")).toMatch(/non-empty/);
    });

    it("allows localhost for development", () => {
      expect(validateRedirectUrl("http://localhost:3000/order-confirmed", "payment-return")).toBeNull();
    });
  });

  describe('kind "web" (Stripe success/cancel)', () => {
    it("accepts allowed-host HTTPS URLs", () => {
      expect(validateRedirectUrl("https://www.presentail.com/order-confirmed", "web")).toBeNull();
    });

    it("rejects non-allowlisted hosts", () => {
      expect(validateRedirectUrl("https://attacker.test/", "web")).toMatch(/not permitted/);
    });
  });
});
