/**
 * Shared test helpers for the Presentail mobile app.
 *
 * These utilities live in lib/ so they can be imported by test files anywhere
 * in the artifacts/presentail tree without coupling tests to each other.
 *
 * `makeDimensionsSubscription`
 * ----------------------------
 * React Native's `Dimensions.addEventListener` return type is the full
 * `EmitterSubscription` interface, which carries `emitter`, `listener`,
 * `context`, and `subscriber` fields that are meaningless in a test
 * environment.  Inline casts like `{ remove: vi.fn() } as any` scatter
 * the structural weakness across every test that mocks the Dimensions
 * listener.
 *
 * This helper isolates the single unsafe cast and returns a correctly-typed
 * stub so call-sites can omit `as any` entirely.  The stub satisfies
 * TypeScript because all fields beyond `remove` are irrelevant to how
 * `useGridCardWidth` (and similar hooks) consume the subscription object —
 * they only ever call `.remove()` in their cleanup effect.
 */

import type { EmitterSubscription } from "react-native";
import type { Mock } from "vitest";

/**
 * Returns a properly-typed `EmitterSubscription` stub whose only meaningful
 * method is `remove`.  Always pass a `vi.fn()` spy — use the same spy
 * reference when you need to assert that cleanup was called, or pass a fresh
 * `vi.fn()` when the test only needs the mock to satisfy the type contract.
 *
 * The cast to `EmitterSubscription` is intentional: RN's interface carries
 * `emitter`, `listener`, `context`, and `subscriber` fields that are never
 * accessed by any hook under test (hooks only call `.remove()` in their
 * cleanup effect).  Isolating the cast here means call-sites need no `as any`.
 *
 * @example
 * vi.spyOn(Dimensions, "addEventListener").mockImplementationOnce((_event, listener) => {
 *   capturedListener = listener as typeof capturedListener;
 *   return makeDimensionsSubscription(removeSpy);
 * });
 */
export function makeDimensionsSubscription(removeFn: Mock): EmitterSubscription {
  const stub: { remove: Mock } = { remove: removeFn };
  return stub as unknown as EmitterSubscription;
}
