---
name: Delivery slot fee invariant
description: Durable rule for pricing delivery time-slot surcharges consistently
---
Rule: the fee shown for a delivery time slot must equal the fee charged, everywhere. Resolve slots date-aware (same-day flag for today, next-day flag for tomorrow AND later), deduplicate duplicate labels by date preference, prefer stable slot ID over label but normalize a date-ineligible ID to the date-correct same-label variant, and treat `extraFee: 0`/undefined as "no override" so same-day night slots (start ≥ 21:00) get the hardcoded $5 fallback.

**Why:** raw-list or label-only lookups let displayed and charged fees diverge (including a payment-recovery path that could accept payments short by the night surcharge).

**How to apply:** never read `extraFee` off a raw slot list in a new fee consumer — go through the shared date-aware resolver on that side, and keep client and server resolvers semantically identical.
