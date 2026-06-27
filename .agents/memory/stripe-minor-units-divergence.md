---
name: Stripe minor-units single source & wallet-sheet divergence bound
description: Why the decimals map / toStripeMinorUnits live in @workspace/display-currency, and the provable bound between the web wallet sheet total and the server PaymentIntent.
---

# Stripe minor-units: single source of truth + divergence bound

The per-currency decimals map and `toStripeMinorUnits` are the single source of
truth in `@workspace/display-currency`. The server FX module and the web
`stripeMinorUnits.ts` both re-export from it; do NOT re-introduce a local copy in
either place.

**Why:** the Apple Pay / Google Pay (Stripe PaymentRequest) sheet total is
computed client-side, while the authoritative charge is the server-created
PaymentIntent. Two copies of the decimals map could drift and show the shopper a
sheet amount that disagrees with the charge.

**How to apply:** any new currency or rounding rule goes in
`lib/display-currency/src/index.ts` only.

## The two paths round differently — and that's expected

- Server (`routes/checkout.ts`): converts + rounds each **unit** price to minor
  units, then multiplies by quantity and sums (delivery fee and coupon rounded
  separately).
- Web wallet sheet (`pages/Checkout.tsx`): converts the **grand total** once and
  rounds once.

These cannot be made identical without changing one path's math. They stay
within a provable bound:

  `(Σ quantity + deliveryRounded + couponRounded + 1) × step / 2`

where `step` = 1 minor unit normally, **10 for KWD/OMR** (Stripe rounds
three-decimal currencies to the nearest 10). The per-unit rounding error is
amplified by line quantity because the server rounds the unit before multiplying
— this is the easy thing to get wrong when writing the tolerance assertion. LBP
is 0-decimal (step 1). Test: `lib/display-currency/src/__tests__/stripeMinorUnits.test.ts`.
