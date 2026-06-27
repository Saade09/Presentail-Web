/**
 * Tests for the deferred-payment staleness guard.
 *
 * Background
 * ----------
 * Redirect-based payments (Mamo / PayPal / the Stripe hosted-checkout fallback)
 * hand control to an external browser. A backgrounded app can resume that
 * browser session and return "success" long after the shopper abandoned it.
 * Without a max-age guard that stale return would be turned into a real
 * WooCommerce order. `isDeferredPaymentStale` is the pure decision and
 * `finalizeHostedPayment` is the single source of truth that the checkout
 * screen consumes verbatim at every payment call site.
 *
 * These tests assert the wiring guarantees the checkout screen depends on:
 *   1. A STALE deferred return never creates the order and routes to failure.
 *   2. A FRESH deferred return does create the order.
 *   3. Inline flows (no `deferredStartedAt`) are never gated.
 */
import { describe, expect, it, vi } from "vitest";

import {
  DEFERRED_PAYMENT_MAX_AGE_MS,
  finalizeHostedPayment,
  isDeferredPaymentStale,
} from "./payments";

describe("isDeferredPaymentStale", () => {
  const now = 1_000_000_000_000;

  it("returns false for a payment that just started", () => {
    expect(isDeferredPaymentStale(now, now)).toBe(false);
  });

  it("returns false at exactly the max-age boundary", () => {
    expect(isDeferredPaymentStale(now - DEFERRED_PAYMENT_MAX_AGE_MS, now)).toBe(false);
  });

  it("returns true one millisecond past the max-age boundary", () => {
    expect(isDeferredPaymentStale(now - DEFERRED_PAYMENT_MAX_AGE_MS - 1, now)).toBe(true);
  });

  it("returns true for a payment started well beyond the window", () => {
    expect(isDeferredPaymentStale(now - 60 * 60 * 1000, now)).toBe(true);
  });

  it("respects a custom max-age window", () => {
    const oneMinute = 60 * 1000;
    expect(isDeferredPaymentStale(now - oneMinute - 1, now, oneMinute)).toBe(true);
    expect(isDeferredPaymentStale(now - oneMinute, now, oneMinute)).toBe(false);
  });

  it("fails closed for a corrupted timestamp (treats it as stale)", () => {
    expect(isDeferredPaymentStale(0, now)).toBe(true);
    expect(isDeferredPaymentStale(-1, now)).toBe(true);
    expect(isDeferredPaymentStale(Number.NaN, now)).toBe(true);
    expect(isDeferredPaymentStale(Number.POSITIVE_INFINITY, now)).toBe(true);
  });

  it("defaults `now` to the current clock", () => {
    expect(isDeferredPaymentStale(Date.now())).toBe(false);
    expect(isDeferredPaymentStale(Date.now() - DEFERRED_PAYMENT_MAX_AGE_MS - 1000)).toBe(true);
  });
});

describe("finalizeHostedPayment — deferred (redirect) payments", () => {
  const now = 1_000_000_000_000;

  it("a STALE deferred return never creates the order and routes to failure", async () => {
    const createOrder = vi.fn(() => Promise.resolve(true));
    const onSettled = vi.fn();
    const onStale = vi.fn();

    await finalizeHostedPayment({
      deferredStartedAt: now - DEFERRED_PAYMENT_MAX_AGE_MS - 1,
      createOrder,
      onSettled,
      onStale,
      now,
    });

    // The order must NEVER be created from a stale redirect — this is the
    // regression the guard exists to prevent.
    expect(createOrder).not.toHaveBeenCalled();
    // The success path must not run either.
    expect(onSettled).not.toHaveBeenCalled();
    // The shopper is routed to the failure screen instead.
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it("a FRESH deferred return creates the order", async () => {
    const createOrder = vi.fn(() => Promise.resolve(true));
    const onSettled = vi.fn();
    const onStale = vi.fn();

    await finalizeHostedPayment({
      deferredStartedAt: now - 1000,
      createOrder,
      onSettled,
      onStale,
      now,
    });

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith(true);
    expect(onStale).not.toHaveBeenCalled();
  });

  it("propagates a failed order creation to onSettled (not onStale)", async () => {
    const createOrder = vi.fn(() => Promise.resolve(false));
    const onSettled = vi.fn();
    const onStale = vi.fn();

    await finalizeHostedPayment({
      deferredStartedAt: now - 1000,
      createOrder,
      onSettled,
      onStale,
      now,
    });

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith(false);
    expect(onStale).not.toHaveBeenCalled();
  });

  it("awaits createOrder before settling", async () => {
    const order: string[] = [];
    const createOrder = vi.fn(async () => {
      order.push("create");
      return true;
    });
    const onSettled = vi.fn(async () => {
      order.push("settle");
    });

    await finalizeHostedPayment({
      deferredStartedAt: now - 1000,
      createOrder,
      onSettled,
      onStale: vi.fn(),
      now,
    });

    expect(order).toEqual(["create", "settle"]);
  });
});

describe("finalizeHostedPayment — inline payments are never gated", () => {
  it("creates the order when no deferredStartedAt is supplied, even with an ancient clock", async () => {
    const createOrder = vi.fn(() => Promise.resolve(true));
    const onSettled = vi.fn();
    const onStale = vi.fn();

    // No deferredStartedAt = inline flow (card / native wallet / Whish /
    // Western Union). `now` is irrelevant — the gate must never engage.
    await finalizeHostedPayment({
      deferredStartedAt: undefined,
      createOrder,
      onSettled,
      onStale,
      now: Number.MAX_SAFE_INTEGER,
    });

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith(true);
    expect(onStale).not.toHaveBeenCalled();
  });
});
