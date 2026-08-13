---
name: AR/FR product translation layer
description: How product name+description are translated to Arabic/French for SEO — architecture, cache, and flow.
---

## How it works

`seo-inject.mjs` already passes `lang=ar`/`lang=fr` to `/api/woo/product` via `fetchEntityForSeo` (line 2173) — no change needed to the web layer.

The API route (`woo.ts` `/woo/product`) now reads `readLang(req)`. When `lang === "ar" || lang === "fr"` it calls `translateProductContent()` from `lib/productTranslation.ts` and returns the translated `name` + `description` in the same response shape. The translated values flow automatically through `buildProductHead` → `buildProductSeo` → title, meta, H1, and Product JSON-LD.

## productTranslation.ts design

- Cache key: `${osNumericId}:${lang}` — stable across restarts; never expires for a slug rename.
- TTL: 7 days (`CACHE_TTL_MS`). Product copy rarely changes.
- In-flight deduplication: `Map<key, Promise>` — concurrent SSR requests for the same cold-cache product share one OpenAI call.
- Model: `gpt-4o-mini` with `max_completion_tokens: 4096` (4096 mandatory for Arabic; lower truncates mid-JSON).
- Fails open: any error returns English originals. Route never throws.
- Client: same dual-credential pattern as `bannerTranslation.ts` — prefers `REPLIT_AI_API_KEY`, falls back to `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY`.

## What flows through automatically (no further changes needed)

1. `<title>` and `og:title`
2. `<meta name="description">` and `og:description`
3. Product H1 (via `buildProductSeo.h1`)
4. `Product` JSON-LD `name` and `description` fields

**Why:** `buildProductHead` reads `product.name` and `product.description` directly; since the API returns translated strings, everything downstream sees translated content without extra work.

## Reliability + hreflang honesty layer (Aug 2026)

- Translations are now persisted in Postgres `product_translation_cache` (PK os_product_id+lang) as L2 under the in-memory L1 map — survives restarts, shared across autoscale replicas.
- OpenAI calls: 3 attempts with backoff behind a slot-transfer semaphore (max 4 concurrent). `translated: true` only when EVERY nonempty source field came back translated; partial model JSON is treated as failure.
- `/api/woo/product` returns `contentLang` ("en" when fallback served). `seo-inject.mjs` carries it as `product.__contentLang`, skips SEO-caching ar/fr responses whose contentLang is "en", and suppresses the product hreflang cluster on fallback responses — never declare fr-lb hreflang over English content.
- Background warm job (`productTranslationWarmJob.ts`) pre-warms fr+ar for all stores 90s after startup + every 6h, guarded by a pg advisory lock across replicas and a consecutive-failure abort.
- **Internal-link rule:** the slashless form is canonical everywhere (`/fr-lb/beirut`, not `/fr-lb/beirut/`); serve.mjs 301s the slash variant. City-root hrefs from `toCityHref("/")` (MainNavbar, Footer) must emit the base without a trailing slash or every logo click/crawl wastes a redirect.

## Invalidation

`invalidateProductTranslation(osNumericId, lang?)` clears cache entries. Call it from the OS catalog refresh hook if product names change frequently enough to matter (not yet wired up — 7-day TTL is usually sufficient).
