/**
 * Payment-method ↔ currency compatibility table.
 *
 * Lives in its own module (rather than co-located in checkout.tsx) so the
 * pure helpers can be imported by unit tests without pulling in the whole
 * React Native checkout screen and its Expo dependencies.
 */

export type PayMethodId =
  | "card"
  | "wallet"
  | "whish"
  | "western"
  | "mamo"
  | "paypal";

export const PAY_METHOD_CURRENCIES: Record<
  PayMethodId,
  readonly string[] | "all"
> = {
  // Stripe processes USD/EUR/GBP/etc. cards directly; card+wallet are the
  // safe default for any non-AED currency.
  card: ["USD", "EUR", "GBP", "CAD", "AUD", "QAR", "SAR", "KWD", "OMR", "CHF"],
  wallet: ["USD", "EUR", "GBP", "CAD", "AUD", "QAR", "SAR", "KWD", "OMR", "CHF"],
  // PayPal: settle in USD only (we always send USD to the API).
  paypal: ["USD"],
  // Mamo is the UAE-only wallet/card processor; only AED.
  mamo: ["AED"],
  // Manual cash flows operate in USD locally.
  whish: ["USD"],
  western: ["USD"],
};

export function isPayMethodSupported(
  method: PayMethodId,
  currency: string,
): boolean {
  const allowed = PAY_METHOD_CURRENCIES[method];
  return allowed === "all" || allowed.includes(currency);
}

export function defaultPayMethodFor(currency: string): PayMethodId {
  if (isPayMethodSupported("card", currency)) return "card";
  if (isPayMethodSupported("mamo", currency)) return "mamo";
  if (isPayMethodSupported("paypal", currency)) return "paypal";
  return "card";
}

/**
 * Decide what the selected payment method should be after the shopper
 * switches the in-app currency.
 *
 * Behaviour (matches the checkout `useEffect`):
 *   - If the customer's existing selection still works in the new currency
 *     it is preserved (a USD shopper who picked PayPal stays on PayPal).
 *   - Otherwise we fall back to the default for the new currency.
 *
 * Returning a single value (rather than mutating state directly) keeps
 * the rule pure and unit-testable.
 */
export function nextPayMethodForCurrency(
  current: PayMethodId,
  newCurrency: string,
): PayMethodId {
  if (isPayMethodSupported(current, newCurrency)) return current;
  return defaultPayMethodFor(newCurrency);
}

/**
 * Build the disabled/enabled state for the payment-method picker in the
 * checkout UI. The checkout requirement is to *disable* (not hide)
 * incompatible methods so the customer understands why a method they
 * recognise is unavailable in their current currency.
 */
export function payMethodAvailability(
  currency: string,
): Record<PayMethodId, { enabled: boolean }> {
  const ids: PayMethodId[] = [
    "card",
    "wallet",
    "whish",
    "western",
    "mamo",
    "paypal",
  ];
  const out = {} as Record<PayMethodId, { enabled: boolean }>;
  for (const id of ids) {
    out[id] = { enabled: isPayMethodSupported(id, currency) };
  }
  return out;
}
