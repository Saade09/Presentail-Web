---
name: Blog locale + editorial template
description: Language derivation for bare /{lang}/blog URLs and the blog article template's schema-driven blocks
---

- **Bare-lang blog URLs**: `parseLocalePath` only matches `/{lang}-{country}` prefixes, so `/ar/blog/...` used to render in English. LocaleContext now also derives language from a `/{lang}/blog` prefix (regex scoped to blog paths). **Why:** blog canonicals are `/{lang}/blog/:slug` with no country segment, so hreflang'd ar/fr blog URLs otherwise fall back to the stored language (default en). **How to apply:** any new bare-lang route family (no `-country` segment) needs the same treatment in LocaleContext or it will ignore the URL language.
- **Blog article template** is schema-driven from `@workspace/blog-content`: all new fields (dek, cta {label,path,country}, recommendation, callout/pullQuote/image per section, lastUpdated, heroFocal, relatedSlugs, toc) are optional with fallbacks — old articles render unchanged. CTA/recommendation hrefs are composed as `/{lang}-{country}/{hubCity}{path}` via HUB_CITY; the recommendation card is config-driven (no product fetch) so "hide when product data unavailable" means: no config → no card.
- **Verbatim paragraph boundaries** require separate section entries; blank lines inside one `body` string render as a single paragraph. **Why:** visual verification showed supplied multi-paragraph copy collapsed together. **How to apply:** use consecutive body-only sections for distinct paragraphs.
- Blog analytics use `trackWebEvent` types (blog_cta_click, blog_share, blog_toc_click, blog_recommendation_impression/click, blog_related_click) — types must exist in BOTH the web `WebEventType` union and the api-server `WEB_EVENT_TYPES` enum.
- The check-social-share-previews script's product-page image checks fail in dev (no product object-storage data) — pre-existing, not blog-related; blog URLs aren't in its fixture set.
