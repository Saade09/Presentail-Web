# Stripe Dashboard Setup for Klarna

This document describes the one-time Stripe Dashboard configuration steps
required to enable Klarna via Dynamic Payment Methods on the Presentail web
checkout.

---

## Overview

Presentail uses Stripe's [Dynamic Payment Methods] so payment method eligibility
(card, Apple Pay, Google Pay, Klarna, etc.) is determined by Stripe automatically
based on the shopper's billing country, currency, and cart value.

The server-side `KLARNA_ROLLOUT` feature flag controls whether a given checkout
session allows redirect-based methods like Klarna:

| `KLARNA_ROLLOUT` value | Effect |
|---|---|
| `off` (default) | Klarna is blocked for all sessions (`allow_redirects: "never"`) |
| `test` | Klarna is allowed only when using a `sk_test_` key |
| `percentage` | Deterministic cohort rollout; percentage set by `KLARNA_ROLLOUT_PERCENTAGE` |
| `on` | Klarna is allowed for all eligible sessions |

**Full production rollout (`KLARNA_ROLLOUT=on`) must not be set until Ahmad
explicitly approves it.**

---

## Step 1: Enable Klarna in the Stripe Dashboard

Perform these steps for **each** Stripe account (main account for Lebanon/Cyprus
and Gulf account for UAE):

1. Log in to [dashboard.stripe.com](https://dashboard.stripe.com).
2. Navigate to **Settings → Payment methods**.
3. Locate **Klarna** in the list and click **Turn on**.
4. Accept Klarna's terms of service if prompted.
5. Under **Currencies**, ensure the currencies you want to accept via Klarna are
   enabled (e.g. USD, EUR, GBP, SEK, NOK, DKK, AUD, CAD for main account).
6. Under **Countries**, verify the shopper countries that should be eligible
   (Klarna is available to shoppers in: AT, AU, BE, CA, CH, CZ, DE, DK, ES, FI,
   FR, GB, GR, IE, IT, NL, NO, NZ, PL, PT, RO, SE, SK, US and more — see
   [Klarna payment method guide]).
7. Set the **Minimum order amount** to at least $35 USD (or equivalent) to match
   Klarna's minimum transaction requirement. Orders below this threshold will not
   show Klarna in the Payment Element even when the flag is on.

> **Note:** Klarna is a redirect-based payment method. The shopper will leave the
> Presentail checkout, complete identification with Klarna, and return via the
> configured `return_url`. The Payment Element handles this flow automatically.

---

## Step 2: Register Stripe Webhook Endpoints

Register a webhook endpoint for **each** Stripe account pointing to the Presentail
API server.

### Endpoint URL

```
https://presentail.com/api/stripe/webhook
```

(Or the `ops.presentail.com` domain if the API is deployed there.)

### Events to subscribe

Select the following events:

| Event | Purpose |
|---|---|
| `payment_intent.processing` | Klarna deferred-approval alert |
| `payment_intent.payment_failed` | Failed payment logging |
| `charge.dispute.created` | Dispute ops alert (critical) |
| `charge.dispute.updated` | Dispute escalation alert |
| `charge.dispute.closed` | Dispute outcome alert |
| `charge.refund.updated` | Refund failure alert |

### Retrieve the signing secret

After creating the webhook endpoint, click **Reveal** next to the signing secret
and add it as a Replit secret:

- **Main account** → `STRIPE_WEBHOOK_SECRET`
- **Gulf (UAE) account** → `STRIPE_WEBHOOK_SECRET_GULF`

Both secrets may be active simultaneously. The webhook handler tries each secret
and accepts the first valid signature.

---

## Step 3: Set Environment Variables (Replit Secrets)

In the Replit Secrets panel, add or update:

| Secret name | Value |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Signing secret from the main Stripe account webhook |
| `STRIPE_WEBHOOK_SECRET_GULF` | Signing secret from the Gulf (UAE) Stripe account webhook |
| `KLARNA_ROLLOUT` | Start with `test`, then `percentage`, then `on` when approved |
| `KLARNA_ROLLOUT_PERCENTAGE` | (Only needed in `percentage` mode) e.g. `10` for 10% |

---

## Step 4: Test in Stripe Test Mode

Before enabling Klarna in production:

1. Set `KLARNA_ROLLOUT=test` and `STRIPE_SECRET_KEY=sk_test_...`.
2. In the checkout, select **Pay by card** → the Stripe Payment Element should
   show Klarna as an option for supported billing countries.
3. Use Klarna's [test payment details] to simulate approved, declined, and
   processing outcomes.
4. Verify the Stripe Dashboard registers the payment_intent events.
5. Verify the `stripe-webhook` route receives events and that structured logs
   appear in the API server console.

### Klarna test card numbers

Use these in the Klarna authorisation page during testing:

| Scenario | Action |
|---|---|
| Approved | Click "Confirm purchase" |
| Declined | Click "Reject" |
| Pending (processing) | Click "Pending" |

---

## Step 5: Gradual Production Rollout

After QA sign-off:

1. Deploy with `KLARNA_ROLLOUT=percentage` and `KLARNA_ROLLOUT_PERCENTAGE=5`.
2. Monitor:
   - Stripe Dashboard → Payments (filter by payment method: Klarna).
   - Presentail API logs for `klarna_cohort=exposed` metadata on PaymentIntents.
   - Dispute rate on the Stripe Dashboard.
   - Klarna conversion rate.
3. Increase `KLARNA_ROLLOUT_PERCENTAGE` in 10–20% increments, monitoring each
   stage for 24–48 hours.
4. Set `KLARNA_ROLLOUT=on` only after Ahmad explicitly approves full rollout.

---

## Supported Countries and Currencies (Reference)

Klarna eligibility is determined server-side by Stripe. The following is a
high-level summary; Stripe's authoritative list takes precedence.

| Country | Currencies typically supported |
|---|---|
| Germany (DE) | EUR |
| Sweden (SE) | SEK, EUR |
| Norway (NO) | NOK |
| Denmark (DK) | DKK |
| Finland (FI) | EUR |
| Netherlands (NL) | EUR |
| Belgium (BE) | EUR |
| Austria (AT) | EUR |
| Switzerland (CH) | CHF |
| Spain (ES) | EUR |
| France (FR) | EUR |
| Italy (IT) | EUR |
| Portugal (PT) | EUR |
| Ireland (IE) | EUR |
| United Kingdom (GB) | GBP |
| United States (US) | USD |
| Canada (CA) | CAD |
| Australia (AU) | AUD |
| New Zealand (NZ) | NZD |

> UAE (AED) is **not** currently supported by Klarna. The Gulf Stripe account
> uses `allow_redirects: "never"` by default to prevent redirect-based methods
> from showing in AED checkout sessions.

---

[Dynamic Payment Methods]: https://stripe.com/docs/payments/payment-methods/integration-options#using-dynamic-payment-methods
[Klarna payment method guide]: https://stripe.com/docs/payments/klarna
[test payment details]: https://stripe.com/docs/testing#klarna
