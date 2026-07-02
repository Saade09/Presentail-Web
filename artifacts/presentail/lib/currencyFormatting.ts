/**
 * Pure currency conversion and formatting helpers.
 *
 * Extracted from CurrencyContext so they can be unit-tested directly and
 * shared with any non-React code that needs price formatting.
 */

import { roundToNearestFive } from "@workspace/display-currency";

import type { Currency } from "@workspace/catalog-data";

/**
 * Convert a USD amount into the given currency, rounded to the nearest 5
 * (or nearest 500 for LBP, or nearest cent for USD).
 * Returns 0 for non-finite / non-numeric inputs.
 */
export function convertCurrency(currency: Currency, usdValue: number): number {
  const v = Number(usdValue) || 0;
  return roundToNearestFive(v * currency.rate, currency.code);
}

/**
 * Format an amount that is already in the given currency (no FX conversion).
 * Applies the currency's symbol, position, spacing, and decimal rules.
 */
export function formatNativeAmount(currency: Currency, amount: number): string {
  const v = Number(amount) || 0;
  const fixed =
    currency.decimals > 0
      ? v.toFixed(currency.decimals)
      : Math.round(v).toString();
  const [intPart, decPart] = fixed.split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const numStr = decPart != null ? `${withSep}.${decPart}` : withSep;
  const sep = currency.spaceBetween ? " " : "";
  if (currency.symbolPosition === "left") {
    return `${currency.symbol}${sep}${numStr}`;
  }
  return `${numStr}${sep}${currency.symbol}`;
}

/**
 * Convert a USD amount to the given currency and format it with symbol.
 * This is the canonical price display path — equivalent to
 * formatNativeAmount(currency, convertCurrency(currency, usdValue)).
 */
export function formatCurrencyPrice(currency: Currency, usdValue: number): string {
  return formatNativeAmount(currency, convertCurrency(currency, usdValue));
}
