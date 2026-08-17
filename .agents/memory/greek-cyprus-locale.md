---
name: Greek (el) is a Cyprus-only storefront language
description: Rules and gotchas for the country-gated Greek locale on presentail-web
---

# Greek (el) — Cyprus-only language

**Rule:** `el` is a full member of `SUPPORTED_LANGS`, but visibility is gated by `langsForCountry(country|null)` / `isLangAllowedForCountry()` in `locale-route.ts`: 4 langs for landing (`null`) and `cy`, 3 for `ae`/`lb`. The switcher derives options from the current URL's country — never render the static lang list.

**Why:** Greek shoppers exist only in the Cyprus market; offering `/el-ae/...` URLs creates broken SEO clusters and dead navigation.

**How to apply:**
- Any new lang-enumerating surface (sitemap, hreflang, IndexNow pings, markdown mirrors, seo-inject) must use the country-aware helpers (`hreflangLangsForCountry` in `hreflang.mjs`, `skipCountryForLang` in `sitemap.mjs`) — cy clusters are en/ar/fr/el + x-default; lb/ae stay 3-lang. IndexNow URL counts are `3×3 + 1`.
- serve.mjs 301s `/el-(ae|lb)/*` → `/en-.../*`; LocaleContext has a matching client-side redirect (SPA navigation never hits the server).
- Greek UI strings are flat `*StringsEl` companions mirroring `*StringsFr` key-for-key; `checkUnusedWebTranslationKeys.ts` is section-aware (tracks `export const ...StringsFr|StringsEl` markers) because flat Fr/El entries are shape-identical.
- That checker's entry regex requires `"key": "value"` on ONE line — a wrapped value silently drops the key from coverage counts.
- Blog articles, page-descriptions pipeline, categorySeoContent, and transactional emails stay en/ar/fr; `el` coerces to `en` at the call sites (`usePageDescription`, Blog/BlogPost `blogLang`).
- OG locale is `el_GR` except `el_CY` for cy. Warm job warms `el` for the cyprus store only. `product_translation_cache.lang` column type union includes `el` (lib/db).
- Banner lang enum lives in `lib/api-spec/openapi.yaml` (`/homepage/banners` lang param); regenerate with `pnpm --filter @workspace/api-spec run codegen` after editing.

**Switcher country detection:** components inside the city storefront run under a `/{lang}-{country}` wouter router base, so `useLocation()` returns a prefix-stripped path — `parseLocalePath` on it yields country `null` (which allows Greek everywhere). Read `window.location.pathname` for country detection; keep `useLocation()` only as the navigation subscription.
