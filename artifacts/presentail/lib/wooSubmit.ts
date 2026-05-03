/**
 * Resilient WooCommerce order submission.
 *
 * After a successful payment we must never silently lose the order. This
 * helper wraps the raw `createWooOrder` API call with:
 *   1. A per-attempt timeout (so a hung WC instance doesn't block forever).
 *   2. A single retry on failure / timeout / thrown error.
 *
 * Extracted from `app/checkout.tsx` so the retry semantics can be unit
 * tested deterministically (the real component closure pulls in too many
 * RN-only deps).
 */

export type SubmitWooOrderDeps = {
  /** Performs the actual API call. */
  createWooOrder: () => Promise<{ ok?: boolean } | null | undefined>;
  /** Per-attempt timeout in ms. Defaults to 15s. */
  attemptTimeoutMs?: number;
  /** Injectable for tests so we don't need real timers in hot paths. */
  setTimeoutFn?: (cb: () => void, ms: number) => unknown;
  /** Optional logger to record retry/failure. Defaults to noop. */
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
  /** Maximum total attempts (initial + retries). Defaults to 2. */
  maxAttempts?: number;
};

export async function submitWooOrderWithRetry(
  deps: SubmitWooOrderDeps,
): Promise<{ ok: boolean; attempts: number }> {
  const {
    createWooOrder,
    attemptTimeoutMs = 15_000,
    setTimeoutFn = setTimeout,
    warn = () => {},
    maxAttempts = 2,
  } = deps;

  const attemptOnce = async (): Promise<boolean> => {
    try {
      const timeout = new Promise<boolean>((resolve) =>
        setTimeoutFn(() => resolve(false), attemptTimeoutMs),
      );
      const request = createWooOrder().then((r) => !!r?.ok);
      return await Promise.race([request, timeout]);
    } catch (err) {
      warn("woo order creation threw", { err });
      return false;
    }
  };

  let attempts = 0;
  for (let i = 0; i < maxAttempts; i++) {
    attempts += 1;
    const ok = await attemptOnce();
    if (ok) return { ok: true, attempts };
    if (i + 1 < maxAttempts) {
      warn("woo order creation failed; retrying", { attempt: attempts });
    }
  }
  return { ok: false, attempts };
}
