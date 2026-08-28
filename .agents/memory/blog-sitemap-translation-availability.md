---
name: Blog sitemap translation availability
description: Rules for keeping untranslated blog variants out of crawler-facing discovery and identity signals.
---

Blog article sitemap entries, hreflang alternates, blog-index crawlable links,
and blog-index structured data must include only locales that have dedicated
editorial content. When a post launches in English before Arabic or French
translations are ready, list only the English canonical URL and its
English/x-default alternate.

**Why:** Missing-language routes render an English fallback with `noindex`.
Advertising those fallback pages in a sitemap, hreflang cluster, crawlable
index, or ItemList sends crawlers to intentionally non-indexable,
non-localized pages.

**How to apply:** Add the translated locale entry to the shared blog content
source when it is ready; all crawler-facing discovery surfaces then include
that locale automatically. Use the shared dedicated-language helper rather
than checking property presence, because getter aliases can expose English
fallback content under another language key.