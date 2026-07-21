---
name: CyberSource checkout integration
description: Architecture decisions for the CyberSource Unified Checkout (web + mobile) payment integration
---

## Key decisions

### Scope gate
CyberSource tile is only shown when `countryCode === "LB"` AND `displayCurrency === "USD"` — enforced on both web and mobile. When `CYBERSOURCE_MERCHANT_ID`/`CYBERSOURCE_API_KEY_ID`/`CYBERSOURCE_SHARED_SECRET_KEY` are unset, the server returns 503 and the tile auto-hides (capture-context failure guard).

### Mobile: csOnTokenRef callback pattern
`finishAfterPayment` is defined inside `placeOrder` (not at CheckoutScreen level). The WebView Modal is in CheckoutScreen's JSX and cannot call `finishAfterPayment` directly. Fix: `csOnTokenRef = useRef<((token: string) => Promise<void>) | null>(null)` at component level; `placeOrder` sets `csOnTokenRef.current` to an async callback that calls `chargeCybersource` + `finishAfterPayment`. The modal's `onMessage` calls `csOnTokenRef.current(token)`.

### Web: CyberSourceSection expiry ownership
The `CyberSourceSection` component manages expiry state internally (renders its own input + parsing). `createToken()` has no params — it reads the component's own `expiry` state. The parent Checkout.tsx does NOT pass expiry props to the component.

### paymentMethod enum coverage
Three places must include "cybersource":
1. `artifacts/api-server/src/lib/wooOrders.ts` — Zod `z.enum([..., "cybersource"])`
2. `artifacts/presentail/lib/woo.ts` — TypeScript `WooOrderPayload.paymentMethod` union
3. `artifacts/presentail/lib/analytics.ts` — `AnalyticsAction` union

### paymentRef format
`"cybs:{paymentId}"` where `paymentId` is the CyberSource `applicationInformation.riskProfile.profile.name` field (or auth transaction ID) from the 201 response. Set in `artifacts/api-server/src/routes/woo.ts` cybersource block.

### PaymentStep component scope
`selectedCountry` from `CheckoutScreen` is NOT accessible inside `PaymentStep` (separate function, line 3682+). The prop passed is `country`, so use `country?.code` not `selectedCountry?.code` inside `PaymentStep`.

## HTTP Signature auth — critical gotchas

### Header name: Authorization, not Signature
CyberSource REST APIs require the signature in **`Authorization: Signature keyId=...`** NOT in a bare `Signature:` header. Using `Signature:` causes HTTP 401 "Authentication Failed". The `buildHeaders()` function in `lib/cybersource.ts` was fixed to use `Authorization: Signature ${signatureHeader}`.

### CYBERSOURCE_ENVIRONMENT must be "live" for production
The production merchant account (`blom_presentail1`) lives on `api.cybersource.com`. Defaulting to `"test"` (apitest.cybersource.com) causes 401 for live merchants. Set `CYBERSOURCE_ENVIRONMENT=live` in Replit secrets.

### Cannot test from Replit container IPs
CyberSource's WAF/gateway returns HTTP 406 "contact support" for requests originating from cloud-hosting IP ranges (Replit, AWS, GCP, etc). This is enforced at their network layer, not the API layer — even valid credentials get 406. The integration can only be validated end-to-end from a production deployment or a non-cloud IP. Do not interpret 406 from Replit as a code bug.

### Credentials notes
- `CYBERSOURCE_SHARED_SECRET_KEY` is base64-encoded; `buildHeaders()` decodes it before use as the HMAC key.
- All three credential env vars are `.trim()`-ed at read time to avoid stray-newline failures.
- Key ID (UUID) and shared secret are only shown once at creation time in Business Center — regenerate if the original value was not captured.
