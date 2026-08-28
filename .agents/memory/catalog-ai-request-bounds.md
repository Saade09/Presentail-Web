---
name: Catalog AI request bounds
description: Safety rules for retry, concurrency, dedupe, and fail-open behavior in catalog AI workflows
---

Use one retry owner for catalog AI calls. When the application policy counts attempts, disable the OpenAI SDK's automatic retries or actual provider calls multiply beyond telemetry and documented bounds.

**Why:** Layering two retry loops made a nominal three-attempt policy capable of nine provider attempts, invalidating latency and cost guarantees.

**How to apply:** Any catalog AI client used behind the bounded executor must set SDK retries to zero. Retry only transient transport, timeout, rate-limit, and server failures.

Never bound in-flight deduplication by evicting unsettled promises. Reject new unique work or apply backpressure, retain existing-key sharing, and delete an entry only if it still points to the settling promise.

**Why:** Evicting active work allows duplicate calls and an old promise's finalizer can delete newer work for the same key.

**How to apply:** Bound admission and waiter queues. At capacity, preserve each public workflow's existing fail-open or fail-closed behavior rather than leaking a new rejection to callers.