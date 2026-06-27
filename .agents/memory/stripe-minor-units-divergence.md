---
name: Stripe minor-units single source & web wallet exact-amount rule
description: Why the decimals map / toStripeMinorUnits live in @workspace/display-currency, and why the web Apple/Google Pay sheet must be gated on a pre-created PaymentIntent.
---

# Stripe minor-units: single source of truth

The per-currency decimals map and `toStripeMinorUnits` are the single source of
truth in `@workspace/display-currency`. The server FX module and the web
`stripeMinorUnits.ts` both re-export from it; do NOT re-introduce a local copy in
either place.

**Why:** drift between two copies of the decimals map could let any client-side
amount disagree with the server-created charge. KWD/OMR are three-decimal but
Stripe rounds them to the nearest 10 minor units — getting that step wrong is the
classic bug.

**How to apply:** any new currency or rounding rule goes in
`lib/display-currency/src/index.ts` only.

# Web wallet sheet must show the server amount exactly (no estimate)

The web Apple Pay / Google Pay sheet (`pages/Checkout.tsx`) must display the
**server PaymentIntent amount byte-for-byte**, never a client estimate.

**Why:** the native sheet total and the actual charge must match; a client-side
currency-conversion estimate can round differently from the server's per-unit
rounding and show the shopper a different number than they are charged.

**How it is enforced (do not regress to an estimate fallback):**
- The PaymentIntent is **pre-created** ahead of the tap by a debounced effect,
  cached in `walletIntentRef` keyed by `walletPiSignature(...)`.
- A readiness signal (`walletReadySig`) drives a `walletPreparing` state that
  disables the wallet submit button (spinner) until a cached intent matches the
  current input signature. So the sheet can never open before the exact amount
  is known.
- On tap, the handler only opens `pr.show()` when a matching prefetched intent
  exists (guarded by `!prefetchedIntent → return`), and reuses its
  `clientSecret`/`amount`/`currency`. No inline create, no estimate.

**Why prefetch instead of awaiting in the click handler:** Safari requires
`pr.show()` to run synchronously inside the user-gesture context — you cannot
`await` a network call before it. So the amount must already be known at tap.

**If pre-creation fails** (server `ok:false` or throws): the button stays in the
disabled "preparing" state and the sheet never opens. This is intentional —
exactness wins over availability. The user can still pick another payment method.
Pre-created intents that go unused are safe (paymentRef-keyed, short server TTL).

**Wallet-availability probe is separate** and must not regress: the
`canMakePayment()` probe still runs to decide whether the wallet tiles are shown;
gating only affects whether the *sheet opens*, not whether the tiles appear.
