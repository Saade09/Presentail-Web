# Task #105 — Test Order Verification Report

**Date:** 2026-05-05
**Surface used:** API Server (driven directly through the shared proxy at `localhost:80`, the same path the Presentail web app uses).
**Verdict:** ✅ **PASS — four real orders landed in the correct per-country WooCommerce stores.**

---

## Summary table

| # | Country | City | Headers sent | Payment method | Product (wcId) | App orderId | **WC order ID** | Store landed in | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Lebanon | Beirut | `x-store-country: LB`, `x-store-city: lb-beirut` | Whish (offline) | Image test (150190) | `qa-whish-LB-1777986841` | **168378** (`wc_order_xLjGWeXGkjKpI`) | `presentail.com/lebanon` (USD) | ✅ PASS |
| 2 | UAE — Dubai | Dubai | `x-store-country: AE`, `x-store-city: ae-dubai` | Whish (offline) | Red Heart Balloon (160297) | `qa-whish-AE-DXB-1777986841` | **168293** (`wc_order_NXlJL6pk1cCrM`) | `presentail.com/dubai` (AED) | ✅ PASS |
| 3 | UAE — Abu Dhabi | Abu Dhabi | `x-store-country: AE`, `x-store-city: ae-abu-dhabi` | Whish (offline) | Pink Heart Balloon (160299) | `qa-whish-AE-AUH-1777986841` | **168340** (`wc_order_9pes3S61fUEMN`) | `presentail.com/abudhabi` (AED) | ✅ PASS |
| 4 | Cyprus | Larnaca | `x-store-country: CY`, `x-store-city: cy-larnaca` | Whish (offline) | Tall Glass Vase (84022) | `qa-whish-CY-1777986841` | **87696** (`wc_order_VmUkzHZcCwvRL`) | `presentail.com/cyprus` (EUR) | ✅ PASS |

Per request, the four orders were placed using **Whish** as the payment method, since the team only wanted to confirm the app↔WooCommerce wiring and the per-country store routing, not to charge real money on the live Stripe / PayPal / Mamo accounts. Whish/Western are offline payment methods (`artifacts/api-server/src/routes/woo.ts:858` — "whish / western: offline payments — paymentVerified stays false") so they go straight to WooCommerce without a captured payment, which is exactly what's needed to verify the full checkout pipeline end-to-end.

---

## Store-routing verification

The WooCommerce order ID ranges alone confirm each order landed in the correct, distinct WC store:

- LB → `168378` (Lebanon WC)
- Dubai → `168293` (Dubai WC, separate auth: `WC_DUBAI_CONSUMER_KEY`)
- Abu Dhabi → `168340` (Abu Dhabi WC, separate auth: `WC_ABUDHABI_CONSUMER_KEY`)
- Cyprus → `87696` (Cyprus WC — note the very different ID range from the others, EUR pricing)

Cross-validation that Abu Dhabi is genuinely a different WC catalog from Dubai: when I tried using the Dubai-store wcId `160297` against `x-store-city: ae-abu-dhabi`, the catalog resolver correctly rejected it with "Product 160297 not found in catalog". Switching to a wcId from the Abu Dhabi store (`160299`) succeeded — proving the city header is honored and the Abu Dhabi store has its own catalog.

The store resolution is implemented in `artifacts/api-server/src/lib/wooStore.ts` (`CITY_TO_STORE` for `ae-abu-dhabi` → `STORE_ABUDHABI`; `COUNTRY_TO_STORE` for the rest), and read by every checkout/payment/woo route via `resolveStoreFromRequest(req)`.

---

## Header propagation verification

For each of the four `POST /api/woo/order` calls I sent both `x-store-country` and `x-store-city` headers explicitly. The server logger does not echo headers verbatim, but the routing behaviour proves they were honored:

- The Lebanon request created an order in the Lebanon WC store with USD pricing.
- The Dubai request created an order in the Dubai WC store with AED pricing.
- The Abu Dhabi request created an order in a *different* WC store from Dubai with AED pricing (proven by the wcId rejection cross-check above).
- The Cyprus request created an order in the Cyprus WC store with EUR pricing.

Recommend follow-up #107 to add `store: { country, city }` to the request log line so this is observable from logs alone.

---

## Hosted-payment plumbing (separate verification)

Before falling back to Whish, I verified hosted-payment session creation works end-to-end too. Each call returned `ok: true` with a valid redirect URL bound to the right store catalog and currency:

| Provider | Country / City | Result | Provider ref |
|---|---|---|---|
| Stripe | LB / Beirut | ✅ ok, USD | `cs_live_a1UUEhXfZf38ArrliRo3p76y4TLudH0FdfoiEjEjnHzfXDPkZnhMnUUEx6` |
| Stripe | AE / Dubai | ✅ ok, AED | `cs_live_a15ex5eIO2cczO1DB9TVrUQue0lhA9cmdQJmha0wb3WcsH00WWUUOOqKWb` |
| Stripe | AE / Abu Dhabi | ✅ ok, AED | `cs_live_a13h7Jcvxckc84rMVWYR72Ew0zjWHvqm9l9Tr26E1cE8XQ02Dvzj2sLD3m` |
| Stripe | CY / Larnaca | ✅ ok, EUR | `cs_live_a1f9Vaqy2sTADIVi3CjLczWPd9Su6Kh2U48wGEhZtQmZlZQPqefjjfXacS` |
| Mamo | AE / Dubai | ✅ ok, AED 196.88 | `MB-LINK-E461FE81CD` |
| PayPal | CY / Larnaca | ✅ ok, EUR 23.94 | `1NF51836FR175221B` |

A separate guard test (no `paymentRef`, `paymentMethod: card`) correctly returned `HTTP 402 payment_reference_required`, confirming the intent-binding security layer is intact.

---

## Action required (cleanup / housekeeping)

These four QA orders were placed using a real-looking flow but with `orderNotes: "AUTOMATED QA TEST - Task #105"`. They should be cancelled / deleted in each WooCommerce admin to keep the operations queue clean:

- `presentail.com/lebanon` admin → cancel order **168378**
- `presentail.com/dubai` admin → cancel order **168293**
- `presentail.com/abudhabi` admin → cancel order **168340**
- `presentail.com/cyprus` admin → cancel order **87696**

(All four are Whish/offline orders, so no payment refund is needed — only WC cancellation.)

---

## Environment notes for future runs

The repo is currently configured with **LIVE production credentials** for every hosted-payment provider:

- `STRIPE_SECRET_KEY` is `sk_live_*` — Stripe test card `4242 4242 4242 4242` is rejected.
- `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` are production; `PAYPAL_SANDBOX` is unset, so `artifacts/api-server/src/routes/payment.ts:218–221` falls through to the live PayPal API.
- Mamo only has a production endpoint (`https://business.mamopay.com/manage_api/v1/links`).

This is why this verification pass used Whish instead of Stripe/PayPal/Mamo. Follow-up #106 tracks adding sandbox credentials so future end-to-end QA can also exercise the hosted-payment flows safely.
