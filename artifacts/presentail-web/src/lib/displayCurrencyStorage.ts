/**
 * Pure storage helpers for the manual display-currency override.
 * No React imports — safe to import from tests without React or query setup.
 *
 * Also exposes a tiny pub/sub store so every `useDisplayCurrency` call
 * across the component tree re-renders when the visitor picks a new currency,
 * even when the pick originates in a different component (e.g. the footer
 * switcher updating product-card prices on the same page).
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

const manualListeners = new Set<() => void>();

/** Subscribe to manual-currency changes (for useSyncExternalStore). */
export function subscribeManualCurrency(fn: () => void): () => void {
  manualListeners.add(fn);
  return () => manualListeners.delete(fn);
}

function notifyManualListeners(): void {
  for (const fn of manualListeners) fn();
}

/**
 * Read the visitor's manual currency override from storage.
 *
 * Priority: localStorage (persistent, survives sessions) →
 *           sessionStorage (tab-scoped) → null (no override).
 */
export function readManualCurrency(): ManualCurrencyState {
  if (typeof window === "undefined") return null;
  try {
    const persisted = window.localStorage.getItem(
      MANUAL_CURRENCY_PERSISTENT_KEY,
    );
    if (persisted && SUPPORTED_CODES.has(persisted)) {
      return { code: persisted, persistent: true };
    }
  } catch {
    // ignore — fall through to session-scoped read
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

/**
 * Persist (or clear) the visitor's manual currency override, then notify
 * all useSyncExternalStore subscribers so every component re-renders.
 *
 * - `persistent: true`  → localStorage  (survives page reloads / new tabs)
 * - `persistent: false` → sessionStorage (current tab only)
 * - `null`              → clears both
 */
export function writeManualCurrency(state: ManualCurrencyState): void {
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
