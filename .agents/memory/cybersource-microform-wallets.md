---
name: CyberSource Microform sessions — CARD only
description: /microform/v2/sessions rejects wallet payment types; silent Stripe fallback masks CyberSource outages
---

## Rule
Never put GOOGLEPAY/APPLEPAY (or anything besides CARD/CHECK) into the `allowedPaymentTypes` of the CyberSource Microform capture-context request (`POST /microform/v2/sessions`).

**Why:** Live CyberSource rejects the session with HTTP 400 `UNIFIEDPAYMENTS_VALIDATION_FIELDS` ("Possible allowed payment types: [CARD, CHECK]"). On 2026-07-27 wallet types were merged in for wallet-eligible (LB-IP) shoppers, which broke the capture context for every Lebanon shopper for ~40 min. The web checkout's `csCaptureContextError` fallback then silently switched those shoppers to Stripe — orders looked normal locally but no transaction of any kind reached CyberSource Business Center.

**How to apply:**
- Wallet tile visibility/eligibility is response-flag plumbing only (`walletsEligible`, `googlePayMerchantId`, `applePayEnabled`, `googlePayEnabled`); wallet flows never use the Microform JWT — Google/Apple Pay tokens go directly to the wallet-charge endpoint.
- A regression test asserts the session request body is exactly `["CARD"]`.
- When debugging "no transactions in Business Center": check capture-context stage logs FIRST — the silent Stripe fallback means shoppers still pay and orders still get created (via the Stripe branch), masking a total CyberSource outage. Structured `PAYMENT_DIAG` stage logs (capture_context → pa_* → charge → order_create_gate) with merchantId/environment now make each stage visible.
