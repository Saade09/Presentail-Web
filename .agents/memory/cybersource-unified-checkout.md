---
name: CyberSource Unified Checkout (v1)
description: Verified UC v1 API/SDK facts — session endpoint, 3DS enum, SDK loading from JWT claims, result JWT handling, dual-flag rollout
---

# CyberSource Unified Checkout v1 — verified integration facts

- Session (capture context): `POST /uc/v1/sessions` with `Accept: application/jwt`; the response body IS the JWT. Omit `clientVersion` from the request to opt into SDK auto-updates.
- `completeMandate: { type: "CAPTURE", consumerAuthentication: "3DS" }` — `consumerAuthentication` is an **enum string** in v1 (not a boolean). This makes UC run device data collection, enrollment, and challenge internally; the legacy `/payer-auth/*` pipeline must NOT run alongside it.
- SDK script URL + SRI hash MUST come from the session JWT claims (`clientLibrary` / `clientLibraryIntegrity`, found under `ctx[0].data` or flat `data`). Never hardcode the CDN URL; load the `<script>` with `integrity` + `crossorigin="anonymous"`.
- Client flow: `client = await VAS.UnifiedCheckout(jwt)` → `client.createCheckout({ autoProcessing: true })` → `checkout.mount(...)` (embedded mode) resolves with a **completed-payment result JWT string**; rejections are `UnifiedCheckoutError` with `.reason`. Clean up via `checkout.destroy()` / `client.destroy()`.
- Result-JWT claim layout is undocumented → use tolerant extractors (check flat, `data`, `ctx[0].data`, `paymentResponse` roots) on both client and server.

**Why:** CyberSource mandated the LB+USD web flow move off Microform v2 + manual Payer Auth REST (July 2026). Docs gaps above cost real research time; the SDK-URL-from-JWT rule is a docs requirement, not a style choice.

**How to apply:**
- The client-posted result (approved/requestId/status) is only a PRE-FILTER. The paid gate is server-authoritative: confirm via Transaction Details `GET /tss/v2/transactions/{requestId}` (HTTP Signature GET — signing string has no digest) and require approval evidence (ics_auth rFlag SOK / reasonCode 100, or approved top-level status) AND captured amount+currency matching the server-recomputed total. Fail closed on 404 (retry a few times first — tss indexing lags a beat), declines, missing amount fields, or network errors. A completion review WILL reject any payment flow that marks paid from client-posted fields alone.
- Client status allowlist mirror (AUTHORIZED, PARTIAL_AUTHORIZED, AUTHORIZED_PENDING_REVIEW, PENDING_REVIEW) still applies before the lookup; `AUTHORIZED_RISK_DECLINED` and 2xx-with-DECLINED are never paid (same rule as the legacy charge path).
- Rollout needs BOTH `CYBERSOURCE_UNIFIED_CHECKOUT_ENABLED` (API) and `VITE_CYBERSOURCE_UNIFIED_CHECKOUT_ENABLED` (web); either off → transparent Microform + payer-auth fallback. Web must also check the server-advertised `unifiedCheckoutEnabled` from `/payment/cybersource/available`, not just the Vite flag, so a server rollback wins.
- Session/complete amount drift is caught by an in-memory pending-session map keyed by orderId; a missing record is tolerated (server restarts) — total is still recomputed server-side from the cart either way.
- Live CyberSource is unreachable from Replit (WAF 406 on api/apitest hosts) — a connection failure here is environmental, not a code bug; real 3DS card testing needs a network that can reach CS.
