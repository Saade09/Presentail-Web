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

Navigation has an additional defensive rule: if a metadata response has no
positive counts for any known static category, keep the static menu tiles
visible instead of treating that snapshot as authoritative and rendering only
the “Shop all” CTA.

**Why:** An already-cached all-zero metadata response can outlive the cache
warm-up that caused it, so a server readiness guard alone cannot guarantee that
every browser avoids the footer-only menu state.

**How to apply:** Gate live category filtering and OS-only category appends on
at least one positive count matching a known static category; otherwise fail
open to the static menu.