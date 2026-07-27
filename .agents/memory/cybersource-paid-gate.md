---
name: CyberSource paid-status gate
description: What counts as a paid charge on /pts/v2/payments — 2xx + requestId + approved-status allowlist
---

## Rule
A CyberSource charge (`POST /pts/v2/payments`, card or wallet) may only be treated as PAID when all three hold:
1. HTTP 2xx (CyberSource uses 201 for both approvals AND declines),
2. non-empty `id` (requestId) in the body,
3. `status` is in the approved allowlist: AUTHORIZED, PARTIAL_AUTHORIZED, AUTHORIZED_PENDING_REVIEW, PENDING_REVIEW.

**Why:** The previous gates were blocklists (`status !== DECLINED/INVALID_REQUEST`; the wallet paths accepted ANY 201 with an id — a 201 DECLINED counted as paid). Unknown/missing statuses defaulted to success. `AUTHORIZED_RISK_DECLINED` must never be paid — Decision Manager reverses the auth and no funds move.

**How to apply:**
- Failure classification: DECLINED / AUTHORIZED_RISK_DECLINED → kind `decline` (only these may show a "Card declined" toast); INVALID_REQUEST → `validation`; other non-approved 201s → `gateway`. Gateway/config errors must never surface to shoppers as card declines.
- The order-creation gate downstream (woo order route) relies on an in-memory payment intent that is stored ONLY after this gate passes, and consumed+snapshot-verified at order time — so hardening this gate is what keeps "local order exists but no money moved" impossible for the cybersource path.
- On PA-success-but-charge-fail, the charge failure log keeps `paTransactionId` so the 3DS attempt stays reconcilable in Business Center.
