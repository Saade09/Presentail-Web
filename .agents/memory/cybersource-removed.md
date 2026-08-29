---
name: CyberSource storefront removal
description: CyberSource checkout UI was removed in August 2026; historical data and mounted legacy backend compatibility paths remain.
---

# CyberSource Integration Removed

**Date removed:** August 2026

## Status
CyberSource (Microform, Unified Checkout, Payer Auth 3DS) was removed from the customer-facing web and mobile checkout. The API still mounts legacy CyberSource authorization and finalization paths for compatibility, so shared payment-integrity changes must include them even though shoppers cannot select CyberSource in the current UI.

## LB+USD shoppers
- Web (`Checkout.tsx`): "Card payment is temporarily unavailable" notice renders via `isLbUsd` flag (senderCountryCode === "LB" && currencyCode === "USD"). Translation key: `checkout.pay.cardTemporarilyUnavailable`.
- Mobile (`checkout.tsx`): Same via `isLbUsd` in the payment picker IIFE. Translation key: `t.checkoutCardTemporarilyUnavailable`.

## What `wooOrders.ts` keeps
- Line ~456: `(body.paymentMethod as string) === "cybersource"` in `requiresOnlinePayment` — legacy cast for historical orders display. This is intentional and must remain.

## Secrets requiring manual deletion
CYBERSOURCE_MERCHANT_ID, CYBERSOURCE_API_KEY_ID, CYBERSOURCE_SHARED_SECRET_KEY, CYBERSOURCE_ENVIRONMENT, CYBERSOURCE_GOOGLE_PAY_MERCHANT_ID, CYBERSOURCE_CHECKOUT_ENABLED, CYBERSOURCE_UNIFIED_CHECKOUT_ENABLED, CYBERSOURCE_PAYER_AUTH_ENABLED, CYBERSOURCE_PA_API_IDENTIFIER, CYBERSOURCE_PA_API_KEY, CYBERSOURCE_PA_ORG_UNIT_ID

**Why:** CS integration removed to rebuild from scratch; historical order records in the active order store must remain readable.

**How to apply:** do not restore CyberSource UI without explicit product approval. Keep historical order records readable, and when shared cart snapshots, delivery guards, or finalization invariants change, keep the mounted legacy API path fail-closed and covered by tests. Do not recreate a dedicated CyberSource-attempt store unless a new approved flow needs it.
