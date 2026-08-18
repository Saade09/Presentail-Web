---
name: Same-day slot expiry guard
description: Where slot expiry is enforced at order submission and the rules that keep it safe
---

# Same-day slot expiry guard

Server + clients re-validate the selected delivery slot at submission via `isSlotStillBookable` in `@workspace/delivery` (window end via `endHour` or label parse, city `sameDayCutoffHour`, store-local tz). API pre-charge guards live in checkout/payment routes via `checkSubmittedSlotBookable`; `/api/woo/order` uses `evaluateOrderSlotGuard`.

**Rules:**
- Reject BEFORE charging; never reject a submission carrying a `paymentRef` (webhook/sweeper/recovery rescue of paid orders) — log-warn and continue instead.
- Structured error: 422 `{ code: "expired_delivery_slot" }`; web/mobile map it (and `past_delivery_date`) to a friendly re-pick prompt, cart preserved.
- The guard deliberately does NOT enforce the per-slot booking `cutoffHour` — only window end + city cutoff — so in-flight payments aren't broken.

**Why:** order LB-2152 — stale tab submitted a 9AM–2PM slot at 4PM Beirut; only client-side filtering existed.

**How to apply:** any new payment-initiation endpoint must call `checkSubmittedSlotBookable` pre-charge; any test mocking `../lib/catalog` must stub `checkSubmittedSlotBookable` + `evaluateOrderSlotGuard`.

Also: web Checkout jsdom tests mock `@/lib/useNow` and seed 2025 dates — any time-based check in Checkout.tsx must consume the `useNow()` value, not `new Date()`, or every submission test breaks.
