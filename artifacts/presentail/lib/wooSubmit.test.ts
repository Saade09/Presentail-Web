import { describe, expect, it, vi } from "vitest";

import { submitWooOrderWithRetry } from "./wooSubmit";

// Use a tiny timeout so racey tests still finish quickly when we want
// the timeout branch to win.
const TINY_TIMEOUT_MS = 5;

describe("submitWooOrderWithRetry", () => {
  it("returns ok on first success without retrying", async () => {
    const create = vi.fn().mockResolvedValue({ ok: true });
    const result = await submitWooOrderWithRetry({ createWooOrder: create });
    expect(result).toEqual({ ok: true, attempts: 1 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries once when the first call resolves with ok=false", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    const result = await submitWooOrderWithRetry({ createWooOrder: create });
    expect(result).toEqual({ ok: true, attempts: 2 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("returns failure after both attempts fail (ok=false twice)", async () => {
    const create = vi.fn().mockResolvedValue({ ok: false });
    const warn = vi.fn();
    const result = await submitWooOrderWithRetry({
      createWooOrder: create,
      warn,
    });
    expect(result).toEqual({ ok: false, attempts: 2 });
    expect(create).toHaveBeenCalledTimes(2);
    // Should have logged the retry between attempts.
    expect(warn).toHaveBeenCalled();
  });

  it("treats a hung request as a timeout failure and retries", async () => {
    // First call hangs forever, second returns ok.
    const create = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({ ok: true });
    const result = await submitWooOrderWithRetry({
      createWooOrder: create,
      attemptTimeoutMs: TINY_TIMEOUT_MS,
    });
    expect(result).toEqual({ ok: true, attempts: 2 });
  });

  it("returns failure when both attempts time out", async () => {
    const create = vi.fn().mockImplementation(() => new Promise(() => {}));
    const result = await submitWooOrderWithRetry({
      createWooOrder: create,
      attemptTimeoutMs: TINY_TIMEOUT_MS,
    });
    expect(result).toEqual({ ok: false, attempts: 2 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("treats a thrown error as a failed attempt and retries", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ ok: true });
    const warn = vi.fn();
    const result = await submitWooOrderWithRetry({
      createWooOrder: create,
      warn,
    });
    expect(result).toEqual({ ok: true, attempts: 2 });
    expect(warn).toHaveBeenCalledWith(
      "woo order creation threw",
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });

  it("returns failure when both attempts throw", async () => {
    const create = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await submitWooOrderWithRetry({ createWooOrder: create });
    expect(result).toEqual({ ok: false, attempts: 2 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("respects maxAttempts when overridden (no retry)", async () => {
    const create = vi.fn().mockResolvedValue({ ok: false });
    const result = await submitWooOrderWithRetry({
      createWooOrder: create,
      maxAttempts: 1,
    });
    expect(result).toEqual({ ok: false, attempts: 1 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("treats a null/undefined response as failure", async () => {
    const create = vi.fn().mockResolvedValue(null);
    const result = await submitWooOrderWithRetry({
      createWooOrder: create,
      maxAttempts: 1,
    });
    expect(result).toEqual({ ok: false, attempts: 1 });
  });
});
