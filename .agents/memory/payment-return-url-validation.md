---
name: Payment return-URL validation contract
description: Why PayPal/Mamo/Tabby return URLs must NOT be path-restricted to the /api/payment/return bridge
---

**Rule:** `validateRedirectUrl`'s `payment-return` kind must only enforce HTTPS + host allowlist (presentail.com, www, REPLIT_DOMAINS). Never re-add a path restriction requiring `/api/payment/return`.

**Why:** July 2026 incident — an open-redirect hardening added that path requirement. Mobile sends the bridge URL, but web checkout has always sent ordinary page URLs (`/order-confirmed?status=...`), so every web PayPal/Mamo/Tabby payment got an instant 400 (`invalid_redirect_url`, responseTime ~0ms in logs) for days until a live customer reported "website not accepting any payment methods" via WhatsApp. The host allowlist alone blocks the phishing/open-redirect vector; the bridge validates its own `deeplink` param independently.

**How to apply:** Any change to redirect validation for payment session routes must keep web page URLs on allowed hosts valid. Regression tests: `artifacts/api-server/tests/validateRedirectUrl.test.ts`.

**Debugging tip:** "payment not accepting" reports → check prod `analytics_events` (name `payment_error`/`payment_failed`, `properties_json` has currency/method) and deployment logs for 400s with ~0ms responseTime (= early validation reject, no provider call). Distinguish one shopper's card declines from systemic breakage by counting `payment_completed` for other sessions.
