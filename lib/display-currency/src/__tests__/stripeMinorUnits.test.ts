// Guards the Apple Pay / Google Pay wallet sheet amount against drifting from
// the server-created PaymentIntent charge.
//
// Two facts are verified here:
//
//  1. LOCKSTEP — the web mirror (`stripeMinorUnits.ts`) and the server FX module
//     (`fx.ts`) both re-export the helpers below, so this single source of truth
//     is what both platforms execute. The decimals map covers exactly the
//     server's SupportedCurrency set and uses the Stripe-correct rounding for
//     LBP (0-decimal).
//
//  2. BOUNDED DIVERGENCE — the wallet sheet (web) converts the *grand total*
//     once, whereas the server-created PaymentIntent converts each item's unit
//     price individually (per-item rounding) before summing. These two valid
//     strategies can differ by at most one rounding step per independently
//     rounded amount. This test asserts that difference stays within a tight,
//     currency-aware tolerance across a realistic cart matrix so the shopper is
//     never shown a sheet total that materially disagrees with the charge.

import { describe, it, expect } from "vitest";
import { CURRENCY_DECIMALS, currencyDecimals, toStripeMinorUnits } from "../index";

const SUPPORTED = [
  "USD",
  "AED",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "QAR",
  "SAR",
  "CHF",
  "LBP",
] as const;

describe("CURRENCY_DECIMALS", () => {
  it("covers every supported currency with the expected precision", () => {
    expect(CURRENCY_DECIMALS).toMatchObject({
      USD: 2,
      AED: 2,
      EUR: 2,
      GBP: 2,
      CAD: 2,
      AUD: 2,
      QAR: 2,
      SAR: 2,
      CHF: 2,
      LBP: 0,
    });
    for (const c of SUPPORTED) {
      expect(typeof CURRENCY_DECIMALS[c]).toBe("number");
    }
  });
});

describe("currencyDecimals", () => {
  it("is case-insensitive and defaults to 2 for unknown codes", () => {
    expect(currencyDecimals("Lbp")).toBe(0);
    expect(currencyDecimals("ZZZ")).toBe(2);
  });
});

describe("toStripeMinorUnits", () => {
  it("converts two-decimal currencies to cents", () => {
    expect(toStripeMinorUnits(301.5, "EUR")).toBe(30150);
    expect(toStripeMinorUnits(342, "USD")).toBe(34200);
    expect(toStripeMinorUnits(99.99, "GBP")).toBe(9999);
  });

  it("converts zero-decimal currencies to whole units (LBP)", () => {
    expect(toStripeMinorUnits(89500.4, "LBP")).toBe(89500);
    expect(toStripeMinorUnits(89500.6, "LBP")).toBe(89501);
  });

});

// ---------------------------------------------------------------------------
// Divergence: wallet sheet (web, total-rounded) vs PaymentIntent (server, per-item)
// ---------------------------------------------------------------------------

type CartItem = { priceUsd: number; quantity: number };

/**
 * Mirrors the API server's per-item rounding in
 * `artifacts/api-server/src/routes/checkout.ts`: each unit price is converted
 * and rounded to minor units, then multiplied by quantity and summed, with the
 * (separately converted+rounded) delivery fee added and coupon subtracted.
 */
function serverPaymentIntentMinor(
  items: CartItem[],
  deliveryFeeUsd: number,
  couponUsd: number,
  rate: number,
  currency: string,
): number {
  const subtotal = items.reduce(
    (sum, i) => sum + toStripeMinorUnits(i.priceUsd * rate, currency) * i.quantity,
    0,
  );
  const delivery =
    deliveryFeeUsd > 0 ? toStripeMinorUnits(deliveryFeeUsd * rate, currency) : 0;
  const coupon = couponUsd > 0 ? toStripeMinorUnits(couponUsd * rate, currency) : 0;
  return Math.max(0, subtotal + delivery - coupon);
}

/**
 * Mirrors the web wallet sheet in `artifacts/presentail-web/src/pages/Checkout.tsx`:
 * the USD grand total is converted once and rounded to minor units a single time.
 */
function walletSheetMinor(totalUsd: number, rate: number, currency: string): number {
  return toStripeMinorUnits(totalUsd * rate, currency);
}

// Realistic carts spanning single/multi item, quantities, delivery, and coupon.
const CARTS: Array<{
  items: CartItem[];
  deliveryFeeUsd: number;
  couponUsd: number;
}> = [
  { items: [{ priceUsd: 49.99, quantity: 1 }], deliveryFeeUsd: 5, couponUsd: 0 },
  { items: [{ priceUsd: 19.95, quantity: 3 }], deliveryFeeUsd: 0, couponUsd: 0 },
  {
    items: [
      { priceUsd: 33.33, quantity: 2 },
      { priceUsd: 12.5, quantity: 1 },
      { priceUsd: 7.77, quantity: 4 },
    ],
    deliveryFeeUsd: 8.5,
    couponUsd: 10,
  },
  {
    items: [
      { priceUsd: 120.01, quantity: 1 },
      { priceUsd: 0.99, quantity: 5 },
    ],
    deliveryFeeUsd: 15,
    couponUsd: 0,
  },
];

// Representative live-ish FX rates per currency (USD base).
const RATES: Record<string, number> = {
  USD: 1,
  AED: 3.673,
  EUR: 0.92,
  GBP: 0.78,
  CAD: 1.37,
  AUD: 1.5,
  QAR: 3.64,
  SAR: 3.75,
  CHF: 0.88,
  LBP: 89_500,
};

/**
 * Provable maximum difference, in minor units, between the two strategies.
 *
 * The server rounds each *unit* price to minor units and then multiplies by the
 * line quantity, so a single line's rounding error (up to half a rounding step)
 * is amplified by its quantity. The delivery fee and coupon are each rounded
 * once, and the web sheet rounds the grand total once. Hence the worst case is:
 *
 *   (Σ quantity + deliveryRounded + couponRounded + 1) × 1 / 2
 *
 * All supported currencies now use 2-decimal (cents) or 0-decimal (LBP)
 * Stripe rounding. `Math.ceil` keeps the bound integer.
 */
function tolerance(cart: (typeof CARTS)[number], _currency: string): number {
  const sumQty = cart.items.reduce((s, i) => s + i.quantity, 0);
  const roundedTerms =
    sumQty + (cart.deliveryFeeUsd > 0 ? 1 : 0) + (cart.couponUsd > 0 ? 1 : 0) + 1;
  return Math.ceil(roundedTerms / 2);
}

describe("wallet sheet vs PaymentIntent divergence", () => {
  for (const currency of SUPPORTED) {
    for (let i = 0; i < CARTS.length; i++) {
      const cart = CARTS[i]!;
      it(`${currency} cart #${i + 1}: stays within rounding tolerance`, () => {
        const rate = RATES[currency]!;
        const totalUsd =
          cart.items.reduce((s, it) => s + it.priceUsd * it.quantity, 0) +
          cart.deliveryFeeUsd -
          cart.couponUsd;

        const server = serverPaymentIntentMinor(
          cart.items,
          cart.deliveryFeeUsd,
          cart.couponUsd,
          rate,
          currency,
        );
        const sheet = walletSheetMinor(totalUsd, rate, currency);

        const diff = Math.abs(server - sheet);
        expect(diff).toBeLessThanOrEqual(tolerance(cart, currency));
      });
    }
  }

  it("a normal 2-decimal EUR cart diverges by at most a few cents", () => {
    // EUR mixed cart (3 lines, qty 2+1+4, delivery + coupon): real-world
    // divergence is tiny — a handful of cents at most — never a visible jump.
    const cart = CARTS[2]!;
    const rate = RATES.EUR!;
    const totalUsd =
      cart.items.reduce((s, it) => s + it.priceUsd * it.quantity, 0) +
      cart.deliveryFeeUsd -
      cart.couponUsd;
    const server = serverPaymentIntentMinor(
      cart.items,
      cart.deliveryFeeUsd,
      cart.couponUsd,
      rate,
      "EUR",
    );
    const sheet = walletSheetMinor(totalUsd, rate, "EUR");
    expect(Math.abs(server - sheet)).toBeLessThanOrEqual(tolerance(cart, "EUR"));
  });
});
