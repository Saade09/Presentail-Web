import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Unit tests for firePostOrderAnalytics — the mobile post-purchase analytics
// helper extracted from checkout.tsx's finishAfterPaymentSettled() success path.
//
// This file is the primary CI signal for the mobile Facebook Purchase event.
// If trackFbMobileEvent("Purchase", …) is removed or altered in
// postOrderAnalytics.ts, these tests will fail. That guarantee is the core
// requirement of this task.
//
// Covered scenarios:
//   1. Signed-in path: trackFbMobileEvent("Purchase") fires with value,
//      currency, contentIds, and email when a signed-in shopper completes an order.
//   2. Guest path: trackFbMobileEvent("Purchase") fires without email when
//      the shopper is a guest (empty senderEmail).
//   3. Phone forwarding: when hasProfilePhone is true, profilePhone is sent;
//      when false, senderWhatsapp is combined with the dial prefix.
//   4. trackEvent("order_placed") fires on both paths.
//   5. eventId forwarding: when paymentRef is provided, a deterministic
//      "fbpurchase-{ref}" eventId is passed — matching the web pixel format
//      used by OrderConfirmed.tsx for Facebook CAPI deduplication.
//      When paymentRef is absent (offline orders), eventId is omitted.
// ---------------------------------------------------------------------------

const { mockTrackEvent, mockTrackFbMobileEvent } = vi.hoisted(() => ({
  mockTrackEvent: vi.fn(),
  mockTrackFbMobileEvent: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock("@/lib/fbPixel", () => ({
  trackFbMobileEvent: (...args: unknown[]) => mockTrackFbMobileEvent(...args),
}));

import { firePostOrderAnalytics } from "./postOrderAnalytics";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_PARAMS = {
  payMethod: "card",
  effectiveCountry: "lb",
  feesGrand: 85.5,
  currencyCode: "USD",
  contentIds: ["prod-001", "prod-002"],
  hasProfilePhone: false,
  profilePhone: undefined,
  senderWhatsapp: "",
  senderCountryDial: "+961",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Signed-in path — email present
// ---------------------------------------------------------------------------

describe("firePostOrderAnalytics — signed-in shopper", () => {
  it("calls trackFbMobileEvent('Purchase') with value, currency, contentIds, and email", () => {
    firePostOrderAnalytics({
      ...BASE_PARAMS,
      senderEmail: "jane@example.com",
    });

    expect(mockTrackFbMobileEvent).toHaveBeenCalledOnce();
    expect(mockTrackFbMobileEvent).toHaveBeenCalledWith("Purchase", {
      countryCode: "lb",
      value: 85.5,
      currency: "USD",
      contentIds: ["prod-001", "prod-002"],
      email: "jane@example.com",
      phone: undefined,
    });
  });

  it("calls trackEvent('order_placed') with payMethod and checkout surface", () => {
    firePostOrderAnalytics({
      ...BASE_PARAMS,
      senderEmail: "jane@example.com",
    });

    expect(mockTrackEvent).toHaveBeenCalledOnce();
    expect(mockTrackEvent).toHaveBeenCalledWith({
      name: "order_placed",
      surface: "checkout",
      action: "card",
    });
  });

  it("uses profilePhone when hasProfilePhone is true (signed-in with phone on file)", () => {
    firePostOrderAnalytics({
      ...BASE_PARAMS,
      senderEmail: "jane@example.com",
      hasProfilePhone: true,
      profilePhone: "+96170123456",
    });

    expect(mockTrackFbMobileEvent).toHaveBeenCalledWith(
      "Purchase",
      expect.objectContaining({ phone: "+96170123456" }),
    );
  });

  it("sends phone as undefined when hasProfilePhone is true but profilePhone is undefined", () => {
    firePostOrderAnalytics({
      ...BASE_PARAMS,
      senderEmail: "jane@example.com",
      hasProfilePhone: true,
      profilePhone: undefined,
    });

    expect(mockTrackFbMobileEvent).toHaveBeenCalledWith(
      "Purchase",
      expect.objectContaining({ phone: undefined }),
    );
  });
});

// ---------------------------------------------------------------------------
// Guest path — no email
// ---------------------------------------------------------------------------

describe("firePostOrderAnalytics — guest shopper", () => {
  it("calls trackFbMobileEvent('Purchase') without email field for a guest (empty senderEmail)", () => {
    firePostOrderAnalytics({
      ...BASE_PARAMS,
      senderEmail: "",
    });

    expect(mockTrackFbMobileEvent).toHaveBeenCalledOnce();
    const [eventName, eventParams] = mockTrackFbMobileEvent.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(eventName).toBe("Purchase");
    expect(eventParams.email).toBeUndefined();
    expect(eventParams.value).toBe(85.5);
    expect(eventParams.currency).toBe("USD");
  });

  it("combines senderWhatsapp with dial prefix for phone when hasProfilePhone is false", () => {
    firePostOrderAnalytics({
      ...BASE_PARAMS,
      senderEmail: "",
      hasProfilePhone: false,
      senderWhatsapp: "70123456",
      senderCountryDial: "+961",
    });

    expect(mockTrackFbMobileEvent).toHaveBeenCalledWith(
      "Purchase",
      expect.objectContaining({ phone: "+961 70123456" }),
    );
  });

  it("sends phone as undefined for a guest with no WhatsApp number entered", () => {
    firePostOrderAnalytics({
      ...BASE_PARAMS,
      senderEmail: "",
      hasProfilePhone: false,
      senderWhatsapp: "",
    });

    expect(mockTrackFbMobileEvent).toHaveBeenCalledWith(
      "Purchase",
      expect.objectContaining({ phone: undefined }),
    );
  });

  it("calls trackEvent('order_placed') for a guest shopper too", () => {
    firePostOrderAnalytics({
      ...BASE_PARAMS,
      senderEmail: "",
    });

    expect(mockTrackEvent).toHaveBeenCalledOnce();
    expect(mockTrackEvent).toHaveBeenCalledWith({
      name: "order_placed",
      surface: "checkout",
      action: "card",
    });
  });
});

// ---------------------------------------------------------------------------
// UAE path — different currency and countryCode
// ---------------------------------------------------------------------------

describe("firePostOrderAnalytics — UAE order", () => {
  it("forwards UAE countryCode and AED currency to trackFbMobileEvent", () => {
    firePostOrderAnalytics({
      payMethod: "mamo",
      effectiveCountry: "ae",
      feesGrand: 200,
      currencyCode: "AED",
      contentIds: ["prod-uae-1"],
      senderEmail: "shopper@example.ae",
      hasProfilePhone: false,
      profilePhone: undefined,
      senderWhatsapp: "",
      senderCountryDial: "+971",
    });

    expect(mockTrackFbMobileEvent).toHaveBeenCalledWith("Purchase", {
      countryCode: "ae",
      value: 200,
      currency: "AED",
      contentIds: ["prod-uae-1"],
      email: "shopper@example.ae",
      phone: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// eventId forwarding for Facebook CAPI deduplication
// ---------------------------------------------------------------------------

describe("firePostOrderAnalytics — eventId forwarding", () => {
  it("passes 'fbpurchase-{ref}' as eventId when paymentRef is provided — matching the web pixel format", () => {
    firePostOrderAnalytics({
      ...BASE_PARAMS,
      senderEmail: "jane@example.com",
      paymentRef: "pi_3Abc123",
    });

    const eventParams = mockTrackFbMobileEvent.mock.calls[0]?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(eventParams).toBeDefined();
    expect(eventParams?.eventId).toBe("fbpurchase-pi_3Abc123");
  });

  it("omits eventId when paymentRef is not provided (offline payment methods)", () => {
    firePostOrderAnalytics({
      ...BASE_PARAMS,
      senderEmail: "jane@example.com",
    });

    const eventParams = mockTrackFbMobileEvent.mock.calls[0]?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(eventParams).toBeDefined();
    // Offline orders (Whish, Western Union) have no paymentRef and no
    // corresponding web pixel event, so deduplication is not needed.
    expect(eventParams?.eventId).toBeUndefined();
  });

  it("does not include event_id (snake_case) — only eventId (camelCase) is forwarded", () => {
    firePostOrderAnalytics({
      ...BASE_PARAMS,
      senderEmail: "jane@example.com",
      paymentRef: "mamo_ref_xyz",
    });

    const eventParams = mockTrackFbMobileEvent.mock.calls[0]?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(eventParams).toBeDefined();
    expect(eventParams).not.toHaveProperty("event_id");
  });
});
