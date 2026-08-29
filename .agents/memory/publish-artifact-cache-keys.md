---
name: Publish artifact cache keys
description: Durable rules for safe, artifact-scoped publish cache invalidation.
---

Content-addressed publish keys must include every build-producing script and
only the source libraries consumed by that artifact. Environment inputs should
also be scoped: public Vite values affect web, while mobile additionally needs
the resolved Replit deployment domain and repl identity.

**Why:** Expo manifests and bundles embed deployment URLs. A source-identical
mobile output restored under a different domain can pass file-integrity checks
yet point clients at the old host. Over-broad environment keys, meanwhile,
invalidate unrelated artifacts and erase the benefit of independent caches.

**How to apply:** Whenever a build adds a generator, config file, source
library, or embedded environment value, add it to that artifact's provenance
inputs and verify with a mutation probe that only the intended artifact key
changes.