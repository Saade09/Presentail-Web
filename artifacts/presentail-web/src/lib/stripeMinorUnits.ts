// Web-side mirror of the API server's `CURRENCY_DECIMALS` / `toStripeMinorUnits`
// (see `artifacts/api-server/src/lib/fx.ts`). Used to express the Stripe
// PaymentRequest (Apple Pay / Google Pay) sheet total in the shopper's display
// currency and correct smallest unit. The actual charge is always the
// server-created PaymentIntent amount; this only controls what the native
// wallet sheet displays, so it must match the server's conversion as closely
// as possible.

const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  AED: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  QAR: 2,
  SAR: 2,
  KWD: 3,
  OMR: 3,
  CHF: 2,
  LBP: 0,
};

export function currencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}

/**
 * Convert an amount already expressed in `currency` into the smallest unit
 * Stripe expects. Handles three-decimal currencies (KWD/OMR), which Stripe
 * requires to be rounded to the nearest 10 minor units, and zero-decimal
 * currencies (LBP).
 */
export function toStripeMinorUnits(convertedAmount: number, currency: string): number {
  const decimals = currencyDecimals(currency);
  if (decimals === 3) {
    const minor = Math.round(convertedAmount * 1000);
    return Math.round(minor / 10) * 10;
  }
  if (decimals === 0) {
    return Math.round(convertedAmount);
  }
  return Math.round(convertedAmount * 100);
}
