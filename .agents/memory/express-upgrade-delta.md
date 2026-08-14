---
name: Express upgrade delta pricing
description: How the cart's Express upgrade card delta is derived so it always equals the change in Total
---

**Rule:** The displayed Express upgrade delta must be derived from the same terms that feed `cartTotal`: express total fee = (deliveryFeeUsd ?? 0) + surcharge; currently applied = (deliveryFeeUsd ?? 0) + slotFeeUsd; delta = surcharge − slotFeeUsd. Never hardcode or recompute from raw config.

**Why:** Free-delivery thresholds, promos, and paid time-slot fees all flow through `deliveryFeeUsd`/`slotFeeUsd`; deriving the delta from the same variables guarantees delta === change in Total in every scenario (spec requirement of the Delivery Summary upgrade card).

**How to apply:** Any new fee input (credits, slot fees) added to the cart total must also flow into this delta derivation in Cart.tsx. Note: web-events analytics types must be added in BOTH the web `WebEventType` union and api-server `WEB_EVENT_TYPES` enum or ingestion 400s silently.
