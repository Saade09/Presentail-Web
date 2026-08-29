---
name: Mobile publish cache ownership
description: Durable rules for sharing mobile publish output and safely reusing Metro caches.
---

One production service must own the mobile type-check and build; other delivery services consume dedicated subtrees from that verified output. Metro transform caches may be reused only when dependency, configuration, and public-environment inputs match.

**Why:** Per-service build hooks duplicate iOS and Android bundling. A healthy Metro process is not a safe cache: its in-memory configuration and environment can survive an on-disk invalidation or explicit clean request.

**How to apply:** Keep platform bundling sequential, give publish builds their own Metro process/port, invalidate persisted transforms when structural inputs change, and write the reusable-cache marker only after every output stage succeeds.