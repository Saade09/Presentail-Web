/**
 * Pure helpers for the web checkout's payment-method picker. Extracted from
 * `Checkout.tsx` so the visibility / label / auto-fallback rules can be unit
 * tested without rendering the React Native–adjacent checkout screen.
 *
 * The underlying compatibility table lives in `@workspace/pay-methods` and is
 * shared with the mobile checkout — these helpers only encode the *web*
 * subset (no Western Union) and the web-specific label flip (Mamo tile is
 * relabelled to "Pay by card" in AED).
 */

import {
  isPayMethodSupported,
  nextPayMethodForCurrency,
  type PayMethodId,
} from "@workspace/pay-methods";

export type WebPaymentMethodId = Extract<
  PayMethodId,
  "card" | "paypal" | "whish" | "mamo" | "apple_pay" | "google_pay" | "western"
>;

export const WEB_PAY_METHODS: readonly WebPaymentMethodId[] = [
  "apple_pay",
  "google_pay",
  "card",
  "paypal",
  "mamo",
  "whish",
] as const;

export type WebPayMethodCtx = {
  activeCurrency: string;
  countryCode?: string | null;
};

/**
 * The i18n label key for a payment method in the active currency. Mamo
 * carries a context-sensitive label: when the active currency is AED the
 * Mamo tile *is* the card option (Stripe doesn't settle in AED), so it is
 * renamed to "Pay by card" — mirrors the mobile checkout copy.
 */
export function webPaymentMethodLabelKey(
  id: WebPaymentMethodId,
  activeCurrency: string,
): string {
  if (id === "mamo") {
    return activeCurrency === "AED"
      ? "checkout.pay.payByCard"
      : "checkout.pay.mamo";
  }
  switch (id) {
    case "card":
      return "checkout.pay.card";
    case "apple_pay":
      return "checkout.pay.apple_pay";
    case "google_pay":
      return "checkout.pay.google_pay";
    case "paypal":
      return "checkout.pay.paypal";
    case "whish":
      return "checkout.pay.whish";
    case "western":
      return "checkout.pay.western";
    default:
      return "checkout.pay.card";
  }
}

/**
 * Visible payment-method tiles for the active currency + country. Methods
 * the shared compatibility table excludes are hidden entirely so shoppers
 * only see real choices. A defensive fallback to `["card"]` keeps the
 * picker from ever being empty — same behaviour as the checkout screen.
 */
export function webVisiblePayMethods(
  ctx: WebPayMethodCtx,
): WebPaymentMethodId[] {
  const country = ctx.countryCode ?? undefined;
  const visible = WEB_PAY_METHODS.filter((id) =>
    isPayMethodSupported(id, ctx.activeCurrency, { country }),
  );
  return visible.length > 0 ? [...visible] : ["card"];
}

/**
 * Auto-fallback selection when the currently selected method becomes hidden
 * (e.g. shopper flips display currency to AED and Stripe `card` disappears).
 * Wraps the shared `nextPayMethodForCurrency` and narrows the result to the
 * web subset, falling back to `"card"` if the shared default ever returns a
 * method the web checkout doesn't implement (today only `"western"`).
 */
export function webNextPaymentMethod(
  current: WebPaymentMethodId,
  ctx: WebPayMethodCtx,
): WebPaymentMethodId {
  const country = ctx.countryCode ?? undefined;
  const next = nextPayMethodForCurrency(current, ctx.activeCurrency, {
    country,
  });
  return (WEB_PAY_METHODS as readonly PayMethodId[]).includes(next)
    ? (next as WebPaymentMethodId)
    : "card";
}
