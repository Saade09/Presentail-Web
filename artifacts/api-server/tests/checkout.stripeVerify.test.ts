// Tests for verifyStripePaymentIntentPaid — the server-side guard that confirms
// a Stripe PaymentIntent was successfully charged before an order is marked paid.
//
// This function is the critical piece: a regression here means orders could be
// created without the card being charged, or shoppers could be charged but have
// their order lost.
//
// Test card semantics (no real network calls are made):
//   4000002760003184 → always requires 3DS (the PI status goes
//     requires_action → succeeded after the challenge)
//   4000000000003220 → 3DS optional; PI goes directly to succeeded
//
// All tests spy on globalThis.fetch so no real Stripe calls are made.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyStripePaymentIntentPaid } from "../src/lib/catalog";

const FAKE_KEY = "sk_test_abcdef";

function mockStripePI(
  status: string,
  orderId: string,
  httpStatus = 200,
): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        status,
        metadata: { orderId },
      }),
      { status: httpStatus, headers: { "Content-Type": "application/json" } },
    ),
  );
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = FAKE_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.STRIPE_SECRET_KEY;
});

describe("verifyStripePaymentIntentPaid", () => {
  // ── Happy path: card charged directly (no 3DS) ────────────────────────
  // Corresponds to the 4000000000003220 test card — succeeds immediately.

  it("returns true when PI status is 'succeeded' and orderId matches (direct charge, no 3DS)", async () => {
    mockStripePI("succeeded", "web-order-001");
    const result = await verifyStripePaymentIntentPaid("pi_direct_charge", "web-order-001");
    expect(result).toBe(true);
  });

  it("calls the Stripe PaymentIntent endpoint (not the Checkout Session endpoint)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: "succeeded", metadata: { orderId: "web-order-001" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await verifyStripePaymentIntentPaid("pi_direct_abc", "web-order-001");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/payment_intents/pi_direct_abc"),
      expect.any(Object),
    );
    // Confirm it is NOT calling the Checkout Session endpoint.
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("/checkout/sessions"),
      expect.any(Object),
    );
  });

  // ── 3DS required path ─────────────────────────────────────────────────
  // 4000002760003184 card: requires_action → shopper authenticates →
  // PI becomes succeeded. The SERVER only sees the final PI state.

  it("returns true when PI status is 'succeeded' after 3DS authentication", async () => {
    // The client's stripe.handleNextAction() already ran; the server only
    // needs to confirm the final state is 'succeeded'.
    mockStripePI("succeeded", "web-order-3ds");
    const result = await verifyStripePaymentIntentPaid("pi_3ds_succeeded", "web-order-3ds");
    expect(result).toBe(true);
  });

  // ── Failure paths ─────────────────────────────────────────────────────

  it("returns false when PI status is 'requires_payment_method' (3DS cancelled or card declined)", async () => {
    // This matches the state after a failed 3DS challenge: the issuer left
    // the PI in requires_payment_method. No order should be created.
    mockStripePI("requires_payment_method", "web-order-3ds-fail");
    const result = await verifyStripePaymentIntentPaid("pi_3ds_cancelled", "web-order-3ds-fail");
    expect(result).toBe(false);
  });

  it("returns false when PI status is 'requires_action' (3DS not yet resolved)", async () => {
    // Edge case: the server is somehow called before the client finished 3DS.
    mockStripePI("requires_action", "web-order-pending");
    const result = await verifyStripePaymentIntentPaid("pi_pending", "web-order-pending");
    expect(result).toBe(false);
  });

  it("returns false when PI status is 'canceled'", async () => {
    mockStripePI("canceled", "web-order-001");
    const result = await verifyStripePaymentIntentPaid("pi_canceled", "web-order-001");
    expect(result).toBe(false);
  });

  // ── Security: replay-attack prevention ───────────────────────────────

  it("returns false when the PI orderId metadata does not match (replay attack)", async () => {
    // An attacker pays for a cheap order, then tries to reuse that PI for an
    // expensive order. The orderId mismatch blocks the replay.
    mockStripePI("succeeded", "web-order-cheap");
    const result = await verifyStripePaymentIntentPaid("pi_replayed", "web-order-expensive");
    expect(result).toBe(false);
  });

  // ── Robustness ────────────────────────────────────────────────────────

  it("returns false when Stripe API returns HTTP 404 (no such PaymentIntent)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: "No such payment_intent: 'pi_nonexistent'" } }),
        { status: 404 },
      ),
    );
    const result = await verifyStripePaymentIntentPaid("pi_nonexistent", "web-order-001");
    expect(result).toBe(false);
  });

  it("returns false when STRIPE_SECRET_KEY is not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await verifyStripePaymentIntentPaid("pi_any", "web-order-001");
    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns false when paymentIntentId is an empty string", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await verifyStripePaymentIntentPaid("", "web-order-001");
    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns false when the Stripe fetch throws a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network failure"));
    const result = await verifyStripePaymentIntentPaid("pi_network_err", "web-order-001");
    expect(result).toBe(false);
  });

  it("sends the secret key in a Basic auth header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: "succeeded", metadata: { orderId: "web-order-001" } }),
        { status: 200 },
      ),
    );
    await verifyStripePaymentIntentPaid("pi_key_check", "web-order-001");
    const [, init] = fetchSpy.mock.calls[0];
    const authHeader = (init as RequestInit)?.headers as Record<string, string>;
    const expectedEncoded = Buffer.from(`${FAKE_KEY}:`).toString("base64");
    expect(authHeader["Authorization"]).toBe(`Basic ${expectedEncoded}`);
  });
});
