---
name: Same-day slot expiry guard
description: Where slot expiry is enforced at order submission and the rules that keep it safe
---

# Same-day slot expiry guard

Server + clients re-validate the selected delivery slot at submission using one shared market-local clock contract. Ordinary persisted selections expire at their delivery-date/window end, not when a booking or city/Express cutoff passes.

**Rules:**
- Reject BEFORE charging; never reject a submission carrying a `paymentRef` (webhook/sweeper/recovery rescue of paid orders) — log-warn and continue instead.
- Keep clock expiry distinct from live operational removal: expired selections use `expired_delivery_slot`; removed or disabled schedule rows use `delivery_slot_unavailable`.
- Booking, city, and Express cutoffs control which new slots the picker offers. Never apply them to an ordinary persisted selection.
- Explicit verified special services may retain a hard cutoff. Midnight uses its occasion-date semantics; Beirut late-night must match the verified campaign window, not merely a broad evening-hour heuristic.
- Treat ordinary windows whose end hour is earlier than their start hour as overnight: they remain valid through the next local date until the end-hour boundary.

**Why:** stale tabs must not submit genuinely passed windows, but shoppers selecting a future window before booking closes need enough time to pay. OS also emits overnight windows and can remove slots after selection.

**How to apply:** any new payment-initiation endpoint must use the shared guard before charge and preserve paid recovery. Resolve exact live slot identity first, then classify unavailable versus expired.

Also: web Checkout jsdom tests mock `@/lib/useNow` and seed 2025 dates — any time-based check in Checkout.tsx must consume the `useNow()` value, not `new Date()`, or every submission test breaks.
