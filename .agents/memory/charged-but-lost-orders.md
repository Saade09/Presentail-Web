---
name: Charged-but-lost order safety net
description: Why card payments could charge without creating an order, and the layered rescue design (pending record + webhook + sweeper + idempotency lock)
---

# Charged-but-lost orders (LB-2029 incident, Aug 2026)

**Failure mode:** card charge succeeds client-side (confirmCardPayment), but the browser's POST /api/woo/order never completes (3DS return failure, tab close, stale-chunk reload) or the server rejects it (autoscale instance without the in-memory payment-intent snapshot + cold OS cache → fail-closed amount_mismatch). Customer charged, no order anywhere. Apple/Google Pay were unaffected because they have no redirect.

**Rule:** any payment method that captures money before the order POST must persist the full order payload server-side BEFORE confirming the payment, and something server-side must be able to finish the order without the browser.

**The layered net:**
1. Web card flow POSTs the order payload to `/api/checkout/klarna-pending` (generic despite the name) before confirm — this write is MANDATORY; the client fails closed if it can't be stored.
2. `payment_intent.succeeded` webhook creates the order from the stored payload. Gotcha: it must NOT override paymentMethod with "stripe" — that value is not in WooOrderSchema's enum and silently failed every webhook order creation.
3. `pendingCheckoutSweeper` (every 2 min) probes Stripe directly for stuck pending rows and submits the stored payload — works even with NO webhook secrets configured.
4. `/woo/order` serializes contenders with a pg advisory lock on orderId (cross-instance) + idempotency check on app_orders.os_order_id, returning `alreadyCreated` instead of duplicating.

**Why:** browser, webhook, and sweeper race by design (each is the others' backup); duplicates to OS trigger real fulfillment/emails, so the lock+check must run server-side in the shared DB, not in memory.

**Env gotcha:** production had no STRIPE_WEBHOOK_SECRET / STRIPE_WEBHOOK_SECRET_GULF — the webhook route 503s without them; the sweeper is the only net until they're set (endpoint: https://presentail.com/api/stripe/webhook, events: payment_intent.* and charge.dispute.*/refund).

**Known bounded risk:** the pending endpoint + recovery path accept any cart whose authoritative cost ≤ amount_received for a valid PI/orderId pair; a hardened fix would persist a server-side checkout snapshot at PI creation.
