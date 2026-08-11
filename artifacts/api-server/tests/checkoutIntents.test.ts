/**
 * Unit tests for checkoutIntents atomic claim-release pattern.
 *
 * Coverage:
 *   - consumePaymentIntent: atomically claims single-use; concurrent callers
 *     get null (duplicate prevention).
 *   - releasePaymentIntent: un-claims after a definitively failed write, enabling
 *     retry without restarting the payment.
 *   - peekAndValidatePaymentIntent: validates without consuming (non-atomic; for
 *     diagnostic use only — never use in concurrent-safe paths).
 *   - markPaymentIntentConsumed: marks consumed after a successful write.
 *   - Full ordering guarantees: claim → write-succeeds → duplicate rejected;
 *     claim → write-fails → release → retry succeeds.
 */

import { describe, expect, it } from "vitest";
import {
  storePaymentIntent,
  consumePaymentIntent,
  releasePaymentIntent,
  peekAndValidatePaymentIntent,
  markPaymentIntentConsumed,
  peekPaymentIntent,
} from "../src/lib/checkoutIntents";

function makeSnapshot() {
  return {
    items: [{ wcId: 1, quantity: 1, priceUsd: 10 }],
    district: "Beirut",
    expressDelivery: false,
  };
}

function storeCs(paymentRef: string, orderId: string) {
  storePaymentIntent({
    orderId,
    paymentRef,
    provider: "cybersource",
    currency: "USD",
    totalUsd: 15,
    snapshot: makeSnapshot(),
    paymentMeta: { csStatus: "AUTHORIZED" },
  });
}

// ---------------------------------------------------------------------------
// Atomic claim via consumePaymentIntent (concurrent safety)
// ---------------------------------------------------------------------------

describe("consumePaymentIntent + releasePaymentIntent — atomic claim-release", () => {
  it("first caller claims the intent; second concurrent caller is rejected", () => {
    storeCs("cs_concurrent_1", "order_c1");

    // Caller A claims (simulating the first simultaneous request)
    const intentA = consumePaymentIntent("cs_concurrent_1", "order_c1");
    expect(intentA).not.toBeNull();

    // Caller B arrives before caller A has finished (simulating a concurrent
    // request — Node.js is single-threaded so consumePaymentIntent is atomic)
    const intentB = consumePaymentIntent("cs_concurrent_1", "order_c1");
    expect(intentB).toBeNull(); // already consumed by A

    // The store entry is still marked consumed — B cannot sneak through
    expect(peekPaymentIntent("cs_concurrent_1")?.consumed).toBe(true);
  });

  it("release after definitive write failure allows a retry to claim", () => {
    storeCs("cs_release_retry_1", "order_r1");

    // Attempt 1: claim atomically
    const claim1 = consumePaymentIntent("cs_release_retry_1", "order_r1");
    expect(claim1).not.toBeNull();

    // OS write fails definitively — release so client can retry
    releasePaymentIntent("cs_release_retry_1");
    expect(peekPaymentIntent("cs_release_retry_1")?.consumed).toBe(false);

    // Retry: claim again
    const claim2 = consumePaymentIntent("cs_release_retry_1", "order_r1");
    expect(claim2).not.toBeNull();

    // OS write succeeds — intent stays consumed
    expect(peekPaymentIntent("cs_release_retry_1")?.consumed).toBe(true);
  });

  it("release is a no-op when the intent does not exist", () => {
    expect(() => releasePaymentIntent("no_such_ref")).not.toThrow();
  });

  it("release is a no-op when the intent is not consumed", () => {
    storeCs("cs_release_noop_1", "order_rn1");
    // Don't consume — intent is already unconsumed
    expect(() => releasePaymentIntent("cs_release_noop_1")).not.toThrow();
    // Still unconsumed
    expect(peekPaymentIntent("cs_release_noop_1")?.consumed).toBe(false);
  });

  it("full success path: claim → write succeeds → duplicate rejected", () => {
    storeCs("cs_full_success_1", "order_fs1");

    // Step 1: atomic claim
    const intent = consumePaymentIntent("cs_full_success_1", "order_fs1");
    expect(intent).not.toBeNull();

    // Step 2: write succeeds — intent stays consumed (no release)
    // Step 3: duplicate submission from same or concurrent request is rejected
    expect(consumePaymentIntent("cs_full_success_1", "order_fs1")).toBeNull();
    expect(peekAndValidatePaymentIntent("cs_full_success_1", "order_fs1")).toBeNull();
  });

  it("write-fails then retry path: claim → release → retry succeeds → duplicate rejected", () => {
    storeCs("cs_fail_retry_1", "order_fr1");

    // Attempt 1: claim
    expect(consumePaymentIntent("cs_fail_retry_1", "order_fr1")).not.toBeNull();

    // Definitive failure — release
    releasePaymentIntent("cs_fail_retry_1");

    // Retry (attempt 2): claim again
    expect(consumePaymentIntent("cs_fail_retry_1", "order_fr1")).not.toBeNull();

    // Success — intent consumed. Concurrent/duplicate attempt rejected.
    expect(consumePaymentIntent("cs_fail_retry_1", "order_fr1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// peekAndValidatePaymentIntent (non-atomic; diagnostic use)
// ---------------------------------------------------------------------------

describe("peekAndValidatePaymentIntent", () => {
  it("returns the intent without marking it consumed", () => {
    storeCs("cs_peek_1", "order_p1");

    const intent = peekAndValidatePaymentIntent("cs_peek_1", "order_p1");
    expect(intent).not.toBeNull();
    expect(intent?.consumed).toBe(false);
    expect(peekPaymentIntent("cs_peek_1")?.consumed).toBe(false);
  });

  it("returns null when orderId does not match", () => {
    storeCs("cs_peek_2", "order_p2");
    expect(peekAndValidatePaymentIntent("cs_peek_2", "wrong_order")).toBeNull();
  });

  it("returns null when the intent does not exist", () => {
    expect(peekAndValidatePaymentIntent("nonexistent_ref", "order_x")).toBeNull();
  });

  it("returns null after the intent has been consumed", () => {
    storeCs("cs_peek_3", "order_p3");
    consumePaymentIntent("cs_peek_3", "order_p3");
    expect(peekAndValidatePaymentIntent("cs_peek_3", "order_p3")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// markPaymentIntentConsumed (non-atomic mark; for deferred consumption use)
// ---------------------------------------------------------------------------

describe("markPaymentIntentConsumed", () => {
  it("marks the intent consumed so consumePaymentIntent subsequently returns null", () => {
    storeCs("cs_mark_1", "order_mk1");

    markPaymentIntentConsumed("cs_mark_1");
    expect(consumePaymentIntent("cs_mark_1", "order_mk1")).toBeNull();
  });

  it("is a no-op when the intent does not exist", () => {
    expect(() => markPaymentIntentConsumed("no_such_ref")).not.toThrow();
  });

  it("is idempotent (calling twice does not throw)", () => {
    storeCs("cs_mark_2", "order_mk2");
    markPaymentIntentConsumed("cs_mark_2");
    expect(() => markPaymentIntentConsumed("cs_mark_2")).not.toThrow();
    expect(peekAndValidatePaymentIntent("cs_mark_2", "order_mk2")).toBeNull();
  });
});
