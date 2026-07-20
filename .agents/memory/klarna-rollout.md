---
name: Klarna rollout architecture
description: Key decisions and gotchas for the Klarna payment integration via Stripe PaymentElement on the web storefront.
---

## Payer Country vs Delivery Country

Klarna eligibility is based on the **payer's IP-detected country** (from `resolveGeoCurrency(clientIp)`), NOT the delivery address `countryCode`. Presentail's diaspora shoppers browse from US/UK/DE and send to LB/AE/CY — using the delivery country would always block Klarna since LB/AE/CY are not in Klarna's supported market list.

**Why:** Klarna's terms require the billing address (effectively the payer's location) to be in a supported market. The delivery country is irrelevant to Klarna's decision.

**How to apply:** The `/api/checkout/klarna-status` endpoint uses `pickClientIp()` + `resolveGeoCurrency()` for server-side IP lookup. Never pass the `countryCode` delivery-selection state from the client for Klarna eligibility checks.

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

## Rollout Env Vars

- `KLARNA_ROLLOUT` = off | test | percentage | on (default: off)
- `KLARNA_ROLLOUT_PCT` = 0-100 (used only in percentage mode)
- Full rollout requires Ahmad's approval.

## Webhook Idempotency

Stripe re-delivers webhooks on timeout/failure. The `stripe_webhook_events` table has a unique constraint on `stripe_event_id` — duplicate events get a PostgreSQL error code 23505 which is silently caught and returns HTTP 200 (so Stripe stops retrying).

## Klarna Redirect Flow

Payload stashed in sessionStorage BEFORE `stripe.confirmPayment()` using the PI id extracted from clientSecret (`clientSecret.split('_secret_')[0]`). OrderConfirmed.tsx already reads PENDING_ORDER_KEY and finalizes the order — no changes needed to OrderConfirmed for Klarna redirect handling.
