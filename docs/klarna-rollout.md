# Klarna Rollout Guide

> **Status: off by default.** Full rollout requires Ahmad's approval.
> Enable only when approved by setting `KLARNA_ROLLOUT` to `test`, `percentage`, or `on`.

## Overview

Klarna is offered as a Buy Now Pay Later option on the **web storefront only** (no mobile app). It coexists with cards, Apple Pay, and Google Pay on the checkout page.

Klarna uses Stripe's PaymentElement to render a unified payment form that shows Klarna (and other eligible methods) alongside card fields. The PaymentElement replaces the existing split card fields (CardNumberElement + CardExpiryElement + CardCvcElement) when Klarna is enabled.

---

## Architecture

```
Client: Checkout.tsx
  └─ Fetches /api/checkout/klarna-status on page load
     ← { enabled: true/false, payerCountry: "US" }
  └─ If enabled: renders <PaymentElement> via StripeCheckoutSection
     (deferred-intent mode: amount+currency in Elements options, no clientSecret at mount)
  └─ On submit:
     1. elements.submit()           → validates form
     2. POST /api/checkout/pi       → creates PaymentIntent (server-verified amount)
     3. stripe.confirmPayment()     → confirms with redirect:'if_required'
        ├─ Card: resolves immediately → finalizeOrderNow(pi.id)
        └─ Klarna: browser redirects → Klarna hosted page → returns to /order-confirmed

Server: /api/checkout/klarna-status (GET, no auth)
  └─ IP geo-lookup → payer country
  └─ isKlarnaEnabled({ sessionId, payerCountry, isTestMode })
  └─ Returns { enabled, payerCountry }

Server: /api/stripe/webhook (POST, raw body, no auth — Stripe signature)
  └─ Handles payment_intent.succeeded, payment_intent.payment_failed,
     charge.dispute.created (Slack alert), charge.refunded
  └─ Idempotency: stripe_webhook_events table (unique on stripeEventId)
  └─ Supports both Stripe accounts (main LB/CY, gulf AE)
```

### Why payer country matters

Klarna's eligibility is based on the **shopper's billing country** (determined by IP), NOT the delivery address. Presentail's customers are diaspora — they browse from the UK, US, France, etc. and send to Lebanon/UAE. The delivery `countryCode` (LB, AE, CY) would always block Klarna; we must use IP geolocation instead.

---

## Rollout Modes

Set via `KLARNA_ROLLOUT` environment variable (default: `off`):

| Value | Behaviour |
|-------|-----------|
| `off` | Klarna never surfaced. Safe default. |
| `test` | Klarna surfaced only when the active Stripe key is a test key (`sk_test_…`). Use for QA on staging or Replit dev environment. |
| `percentage` | Klarna surfaced for `KLARNA_ROLLOUT_PCT`% of sessions, determined by a deterministic hash of the shopper's session ID. The same shopper sees the same result across reloads. |
| `on` | Klarna surfaced for all shoppers in eligible payer countries. Full rollout. |

### Environment Variables

```bash
# Required: rollout mode
KLARNA_ROLLOUT=off             # off | test | percentage | on

# Optional: percentage target (0-100), used only when KLARNA_ROLLOUT=percentage
KLARNA_ROLLOUT_PCT=10          # e.g. 10 = 10% of sessions

# Required: Stripe webhook secrets (needed for dispute/refund handling)
STRIPE_WEBHOOK_SECRET=whsec_… # main account (LB, CY)
STRIPE_WEBHOOK_SECRET_GULF=whsec_… # gulf account (AE)
```

### Eligible Payer Countries

Klarna is only offered when the shopper's IP resolves to one of these countries:

AT, AU, BE, CA, CH, DE, DK, ES, FI, FR, GB, GR, IE, IT, NL, NO, NZ, PL, PT, SE, US

Lebanon (LB), UAE (AE), and Cyprus (CY) are **not** on this list — Klarna does not operate in these markets. This is by design: Klarna is for diaspora shoppers paying from supported countries.

---

## Staged Rollout Plan

### Phase 1 — QA on dev (`KLARNA_ROLLOUT=test`)

1. Set `KLARNA_ROLLOUT=test` in Replit secrets.
2. Verify the PaymentElement renders with Klarna visible in the accordion.
3. Place a test Klarna order using a Stripe test card (see Stripe docs for Klarna test sequences).
4. Confirm the order lands in Presentail OS after the Klarna redirect.
5. Trigger a test dispute via Stripe dashboard and confirm the Slack alert fires.

### Phase 2 — 10% rollout (`KLARNA_ROLLOUT=percentage`, `KLARNA_ROLLOUT_PCT=10`)

1. Ahmad approves rollout.
2. Set `KLARNA_ROLLOUT=percentage` + `KLARNA_ROLLOUT_PCT=10` and redeploy.
3. Monitor for 48h: check Klarna payment success rates in `analytics_events` (`stripe_payment_succeeded` where `action='klarna'`), dispute rate in `stripe_webhook_events`, and Slack for alerts.
4. If no issues, increase to 25%, then 50%.

### Phase 3 — Full rollout (`KLARNA_ROLLOUT=on`)

1. Ahmad approves.
2. Set `KLARNA_ROLLOUT=on` and redeploy.

---

## Stripe Webhook Setup

Klarna payments complete asynchronously via Stripe webhooks. Set up webhooks in the Stripe dashboard:

1. Go to **Stripe dashboard → Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://presentail.com/api/stripe/webhook`
3. Events to listen for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.dispute.created`
   - `charge.refunded`
4. Copy the webhook signing secret and set it as `STRIPE_WEBHOOK_SECRET` (main account) or `STRIPE_WEBHOOK_SECRET_GULF` (gulf AE account).
5. Repeat for the gulf Stripe account if needed.

---

## Database Changes

Two migrations are required (already in the schema, run `pnpm --filter @workspace/db run push`):

1. **`stripe_webhook_events`** — new table, idempotency log for Stripe events.
2. **`app_orders`** — two new nullable columns: `stripe_payment_intent_id`, `stripe_charge_id`.

---

## Testing Klarna End-to-End

Use Stripe's test credentials to simulate a Klarna payment:

```
Card-like test input for Klarna:
  - Choose Klarna in the PaymentElement accordion
  - Use any email; date of birth: 01/01/1990
  - Klarna in test mode auto-approves
  - After approval, the browser returns to /order-confirmed?status=success
  - The order payload stashed in sessionStorage is read and finalized
```

See Stripe docs: https://stripe.com/docs/testing#klarna

---

## Monitoring

After enabling, watch these signals:

| Signal | Source | Check |
|--------|--------|-------|
| Klarna payment successes | `analytics_events` WHERE `name='stripe_payment_succeeded'` AND `properties->>'method'='klarna'` | Rising count |
| Klarna payment failures | `analytics_events` WHERE `name='stripe_payment_failed'` | Low rate |
| Disputes | `stripe_webhook_events` WHERE `event_type='charge.dispute.created'` + Slack alert | Zero or low |
| Refunds | `stripe_webhook_events` WHERE `event_type='charge.refunded'` | Monitor |

---

## Rollback

To disable Klarna immediately without a redeploy:

```bash
# Set in Replit secrets and redeploy
KLARNA_ROLLOUT=off
```

The `klarnaEnabled` flag is fetched fresh on each page load — new visitors will see card-only within seconds of the environment variable update propagating. No frontend code changes needed.

---

## FAQ

**Q: Why web-only, not mobile?**  
Klarna payments require a browser redirect to Klarna's hosted payment page. Stripe React Native cannot handle this redirect reliably inside the Expo WebView for production use. Klarna can be added to mobile in a future phase when Stripe's native Klarna SDK support matures.

**Q: Does Klarna work for AE (UAE) customers?**  
No — Klarna is not available in the UAE. Gulf orders use AED as the billing currency and the gulf Stripe account; Klarna's AED support is not live as of 2026. The `isKlarnaEligibleCountry()` guard ensures Klarna is never offered to shoppers whose IP resolves to AE.

**Q: What happens if the sessionStorage stash is lost before Klarna redirect returns?**  
The `OrderConfirmed` page will show a "payment received" state without an order reference, and prompt the shopper to contact support. The Stripe `payment_intent.succeeded` webhook still fires, creating an analytics event for ops to identify the order.

**Q: Does Klarna affect the existing card / Apple Pay / Google Pay flows?**  
No. `KLARNA_ROLLOUT=off` is the default and leaves the existing split card fields completely unchanged. When Klarna is enabled, the PaymentElement is used which still supports cards (including saved cards, which bypass the PaymentElement using `payment_method: savedCardId`). Apple Pay and Google Pay use a separate wallet sheet and are not affected by this rollout.
