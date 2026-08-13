---
name: Category nav must be inventory-driven
description: Category links must be filtered by per-country catalog metadata counts or they 404; list of surfaces and the loading-state rule
---

# Category navigation must reflect per-country inventory

**Rule:** never render a `/category/<slug>` link from a static hardcoded list. Category pages 404 when the category has zero products in the current country (surfaced first as Lebanon "Perfume", then country-wide for Cyprus where only hand-bouquets/flower-vases/balloons have stock). Filter by `/api/catalog/metadata?countryCode=X&lang=Y` — it is country-scoped, excludes zero-count categories server-side, and translates names for ar/fr via `lang`.

**How to apply:** every surface that lists category links (Shop sidebar, BestSellers sidebar, Footer "Popular Categories", MainNavbar menus) must filter by metadata counts. While metadata is loading or failed, render NO category links — a static fallback shows clickable dead links. Static labelKey entries keep their i18n labels; metadata-only categories use the server-translated `name`.

**Why:** the sitemap generator was fixed the same way earlier (only emits category URLs with per-country count > 0); nav and sitemap must agree or Semrush crawls flag 404s.

**Related:** blog shell's nested wouter router base is `/${lang}`; bare-language roots like `/fr/` are NOT routes. Home links on lang-based shells must escape the router base with wouter's `~` prefix (`~/`).
