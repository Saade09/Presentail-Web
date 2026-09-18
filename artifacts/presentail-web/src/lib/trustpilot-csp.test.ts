import { describe, expect, it } from "vitest";
import { STOREFRONT_CONTENT_SECURITY_POLICY } from "../../serve-security.mjs";

describe("storefront Trustpilot CSP", () => {
  it("allows only the official Trustpilot bootstrap and widget frame origin", () => {
    expect(STOREFRONT_CONTENT_SECURITY_POLICY).toContain(
      "https://widget.trustpilot.com",
    );
    expect(STOREFRONT_CONTENT_SECURITY_POLICY).toContain(
      "script-src 'self'",
    );
    expect(STOREFRONT_CONTENT_SECURITY_POLICY).toContain(
      "frame-src 'self' https://widget.trustpilot.com",
    );
    expect(STOREFRONT_CONTENT_SECURITY_POLICY).not.toContain(
      "https://www.trustpilot.com",
    );
  });
});