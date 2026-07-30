---
name: OnlineStore schema gating
description: Organisation JSON-LD is OnlineStore (not Florist), emitted only on hub-city homepages; breadcrumb stays on every city home.
---

The organisation JSON-LD node for the web storefront is `@type: OnlineStore` with a single country-string `areaServed` — not `Florist` with an AdministrativeArea array.

**Why:** Repeating a near-identical LocalBusiness node across ~37 city homepages sharing one phone/address is the multi-location spam pattern Google penalises, and Presentail travels to customers (no storefronts), so OnlineStore + service area is the correct model (July 2026 SEO batch 3).

**How to apply:**
- The block is gated to one hub city per country (`ORGANIZATION_HUB_CITIES` in seo-inject.mjs) — keep it in sync with `HUB_CITY` in `src/lib/hreflang.mjs`.
- The Home > {City} BreadcrumbList must be emitted on EVERY city homepage — it's navigation context, not an organisation claim. A code review caught that gating both together silently dropped breadcrumbs from non-hub pages.
- "Florist" expectations live in three places when changing schema types: `src/lib/seo-inject.test.ts`, `scripts/check-nonproduct-jsonld-schema.mjs`, and `e2e-serve/jsonld-schema.spec.ts`.
- Shop entity pages inject the FULL product-link list (no slice cap; bounded by page size 24) in a `sr-only` div outside the `display:none` wrapper — display:none content is crawled but potentially deweighted.
