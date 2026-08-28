---
name: Advertising purchase integrity
description: Security boundary for privileged paid-ad Purchase conversion reporting.
---

Privileged Google Ads and Meta CAPI Purchase conversions must be emitted only from verified server-side order/payment state. Public analytics routes may accept non-purchase funnel events, but must never forward caller-selected Purchase IDs, values, currencies, or product data.

**Why:** Authentication and rate limits do not prove a purchase happened. A public caller can invent unlimited transaction or event IDs and poison advertising reporting and campaign optimization.

**How to apply:** Keep Purchase reporting in confirmed-order flows with server-authoritative amounts and durable idempotency. Treat any proposal to restore Purchase on a client-facing analytics endpoint as a security regression.