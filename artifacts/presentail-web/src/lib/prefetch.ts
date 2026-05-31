type Loader = () => Promise<unknown>;

const prefetched = new Set<Loader>();

const idle: (cb: () => void) => void =
  typeof requestIdleCallback === "function"
    ? (cb) => requestIdleCallback(cb, { timeout: 3000 })
    : (cb) => setTimeout(cb, 300);

/**
 * Prefetch a list of dynamic-import loaders during browser idle time.
 * Each loader is called at most once regardless of how many times this
 * function is invoked, so it is safe to call from multiple components.
 */
export function prefetchOnIdle(loaders: Loader[]): void {
  for (const loader of loaders) {
    if (prefetched.has(loader)) continue;
    prefetched.add(loader);
    idle(() => {
      loader().catch(() => {});
    });
  }
}

/**
 * Returns `onMouseEnter` / `onFocus` props that trigger a prefetch the
 * first time the user hovers or tabs to the element.
 * Pass the same function reference on every render (e.g. a module-level
 * constant) so the `prefetched` set de-duplication works correctly.
 */
export function prefetchProps(loader: Loader): {
  onMouseEnter: () => void;
  onFocus: () => void;
} {
  const trigger = () => {
    if (prefetched.has(loader)) return;
    prefetched.add(loader);
    loader().catch(() => {});
  };
  return { onMouseEnter: trigger, onFocus: trigger };
}
