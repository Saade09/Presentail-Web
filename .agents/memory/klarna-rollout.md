---
name: Klarna rollout architecture
description: Key decisions and gotchas for the Klarna payment integration via Stripe PaymentElement on the web storefront, including rollout gate and eligibility.
---

## Payer Country vs Delivery Country

Klarna eligibility is based on the **payer's IP-detected country** (from `resolveGeoCurrency(clientIp)`), NOT the delivery address `countryCode`. Presentail's diaspora shoppers browse from US/UK/DE and send to LB/AE/CY — using the delivery country would always block Klarna since LB/AE/CY are not in Klarna's supported market list.

**Why:** Klarna's terms require the billing address (effectively the payer's location) to be in a supported market. The delivery country is irrelevant to Klarna's decision.

**How to apply:** The `/api/checkout/klarna-status` endpoint uses `pickClientIp()` + `resolveGeoCurrency()` for server-side IP lookup. Never pass the `countryCode` delivery-selection state from the client for Klarna eligibility checks.

## Rollout Env Vars

- `KLARNA_ROLLOUT` = off | test | percentage | on (default: off)
- `KLARNA_ROLLOUT_PERCENTAGE` = 0-100 is the canonical percentage setting.
- Deprecated `KLARNA_ROLLOUT_PCT` is a warning-emitting compatibility fallback only; the canonical name wins when both exist.
- Gulf (AED/UAE) stores always block Klarna regardless of the flag — Klarna does not support AED.
- Full rollout requires Ahmad's explicit approval.

**Why:** Combining both percentage names allowed a stale setting to silently increase the live cohort.

**How to apply:** Configure only `KLARNA_ROLLOUT_PERCENTAGE` for percentage mode and remove `KLARNA_ROLLOUT_PCT` after any migration window.

## confirmPayment + redirect:'if_required' Type Cast

`stripe.confirmPayment({ redirect: 'if_required' })` requires a cast because the `@stripe/stripe-js` type declarations in this codebase only declare `redirect: 'always'`. Pattern used:

```ts
const _peResult = await (stripe.confirmPayment as (o: object) => Promise<{
  error?: StripeError;
  paymentIntent?: PaymentIntent;
}>)({ ..., redirect: "if_required" });
const peError = _peResult.error;
const peIntent = _peResult.paymentIntent;
```

Do NOT destructure `{ error, paymentIntent }` directly — TypeScript treats `confirmPayment` as returning a union and complains about the missing property on the error branch.

## Deferred Intent Mode requires elements.submit()

When using PaymentElement in deferred-intent mode (`mode: 'payment'`, no clientSecret at mount), you MUST call `elements.submit()` before creating the PaymentIntent. Skipping this step causes the PaymentElement form to be invalid at confirmation time.

Order: `elements.submit()` → create PI → `stripe.confirmPayment({ elements, clientSecret })`

Skip `elements.submit()` when a saved card is selected (no PaymentElement form to validate).

## Stripe Checkout Session vs PaymentIntent difference

- For **Checkout Sessions**: use `payment_method_types:["card"]` to restrict (no `automatic_payment_methods` available at session level — TypeScript enforces this).
- For **PaymentIntents**: when Klarna is off, use `payment_method_types: ["card"]` (explicit restriction); when Klarna is on, use `automatic_payment_methods: { enabled: true }` (lets Stripe surface Klarna + wallet methods).

## Webhook Idempotency

Stripe re-delivers webhooks on timeout/failure. The `stripe_webhook_events` table has a unique constraint on `stripe_event_id`. Idempotency record is written AFTER the handler succeeds (not before). On handler error the endpoint returns 500 so Stripe retries — the missing idempotency record means the retry re-enters the handler. Concurrent delivery may process the same event twice, but all side effects are idempotent.

## Webhook secrets

Two secrets required: `STRIPE_WEBHOOK_SECRET` (main LB/CY) and `STRIPE_WEBHOOK_SECRET_GULF` (gulf AE). Handler tries both in sequence.

## Klarna Redirect Flow

Payload stashed in sessionStorage BEFORE `stripe.confirmPayment()` using the PI id extracted from clientSecret (`clientSecret.split('_secret_')[0]`). OrderConfirmed.tsx already reads PENDING_ORDER_KEY and finalizes the order — no changes needed to OrderConfirmed for Klarna redirect handling.
