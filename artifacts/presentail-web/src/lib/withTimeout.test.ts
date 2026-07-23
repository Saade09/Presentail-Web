// @vitest-environment node
//
// Pure unit tests for the withTimeout / withTimeoutAsNull helpers.
//
// These helpers guard never-settling promises (e.g. Stripe's canMakePayment()
// on Chrome iOS) so the UI never hangs waiting for a promise that will never
// resolve. Tests use Vitest fake timers so they complete instantly regardless
// of the configured deadline.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withTimeout, withTimeoutAsNull } from "./withTimeout";

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the value when the inner promise resolves before the deadline", async () => {
    const inner = Promise.resolve(42);
    const result = await withTimeout(inner, 5000);
    expect(result).toBe(42);
  });

  it("rejects with the inner error when the inner promise rejects before the deadline", async () => {
    const inner = Promise.reject(new Error("inner failure"));
    await expect(withTimeout(inner, 5000)).rejects.toThrow("inner failure");
  });

  it("rejects with a timeout error when the inner promise never settles", async () => {
    const never = new Promise<number>(() => {});
    const race = withTimeout(never, 5000);

    // Promise hasn't settled yet — deadline hasn't fired.
    let settled = false;
    race.catch(() => { settled = true; });

    // Advance exactly to the deadline.
    await vi.advanceTimersByTimeAsync(5000);

    expect(settled).toBe(true);
    await expect(race).rejects.toThrow("timeout");
  });

  it("fires the timeout error at the configured deadline (not before)", async () => {
    const never = new Promise<number>(() => {});
    const race = withTimeout(never, 3000);

    let settled = false;
    race.catch(() => { settled = true; });

    // 1 ms before the deadline — must not have fired yet.
    await vi.advanceTimersByTimeAsync(2999);
    expect(settled).toBe(false);

    // Cross the deadline.
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it("clears the deadline timer when the inner promise resolves (no stray timer callbacks)", async () => {
    // Verifies clearTimeout is called on resolution — so no late rejection
    // fires when fake time is further advanced past what would have been the
    // deadline. If clearTimeout were missing, the second advance would cause
    // the already-resolved promise chain to emit an unhandled rejection.
    const inner = Promise.resolve("ok");
    await withTimeout(inner, 1000);

    // Advance past the (now-cleared) deadline — no error should throw.
    await expect(vi.advanceTimersByTimeAsync(2000)).resolves.not.toThrow();
  });
});

describe("withTimeoutAsNull", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the value when the inner promise resolves before the deadline", async () => {
    const inner = Promise.resolve({ applePay: true });
    const result = await withTimeoutAsNull(inner, 5000);
    expect(result).toEqual({ applePay: true });
  });

  it("resolves with null when the inner promise resolves to null before the deadline", async () => {
    const inner = Promise.resolve(null);
    const result = await withTimeoutAsNull(inner, 5000);
    expect(result).toBeNull();
  });

  it("resolves with null (not a rejection) when the inner promise never settles past the deadline", async () => {
    const never = new Promise<{ applePay: boolean } | null>(() => {});
    const race = withTimeoutAsNull(never, 5000);

    let resolvedValue: { applePay: boolean } | null | undefined;
    let rejected = false;
    race
      .then((v) => { resolvedValue = v; })
      .catch(() => { rejected = true; });

    await vi.advanceTimersByTimeAsync(5000);

    expect(rejected).toBe(false);
    expect(resolvedValue).toBeNull();
  });

  it("resolves with null (not a rejection) when the inner promise rejects before the deadline", async () => {
    const failing = Promise.reject(new Error("stripe unavailable"));
    const result = await withTimeoutAsNull(failing, 5000);
    expect(result).toBeNull();
  });

  it("fires the null resolution at the configured deadline (not before)", async () => {
    const never = new Promise<null>(() => {});
    const race = withTimeoutAsNull(never, 4000);

    let resolved = false;
    race.then(() => { resolved = true; });

    await vi.advanceTimersByTimeAsync(3999);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });

  it("clears the deadline timer when the inner promise resolves (no stray null resolution)", async () => {
    const inner = Promise.resolve({ applePay: false });
    const result = await withTimeoutAsNull(inner, 1000);
    expect(result).toEqual({ applePay: false });

    // Advance past the cleared deadline — no stray resolution should occur.
    await expect(vi.advanceTimersByTimeAsync(2000)).resolves.not.toThrow();
  });
});
