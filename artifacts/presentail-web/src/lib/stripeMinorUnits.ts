// The Stripe smallest-unit conversion and the per-currency decimals map are now
// the SINGLE SOURCE OF TRUTH in `@workspace/display-currency`, shared with the
// API server (`artifacts/api-server/src/lib/fx.ts` re-exports the same helpers).
// This guarantees the Apple Pay / Google Pay (Stripe PaymentRequest) sheet total
// computed here can never drift from the server-created PaymentIntent amount.
// The actual charge is always the server PaymentIntent; this only controls what
// the native wallet sheet displays, so it must match the server's conversion.

export { currencyDecimals, toStripeMinorUnits } from "@workspace/display-currency";
