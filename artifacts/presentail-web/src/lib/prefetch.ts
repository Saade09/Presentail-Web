/**
 * Prefetch a list of lazy-imported route modules during browser idle time so
 * their JS chunks are already in the module cache when the shopper navigates
 * to them.  Uses `requestIdleCallback` when available (all modern browsers)
 * and falls back to a short `setTimeout` in environments that lack it (Safari
 * < 16, server-side renders).
 *
 * Each import factory is called at most once — the browser / module cache
 * deduplicates subsequent calls, so there is no risk of double-fetching.
 *
 * Usage:
 *   prefetchRoutes([
 *     () => import("@/pages/Home"),
 *     () => import("@/pages/Shop"),
 *   ]);
 */

type ImportFactory = () => Promise<unknown>;

const ric: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number =
  typeof requestIdleCallback !== "undefined"
    ? (cb, opts) => requestIdleCallback(cb, opts)
    : (cb) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 200);

/**
 * Schedule prefetch of each module factory during idle time.
 * Returns a cleanup function that cancels any pending idle callbacks.
 */
export function prefetchRoutes(factories: ImportFactory[]): () => void {
  const handles: number[] = [];
  for (const factory of factories) {
    const handle = ric(() => {
      factory().catch(() => {});
    }, { timeout: 5000 });
    handles.push(handle);
  }

  const cancelRic: (handle: number) => void =
    typeof cancelIdleCallback !== "undefined"
      ? (h) => cancelIdleCallback(h)
      : (h) => clearTimeout(h);

  return () => {
    for (const h of handles) cancelRic(h);
  };
}
