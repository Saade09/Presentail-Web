---
name: Cross-midnight slot carryover
description: Rule for preserving an exact prior-date delivery slot across local midnight without weakening ordinary stale-date validation.
---

Persisted cross-midnight selections must be validated against their exact configured slot identity and absolute window endpoint before generic same-day/next-day date filtering. The selected start date may be yesterday only while that exact window remains active.

**Why:** Once local midnight passes, ordinary date filters reinterpret the start date as a generic past/future-style date. That can either hide a still-active cross-midnight slot or leave an expired one confirmable, causing cart, picker, and server validation to disagree.

**How to apply:** For any cross-midnight service, resolve the exact slot ID, label, city, and service marker first. Preserve it through its absolute endpoint regardless of generic date flags; at the endpoint, invalidate it and require an explicit replacement. Keep generic stale-date handling unchanged for every other slot.