---
name: CyberSource capture-context schema
description: Required fields, valid enum values, and forbidden fields for POST /up/v1/capture-contexts; also documents the clientLibrary UC SDK URL embedded in the JWT.
---

# CyberSource /up/v1/capture-contexts — Required Field Schema

## Required fields (all must be present or CyberSource returns 400)
- `clientVersion` — string, e.g. `"0.23"` (no `v` prefix)
- `locale` — MUST use underscore separator: `"en_US"` not `"en-US"` (ISO 639_ISO 3166 format)
- `country` — two-letter ISO country code at ROOT of body (not inside orderInformation)
- `targetOrigins` — array of fully-qualified HTTPS origins (no path, no trailing slash)
- `allowedCardNetworks` — e.g. `["VISA", "MASTERCARD", "AMEX"]`
- `allowedPaymentTypes` — valid enum values: `PANENTRY`, `SRC`, `GOOGLEPAY`, `CLICKTOPAY`, `APPLEPAY`, `PAZE`, `CHECK`, `AFTERPAY`, `IDEAL`, `MULTIBANCO`, `PRZELEWY24`, `MYBANK`, `KONBINI`, `DRAGONPAY`, `BANCONTACT`, `TINKPAYBYBANK`, `PAYPAL`, `VENMO`, `TMS_TOKEN`. **"CARD" is NOT valid.** Use `PANENTRY` for manual card entry (Flex Microform).
- `orderInformation.amountDetails.totalAmount` — must be > 0 (string); `"0.00"` is invalid; use `"1.00"` as placeholder when no amount is known yet
- `orderInformation.amountDetails.currency` — e.g. `"USD"`

## Forbidden fields (cause 400 with "not defined in the schema" error)
- `payerAuthenticationConfig` — NOT valid on capture-contexts; payer auth (3DS) is triggered at `/pts/v2/payments` via `payerAuthEnrollService.run="true"`

## targetOrigins pitfalls
- `CYBERSOURCE_ALLOWED_ORIGINS` env var may have bare hostnames without scheme (e.g. `presentail.com`). These fail `new URL()` and get filtered. Code now auto-prepends `https://` for bare hostnames.
- Always auto-include `req.headers.origin` so any browser origin is covered without listing every domain in env var.

## JWT clientLibrary field
The returned JWT embeds the correct SDK URL in `clientLibrary`. For production with clientVersion `"0.23"` this is:
`https://up.cybersource.com/uc/v1/assets/0.23.3/SecureAcceptance.js`

This is the **Unified Checkout SDK** (`SecureAcceptance.js` from `up.cybersource.com`), NOT the Flex Microform SDK (`flex.cybersource.com/microform/bundle/v2/flex-microform.min.js`). The frontend should load the SDK URL from `clientLibrary` in the JWT (or hardcode `up.cybersource.com/uc/v1/assets/...` for the UC product).

## Diagnostic script
`artifacts/api-server/scripts/test-cs-capture-context.mjs` — calls the endpoint directly using server env vars and prints full request body + raw response. Run with:
```
cd artifacts/api-server && node scripts/test-cs-capture-context.mjs
```

**Why:** Every field validation error only appears one at a time in the CyberSource 400 response. Use the diagnostic script to iterate quickly without needing a Lebanon IP.

**How to apply:** Any change to the capture-context body shape must be tested with this script first.
