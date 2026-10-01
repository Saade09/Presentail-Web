---
name: OnlineStore schema gating
description: Organisation JSON-LD is LocalBusiness (not Florist, no longer OnlineStore), emitted only on hub-city homepages; breadcrumb stays on every city home.
---

The organisation JSON-LD node for the web storefront is `@type: LocalBusiness` with a single country-string `areaServed` — not `Florist` with an AdministrativeArea array.

**Why:** Repeating a near-identical LocalBusiness node across ~37 city homepages sharing one phone/address is the multi-location spam pattern Google penalises, and Presentail travels to customers (no storefronts), so a single service-area business is the correct model (July 2026 SEO batch 3, which first moved Florist → OnlineStore). On 2026-08-11 (commit 8817145d) it moved OnlineStore → LocalBusiness because OnlineStore inherits from Organization, which does not recognise openingHours, hasMap, priceRange, currenciesAccepted or paymentAccepted (Google flagged them invalid). Florist would also accept those fields, but it was deliberately not restored.

**How to apply:**
- The block is gated to one hub city per country (`ORGANIZATION_HUB_CITIES` in seo-inject.mjs) — keep it in sync with `HUB_CITY` in `src/lib/hreflang.mjs`.
- The Home > {City} BreadcrumbList must be emitted on EVERY city homepage — it's navigation context, not an organisation claim. A code review caught that gating both together silently dropped breadcrumbs from non-hub pages.
- Schema-type expectations live in four places when changing it: `src/lib/seo-inject.test.ts`, `scripts/check-nonproduct-jsonld-schema.mjs`, `e2e-serve/jsonld-schema.spec.ts` (all under artifacts/presentail-web), and `scripts/src/localSeo.test.ts` at the repo root.
- Shop entity pages inject the FULL product-link list (no slice cap; bounded by page size 24) in a `sr-only` div outside the `display:none` wrapper — display:none content is crawled but potentially deweighted.
