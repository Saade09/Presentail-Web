# Threat Model

## Project Overview
- Presentail Lebanon is a luxury flower and gift delivery storefront with an Expo mobile app, a Vite web storefront, and an Express 5 API server in a pnpm TypeScript monorepo. Product catalog data (listings, categories, occasions, brands) is served from the Presentail OS API (`os.presentail.com`). The API submits orders to WooCommerce and validates customer identity via WordPress JWT for mobile auth; these WooCommerce/WordPress dependencies are retained pending Presentail OS order/auth endpoints. The API creates hosted payment sessions with Stripe, Mamo, and PayPal, manages Expo push tokens in PostgreSQL via Drizzle ORM, and validates WordPress or server-issued JWTs for account operations.

## Assets

- **Customer accounts and sessions** -- WordPress JWTs, server-issued social-login JWTs, customer IDs, emails, names, phone numbers, and profile data. Compromise allows account takeover or unauthorized profile changes.
- **Order and delivery data** -- recipient names, phones, delivery addresses, delivery dates/slots, card messages, QR links, payment references, WooCommerce order IDs, and reconciliation queue payloads. This data contains personal and business-sensitive information.
- **Payment integrity** -- Stripe Checkout sessions, Mamo links, PayPal orders, payment references, order totals, product IDs, delivery fees, and WooCommerce `set_paid` status. Tampering can create underpaid or unpaid orders.
- **Application secrets** -- WooCommerce REST keys, Stripe/Mamo/PayPal secrets, `PUSH_ADMIN_TOKEN`, database URL, and JWT signing secrets. Exposure allows unauthorized store, payment, notification, or database operations.
- **Push notification tokens** -- Expo tokens, user/device associations, and order-state push content. Compromise can leak order status or let attackers spam users.
- **Paid external services and business telemetry** -- OpenAI generation quota, persistent AI/content caches, advertising conversion accounts, and order-number/checkout-attempt records. Abuse can create direct spend, corrupt merchandising/attribution data, or exhaust operational storage.

## Trust Boundaries

- **Browser/mobile client to Express API** -- all client requests are untrusted. The API must validate authentication, authorization, payment state, prices, quantities, URLs, delivery fees, and admission to paid or stateful work.
- **Express API to Presentail OS** -- product listings, categories, occasions, and brands are fetched from `os.presentail.com` and cached in-process. The cache is the authoritative price/availability source; client-supplied product data must never override it for pricing or availability decisions.
- **Express API to Presentail OS storage** -- any route that proxies OS-hosted assets must treat caller-supplied URLs as untrusted. Backend OS credentials may only be attached when the server has resolved a known public asset server-side; generic fetch/proxy routes must not turn the OS API key into a public file-read capability.
- **Express API to WooCommerce/WordPress** -- the API calls WooCommerce and WordPress for order submission and mobile JWT authentication. Any route that forwards client data to WooCommerce must prevent attackers from creating, modifying, or reading store records outside intended flows.
- **Express API to payment providers** -- the API uses server-side payment secrets to create hosted sessions/orders. Amounts, currency, return URLs, and payment completion state must be derived or verified server-side rather than trusted from the client. Provider capture contexts must be restricted to storefront origins.
- **Express API to PostgreSQL** -- push-token, app-order, checkout-attempt, AI-cache, and reconciliation tables store production operational data. Queries must remain parameterized, row ownership must be enforced in route handlers, and public reservation/queue endpoints must have bounded admission.
- **Public to authenticated account boundary** -- `/auth/me`, push-token ownership changes, and account deletion require validated WordPress or server-issued JWTs. Public auth endpoints such as login/register/reset/social must not leak secrets or enable abuse. Because customer identity and guest-order linkage are keyed by email, registration must not let an attacker claim an unverified mailbox as a real account identity, and account deletion/password recovery must revoke existing sessions rather than leaving the same customer ID accessible through surviving tokens.
- **Public to admin boundary** -- order-event push triggers and pending-order support views require `PUSH_ADMIN_TOKEN`; the token must remain secret and comparisons must not be bypassable.
- **Public to promotion and payment state boundary** -- coupon-redemption and payment-finalization routes mutate business-critical state. They must require proof that the caller is entitled to redeem the coupon or finalize the order, and any recovery path after lost in-memory checkout state must still re-bind the paid provider amount and cart to the final order.
- **Public to paid-service and telemetry boundary** -- public descriptions, product inference, order-ID reservation, and advertising routes must not allow arbitrary callers to turn ordinary requests into unbounded AI calls, persistent writes, sequence consumption, or privileged conversion submissions.
- **Production to dev-only boundary** -- `artifacts/mockup-sandbox`, build scripts, test files, and generated/dist artifacts are not production attack surfaces unless explicitly deployed or reachable.

## Scan Anchors

- Production API entry points: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, and `artifacts/api-server/src/routes/*` mounted under `/api`.
- Highest-risk routes: `routes/checkout.ts`, `routes/payment.ts`, `routes/woo.ts`, `lib/wooOrders.ts`, `routes/auth.ts`, `lib/auth.ts`, and `routes/push.ts`.
- Public paid-service and integration routes: `routes/pageDescriptions.ts`, `lib/pageDescriptionQueue.ts`, `routes/products.ts`, `lib/productColorInference.ts`, `routes/cyberSource.ts`, `routes/analytics.ts`, `routes/fb.ts`, and `routes/orders.ts`.
- Client checkout/auth flows: `artifacts/presentail/app/checkout.tsx`, `artifacts/presentail/lib/stripe.ts`, `artifacts/presentail/lib/payments.ts`, `artifacts/presentail/lib/woo.ts`, `artifacts/presentail-web/src/pages/Checkout.tsx`, and `artifacts/presentail-web/src/pages/OrderConfirmed.tsx`.
- Public surfaces: product/brand/category reads, auth login/register/reset/social endpoints, checkout/payment session creation, payment return bridge, guest order creation, coupon validation/redemption endpoints, AI-backed content/color endpoints, advertising conversion endpoints, order-ID reservation, and OS-backed image/proxy routes.
- Authenticated surfaces: `/api/auth/me`, signed-in push registration/unregistration, account deletion, and order-user association.
- Admin surfaces: `/api/push/order-event` and `/api/woo/pending-orders`, protected by `PUSH_ADMIN_TOKEN` headers.
- Dev-only areas usually out of scope: `artifacts/mockup-sandbox`, `artifacts/presentail/scripts`, tests, build outputs, generated API clients, and attached assets.

## Threat Categories

### Spoofing

Attackers may attempt to impersonate users by forging WordPress JWTs, server-issued social-login JWTs, Apple/Google identity tokens, or admin push tokens. The API must validate JWT signatures, issuer, audience, expiration, and customer ID derivation on every protected request; social-login tokens must only be minted after verifying provider identity tokens against the correct client IDs. Admin endpoints must require a strong server-side token that is never exposed to clients.

### Tampering

Checkout and order creation cross a major trust boundary because clients send cart items, prices, delivery fees, currencies, payment references, hosted-payment return URLs, and coupon claims. The server must derive product prices and delivery fees from the Presentail OS product cache and trusted location data (never from client-supplied values), create payment sessions for those trusted totals, verify payment completion with the payment provider before marking a WooCommerce order paid, preserve a trustworthy server-side binding between the paid cart and the finalized order even after cache expiry/restart, and restrict payment return/deep-link targets to expected schemes and hosts.

### Information Disclosure

The API handles customer PII, order payloads, payment references, push tokens, and OS-hosted media. Responses and logs must avoid leaking passwords, bearer tokens, WooCommerce credentials, payment secrets, full reset keys, and unnecessary order/customer fields. Product and homepage content are public, but account, push-token, pending-order, OS private-storage assets, and WooCommerce support data must be scoped to authenticated users or admins.

### Denial of Service

Public auth, product, checkout, payment, order, AI, and analytics endpoints can be called by unauthenticated clients. The API should bound request body sizes, validate array lengths and numeric ranges, use caching/in-flight de-duplication for Presentail OS and WooCommerce reads, apply timeouts/backoff for external calls, rate-limit high-abuse endpoints such as login, registration, reset, payment session creation, order creation, AI generation, and sequence reservation, and bound persistent queue/storage growth.

### Elevation of Privilege

Attackers may try to create paid orders without paying, associate push tokens with other users, delete other users' push tokens, access pending orders without admin rights, redeem coupons they are not entitled to consume, forge advertising conversions, or use SQL/injection flaws to bypass application checks. The API must enforce server-side ownership and admin checks, ignore client-supplied user IDs when authenticated identity is available, use parameterized database access, and never use client-controlled payment method, email identity, coupon-redemption claims, advertising event data, or order fields as proof of authorization or payment.
