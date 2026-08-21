/**
 * Races `promise` against a `ms`-millisecond deadline. If the deadline fires
 * first, the returned promise rejects with an Error("timeout"). Use this to
 * guard any promise that may never settle — e.g. Stripe's canMakePayment() on
 * Chrome iOS, which can hang indefinitely when the Apple Pay service is slow.
 */
export class TimeoutError extends Error {
  constructor() {
    super("timeout");
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });
}

/**
 * Like withTimeout, but resolves with `null` on deadline instead of rejecting.
 * Use for canMakePayment() calls where a timeout should be treated identically
 * to a `null` result (triggering the retry / give-up path, not the catch path).
 */
export function withTimeoutAsNull<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const id = setTimeout(() => resolve(null), ms);
    promise.then(
      (v) => { clearTimeout(id); resolve(v); },
      () => { clearTimeout(id); resolve(null); },
    );
  });
}
