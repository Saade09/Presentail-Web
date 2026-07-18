# Product Title Format Change — Verification Report

**Date:** 2026-07-18
**Change tracked:** Product `<title>` format changed from `{name} Delivery in {city} | Presentail` → `{name} — {city} | Presentail`

---

## 1. Title format in source — verified ✅

`ENTITY_TITLES.product` in `artifacts/presentail-web/src/lib/seo.mjs` (lines 569–574):

```js
product: {
  en: "{name} — {city} | Presentail",
  ar: "{name} — {city} | Presentail",
  fr: "{name} — {city} | Presentail",
},
```

The em-dash (`—`, U+2014) is a literal character in the source file, **not** an HTML entity. This ensures it:
- Renders correctly in all browsers (Chromium, Firefox, Safari, WebKit/WKWebView).
- Appears correctly in social share-card previews (og:title / twitter:title) because those are also driven by `buildProductSeo()` which sets `ogTitle` and `twitterTitle` to the same value.
- Is validated by the existing seo-inject test at line 49 of `src/lib/seo-inject.test.ts`:
  ```ts
  expect(out).toContain("<title>Velvet Rose Bouquet — Dubai | Presentail</title>");
  ```

---

## 2. Server-side injection — verified ✅

`seo-inject.mjs` calls `buildProductHead()`, which calls `buildProductSeo()`, on every server-rendered product URL. The injected `<title>` uses the live format for all three languages (EN/AR/FR) and all three markets (LB/AE/CY).

Representative rendered titles (from seo-inject.test.ts):

| Product name | City | Expected `<title>` |
|---|---|---|
| Velvet Rose Bouquet | Dubai | `Velvet Rose Bouquet — Dubai \| Presentail` |
| 15 Red Roses | Beirut | `15 Red Roses — Beirut \| Presentail` |
| (404 fallback) | Dubai | `Gift Delivery in Dubai \| Presentail` (generic) |

---

## 3. Title-length guardrail — added ✅

**Problem identified:** `buildProductSeo()` previously had no length cap. With the new `{name} — {city} | Presentail` format, a 45+ character product name in cities like Abu Dhabi (9 chars) or Minnieh-Denniyeh (16 chars) would exceed Google's ~60-65 char display limit, causing Google to rewrite the title in SERPs.

**Fix applied** (`artifacts/presentail-web/src/lib/seo.mjs`, `buildProductSeo()`):

```
PRODUCT_TITLE_HARD_MAX = 65  (matches the FAQ/Contact page guardrail)

When  "{name} — {city} | Presentail".length > 65:
  truncate name to (65 − suffix.length − 1) chars and append "…"
```

Examples:

| Product name (70 chars) | City | Before fix | After fix |
|---|---|---|---|
| "Romantic Red Rose Bouquet with Personalised Teddy Bear and Chocolates" | Beirut | 92 chars → Google rewrites | `Romantic Red Rose Bouquet with Personalise… — Beirut \| Presentail` (65 chars) |
| `A…A` (50 chars) | Minnieh-Denniyeh | 82 chars → Google rewrites | Truncated to 65 chars |

Unit tests added (all pass — see `seo-inject.test.ts` lines 5911–5949):
- Long name truncated to ≤ 65 chars ✅
- Truncated title is exactly 65 chars ✅
- Short names unchanged ✅
- No-city path unaffected ✅
- Longest city (Minnieh-Denniyeh) handled correctly ✅

---

## 4. Google Search Console monitoring checklist

The Search Console re-crawl window is ~2 weeks from when the format went live. The team should perform the following checks:

### 4a. Coverage report
Navigate to **Google Search Console → Pages → Why pages aren't indexed** and check for any new "Crawled – currently not indexed" or "Alternate page with proper canonical tag" entries on product URLs. A title format change alone does not cause deindexing, but it's worth confirming.

### 4b. Inspect URL — sample product checks

For each market, inspect a representative product URL using **GSC → URL Inspection**:

| Market | Sample URL pattern | Expected displayed title |
|---|---|---|
| Lebanon (Beirut) | `/en-lb/beirut/product/{slug}` | `{product name} — Beirut \| Presentail` |
| UAE (Dubai) | `/en-ae/dubai/product/{slug}` | `{product name} — Dubai \| Presentail` |
| Cyprus (Nicosia) | `/en-cy/nicosia/product/{slug}` | `{product name} — Nicosia \| Presentail` |
| Arabic (Beirut) | `/ar-lb/beirut/product/{slug}` | `{product name} — بيروت \| Presentail` |
| French (Beyrouth) | `/fr-lb/beirut/product/{slug}` | `{product name} — Beyrouth \| Presentail` |

If GSC shows a Google-generated title (different from the `<title>` tag), check:
1. Is the product name > 42 chars for Beirut? → The guardrail should now truncate it.
2. Is the GSC title still using the old "Delivery in" format? → Cache; request re-indexing.

### 4c. Performance report — title click-through

Compare CTR for product pages in the 2-week windows before and after the change using **GSC → Performance → Pages**, filtered to URLs matching `/product/`. A moderate CTR change (±10%) is expected from the cleaner em-dash format and is not a signal of a problem.

### 4d. Rich results / structured data
The product JSON-LD (`@type: Product`) is emitted separately from the `<title>` and is unaffected by this change. Confirm no new errors in **GSC → Enhancements → Products**.

---

## 5. Status summary

| Check | Status |
|---|---|
| Title format correct in code | ✅ Verified (seo.mjs) |
| Em-dash renders correctly | ✅ Verified (seo-inject.test.ts) |
| Server-side injection tested | ✅ Verified (seo-inject.test.ts) |
| Title-length guardrail added | ✅ Implemented + tested |
| Google Search Console monitoring | ⏳ Ongoing — 2-week crawl window from format-change date |
