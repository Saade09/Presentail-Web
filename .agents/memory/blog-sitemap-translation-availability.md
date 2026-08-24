---
name: Blog sitemap translation availability
description: Rules for keeping untranslated blog variants out of crawler-facing sitemaps and hreflang clusters.
---

Blog article sitemap entries and their hreflang alternates must include only
locales that have dedicated editorial content. When a post launches in English
before Arabic or French translations are ready, list only the English canonical
URL and its English/x-default alternate.

**Why:** Missing-language routes render an English fallback with `noindex`.
Advertising those fallback pages in a sitemap or hreflang cluster sends crawlers
to intentionally non-indexable, non-localized pages.

**How to apply:** Add the translated locale entry to the shared blog content
source when it is ready; the sitemap then includes that locale and its
hreflang alternate automatically. Validate server-only sitemap routes against
the production-style server, since Vite development previews serve the SPA
shell instead.