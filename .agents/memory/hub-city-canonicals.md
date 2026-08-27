---
name: Hub-city canonicals + intra-city hreflang
description: SEO consolidation rules for city-variant URLs on presentail-web
---

**Rule:** Entity pages (product/brand/category/occasion) at non-hub cities canonicalize to the hub city (`HUB_CITY` in `src/lib/hreflang.mjs`: lb→beirut, ae→dubai, cy→nicosia; sitemap re-exports it as `SITEMAP_CANONICAL_CITIES`). hreflang clusters are intra-city only: en/ar/fr of the SAME city + x-default→en of that city — never cross-country. Root landing (/) emits no hreflang. City-level pages (home/shop/static) keep self-canonical and self-city clusters.

**Why:** ~36k near-duplicate city URLs fragmented ranking signals; cross-country hreflang (Tripoli's "en" listed as Beirut) invited Google to merge cities. Canonical and hreflang are read as a set, so they must agree — entity hreflang uses the hub city to match the remapped canonical.

**How to apply:** Any new head builder for an entity-type page must pass `remapCityToHub: true` to `buildEntityHead` and build its hreflang with the hub city. Every locale-scoped URL in Product/Offer/BreadcrumbList/ItemList JSON-LD, plus crawlable entity product links, must use that effective hub pathname. Curated city-specific category/occasion pages stay self-canonical and keep their own URLs. Contextual links back to the browsed satellite-city landing page may retain the request city. Never reintroduce cross-country alternates or an all-locales landing cluster. Note: cy hub is nicosia (an older hreflang map wrongly used limassol).
