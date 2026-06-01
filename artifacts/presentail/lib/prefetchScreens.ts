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

/**
 * Returns an `onPressIn` prop that triggers a dynamic-import prefetch the
 * first time the user begins pressing an element — the mobile equivalent of
 * the web's `onMouseEnter` hover-prefetch pattern.
 *
 * Because `onPressIn` fires before the press completes, the JS module starts
 * loading during the ~100–200 ms the user holds their finger down, so the
 * screen transition that follows is noticeably faster.
 *
 * Pass the same loader function reference on every render (e.g. a
 * module-level constant) so the `prefetched` set de-duplication works
 * correctly and the import is only issued once.
 */
export function prefetchOnInteraction(loader: Loader): { onPressIn: () => void } {
  const trigger = () => {
    if (prefetched.has(loader)) return;
    prefetched.add(loader);
    loader().catch(() => {});
  };
  return { onPressIn: trigger };
}

// Module-level constants so the Set deduplication works correctly:
// the same function reference is passed on every render.
export const loadHomeScreen = () => import("../app/(tabs)/index");
export const loadCatalogScreen = () => import("../app/(tabs)/catalog");
export const loadProductDetailScreen = () => import("../app/product/[slug]");
export const loadCartScreen = () => import("../app/(tabs)/cart");
export const loadCheckoutScreen = () => import("../app/checkout");
