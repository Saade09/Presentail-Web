---
name: CyberSource Payer Auth (3DS)
description: 3DS flow contracts (setup/check-enrollment/validate), flat response shapes, challenge return relay, and the contract-drift lesson.
---

## Read the merged backend before wiring a frontend
**Why:** The web 3DS wiring was first written against *anticipated* shapes (`/payer-auth/enroll`, `action: "CONTINUE"`, nested `payerAuthData`, numeric browserInfo) and a completion review rejected it — every stage would have 400'd in production with the flag on. The merged routes were the truth.
**How to apply:** treat `artifacts/api-server/src/routes/payment.ts` as the contract source; contract drift is pinned by `payment.payerAuth.test.ts`, whose fixtures mirror the exact frontend payloads — if those tests fight the frontend, fix the drift, not the test.

## Actual contracts (as merged)
- `POST /payment/cybersource/payer-auth/setup` — `{ transientTokenJwt, orderId, paymentAttemptId? }` → `{ ok, accessToken, deviceDataCollectionUrl, referenceId }`.
- `POST /payment/cybersource/payer-auth/check-enrollment` (not `/enroll`) — requires `amount`, `currency`, `returnUrl` besides token/referenceId/orderId; optional `billTo` (PayerAuthBillTo names) and `browserInfo` (CyberSource names: `acceptHeaders`, `userAgentBrowserValue`, string dimensions — NOT `acceptHeader`/`userAgent`/numbers). Response: `{ enrolled: true, stepUpUrl, accessToken, authenticationTransactionId }` (challenge) or `{ enrolled: false, ...FLAT 3DS fields }` (frictionless).
- `POST /payment/cybersource/payer-auth/validate` — keyed by `authenticationTransactionId` (from enrollment, never from iframe messages) → FLAT 3DS fields.
- All 3DS metadata is FLAT on response bodies — never nested. Web maps it via `extractCsPayerAuthData()` (`presentail-web/src/lib/csPayerAuth.ts`) into the charge's `payerAuthData`; charge gate needs cavv OR eci/eciRaw (`pa_required` otherwise).

## Challenge completion = return relay, not a Cardinal postMessage
The step-up iframe form-POSTs the `returnUrl` when the issuer challenge ends. Point `returnUrl` at `/api/payment/cybersource/payer-auth/return` — a no-auth HTML page that `parent.postMessage`s `{ MessageType: "cybersource.stepUpComplete" }`. The checkout modal listens for that same-origin message; the payload is only a "challenge over" ping — validation uses the enrollment's transaction id. TransactionId echoed into the page must stay regex-sanitized (XSS).

## Wallets and eligibility
- Wallet eligibility (Google/Apple Pay tiles) is gated on client IP = LB (`pickClientIp` + `lookupCountryFromIp`), never delivery address. It only sets response flags — wallet types must NEVER enter the Microform capture context (see cybersource-microform-wallets.md).
- `POST /payment/cybersource/wallet-charge` returns `paymentMethod: "cybersource_googlepay" | "cybersource_applepay"`; frontend passes it as the order's paymentMethod.

## Enabling 3DS
`/payment/cybersource/available` must expose `payerAuthEnabled` (frontend defaults false when absent). Flag on requires `CYBERSOURCE_PAYER_AUTH_ENABLED=true` + `CYBERSOURCE_PA_API_IDENTIFIER`/`API_KEY`/`ORG_UNIT_ID`; with the backend flag on but the field not exposed, every charge dies with `pa_required` — keep flag exposure and charge gating in lockstep.

## PA REST API auth = HMAC Signature, NOT Basic auth
The Payer Auth REST endpoints (`/risk/v1/authentication-setups`, `/risk/v1/authentications`, `/risk/v1/authentication-results`) use the **same HTTP Signature (HMAC-SHA256) as Payments** — `buildHeaders()` from `cybersource.ts`. The Cardinal/Cruise Control credentials (`CYBERSOURCE_PA_API_IDENTIFIER`, `CYBERSOURCE_PA_API_KEY`) are NOT used for server-side REST auth; they are merchant-configuration identifiers. `CYBERSOURCE_PA_ORG_UNIT_ID` IS passed as an extra `OrgUnitId` header on every PA REST call so CyberSource links the session to the correct Cardinal merchant account.
**Why:** The original implementation used `Authorization: Basic <apiIdentifier:apiKey>` which caused 401s from CyberSource on every PA setup call — "Card verification could not be started".
**How to apply:** Any new PA endpoint added to `cybersource-payer-auth.ts` must call `getCredentials()` + `buildHeaders()` for auth; never use Basic auth with PA credentials for REST calls.
