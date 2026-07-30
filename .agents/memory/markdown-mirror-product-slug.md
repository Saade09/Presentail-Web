---
name: Markdown mirror product slug field
description: The live products API carries the slug in `id`, not `slug` — listing code must accept both.
---

The web `/api/woo/products` response has no `slug` field; the product slug lives in `id` (e.g. "ivory-rose-vase"). Tests/fixtures use `slug`.

**Why:** markdown.mjs filtered on `p.slug`, so every markdown mirror (shop/category/occasion/best-sellers) rendered zero products and all product `.md` mirrors 404'd — silently, for months.

**How to apply:** any code consuming that products list must resolve the slug as `p.slug ?? p.id` (see `productSlugOf()` in artifacts/presentail-web/markdown.mjs). Also: adding a new SPA locale subroute requires touching THREE places or it soft-fails — App.tsx route, `KNOWN_LOCALE_SUBROUTES_EXACT` in serve.mjs (else real 404), and `ROUTE_KEYS` in seo-inject.mjs + TITLES/DESCRIPTIONS in src/lib/seo.mjs (else canonical points to city home).
