/**
 * Pure storage helpers for the manual display-currency override.
 * No React imports — safe to import from tests without React or query setup.
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
 * Persist (or clear) the visitor's manual currency override.
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
}
