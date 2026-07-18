# Legacy WordPress / WooCommerce URL Redirect Proposal

> **Status:** Proposal only — not approved for implementation.  
> Requires stakeholder review and sign-off before any redirect, status change, or route modification is applied.  
> Reference task: SEO-01.

---

## 1. Summary

This document catalogues every legacy WordPress and WooCommerce URL pattern that may
still appear in external link profiles, search-engine indexes, or third-party integrations,
and assigns each a proposed HTTP treatment (301 permanent redirect or 410 Gone).

No change to `serve.mjs`, `robots.txt`, sitemap, or CDN configuration is made during this task.

---

## 2. Important: Actual Current Behaviour vs. Task Brief

The task brief describes legacy paths as "Falls through to SPA shell (200, no redirect)".
Code review of `artifacts/presentail-web/serve.mjs` (the production static server) shows
that a **non-locale path guard** (lines 1435–1453) was already added. Its effect:

> Any path that is not `/`, `/favorites/share/:token`, or a locale-prefixed
> `/:lang-:country/:city/…` URL receives a real **HTTP 404** today — not a 200 SPA shell.

This is already better than a 200 soft-404, but:
- External links and crawl-index entries still point to these paths.
- A 404 does not transfer link equity; a 301 would.
- A 410 signals permanent removal, saving crawl budget.

The proposal below targets the definitive treatment for each pattern family.

---

## 3. Already-Wired Redirects (Existing — No Change Required)

| Source pattern | Current treatment | Notes |
|---|---|---|
| `/product/:slug` | **301 → `/en-lb/beirut/product/:slug`** | Regex match in serve.mjs line 1233. Handles mobile share links. |
| `/:lang-:country/:city/shop?category=:slug` | **301 → `/:lang-:country/:city/category/:slug`** | Query-param rewrite in serve.mjs line 1247. |
| `/:lang-:country/:city/shop?occasion=:slug` | **301 → `/:lang-:country/:city/occasion/:slug`** | Same block as above. |
| `www.presentail.com/*` | **301 → `https://presentail.com/*` (same path)** | Host-header redirect in serve.mjs lines 861–869. |

These four are excluded from new proposals below.

---

## 4. Proposed Redirect / Gone Table

Each row specifies the source pattern, match type, target, HTTP status, rationale, and
which infrastructure layer must implement the change.

### Implementation layers used below

- **Node / serve.mjs** — a new `if` block before the SPA fallback in
  `artifacts/presentail-web/serve.mjs`, matching the same style as the existing
  `/product/:slug` redirect block.
- **CDN / DNS** — requires configuration at the CDN edge or DNS provider;
  `serve.mjs` cannot intercept a request on a different hostname.

### 301 target verification

All proposed 301 targets below are locale-prefixed SPA routes that are confirmed valid by
`isKnownLocaleSubRoute()` in serve.mjs (lines 799–813) and will return **HTTP 200**:

| Verified target | Matched by |
|---|---|
| `/en-lb/beirut/` | `rest === ""` → passes |
| `/en-lb/beirut/shop` | Exact match in `KNOWN_LOCALE_SUBROUTES_EXACT` |
| `/en-lb/beirut/category/:slug` | `rest.startsWith("/category/")` → passes |
| `/en-lb/beirut/occasion/:slug` | `rest.startsWith("/occasion/")` → passes |
| `https://presentail.com/en-lb/beirut/` | CDN-layer; same logic as above |
| `https://presentail.com/en-ae/dubai/` | CDN-layer; same logic as above |
| `https://presentail.com/en-cy/nicosia/` | CDN-layer; same logic as above |

> **Note:** `/en-lb/beirut/best-sellers` is **not** a valid 301 target — it is absent from
> `KNOWN_LOCALE_SUBROUTES_EXACT` and does not match any prefix rule, so serve.mjs would
> return 404 for it. The `/wp/all-flowers/` and `/wp/best-sellers/` vanity paths
> redirect to `/en-lb/beirut/shop` instead.

---

| # | Source pattern | Example URL(s) | Match type | Proposed target | HTTP status | Rationale | Implementation layer |
|---|---|---|---|---|---|---|---|
| 1 | `/product-category/:slug` | `/product-category/flowers` | Prefix | `/en-lb/beirut/category/:slug` (use same slug if it exists in current catalog; else fallback to row 2) | 301 | Direct semantic equivalent exists in the new category URL structure. Passes link equity to the canonical category page. | Node / serve.mjs |
| 2 | `/product-category/:slug` (unknown slug) | `/product-category/misc-gifts` | Prefix (fallback) | `/en-lb/beirut/shop` | 301 | No 1-to-1 category mapping exists; nearest equivalent is the main shop. | Node / serve.mjs |
| 3 | `/product-category/:slug/page/:n/` | `/product-category/flowers/page/2/` | Regex | `/en-lb/beirut/category/:slug` (strip pagination) | 301 | Paginated WC archives are not replicated; the canonical category page is the best landing destination. | Node / serve.mjs |
| 4 | `/shop/page/:n/` | `/shop/page/2/`, `/shop/page/3/` | Regex | `/en-lb/beirut/shop` | 301 | Paginated shop archives do not exist in the SPA; redirect to the main shop. | Node / serve.mjs |
| 5 | `/shop/` (bare, no query params) | `/shop/` | Exact | `/en-lb/beirut/shop` | 301 | Bare WC shop root; passes link equity to the new shop page. | Node / serve.mjs |
| 6 | `/shop/?orderby=:value` | `/shop/?orderby=price`, `/shop/?orderby=popularity` | Prefix + query | `/en-lb/beirut/shop` | 301 | Sort-order query params are not supported in the SPA; redirect to unfiltered shop. | Node / serve.mjs |
| 7 | `/shop/?min_price=:n` and/or `?max_price=:n` | `/shop/?min_price=10&max_price=50` | Prefix + query | `/en-lb/beirut/shop` | 301 | Price-filter query params are not supported; redirect to unfiltered shop. | Node / serve.mjs |
| 8 | `/shop/?add-to-cart=:id` | `/shop/?add-to-cart=123` | Prefix + query | `/en-lb/beirut/shop` | 301 | WC add-to-cart query param is meaningless outside WooCommerce; redirect to shop. | Node / serve.mjs |
| 9 | `/offer/` | `/offer/` | Exact | `/en-lb/beirut/shop` | 301 | WC vanity curated page; no direct equivalent. Nearest landing is the main shop. | Node / serve.mjs |
| 10 | `/all-flowers/` | `/all-flowers/` | Exact | `/en-lb/beirut/category/hand-bouquets` | 301 | Closest semantic equivalent is the hand-bouquets category. | Node / serve.mjs |
| 11 | `/best-sellers/` | `/best-sellers/` | Exact | `/en-lb/beirut/shop` | 301 | `/en-lb/beirut/best-sellers` is not yet in `KNOWN_LOCALE_SUBROUTES_EXACT`; use shop as interim target. If `/best-sellers` is added as a valid locale sub-route, update this to `/en-lb/beirut/best-sellers`. | Node / serve.mjs |
| 12 | `/new-arrivals/` | `/new-arrivals/` | Exact | `/en-lb/beirut/shop` | 301 | WC vanity page; no direct SPA equivalent. | Node / serve.mjs |
| 13 | `/sale/` | `/sale/` | Exact | `/en-lb/beirut/shop` | 301 | WC sale archive; no direct SPA equivalent. | Node / serve.mjs |
| 14 | `/product-tag/:slug/` | `/product-tag/birthday/` | Prefix | `/en-lb/beirut/occasion/:slug` (if slug is a known occasion) | 301 | Product tags were often used as occasion synonyms; redirect to closest occasion page. | Node / serve.mjs |
| 15 | `/product-tag/:slug/` (not an occasion) | `/product-tag/roses/` | Prefix (fallback) | `/en-lb/beirut/shop` | 301 | No direct occasion or category mapping; redirect to shop. | Node / serve.mjs |
| 16 | `/product-tag/:slug/page/:n/` | `/product-tag/birthday/page/2/` | Regex | `/en-lb/beirut/occasion/:slug` or `/en-lb/beirut/shop` | 301 | Paginated tag archive → strip pagination, apply same occasion-mapping logic as rows 14–15. | Node / serve.mjs |
| 17 | `/2[0-9]{3}/[0-9]{2}/` (WP date archive) | `/2022/06/`, `/2023/12/` | Regex | — | **410 Gone** | WP date archives have no equivalent; no meaningful content to redirect to. | Node / serve.mjs |
| 18 | `/2[0-9]{3}/[0-9]{2}/[0-9]{2}/` (WP date archive, day) | `/2022/06/15/` | Regex | — | **410 Gone** | Same as above. | Node / serve.mjs |
| 19 | `/author/:name/` | `/author/admin/`, `/author/editor/` | Prefix | — | **410 Gone** | Author archives have no equivalent in the SPA. Returning 410 removes them from search indexes. | Node / serve.mjs |
| 20 | `/wp-json/` and all sub-paths | `/wp-json/`, `/wp-json/wc/v3/products` | Prefix | — | **410 Gone** | WordPress REST API; the site no longer runs WordPress. Must not be 301 — no meaningful equivalent exists. | Node / serve.mjs |
| 21 | `/wp-admin/` and all sub-paths | `/wp-admin/`, `/wp-admin/edit.php` | Prefix | — | **410 Gone** | WordPress admin surface; site is no longer WordPress. Returning 410 removes it from indexes and shuts down WordPress-targeting scanners. | Node / serve.mjs |
| 22 | `/wp-login.php` | `/wp-login.php` | Exact | — | **410 Gone** | WordPress login endpoint; no longer exists. 410 is correct: it stops credential-stuffing tools that expect a 200 or 302. | Node / serve.mjs |
| 23 | `/wp-content/` and all sub-paths | `/wp-content/uploads/2022/photo.jpg` | Prefix | — | **410 Gone** | WordPress media/plugin directory paths have no equivalent. Images are now served from the Presentail OS CDN. | Node / serve.mjs |
| 24 | `/wp-includes/` and all sub-paths | `/wp-includes/js/jquery.js` | Prefix | — | **410 Gone** | WordPress core includes directory; no equivalent. | Node / serve.mjs |
| 25 | `lb.presentail.com/*` (old Lebanon subdomain) | `lb.presentail.com/`, `lb.presentail.com/product/roses` | Host-level prefix | `https://presentail.com/en-lb/beirut/` (or path-mapped equivalent) | **301** | Old per-country subdomain; the canonical domain is now `presentail.com` with locale-prefix routing. | **CDN / DNS** (cannot be handled in serve.mjs) |
| 26 | `ae.presentail.com/*` (old UAE subdomain) | `ae.presentail.com/`, `ae.presentail.com/shop` | Host-level prefix | `https://presentail.com/en-ae/dubai/` | **301** | Same rationale as row 25. | **CDN / DNS** |
| 27 | `cy.presentail.com/*` (old Cyprus subdomain, if existed) | `cy.presentail.com/` | Host-level prefix | `https://presentail.com/en-cy/nicosia/` | **301** | Precautionary entry; include if DNS records existed. Confirm with DNS history before implementing. | **CDN / DNS** |

---

## 5. Occasion Slug Mapping (for rows 14–16)

The following WP product-tag slugs are known to map directly to current SPA occasion slugs.
All others should fall back to `/en-lb/beirut/shop`.

| WP tag slug | Proposed SPA occasion slug | Notes |
|---|---|---|
| `birthday` | `birthday` | Direct match |
| `anniversaire` / `anniversary` | `anniversary` | Both spellings seen in WP catalogs |
| `valentines-day` / `valentine` | `love-romance` | Slug changed in new system |
| `mothers-day` | `love-romance` | No dedicated mothers-day occasion; nearest |
| `new-born` / `newborn` | `new-born` | Direct match |
| `graduation` | `graduation` | Direct match |
| `get-well-soon` | `get-well-soon` | Direct match |
| `thank-you` | `thank-you` | Direct match |
| `congratulations` | `congratulations` | Direct match |
| `condolences` | `condolences` | Direct match |
| `wedding` | `wedding` | Direct match |
| `eid` | `congratulations` | No dedicated eid occasion; nearest generic celebration |
| `christmas` | `congratulations` | No dedicated christmas occasion |

---

## 6. Category Slug Mapping (for rows 1–3)

| WP product-category slug | Proposed SPA category slug | Notes |
|---|---|---|
| `flowers` | `hand-bouquets` | Broadest flower category |
| `flower-bouquets` | `hand-bouquets` | Direct equivalent |
| `flower-boxes` | `flower-boxes` | Direct match |
| `flower-vases` | `flower-vases` | Direct match |
| `flower-baskets` | `flower-baskets` | Direct match |
| `cakes` | `cakes` | Direct match |
| `chocolates` / `chocolate` | `chocolate` | Normalize to singular slug |
| `plants` | `plants` | Direct match |
| `balloons` | `balloons` | Direct match |
| `gift-boxes` | `gift-baskets` | Nearest equivalent |
| `hampers` | `gift-baskets` | Nearest equivalent |
| `stuffed-animals` / `teddy-bears` | `stuffed-animals` | Direct match |
| `roses` | `roses` | Direct match |
| `lux-arrangements` | `lux-arrangements` | Direct match |
| `arabic-sweets` | `arabic-sweets` | Direct match |
| `electronics` | `electronics` | Direct match |
| *(any other)* | *(fallback: `/en-lb/beirut/shop`)* | No mapping; use shop |

---

## 7. Implementation Notes for Node / serve.mjs

When this proposal is approved, all Node-layer entries (rows 1–24) should be inserted as
a single new redirect block in `serve.mjs` **immediately after** the existing
`shopRedirectMatch` block (line 1264) and **before** the `safeJoin` / file-exists check
(line 1266). This preserves the existing redirect priority and keeps all legacy-URL
logic in one place.

Suggested block ordering within the new section:

1. `/wp-admin/`, `/wp-login.php`, `/wp-json/`, `/wp-content/`, `/wp-includes/` → 410 (exact/prefix checks first)
2. `/author/:name/` → 410
3. `/2[0-9]{3}/[0-9]{2}` date archives → 410
4. `/product-category/:slug` → 301 with category mapping
5. `/product-tag/:slug` → 301 with occasion mapping
6. `/shop/page/:n/`, `/shop/?...` → 301 → shop
7. Vanity archives (`/offer/`, `/all-flowers/`, etc.) → 301

410 responses should include no body or a minimal `Gone` body and must **not** set a
`Location` header.

---

## 8. Acceptance Checklist

- [x] Every URL family from the task scope is addressed.
- [x] Each row specifies: source pattern, target, HTTP status, match type, and implementation layer.
- [x] No proposed 301 target is itself a redirect (no chains).
- [x] `/wp-admin/` and `/wp-json/` are assigned 410, not 301.
- [x] Already-existing redirects (`/product/:slug`, query-param shop, `www.`) are documented as existing and excluded from new proposals.
- [ ] At least one stakeholder has reviewed and approved this document before implementation (Task SEO-02 onwards).
- [ ] Every proposed 301 target verified to return HTTP 200 in production before implementation.
- [ ] Cross-reference proposed targets against canonical URL list (Task 3) to ensure no target conflicts with a noindex or soft-404 page.

---

## 9. Out of Scope

- `/robots.txt` changes — separate task.
- Sitemap changes — separate task.
- Any change to active SPA routes, API routes, or the Presentail OS catalog.
- WP blog post URLs (`/year/month/day/post-slug/`) — these would individually need content
  migration assessment; they are not catalogued here as a group redirect pattern.
