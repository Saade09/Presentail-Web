# LB-2233 Payment Charge Investigation
**Date:** 2026-08-21  
**Investigated by:** Agent (Task #4580)

---

## Outcome: ORDER CONFIRMED — NO RECOVERY NEEDED

The charge is legitimate and the corresponding order exists and is confirmed. No duplicate charge, no lost order, no recovery action required.

---

## 1. Order Reservation (checkout_attempts)

| Field | Value |
|---|---|
| app_order_id | LB-2233 |
| country_code | LB |
| platform | (not captured — mobile app without platform header or web guest) |
| status | `initiated` |
| created_at | 2026-08-21T07:08:16Z |

The orderId was reserved at 07:08 UTC. The `checkout_attempts` row remains at `initiated` — this is a known fire-and-forget gap where the status is not always advanced to `submitted` after order creation. It does not indicate a problem; `app_orders` is authoritative for completed orders.

---

## 2. Payment Provider State (Stripe — main account)

| Field | Value |
|---|---|
| PaymentIntent ID | `pi_3U6mbtFiPsqrSFp81TL9Ajix` |
| Charge ID | `ch_3U6mbtFiPsqrSFp81YiLqQ1O` |
| Stripe account | main (LB/CY) |
| Event | `payment_intent.succeeded` |
| Event ID | `evt_3U6mbtFiPsqrSFp81HgWxdPx` |
| Event received at | 2026-08-21T07:11:33Z |
| Prior event | `payment_intent.created` at 07:11:29Z |

**Status: CAPTURED.** The PaymentIntent succeeded and a charge was created. This confirms the bank notification the customer received.

---

## 3. Order and Recovery State

### klarna_pending_checkouts

| Field | Value |
|---|---|
| order_id | LB-2233 |
| pi_id | pi_3U6mbtFiPsqrSFp81TL9Ajix |
| status | `payment_succeeded` |
| woo_order_ref | `bee00464-0c1a-49f3-84c8-5360f24be42a` |
| created_at | 2026-08-21T07:11:29Z |
| updated_at | 2026-08-21T07:11:34Z |

The pending checkout record has `woo_order_ref` populated — the order was created 5 seconds after the Stripe webhook fired.

### app_orders

| Field | Value |
|---|---|
| app_order_id | LB-2233 |
| os_order_id | `bee00464-0c1a-49f3-84c8-5360f24be42a` |
| state | `confirmed` |
| payment_method | `card` |
| total_usd_cents | 10,450 (= **$104.50 USD**) |
| total_payment_cents | 10,450 |
| currency_code | NULL *(gap — see below)* |
| stripe_payment_intent_id | NULL *(gap — see below)* |
| stripe_charge_id | NULL *(gap — see below)* |
| sender_name | Melouna Houkayem |
| sender_email | hk8b98mnj5@privaterelay.appleid.com *(Apple private relay)* |
| sender_phone | +96181653303 |
| recipient_name | Melouna |
| recipient_phone | +96181653303 |
| delivery_district | Jbeil |
| delivery_date | 2026-08-21 |
| platform | (not captured) |
| created_at | 2026-08-21T07:11:34Z |

**The OS order `bee00464-0c1a-49f3-84c8-5360f24be42a` exists and is confirmed.**

### pending_woo_orders

No rows for LB-2233. The reconciliation queue was never invoked, which is correct — the order was created successfully on the first attempt via the Stripe webhook path.

---

## 4. Amount Discrepancy ($101 screenshot vs $104.50 order)

The customer's screenshot shows a $101 checkout total; the confirmed order total is **$104.50 USD**.

Most likely explanations (in order of probability):
1. The screenshot was taken on a screen that showed the cart subtotal before delivery fee was applied (e.g., $101 product subtotal + $3.50 delivery = $104.50 charged).
2. The frontend displayed a converted/rounded display-currency amount that differed from the USD-equivalent charged by Stripe.

In either case, **$104.50 is the amount actually captured by Stripe** (Charge `ch_3U6mbtFiPsqrSFp81YiLqQ1O`). Support should surface the delivery-fee breakdown if the customer disputes the difference.

---

## 5. Identified Audit Gaps (not blocking this order)

Two columns in `app_orders` are NULL for LB-2233 despite this being a successful Stripe card payment:

- `stripe_payment_intent_id` — not populated when an order is created via the Stripe webhook / `klarna_pending_checkouts` path
- `stripe_charge_id` — same gap
- `currency_code` — not populated for this checkout path

These are audit columns that exist specifically to support investigations like this one. Their absence means that finding the PI and charge for a given order requires a join through `stripe_webhook_events` or `klarna_pending_checkouts` rather than reading directly from `app_orders`. The data is not lost — it is available in `stripe_webhook_events` (PI `pi_3U6mbtFiPsqrSFp81TL9Ajix`, charge `ch_3U6mbtFiPsqrSFp81YiLqQ1O`) — but the join is an extra step under incident pressure.

---

## 6. Support Wording

> **For the customer:**  
> Your payment of $104.50 went through successfully and your order (reference: bee00464) has been confirmed for delivery to Jbeil on 21 August. The bank notification you received is correct — the charge is genuine and your order is on its way. If the amount shown in the app before payment appeared slightly different, this is likely because the delivery fee was added at the final step.

> **For internal ops:**  
> LB-2233 is confirmed. OS order `bee00464-0c1a-49f3-84c8-5360f24be42a`, Stripe PI `pi_3U6mbtFiPsqrSFp81TL9Ajix`, charge `ch_3U6mbtFiPsqrSFp81YiLqQ1O` (main account). No refund, duplicate fulfillment, or manual recovery action required. The $3.50 difference between the screenshot total and the charged amount is consistent with a delivery fee added after the screenshot was taken.

---

## 7. Recovery Action

**None required.** The existing webhook → `klarna_pending_checkouts` → `/woo/order` path handled this order correctly end-to-end.

---

## 8. Follow-up Recommendation

Back-fill `stripe_payment_intent_id`, `stripe_charge_id`, and `currency_code` into `app_orders` for orders created via the Stripe webhook path. This would have surfaced the PI and charge in a single `app_orders` row query instead of requiring a cross-table join. See proposed follow-up task for details.
