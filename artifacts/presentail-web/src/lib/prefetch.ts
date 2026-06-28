type Loader = () => Promise<unknown>;

const prefetched = new Set<Loader>();

const useRic = typeof requestIdleCallback === "function";

function idle(cb: () => void): () => void {
  if (useRic) {
    const id = requestIdleCallback(cb, { timeout: 3000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(cb, 300);
  return () => clearTimeout(id);
}

/**
 * Prefetch a list of dynamic-import loaders during browser idle time.
 * Each loader is called at most once regardless of how many times this
 * function is invoked, so it is safe to call from multiple components.
 * Returns a cancel function that cancels any pending idle callbacks for
 * loaders that have not yet fired (already-fired loaders are not affected).
 */
export function prefetchOnIdle(loaders: Loader[]): () => void {
  const cancels: Array<() => void> = [];
  for (const loader of loaders) {
    if (prefetched.has(loader)) continue;
    prefetched.add(loader);
    const cancel = idle(() => {
      loader().catch(() => {});
    });
    cancels.push(cancel);
  }
  return () => { for (const c of cancels) c(); };
}

/**
 * Returns `onMouseEnter` / `onFocus` props that trigger a prefetch the
 * first time the user hovers or tabs to the element.
 * Pass the same function reference(s) on every render (e.g. module-level
 * constants) so the `prefetched` set de-duplication works correctly.
 *
 * Accepts one or more loaders: all are triggered on the same hover/focus event.
 * This is useful when hovering a link should warm up both the current target
 * chunk (e.g. Cart) and the next likely destination (e.g. Checkout).
 */
export function prefetchProps(...loaders: Loader[]): {
  onMouseEnter: () => void;
  onFocus: () => void;
} {
  const trigger = () => {
    for (const loader of loaders) {
      if (prefetched.has(loader)) continue;
      prefetched.add(loader);
      loader().catch(() => {});
    }
  };
  return { onMouseEnter: trigger, onFocus: trigger };
}
