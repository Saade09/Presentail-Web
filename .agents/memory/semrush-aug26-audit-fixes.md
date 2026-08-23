---
name: Semrush Aug 2026 audit — what was fixed
description: Root causes and fixes for the 7 Semrush SEO error categories found in August 2026 crawl.
---

## Issue 2 — French blog double-prefix 404 links (1,777 links)
**Root cause:** blogPostsCopy.js stores locale-prefixed hrefs (e.g. /en-lb/beirut/product/X). renderBody() passed these to wouter <Link>, which prepended the /fr router base → /fr/en-lb/... → 404.
**Fix:** renderBody() now accepts lang?: string. Detects LOCALE_HREF_RE = /^/(en|ar|fr|el)(-[a-z]{2})(/.*)/; rewrites the prefix to current page lang; renders as native <a> (not wouter <Link>). SectionBlocks uses useLocale() and passes language down.
**Why:** wouter's router base prepends to relative paths in SSR-rendered HTML, causing double-prefix. Native <a> renders verbatim.

## Issue 3 — Dead brand links (rifai, samsung, superheated-neurons)
**Root cause:** catalog/metadata returns these brands with count=0. Brands.tsx (AllBrands page) rendered ALL brands from catalogMetadata?.brands with no count filter.
**Fix:** Brands.tsx now filters: .filter((b) => b.count === undefined || b.count > 0). undefined guard prevents premature hide while metadata is loading.
**Note:** Sitemap already excludes all brands (MIN_PRODUCTS_BY_TYPE["city-brand"]=3; /api/woo/brands returns no count field → count??0=0 < 3 → ineligible). Brand sitemap gap is pre-existing.

## Issue 4 — Phantom occasion links (farewell, condolences, colleague, friend, children)
**Root cause:** BestSellers.tsx OCCASIONS array and Shop.tsx OCCASION_SLUGS array hardcoded slugs that don't exist in the live OS catalog. OS has "funeral" but not condolences/farewell/colleague/friend/children.
**Fix:** Removed farewell, condolences, colleague, friend, children. Added funeral with new label key shop.occ.funeral (reuses "Condolences" label for UX appropriateness — funeral is the OS slug, condolences is the user-facing copy).
**Note:** AllOccasions.tsx OCCASION_LABEL_KEYS is label-lookup-only, generates no nav links → no fix needed there.

## Issue 7 — el/ar blog duplicate content (noindex)
**Root cause:** Arabic uses get ar() { return this.en } → same reference as en. Greek has no el content, ??"en" fallback. Both yield duplicate English content under /ar/blog/ and /el/blog/.
**Fix:** BlogPost.tsx now has a separate useEffect that detects isFallback = language !== "en" && (articlesByLang?.[lang] === undefined || articlesByLang?.[lang] === articlesByLang?.["en"]). When true: emits <meta name="robots" content="noindex,follow" data-seo-blog-noindex="true"> into document.head. Cleans up on unmount.

## Issues NOT fixed this session
- Issue 1 (5xx on /en-lb/saida/product/summer-fever-bundle and /en-lb/metn/product/4-red-heart-balloons--291): Both products exist in OS, both cities are valid LB cities — likely transient (OS API timeout during Semrush crawl). No code fix.
- Issue 5 (Malformed French product slug: /fr-ae/dubai/product/chocolate-rocher-cake without --899 suffix): Not found in blog content (LB version has correct suffix). May be stale sitemap entry. No fix.
- Issue 6 (Missing title tags on 13 pages): Products birthday-bliss-balloon, euphoria-rouge, 50-red-roses-arrangement don't exist in OS. Source of stale links not found. No fix.
- French meta description duplicates (Issue 7b): Generic "Commandez ce cadeau pour livraison..." template → duplicate across dozens of FR product pages. Decision pending.

## shop.occ.funeral label
Added to shop.ts in all 4 locale sections (en/ar dict, fr flat, el flat). Value is "Condolences" / "تعازي" / "Condoléances" / "Συλλυπητήρια" — same as condolences label since funeral is the OS slug, condolences is more appropriate user-facing copy.
