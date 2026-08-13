---
name: Free-delivery banner rules
description: Cart free-delivery promo — eligibility vs display state, add-ons gating
---
The cart's three-state free-delivery card (hidden/close/unlocked) separates two concepts:

**Rule 1:** `free_delivery_unlocked` / `free_delivery_lost` analytics must key on *actual threshold qualification* (subtotal ≥ threshold with config loaded/enabled), never on the banner's display state. Selecting express or config unloads only hides the promo — firing "lost" there corrupts the metric.
**Why:** Completion code review rejected the first implementation for exactly this.

**Rule 2:** The "Shop add-ons" action must be gated on the upsells section actually rendering content (CartUpsells reports availability via `onAvailabilityChange`); never assume the scroll target exists.

**How to apply:** Reuse `resolveFreeDeliveryState` + a separate `qualified` boolean when porting this pattern to the upsell modal, checkout summary, or the mobile app cart banner.
