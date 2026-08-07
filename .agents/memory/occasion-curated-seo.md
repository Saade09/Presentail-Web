---
name: Curated occasion SEO content
description: How curated per-city occasion page content works and the thin-page eligibility gate interaction
---

# Curated occasion SEO content (web)

- Curated copy lives in a shared data module under `src/data/` keyed `"{country}/{city}"` → occasion slug, consumed by BOTH the server prerender (seo-inject) and the client Shop route. Any new curated page must update both render paths stay in parity (FAQPage JSON-LD must match visible FAQs — cloaking risk otherwise).
- **Thin-page eligibility gate**: occasion/category pages are noindexed + dropped from sitemap when uniqueness ratio < 0.15 or < 4 products. Curated pages bypass this — but the bypass must be **scoped to the locale that actually renders curated copy** (EN-only today). Probing existence with `lang: "en"` for all locales indexes thin ar/fr template pages (caught in code review Aug 2026).
- Zero-product listing pages still get `noindex, follow` via a separate path; the curated bypass does not (and should not) override it.

**Why:** hand-written content justifies indexing only on the locale variant that shows it.

**Gotchas:**
- Client lookup: `city.id` from LocationContext is the delivery API id (`ae-dubai`); curated keys use URL slugs — convert with `cityIdToSlug`.
- Valid occasion slugs come from `/api/catalog/occasions?countryCode=..`; "sympathy" does not exist — the slug is `funeral`. `new-baby` and `mothers-day` were also dead slugs in FEATURED_HOME_OCCASIONS.
- seo-inject test fixture `HTML` has no `#root` div, so prerendered body assertions need a fixture containing `<div id="root"></div>`.
- Dubai same-day cutoff is 11 PM (owner-confirmed); unverified claims (hospital/funeral-home delivery, Feb-14 cutoff) were deliberately omitted from copy.
