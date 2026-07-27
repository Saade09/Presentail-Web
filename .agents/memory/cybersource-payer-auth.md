---
name: CyberSource Payer Auth (3DS)
description: Backend 3DS implementation — endpoint paths, eligibility rules, consumerAuthInfo flow, and key design decisions.
---

## Eligibility rule
Wallet payment types (GOOGLEPAY, APPLEPAY) are added to the capture context `allowedPaymentTypes` only when the **client IP resolves to Lebanon**. Delivery address, billing address, and browser locale are never used. This is enforced server-side in `POST /payment/cybersource/capture-context` via `pickClientIp` + `lookupCountryFromIp`.

## 3-step Payer Auth flow

| Step | Route | CyberSource endpoint |
|------|-------|---------------------|
| 1 | `POST /payment/cybersource/payer-auth/setup` | `/risk/v1/authentication-setups` |
| 2 | `POST /payment/cybersource/payer-auth/enroll` | `/risk/v1/authentications` |
| 3 | `POST /payment/cybersource/payer-auth/validate` | `/risk/v1/authentication-results` |

**Step 1 → setup**: takes `orderId` + `transientTokenJwt`; returns `{ accessToken, deviceDataCollectionUrl, referenceId }`. Frontend loads `deviceDataCollectionUrl` in a hidden iframe. `referenceId` must be passed to step 2.

**Step 2 → enroll**: takes `orderId`, `transientTokenJwt`, `totalAmount`, `currency`, `returnUrl`, `referenceId`. Returns:
- `action: "CONTINUE"` — frictionless; proceed directly to charge with `authenticationTransactionId`
- `action: "CONSUMER_AUTHENTICATION_REQUIRED"` — challenge; open `stepUpUrl` in iframe; after completion call validate

**Step 3 → validate**: takes `orderId` + `authenticationTransactionId`. Returns `payerAuthData` (cavv, eci, xid, ucafAuthenticationData, paSpecificationVersion, directoryServerTransactionId).

## Charge with 3DS
Pass `payerAuthData` from the validate step as `payerAuthData` in the `POST /payment/cybersource/charge` request body. The route forwards it as `consumerAuthenticationInformation` in the CyberSource payment payload. Same pattern for wallet charges (no route param yet, can be added).

## Wallet payment method labels
`POST /payment/cybersource/wallet-charge` now returns `paymentMethod: "cybersource_googlepay"` or `"cybersource_applepay"` in the response. The frontend should pass this as the order's `paymentMethod` when creating the WooCommerce order.

**Why:** The spec requires distinct payment method labels per wallet type on the order record, and the charge endpoint is the only point that knows the wallet type server-side.

## generateCaptureContext extraPaymentTypes
The function accepts an optional `extraPaymentTypes?: string[]` merged dedup-safe with `["CARD"]`. The capture-context route passes `["GOOGLEPAY", "APPLEPAY"]` when IP=LB. Non-LB IPs get only `["CARD"]`.
