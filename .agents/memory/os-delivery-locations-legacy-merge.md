---
name: OS delivery-locations legacy/ext endpoint merge
description: Presentail OS's /api/delivery-locations-ext endpoint doesn't cover every country yet; the legacy /api/delivery-locations endpoint is the live source for the gap countries.
---

Presentail OS exposes two locations endpoints with different rollout coverage:
`/api/delivery-locations-ext` (primary; camelCase, flat `timeSlots`, richer fields
like `expressFeeTotal`) and `/api/delivery-locations` (legacy; snake_case,
per-day-of-week `delivery_slots`, string city ids/slugs like `"nicosia"`). The ext
endpoint is not deployed for every country — as of 2026-07 Cyprus is legacy-only —
so any country missing from the ext response must not be treated as "OS has no
data for this country" and silently replaced with static hardcoded fallback data.

**Why:** Before the fix, `lib/catalog-data/src/deliveryLocations.ts`'s hardcoded
Cyprus cities were always `isActive: true` and the cache-transform layer only
reached for that hardcoded fallback, so toggling a Cyprus city's active state in
the OS admin panel had zero effect on the storefront — the live signal existed
(in the legacy endpoint) but was never being read.

**How to apply:** `fetchOsLocations()` in `lib/presentail-os/src/client.ts` now
always fetches both endpoints when the primary succeeds, and merges in any
country present in legacy but absent from primary (generic by country code, not
Cyprus-specific — becomes a no-op once OS adds a country to the ext endpoint).
When adding new logic that reads `OSCountry`/`OSCity` data, don't assume a
country's absence from one endpoint means no live data exists; check whether
the other endpoint has it. Legacy city normalisation quirks worth remembering:
city `id` is a string slug (not numeric) so `OSCity.id` gets a numeric
placeholder while the real value flows through `slug`; `isActive` may only be
present as snake_case `is_active` on some deployments.

For cities present in both feeds, the legacy feed's per-weekday
`delivery_slots` membership is authoritative. The ext feed can lag newly added
slot IDs even while the OS admin and legacy endpoint already expose them.
Merge the union of slot IDs, enriching matches with ext fields; do not use the
ext flat slot list as an allowlist for weekday schedules.

**Why:** UAE Midnight rows and updated future-weekday windows were present in
the OS admin/legacy feed but disappeared from the storefront because the merge
filtered every legacy slot not yet listed by ext.

**How to apply:** Keep ext authoritative for country/city membership and richer
city settings, while treating legacy `slotsByDay` as authoritative for each
weekday's slot membership. Reapply canonical slot normalization when hydrating
shared snapshots so cached rows follow current service rules too.
