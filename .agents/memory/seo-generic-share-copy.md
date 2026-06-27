---
name: SEO generic share copy (web)
description: Which web routes get dedicated short OG/Twitter copy vs reuse the page title/description, and the seo-inject test cache-masking trap.
---

# Web SEO og:/twitter: share copy routing

`artifacts/presentail-web/seo-inject.mjs` `buildSeoHead` only emits dedicated
short OG/Twitter copy for routes that have an entry in `GENERIC_OG` /
`GENERIC_TWITTER` (`src/lib/seo.mjs`), plus the special-cased `landing`
(LANDING_OG) and `home` (HOME_OG) routes.

**Rule:** `GENERIC_OG`/`GENERIC_TWITTER` deliberately contain **only `category`**.
Shop, Brands and All Occasions **intentionally reuse their page
title/description** for og: and twitter: (so og:description == twitter:description
== `DESCRIPTIONS[lang][routeKey]`). This is documented in the comment above
`GENERIC_OG` in `src/lib/seo.mjs`.

**Why:** product decision — only the category fallback head needed distinct
share copy; the other browse routes are fine mirroring their page copy. A stale
comment in `seo-inject.mjs` (~line 321) says Shop/Brands/All-Occasions use
"distinct shorter copy" — that comment is misleading; trust the seo.mjs note.

**How to apply:** if a test expects dedicated short copy for shop/brands/
all-occasions, it is wrong — those routes mirror the page description. Only add
dedicated copy by adding a `GENERIC_OG`/`GENERIC_TWITTER` entry for ALL of
en/ar/fr (en-only would regress AR/FR previews to English via the `?? .en`
fallback).

## seo-inject.test.ts cache-masking trap
`buildSeoHead` memoizes into module-level `genericSeoCache`. The
"route-dependent share copy" describe clears it in `beforeEach`, but most other
describes do NOT reset module caches. A failing assertion can be **masked** in a
full-file run by an earlier test that populated the cache. Always verify a
suspect SEO test in isolation (`vitest run <file> -t "<name>"`) — if it passes
full-file but fails isolated (or vice-versa), it is cache contamination, not a
real pass.
