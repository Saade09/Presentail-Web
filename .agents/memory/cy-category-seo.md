---
name: Cyprus non-hub city category SEO pattern
description: How curated content unlocks indexing + self-canonical for Larnaca/Limassol/Paphos category pages
---

## Rule
Non-hub city category pages (e.g. `/en-cy/larnaca/category/balloons`) are noindexed and get a Nicosia-remapped canonical by default. Adding a curated `CATEGORY_SEO_CONTENT` entry flips both behaviours automatically.

**Why:** `buildShopEntityHead` (seo-inject.mjs) uses `remapCityToHub: !curated` — so curated pages self-canonicalize. The eligibility-noindex gate skips when `hasCuratedCategoryContent` is truthy. Sitemap section 5b emits non-hub curated pages when catalog data is present.

**How to apply:**
1. Add `cy/{city}: { balloons: { ... } }` in `src/data/categorySeoContent.mjs` (EN section). AR/FR auto-fallback to EN.
2. Test with anti-cloaking pattern in `seo-inject.test.ts` — assert self-canonical (`presentail.test` origin), `og:locale=en_CY`, no noindex, CollectionPage + Service JSON-LD in @graph.
3. Sitemap section 5b picks up new entries automatically (gated on `hasCatalogData`).

## og:locale for Cyprus
`OG_LOCALE_COUNTRY.en.cy = "en_CY"` (was wrong: `"en_US"` — corrected Aug 2026 in `src/lib/seo.mjs`).

## Legacy /cyprus/* redirects
VANITY_REDIRECT_MAP (serve.mjs §7) fires before the generic COUNTRY_PREFIX_CONFIG §8.
Add `/cyprus/flower-shops-in-{city}` → `/en-cy/{city}` entries there for any wrong-city mappings.
