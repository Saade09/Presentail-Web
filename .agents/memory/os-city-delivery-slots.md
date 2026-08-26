---
name: OS city delivery slots
description: The authoritative source and fallback rule for standard delivery windows across web, mobile, and order validation
---

The selected city's Presentail OS schedule is the sole source of standard delivery slots. OS slot IDs can differ by weekday even when labels and hours are identical, so date-aware validation and checkout state must resolve `slotsByDay` for the selected date before consulting flat `timeSlots`. Flat and weekday slots may be combined only for that same city. If OS has no schedule, surfaces must remain unavailable and server validation must reject scheduled submissions; never substitute a country-wide, hardcoded, or other-city schedule.

**Why:** Delivery windows, IDs, and surcharges are operational data that can differ by city and weekday. Replacing a valid weekday ID with a same-label flat-list ID makes server validation reject an otherwise available slot.

**How to apply:** Keep all web, mobile, cart, checkout, product, reschedule, and server slot resolution paths OS-city-and-date-aware. Preserve the exact selected weekday ID while city data is loading, then clear or reject it once OS confirms that the selected city/date has no matching schedule.