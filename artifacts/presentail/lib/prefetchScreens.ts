import { InteractionManager } from "react-native";

type Loader = () => Promise<unknown>;

const prefetched = new Set<Loader>();

/**
 * Pre-load a list of dynamic-import loaders after all in-flight JS
 * interactions (animations, gestures) have settled.
 *
 * Uses `InteractionManager.runAfterInteractions` — the React Native
 * equivalent of `requestIdleCallback` — so the prefetch never competes
 * with the initial paint or any ongoing transition.
 *
 * Each loader is called at most once regardless of how many times this
 * function is invoked, making it safe to call from multiple components.
 */
export function prefetchOnIdle(loaders: Loader[]): void {
  const pending = loaders.filter((l) => !prefetched.has(l));
  if (pending.length === 0) return;

  for (const loader of pending) {
    prefetched.add(loader);
  }

  InteractionManager.runAfterInteractions(() => {
    for (const loader of pending) {
      loader().catch(() => {});
    }
  });
}

// Module-level constants so the Set deduplication works correctly:
// the same function reference is passed on every render.
export const loadCatalogScreen = () => import("../app/(tabs)/catalog");
export const loadProductDetailScreen = () => import("../app/product/[slug]");
export const loadCartScreen = () => import("../app/(tabs)/cart");
export const loadCheckoutScreen = () => import("../app/checkout");
