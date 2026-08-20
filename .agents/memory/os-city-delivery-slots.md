---
name: OS city delivery slots
description: The authoritative source and fallback rule for standard delivery windows across web, mobile, and order validation
---

The selected city's Presentail OS schedule is the sole source of standard delivery slots. Flat `timeSlots` and `slotsByDay` may be combined only for that same city. If OS has no schedule, surfaces must remain unavailable and server validation must reject scheduled submissions; never substitute a country-wide, hardcoded, or other-city schedule.

**Why:** Delivery windows and surcharges are operational data that can differ by city and weekday; a static fallback can display or accept a slot that operations cannot fulfill.

**How to apply:** Keep all web, mobile, cart, checkout, product, reschedule, and server slot resolution paths OS-city-aware. Preserve a saved selection while city data is loading, then clear or reject it once OS confirms that the selected city has no matching schedule.