---
name: Checkout wallet (Apple Pay / Google Pay) flow
description: Durable rules for the web checkout wallet native-sheet branch — failure handling and how its errors reach the shopper.
---

# Web checkout wallet (Apple Pay / Google Pay) native-sheet branch

The wallet path in the web checkout `handleSubmit` only runs for non-AED currency on mobile, where the upfront `canMakePayment()` probe returns null and a PaymentRequest is built on demand.

## Rules / decisions

- **A wallet failure must never fall through to the default order path.** The resolved `payMethod` stays `"apple_pay"` even after a wallet sheet fails, so any wallet failure branch must explicitly redirect to card and `return` — otherwise execution reaches the default `finalizeOrderNow()` and places an UNPAID order.
  - **Why:** a real latent bug — `pr.show()` throwing silently created an unpaid order.
  - **How to apply:** on `pr.show()` throw, and on every in-sheet payment failure, switch the selected method to card and stop; do not let control reach the non-wallet branches below.

- **Wallet errors are invisible unless the card tile is selected.** The inline Stripe error only renders while the card method is active. After a wallet payment failure you must switch the selected method to card so the shopper actually sees the error; a wallet shopper otherwise just sees the sheet dismiss with no explanation. Note the card tile's onClick clears the error, but a programmatic method switch does not.

## Parity check must use serverFeesOverride, not client fees

The parity check in `handleSubmit` (before `pr.show()`) compares `walletIntentRef.current.amount` against a client-recomputed total. The server **ignores** the client-supplied `deliveryFeeUsd` and computes its own fees (see `checkout.ts` line ~580). Even a $1 discrepancy between server and client fees causes every tap to fire "Order total updated", clear the PI, re-arm the spinner, and loop forever.

**Fix:** use `serverFeesOverride?.subtotalUsd`, `serverFeesOverride?.districtFeeUsd`, etc. when available (fall back to client estimates when null). `serverFeesOverride` is populated right after PI creation by the inline `/api/checkout/fees` fetch in the wallet effect — it always matches the PI amount.

**Why:** server ignores client `deliveryFeeUsd` as a security measure (anti-tamper); parity check must use server-authoritative amounts to avoid false positives.

## Prepared-intent signatures must stay in lockstep

The wallet pre-creation effect, render-time readiness check, and submit-time lookup must build the exact same signature, and the effect dependency list must include every signature input.

**Why:** adding delivery identity to only the prepared signature caused every native-wallet tap to reject its own valid prefetched intent; omitting the new fields from effect dependencies also risks reusing a stale paid delivery context.

**How to apply:** whenever cart, currency, coupon, or delivery identity changes, update all three signature builders together and add the field to the preparation effect dependencies. Tests must cover native-sheet opening and intent reuse.

## Testing the wallet branch

- It only runs on mobile viewports — mock `useIsMobile` true and have the canMakePayment probe resolve null, then capture the `pr.on("paymentmethod"|"cancel", ...)` handlers and invoke them directly.
- `vi.clearAllMocks()` clears call history but NOT implementations — re-assert `mockResolvedValue`/`mockImplementation` in `beforeEach`.
- A `vi.mock` factory that needs a module-level `mock*` const must reference it lazily through a thunk (e.g. `trackEvent: (...a) => mockTrackEvent(...a)`); a direct reference is read during hoisting, before the const initialises, and throws.
