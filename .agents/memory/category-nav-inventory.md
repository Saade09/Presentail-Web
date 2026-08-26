---
name: Category nav must be inventory-driven
description: Category links must be filtered by per-country catalog metadata counts or they 404; list of surfaces and the loading-state rule
---

# Category navigation must reflect per-country inventory

**Rule:** never render a `/category/<slug>` link from a static hardcoded list. Category pages 404 when the category has zero products in the current country (surfaced first as Lebanon "Perfume", then country-wide for Cyprus where only hand-bouquets/flower-vases/balloons have stock). Filter by `/api/catalog/metadata?countryCode=X&lang=Y` — it is country-scoped, excludes zero-count categories server-side, and translates names for ar/fr via `lang`.

**How to apply:** every surface that lists category links (Shop sidebar, BestSellers sidebar, Footer "Popular Categories", MainNavbar menus) must filter by metadata counts. While metadata is loading or failed, render NO category links — a static fallback shows clickable dead links. Static labelKey entries keep their i18n labels; metadata-only categories use the server-translated `name`.

**OS eligibility:** category navigation requires all three signals: membership in the OS public active-only taxonomy, `is_featured === true` (Mega menu enabled), and a positive per-country product count. Explicit inactive aliases always win.

**Why:** the sitemap generator was fixed the same way earlier (only emits category URLs with per-country count > 0); nav and sitemap must agree or Semrush crawls flag 404s.

**Related:** blog shell's nested wouter router base is `/${lang}`; bare-language roots like `/fr/` are NOT routes. Home links on lang-based shells must escape the router base with wouter's `~` prefix (`~/`).

## Crawler-facing fragments must mirror the hydrated filter (Aug 2026)

The hydrated Shop/BestSellers/Footer were country-filtered, but `seo-inject.mjs`'s prerendered "Shop by Category" fragment still emitted the static FEATURED_SHOP_CATEGORIES list — so view-source/Semrush on /fr-cy/paphos/shop showed links to zero-inventory categories. Fix: seo-inject keeps a per-country available-category cache (`ensureShopCategoriesForSeo`, /api/catalog/metadata?countryCode=, 10-min TTL, 60s negative cache), pre-warmed in injectSeoTagsAsync for shop routes only; buildSeoHead skips the generic cache for shop routes while counts are unknown (fail-closed: no list rather than wrong links). Tests seed via `__setShopCategorySlugsForTest`.

**Rule:** any crawler-only body fragment that mirrors a UI nav must apply the same per-country inventory filter as the hydrated view — parity check both when adding links.

Also: bare language roots (/en, /ar, /fr, ± slash) 301 → "/" in serve.mjs, placed BEFORE the trailing-slash handler for a single hop. Metadata category objects use `id` as the slug field, not `slug`.
