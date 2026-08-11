# CyberSource Unified Checkout — Setup Guide

## Overview

CyberSource Unified Checkout (UC) with Payer Authentication (3DS 2.x) is available
exclusively for shoppers whose IP geolocates to Lebanon **and** whose checkout currency
is USD. All other shopper contexts continue to use Stripe unchanged.

---

## Required Environment Variables

Set the following in the Replit Secrets panel (or equivalent):

| Variable | Description | Example |
|---|---|---|
| `CYBERSOURCE_MERCHANT_ID` | Business Center Merchant ID | `presentail_lb` |
| `CYBERSOURCE_API_KEY_ID` | REST API key ID from Business Center | `abc123...` |
| `CYBERSOURCE_SHARED_SECRET_KEY` | Shared secret key (Base64-encoded) | `<base64 string>` |
| `CYBERSOURCE_BASE_URL_TEST` | CyberSource sandbox base URL | `https://apitest.cybersource.com` |
| `CYBERSOURCE_BASE_URL_PROD` | CyberSource production base URL | `https://api.cybersource.com` |
| `CYBERSOURCE_ENV` | Active environment: `test` or `production` | `test` |
| `CYBERSOURCE_ALLOWED_ORIGINS` | Comma-separated allowed origins for Microform | `https://presentail.com,https://www.presentail.com` |
| `CYBERSOURCE_ALLOWED_NETWORKS` | _(optional)_ Comma-separated card networks | `VISA,MASTERCARD,AMEX` |

### Generating API Credentials

1. Log in to the CyberSource Business Center:
   - Sandbox: https://ebctest.cybersource.com
   - Production: https://ebc2.cybersource.com
2. Navigate to **Payment Configuration → Key Management → REST API Keys**.
3. Click **Generate Key** and select **Shared Secret**.
4. Copy the **Key ID** → `CYBERSOURCE_API_KEY_ID`.
5. Copy the **Shared Secret** (Base64-encoded) → `CYBERSOURCE_SHARED_SECRET_KEY`.

---

## Config-Check Endpoint

After setting the variables, confirm they are all present (without revealing values) via:

```
GET /api/admin/cybersource/config-check
x-admin-token: <PUSH_ADMIN_TOKEN>
```

Response example:
```json
{
  "ok": true,
  "environment": "test",
  "resolvedBaseUrl": "https://apitest.cybersource.com",
  "vars": [
    { "key": "CYBERSOURCE_MERCHANT_ID", "present": true, "value": "***set***" },
    { "key": "CYBERSOURCE_API_KEY_ID",   "present": true, "value": "***set***" },
    ...
  ]
}
```

---

## Business Center Configuration

### Allowed Origins (CORS)

In Business Center → **Unified Checkout → CORS Domains**, add every domain the
Microform JavaScript will be loaded from:

- `https://presentail.com`
- `https://www.presentail.com`
- Any Replit dev domains used for testing

These domains must also appear in `CYBERSOURCE_ALLOWED_ORIGINS`.

### Payer Authentication (3DS 2.x)

1. Navigate to **Risk → Payer Authentication**.
2. Ensure **Payer Authentication** is **Enabled**.
3. The 3DS Return URL is handled automatically by the `/api/payment/cybersource/3ds-return`
   server endpoint — register this URL in Business Center:
   `https://presentail.com/api/payment/cybersource/3ds-return`
   (and add the Replit dev domain equivalent for sandbox testing).
   Do **not** register `/checkout/payment-resume` here — that path is for other
   payment providers' hosted-redirect flows and will bypass the 3DS transactionId
   return mechanism used by the inline iframe challenge flow.

### Accepted Card Networks

By default, Visa, Mastercard, and American Express are enabled. To restrict or
extend the allowed networks, update `CYBERSOURCE_ALLOWED_NETWORKS`.

---

## API Endpoints

### `POST /api/payment/cybersource/capture-context`

Returns the capture-context JWT required to initialize the UC Microform.

**Request body:**
```json
{
  "currency": "USD",
  "amount": 55.00
}
```

**Response:**
```json
{
  "ok": true,
  "captureContext": "<JWT string>"
}
```

Returns `403` when the caller's IP is not Lebanon or the currency is not USD.

---

### `POST /api/payment/cybersource/authorize`

Resolves cart prices server-side, then submits an auth+capture payment to
CyberSource. Returns a `paymentRef` for use in `/woo/order`.

**Request body:**
```json
{
  "transientToken": "<transient token from UC Microform>",
  "orderId": "PR-12345",
  "currency": "USD",
  "items": [{ "wcId": 0, "osSlug": "teddy-bear-123", "quantity": 1 }],
  "district": "Beirut",
  "expressDelivery": false,
  "threeDSAuthData": {
    "cavv": "AAABCSIIAAAAAAACcwgAEMCoNh==",
    "eci": "05",
    "authenticationTransactionId": "trx123"
  }
}
```

**Success response:**
```json
{
  "ok": true,
  "paymentRef": "7054985937856294904810",
  "status": "AUTHORIZED"
}
```

Accepted statuses: `AUTHORIZED`, `AUTHORIZED_PENDING_REVIEW`.
Returns `402` for `DECLINED` or other non-authorized terminal statuses.

For `PENDING_AUTHENTICATION` (3DS challenge required) the server returns HTTP 200 with:
```json
{
  "ok": false,
  "pending3DS": true,
  "stepUpUrl": "https://acs.issuer.example/challenge",
  "accessToken": "<JWT to POST to stepUpUrl>",
  "csStatus": "PENDING_AUTHENTICATION"
}
```
The client shows the ACS challenge in an iframe (POST `JWT=<accessToken>` to `stepUpUrl`),
then re-calls `/authorize` with `threeDSAuthData.authenticationTransactionId` set to
the transaction ID returned by the ACS via `/api/payment/cybersource/3ds-return`.

---

## Order Finalization

After a successful `/authorize`, call `/woo/order` as usual with:

```json
{
  "paymentMethod": "cybersource",
  "paymentRef": "<paymentRef from /authorize>",
  ...
}
```

The order route verifies the `paymentRef`↔`orderId` binding and the cart snapshot
before accepting the order as paid.

---

## Security Notes

- API credentials are never returned to the browser — all CyberSource calls are
  made server-side.
- The Lebanon+USD routing gate is verified independently on both `capture-context`
  and `authorize` so neither endpoint can be reached by bypassing the other.
- Cart prices and delivery fees are resolved from the OS catalog cache on the
  server; the client-supplied `amount` is ignored.
- The payment intent uses `capture: true` (auth+capture) so no separate capture
  step is required after authorization.
