/**
 * Payment-method ↔ currency/country compatibility table.
 *
 * Lives in its own module (rather than co-located in checkout.tsx) so the
 * pure helpers can be imported by unit tests without pulling in the whole
 * React Native checkout screen and its Expo dependencies.
 */

export type PayMethodId =
  | "card"
  | "wallet"
  | "apple_pay"
  | "google_pay"
  | "whish"
  | "western"
  | "mamo"
  | "paypal";

export const PAY_METHOD_CURRENCIES: Record<
  PayMethodId,
  readonly string[] | "all"
> = {
  // Stripe processes USD/EUR/GBP/etc. cards directly. AED is routed through
  // the Gulf Stripe account (STRIPE_SECRET_KEY_GULF) along with KWD and OMR.
  card: ["USD", "EUR", "GBP", "CAD", "AUD", "QAR", "SAR", "KWD", "OMR", "CHF", "AED"],
  // apple_pay uses Stripe's native PlatformPay sheet (iOS). AED is now
  // included via the Gulf Stripe account.
  apple_pay: ["USD", "EUR", "GBP", "CAD", "AUD", "QAR", "SAR", "KWD", "OMR", "CHF", "AED"],
  // google_pay uses Stripe's native PlatformPay sheet (Android). Same currency
  // set as apple_pay.
  google_pay: ["USD", "EUR", "GBP", "CAD", "AUD", "QAR", "SAR", "KWD", "OMR", "CHF", "AED"],
  // Wallet (legacy combined Apple Pay / Google Pay row) is kept in the table
  // for type-compatibility. AED is no longer routed through Mamo.
  wallet: ["USD", "EUR", "GBP", "CAD", "AUD", "QAR", "SAR", "KWD", "OMR", "CHF"],
  // PayPal settles in USD and the other major currencies the app supports;
  // Gulf currencies (AED, QAR, SAR, KWD, OMR) are excluded — PayPal does
  // not settle in them, and UAE is also blocked via PAY_METHOD_EXCLUDED_COUNTRIES.
  paypal: ["USD", "EUR", "GBP", "CAD", "AUD", "CHF"],
  // Mamo is disabled — secrets are retained but no currency routes to it.
  mamo: [],
  // Manual cash flows operate in USD locally.
  whish: ["USD"],
  western: ["USD"],
};

/**
 * ISO-3166 alpha-2 country codes a payment method is restricted to. Methods
 * not listed are available in any country (subject to the currency table).
 *
 * Whish Money and Western Union are local Lebanon-only flows: even when the
 * shopper is browsing in USD from UAE/Cyprus they should not see them.
 */
export const PAY_METHOD_COUNTRIES: Partial<Record<PayMethodId, readonly string[]>> = {
  whish: ["LB"],
  western: ["LB"],
};

/**
 * ISO-3166 alpha-2 country codes a payment method is *not* available in.
 * Used for methods that are otherwise broadly available but should be hidden
 * in regions where a better local alternative exists.
 *
 * PayPal is excluded from UAE because Mamo is the natural local AED option
 * there — even a UAE shopper who switches their display currency to USD
 * should not see PayPal in the picker.
 */
export const PAY_METHOD_EXCLUDED_COUNTRIES: Partial<
  Record<PayMethodId, readonly string[]>
> = {
  paypal: ["AE"],
};

export type PayMethodContext = {
  /** Active country code (ISO-3166 alpha-2), e.g. "LB", "AE", "CY". */
  country?: string;
};

export function isPayMethodSupported(
  method: PayMethodId,
  currency: string,
  ctx: PayMethodContext = {},
): boolean {
  const allowedCurrencies = PAY_METHOD_CURRENCIES[method];
  const currencyOk =
    allowedCurrencies === "all" || allowedCurrencies.includes(currency);
  if (!currencyOk) return false;
  const allowedCountries = PAY_METHOD_COUNTRIES[method];
  if (allowedCountries) {
    if (!ctx.country) return false;
    if (!allowedCountries.includes(ctx.country)) return false;
  }
  const excludedCountries = PAY_METHOD_EXCLUDED_COUNTRIES[method];
  if (excludedCountries && ctx.country && excludedCountries.includes(ctx.country)) {
    return false;
  }
  return true;
}

export function defaultPayMethodFor(
  currency: string,
  ctx: PayMethodContext = {},
): PayMethodId {
  if (isPayMethodSupported("apple_pay", currency, ctx)) return "apple_pay";
  if (isPayMethodSupported("google_pay", currency, ctx)) return "google_pay";
  if (isPayMethodSupported("card", currency, ctx)) return "card";
  if (isPayMethodSupported("mamo", currency, ctx)) return "mamo";
  if (isPayMethodSupported("paypal", currency, ctx)) return "paypal";
  return "card";
}

/**
 * Decide what the selected payment method should be after the shopper
 * switches the in-app currency or country.
 *
 * Behaviour (matches the checkout `useEffect`):
 *   - If the customer's existing selection still works in the new
 *     currency/country it is preserved (a USD shopper who picked PayPal
 *     stays on PayPal).
 *   - Otherwise we fall back to the default for the new currency/country.
 *
 * Returning a single value (rather than mutating state directly) keeps
 * the rule pure and unit-testable.
 */
export function nextPayMethodForCurrency(
  current: PayMethodId,
  newCurrency: string,
  ctx: PayMethodContext = {},
): PayMethodId {
  if (isPayMethodSupported(current, newCurrency, ctx)) return current;
  return defaultPayMethodFor(newCurrency, ctx);
}

/**
 * Build the visible/hidden map for the payment-method picker in the
 * checkout UI. The checkout requirement is to *hide* methods that
 * aren't selectable in the active currency + country so shoppers only
 * see real choices. Kept as `{ enabled }` for backwards compatibility
 * with existing call sites / tests.
 */
export function payMethodAvailability(
  currency: string,
  ctx: PayMethodContext = {},
): Record<PayMethodId, { enabled: boolean }> {
  const ids: PayMethodId[] = [
    "card",
    "wallet",
    "apple_pay",
    "google_pay",
    "whish",
    "western",
    "mamo",
    "paypal",
  ];
  const out = {} as Record<PayMethodId, { enabled: boolean }>;
  for (const id of ids) {
    out[id] = { enabled: isPayMethodSupported(id, currency, ctx) };
  }
  return out;
}
