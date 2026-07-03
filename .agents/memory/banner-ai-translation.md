---
name: Banner AI translation
description: How homepage banner text is translated to Arabic/French via OpenAI
---

## Approach

`GET /api/homepage/banners?lang=ar|fr` always fetches **English** text from the OS API, then translates to the target language using OpenAI (`gpt-5-nano`) in a single batched call covering all banners at once.

The `localise()` helper that used to probe OS-native `title_ar` / `translations.ar.title` fields was removed — we do all translation ourselves.

## Key files

- `artifacts/api-server/src/lib/bannerTranslation.ts` — translation module
- `artifacts/api-server/src/routes/homepage.ts` — calls `translateBanners()` after normaliseBanners

## Cache

In-process `Map` keyed by `sha256(lang + [title, headline, subtitle, ctaText])`, 1-hour TTL. A cache hit drops latency from ~9s to ~300ms (just the OS fetch).

## Token budget

`max_completion_tokens` must be **≥ 4096**. Arabic output is more verbose than English; 1024 tokens causes truncation → `"Unexpected end of JSON input"` on JSON.parse.

**Why:** Arabic translations of 3 banner objects (2–3 short fields each) easily exceed 1024 tokens when the model wraps the array correctly.

## Fallback

Any OpenAI error (parse failure, network, missing env vars) logs a WARN and returns the English originals — the page never crashes.

## OpenAI client construction

Follows the same `buildClient()` pattern as `productColorInference.ts`:
1. `REPLIT_AI_API_KEY` + `https://openai-proxy.replit.com/v1` (preferred)
2. `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY` (fallback)
Both env vars are present in this project's Replit secrets.
