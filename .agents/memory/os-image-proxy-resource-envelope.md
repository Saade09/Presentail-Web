---
name: OS image proxy resource envelope
description: Security and memory-safety rules for public OS image delivery and validation.
---

Any public route that attaches the OS API key must accept only the exact
`/api/storage/public-objects/` namespace. A host-only or broad
`/api/storage/` allow-list can expose private objects through a credentialed
server fetch.

Bound image work before the upstream fetch, not only before Sharp. Distinct
cold misses can otherwise retain many maximum-size source buffers while they
wait for a transform slot. All image transforms, including catalog routes and
health monitors, must share the same decode-concurrency and pixel budget.

**Why:** Per-stage limits that look safe independently can combine into an
unsafe process-wide memory envelope, especially under crawler cache-busting or
while scheduled health checks overlap storefront traffic.

**How to apply:** For any new image consumer, use the shared trusted URL parser,
bounded body reader, and globally admitted transform helper. Recalculate the
aggregate worst case before raising source-byte, pixel, concurrency, queue, or
cache limits.