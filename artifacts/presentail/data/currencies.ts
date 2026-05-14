// Re-export the canonical currency table from the shared lib so the mobile
// app, the web storefront, and the API server all agree on which currencies
// are supported, their static fallback rates, and the country → currency
// map. The lib intentionally has no React Native dependencies.
//
// The mobile-only `applyFxRates` helper lives here (not in the lib) because
// it mutates the in-memory CURRENCIES table at runtime — only the mobile
// app keeps a long-lived JS process where that mutation makes sense; the
// API server treats CURRENCIES as immutable and the web fetches fresh data
// from `/currencies`.
export {
  CURRENCIES,
  COUNTRY_TO_CURRENCY_MAP,
  FALLBACK_CURRENCY_CODE,
  currencyForCountry,
  getCurrency,
  isSupportedCurrencyCode,
} from "@workspace/catalog-data";
export type { Currency, CurrencyCode } from "@workspace/catalog-data";

import { CURRENCIES, type CurrencyCode } from "@workspace/catalog-data";

/**
 * Mutate the live `rate` field of each known currency from a fresh FX
 * snapshot. Used by the mobile app's FX-rates service so display prices
 * follow live exchange rates between syncs.
 */
export function applyFxRates(
  rates: Partial<Record<CurrencyCode, number>>,
): void {
  for (const c of CURRENCIES) {
    const fresh = rates[c.code];
    if (typeof fresh === "number" && Number.isFinite(fresh) && fresh > 0) {
      c.rate = fresh;
    }
  }
}
