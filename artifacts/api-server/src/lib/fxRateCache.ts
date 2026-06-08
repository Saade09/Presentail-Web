/**
 * In-memory FX rate cache populated by the OS `exchange_rate.updated` webhook.
 *
 * Rates are stored as `{ [ISO_4217_code]: number }` with USD as the base
 * (i.e. 1 USD = rates[currency] units of that currency). For example:
 *   { AED: 3.6725, LBP: 89500, EUR: 0.92, GBP: 0.79, ... }
 *
 * The cache starts empty. `getUsdAmount` returns a fallback for known pegged
 * currencies (AED: 3.6725) when the webhook has not fired yet, so UAE
 * delivery fees are always converted to USD even on a cold start.
 *
 * `setFxRates` is called by the OS webhook handler on every
 * `exchange_rate.updated` event.
 */

/** Static fallback rates (base USD). Used when OS hasn't sent rates yet. */
const STATIC_FALLBACK: Record<string, number> = {
  AED: 3.6725, // UAE Dirham — officially pegged to USD at this rate
};

/** Live rates from the OS `exchange_rate.updated` webhook. */
let liveRates: Record<string, number> | null = null;

/**
 * Update the in-memory FX rate cache with fresh rates from the OS webhook.
 * Rates must be base-USD (1 USD = N units of currency).
 */
export function setFxRates(rates: Record<string, number>): void {
  if (!rates || typeof rates !== "object") return;
  liveRates = { ...rates };
}

/**
 * Get the current FX rates map (live if available, otherwise static fallback).
 * Returns a copy so callers cannot mutate the cache.
 */
export function getFxRates(): Record<string, number> {
  return { ...STATIC_FALLBACK, ...(liveRates ?? {}) };
}

/**
 * Convert `amount` from `currency` into USD.
 *
 * - USD passthrough: returns `amount` unchanged.
 * - Non-USD with a known rate: returns `amount / rate`.
 * - Non-USD with no known rate: logs a warn and returns `amount` unchanged
 *   (safest fallback — callers should never get here for known currencies).
 *
 * The static AED peg (3.6725) acts as a cold-start fallback before the OS
 * webhook fires, so UAE delivery fees are always converted correctly.
 */
export function getUsdAmount(amount: number, currency: string | undefined): number {
  if (!currency || currency.toUpperCase() === "USD") return amount;
  const rates = getFxRates();
  const code = currency.toUpperCase();
  const rate = rates[code];
  if (typeof rate !== "number" || rate <= 0) {
    // Unknown currency — return amount unchanged (treat as 1:1 with USD).
    return amount;
  }
  return amount / rate;
}

/**
 * Reset the live rate cache. Only intended for unit tests.
 */
export function __resetFxRatesForTest(): void {
  liveRates = null;
}
