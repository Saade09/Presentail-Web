---
name: catalog listing readiness
description: The invariant that separates a warming OS catalog cache from a genuinely empty listing.
---

Catalog listings must never translate “no successful catalog read yet” into an
empty product response. A completed OS read with zero eligible products is
authoritative; an unpopulated cache is temporary and must use the explicit
catalog-readiness response.

**Why:** The storefront caches successful empty lists for minutes, so treating
the cold-cache state as `[]` made product, category, occasion, and brand pages
falsely claim everything was sold out immediately after an API restart.

**How to apply:** Any new read-only catalog listing or client query must
preserve the distinction. Return or handle the readiness state as retryable,
keep loading UI until a successful catalog response exists, and only then
render the normal empty state.