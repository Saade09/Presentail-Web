/**
 * Pure storage helpers for the manual display-currency override.
 * No React imports — safe to import from tests without React or query setup.
 *
 * Also exposes a tiny pub/sub store so every `useDisplayCurrency` call
 * across the component tree re-renders when the visitor picks a new currency,
 * even when the pick originates in a different component (e.g. the footer
 * switcher updating product-card prices on the same page).
 *
 * IMPORTANT: `readManualCurrency` must return a stable object reference when
 * the value hasn't changed, because `useSyncExternalStore` compares snapshots
 * with `Object.is()`. We maintain a module-level cached state for this.
 */

export const MANUAL_CURRENCY_KEY = "presentail_display_currency_manual_v1";
export const MANUAL_CURRENCY_PERSISTENT_KEY =
  "presentail_display_currency_manual_persistent_v1";

const SUPPORTED_CODES = new Set([
  "USD",
  "AED",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "QAR",
  "SAR",
  "KWD",
  "OMR",
  "CHF",
]);

export type ManualCurrencyState = { code: string; persistent: boolean } | null;

// ── Module-level stable snapshot ──────────────────────────────────────────
// useSyncExternalStore compares snapshots with Object.is(). If readManualCurrency
// returned a new `{ code, persistent }` object on every call, Object.is()
// would always be false → infinite re-render loop. We cache the current state
// here so the same reference is returned until writeManualCurrency is called.

function readFromStorage(): ManualCurrencyState {
  if (typeof window === "undefined") return null;
  try {
    const persisted = window.localStorage.getItem(
      MANUAL_CURRENCY_PERSISTENT_KEY,
    );
    if (persisted && SUPPORTED_CODES.has(persisted)) {
      return { code: persisted, persistent: true };
    }
  } catch {
    // ignore
  }
  try {
    const session = window.sessionStorage.getItem(MANUAL_CURRENCY_KEY);
    if (session && SUPPORTED_CODES.has(session)) {
      return { code: session, persistent: false };
    }
  } catch {
    // ignore
  }
  return null;
}

// Initialise once at module load (browser only; null during SSR).
let _state: ManualCurrencyState =
  typeof window !== "undefined" ? readFromStorage() : null;

const manualListeners = new Set<() => void>();

function notifyManualListeners(): void {
  for (const fn of manualListeners) fn();
}

// ── Public API ────────────────────────────────────────────────────────────

/** Subscribe to manual-currency changes (for useSyncExternalStore). */
export function subscribeManualCurrency(fn: () => void): () => void {
  manualListeners.add(fn);
  return () => manualListeners.delete(fn);
}

/**
 * Returns the current manual-currency state.
 * Always returns the same reference when the value hasn't changed,
 * so useSyncExternalStore's Object.is() comparison stays stable.
 */
export function readManualCurrency(): ManualCurrencyState {
  return _state;
}

/**
 * Force a re-read from the current window.localStorage / window.sessionStorage
 * into the module-level cache without notifying listeners.
 *
 * Use this in tests after stubbing window storage so that readManualCurrency()
 * reflects the mocked storage state rather than the value cached at module-load
 * time or set by a previous writeManualCurrency() call.
 *
 * @internal — not part of the public API; exported for testing only.
 */
export function syncManualCurrencyFromStorage(): void {
  _state = readFromStorage();
}

/**
 * Persist (or clear) the visitor's manual currency override, update the
 * module-level cache, then notify all useSyncExternalStore subscribers.
 *
 * - `persistent: true`  → localStorage  (survives page reloads / new tabs)
 * - `persistent: false` → sessionStorage (current tab only)
 * - `null`              → clears both
 */
export function writeManualCurrency(state: ManualCurrencyState): void {
  _state = state;

  if (typeof window === "undefined") return;
  try {
    if (state?.persistent) {
      window.localStorage.setItem(MANUAL_CURRENCY_PERSISTENT_KEY, state.code);
    } else {
      window.localStorage.removeItem(MANUAL_CURRENCY_PERSISTENT_KEY);
    }
  } catch {
    // best-effort persistence
  }
  try {
    if (state && !state.persistent) {
      window.sessionStorage.setItem(MANUAL_CURRENCY_KEY, state.code);
    } else {
      window.sessionStorage.removeItem(MANUAL_CURRENCY_KEY);
    }
  } catch {
    // best-effort persistence
  }

  notifyManualListeners();
}
