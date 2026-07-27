---
name: apiFetch error contract (web)
description: Thrown errors from web apiFetch must carry .data (full parsed error body) — payment error mapping depends on it
---

The web client's `apiFetch` throws an `Error` augmented with `.status`, `.code`, and `.data` (the full parsed JSON error body). Checkout's payment error mapping (CyberSource card branch, Stripe already-paid recovery) reads server fields via `apiErr.data.message` / `.code` / `.declineCode` / `.cybersourceStatus`.

**Why:** Before `.data` was attached, every charge failure — including honest server messages like "merchant account not enabled for the REST Payments API" — collapsed into the generic "Card payment unavailable" toast, making shopper-reported payment errors undiagnosable. The server also returned silent 400s from charge-route early validation (no WARN), so neither client nor logs revealed the cause.

**How to apply:**
- Any new code that throws from `apiFetch` or maps its errors must preserve the `.data` field; don't strip it down to `.message`/`.code` only.
- Payment-route early validation rejects (400s) must `req.log.warn` with safe request-shape info (hasOrderId, tokenType/segments, itemCount, check name) — never the token, PAN, or CVC.
- Client-side silent early-returns in payment flows should emit a `PAYMENT_DIAG` console.log with the stage and safe context before showing a generic toast.
