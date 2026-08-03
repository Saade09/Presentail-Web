---
name: CyberSource integration removed
description: CyberSource payment integration was completely removed in August 2026; historical data preserved read-only.
---

# CyberSource Integration Removed

**Date removed:** August 2026

## Status
CyberSource (Microform, Unified Checkout, Payer Auth 3DS) was fully removed from the Presentail codebase. A future implementation can start from a clean slate.

## Historical data preserved
- `lib/db/migrations/0016_cs_payment_attempts.sql` — do NOT drop (production data)
- `lib/db/src/schema/csPaymentAttempts.ts` — Drizzle schema kept for read-only queries on historical orders
- `lib/db/migrations/0018_cs_legacy_readonly.sql` — CHECK constraint preventing new rows after 2026-08-03

## LB+USD shoppers
- Web (`Checkout.tsx`): "Card payment is temporarily unavailable" notice renders via `isLbUsd` flag (senderCountryCode === "LB" && currencyCode === "USD"). Translation key: `checkout.pay.cardTemporarilyUnavailable`.
- Mobile (`checkout.tsx`): Same via `isLbUsd` in the payment picker IIFE. Translation key: `t.checkoutCardTemporarilyUnavailable`.

## What `wooOrders.ts` keeps
- Line ~456: `(body.paymentMethod as string) === "cybersource"` in `requiresOnlinePayment` — legacy cast for historical orders display. This is intentional and must remain.

## Secrets requiring manual deletion
CYBERSOURCE_MERCHANT_ID, CYBERSOURCE_API_KEY_ID, CYBERSOURCE_SHARED_SECRET_KEY, CYBERSOURCE_ENVIRONMENT, CYBERSOURCE_GOOGLE_PAY_MERCHANT_ID, CYBERSOURCE_CHECKOUT_ENABLED, CYBERSOURCE_UNIFIED_CHECKOUT_ENABLED, CYBERSOURCE_PAYER_AUTH_ENABLED, CYBERSOURCE_PA_API_IDENTIFIER, CYBERSOURCE_PA_API_KEY, CYBERSOURCE_PA_ORG_UNIT_ID

**Why:** CS integration removed to rebuild from scratch; historical order records must remain readable.
