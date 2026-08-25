---
name: Checkout E2E delivery selection
description: How checkout browser tests that submit payment avoid the valid stale-slot re-pick guard.
---

# Checkout E2E delivery selection

Payment-flow browser fixtures that include a delivery address must seed a **future, committed** delivery selection before checkout loads.

**Why:** Checkout performs a pre-payment stale-slot check. An absent or expired scheduled window is intentionally blocked and opens the delivery picker, so an otherwise valid test can time out waiting for the order confirmation.

**How to apply:** Store a next-day scheduled date and a label present in the fixture's selected-city time slots through the delivery-selection context's persisted shape. Keep the date dynamic so the fixture cannot become stale with time. Tests that choose “ask the recipient” do not need a delivery window.