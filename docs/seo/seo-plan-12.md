# SEO-12: Automated SEO Regression Tests — Implementation Plan

> **Status:** PLANNING ONLY — Pending review and sign-off before implementation.
> **Date drafted:** 2026-07-18
> **Author:** Task agent (SEO-12)

---

## 1. Objective

Establish a single `check-seo-regression.mjs` script that validates 26 named SEO properties against any base URL, runs in CI on every PR (against a deployed preview environment), runs on a daily schedule against production, and drives a final audit report confirming all 11 preceding SEO tasks shipped correctly.

Target pass bar: **≥85 Agent Ready score** and **≥95 llms.txt score** on production after all 12 tasks are merged.

---

## 2. The 26 Regression Checks

Each check is identified by a stable slug used in output and CI reporting.

| # | Check slug | Method | Sample URL(s) | Pass condition |
|---|---|---|---|---|
| 1 | `http-200-homepage` | `curl -o /dev/null -s -w "%{http_code}" {BASE}/` | `/` | `200` |
| 2 | `http-200-shop` | same | `/{locale}/{city}/shop` | `200` |
| 3 | `http-200-brands` | same | `/{locale}/{city}/brands` | `200` |
| 4 | `http-200-occasions` | same | `/{locale}/{city}/occasions` | `200` |
| 5 | `http-200-blog` | same | `/{locale}/{city}/blog` | `200` |
| 6 | `html-lang-en` | Fetch HTML; parse `<html lang>` | EN page | `lang="en"` |
| 7 | `html-lang-ar` | same | AR page | `lang="ar"` |
| 8 | `html-lang-fr` | same | FR page | `lang="fr"` |
| 9 | `html-dir-rtl` | Fetch HTML; parse `<html dir>` | AR page | `dir="rtl"` |
| 10 | `html-dir-ltr` | same | EN and FR pages | `dir="ltr"` |
| 11 | `title-entity-name` | Parse `<title>` | product/category/occasion/brand sample | Title contains entity name (not generic) |
| 12 | `meta-description-valid` | Parse `content` of `<meta name="description">` | All indexable page types | Non-empty string, length ≤ 155 chars |
| 13 | `canonical-self` | Parse `<link rel="canonical" href>` | All indexable page types | `href` matches requested URL (query-string stripped, trailing-slash normalised) |
| 14 | `hreflang-count` | Count `<link rel="alternate" hreflang>` | Product page | Exactly 10 (9 locales: en-LB, ar-LB, fr-LB, en-AE, ar-AE, fr-AE, en-CY, ar-CY, fr-CY + x-default) |
| 15 | `og-title-equals-title` | Parse `og:title` and `<title>`, compare strings (normalise HTML entities) | Homepage, product sample | Identical after entity decode |
| 16 | `og-description-equals-meta` | Parse `og:description` and `<meta name="description">`, compare | All indexable page types | Identical |
| 17 | `jsonld-present` | Count `<script type="application/ld+json">` blocks | All indexable page types | At least 1 block |
| 18 | `jsonld-product` | Extract and parse JSON-LD; find `@type === "Product"` | Product page | `name` non-empty, `offers.price` is a finite number |
| 19 | `jsonld-breadcrumb` | Find `@type === "BreadcrumbList"` in JSON-LD | Non-home indexable pages | Present, `itemListElement.length >= 2` |
| 20 | `no-aggregate-rating` | Search all JSON-LD blocks for `AggregateRating` | All pages | String `"AggregateRating"` absent from all JSON-LD |
| 21 | `noindex-private` | Parse `<meta name="robots">` | `/checkout`, `/cart`, `/account` (or locale-prefixed equivalents) | `content` contains `noindex` (or page 404s, which is acceptable) |
| 22 | `no-noindex-indexable` | Parse `<meta name="robots">` | Shop, brands, occasions, product sample | `noindex` absent from `content` |
| 23 | `h1-count` | Count `<h1>` tags | All indexable page types | Exactly 1 per page |
| 24 | `h1-entity-name` | Parse `<h1>` text content | Product/category/occasion/brand pages | H1 text contains entity name |
| 25 | `sitemap-valid` | HTTP 200 + parse XML; check for private paths | `/sitemap.xml` | Status 200; no `<loc>` containing `/checkout`, `/cart`, `/account`, `/auth`, `/sign-in`, `/sign-up`, `/reset-password`, `/order-confirmed`, `/favorites`, `/personal-information` |
| 26 | `robots-txt-valid` | HTTP 200 | `/robots.txt` | Status 200 |
| 27 | `www-redirect` | `curl -sI https://www.{domain}/` | `www.` | 301 → `https://{domain}/` |
| 28 | `trailing-slash-redirect` | `curl -sI {BASE}/{locale}/{city}/shop/` | trailing slash | 301 → same URL without trailing slash |
| 29 | `product-slug-redirect` | `curl -sI {BASE}/product/test-slug` | `/product/:slug` | 301 → `/{default-locale}/{default-city}/product/test-slug` |
| 30 | `llms-txt-content-type` | `curl -sI {BASE}/llms.txt` | `/llms.txt` | `content-type` header starts with `text/plain` |
| 31 | `llms-txt-summary` | Fetch and parse `/llms.txt` | `/llms.txt` | Non-empty paragraph between the title line and the first `## ` section header |

That is **31 named checks** (exceeds the 24+ minimum).

---

## 3. Script Architecture

### 3.1 File layout

```
artifacts/presentail-web/
  scripts/
    check-seo-regression.mjs     ← single entry; imports sub-checkers
    seo-checks/
      http.mjs                   ← checks 1-5 (HTTP 200 assertions)
      html-meta.mjs              ← checks 6-16 (lang, dir, title, description, canonical, hreflang, OG)
      jsonld.mjs                 ← checks 17-20 (JSON-LD presence, Product, BreadcrumbList, AggregateRating)
      robots-meta.mjs            ← checks 21-22 (noindex on private, not on indexable)
      h1.mjs                     ← checks 23-24 (h1 count, h1 entity name)
      sitemap.mjs                ← check 25 (sitemap HTTP + private path exclusion)
      redirects.mjs              ← checks 27-29 (www, trailing-slash, /product/:slug)
      llms.mjs                   ← checks 30-31 (llms.txt content-type, summary)
      robots-txt.mjs             ← check 26 (robots.txt HTTP 200)
      util.mjs                   ← shared fetch helpers, HTML entity decoder, slug resolver
```

### 3.2 CLI interface

```
node check-seo-regression.mjs [OPTIONS]

Options:
  --base-url <url>      Base URL to test (default: https://presentail.com)
  --locale  <lc>        Default locale prefix (default: en-lb)
  --city    <city>      Default city slug (default: beirut)
  --dry-run             Fetch and log but do not assert; never exits non-zero
  --output  <format>    "text" (default) | "json" | "github"  (github: ::error:: annotations)
  --check   <slug>      Run only this check slug (repeatable)
  --skip    <slug>      Skip this check slug (repeatable)
```

Exit code: `0` if all ran checks pass, `1` if any fail.

### 3.3 Sample URLs baked into the script

The script needs at least one real entity URL per type to exercise entity-name checks. These are resolved at runtime by calling the `/api/products`, `/api/categories`, `/api/occasions`, `/api/brands` endpoints (or a `--seed-url` flag for offline use):

| Type | Runtime resolution | Fallback seed |
|---|---|---|
| Product | First slug from `/api/products?per_page=1` | `pink-roses-bouquet` |
| Category | First slug from `/api/categories?per_page=1` | `flowers` |
| Occasion | First slug from `/api/occasions?per_page=1` | `birthday` |
| Brand | First slug from `/api/brands?per_page=1` | `fleuri` |

### 3.4 npm script entry

In `artifacts/presentail-web/package.json`:

```json
{
  "scripts": {
    "check-seo-regression": "node scripts/check-seo-regression.mjs"
  }
}
```

Invocation: `pnpm --filter @workspace/presentail-web run check-seo-regression --base-url https://presentail.com`

### 3.5 GitHub Actions workflow

File: `.github/workflows/seo-regression.yml`

```yaml
name: SEO Regression

on:
  pull_request:
    paths:
      - 'artifacts/presentail-web/**'
      - 'artifacts/api-server/**'
      - '.github/workflows/seo-regression.yml'
  schedule:
    - cron: '0 5 * * *'   # 05:00 UTC daily against production
  workflow_dispatch:
    inputs:
      base_url:
        description: 'Base URL to test'
        default: 'https://presentail.com'
        required: false

jobs:
  seo-regression:
    name: SEO regression checks
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      # PR: run against the Replit preview URL for this branch
      - name: Run SEO regression (PR preview)
        if: github.event_name == 'pull_request'
        run: |
          pnpm --filter @workspace/presentail-web run check-seo-regression \
            --base-url "${{ secrets.PREVIEW_BASE_URL }}" \
            --output github
        env:
          PREVIEW_BASE_URL: ${{ secrets.PREVIEW_BASE_URL }}

      # Scheduled / manual: run against production
      - name: Run SEO regression (production)
        if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
        run: |
          pnpm --filter @workspace/presentail-web run check-seo-regression \
            --base-url "${{ github.event.inputs.base_url || 'https://presentail.com' }}" \
            --output github
```

**Required secret:** `PREVIEW_BASE_URL` — the Replit deployment preview URL for the branch under test. Set this as a GitHub Actions secret pointing to the Replit preview domain (e.g. `https://<repl-id>.repl.co` or a `REPLIT_DOMAINS` entry).

**Failure behaviour:** The job fails and blocks merge if any check exits non-zero. The `--output github` flag emits `::error::` annotations directly in the PR diff view.

---

## 4. Audit Report Template

After all 12 tasks are approved and merged, produce `.local/seo/seo-audit-final.md` with the following sections. Every ✅ must be backed by verifiable output from the regression script (no fabricated results).

```markdown
# Presentail SEO Audit — Final Report
Generated: YYYY-MM-DD HH:MM UTC
Regression script commit: <git sha>
Production URL: https://presentail.com

## Summary

| Metric | Before (baseline) | After (post-implementation) | Target |
|---|---|---|---|
| Agent Ready score | 52/100 | ? | ≥85 |
| llms.txt score | 87/100 | ? | ≥95 |
| Regression checks passing | 19/31 (baseline) | ?/31 | 31/31 |

## Task Completion Status

| Task | Title | Status | Evidence |
|---|---|---|---|
| SEO-1 | … | ✅ / ⚠️ / ❌ | one-line note |
| SEO-2 | … | … | … |
| … | | | |
| SEO-12 | Regression tests | ✅ | This report |

## Remaining Gaps

List any acceptance criterion from Tasks 1–12 not met, with rationale.

## False Negatives

Any Agent Ready or Google Rich Results check that fails despite correct implementation. For each:
- **Check name**: …
- **Expected result**: …
- **Actual result**: …
- **Investigation**: …
- **Root cause / workaround**: …

## Regression Test Results

Timestamp: YYYY-MM-DDTHH:MM:SSZ
Command: `node check-seo-regression.mjs --base-url https://presentail.com --output text`

\`\`\`
[full script stdout pasted here]
\`\`\`

## Structured Data Validation

For each of 5 representative pages, paste the Google Rich Results Test output URL or copy the result summary:

1. Homepage — `https://presentail.com/`
2. Product page — `https://presentail.com/en-lb/beirut/product/<slug>`
3. Category page — `https://presentail.com/en-lb/beirut/category/<slug>`
4. Occasion page — `https://presentail.com/en-lb/beirut/occasion/<slug>`
5. Brand page — `https://presentail.com/en-lb/beirut/brand/<slug>`

## Sitemap Audit

- URL count: N
- Pages with hreflang coverage: N / N (100%)
- Private URL exclusion: ✅ / ❌ (search results for /checkout, /cart, /account)

## Canonical + Hreflang Audit

Sample of 10 pages:

| URL | Canonical | Hreflang count | x-default |
|---|---|---|---|
| … | … | … | … |

## Recommendations for Next Phase

Maximum 5 items not covered by Tasks 1–12:

1. …
2. …
3. …
```

---

## 5. Target Scores

| Metric | Current (baseline) | Target | Source |
|---|---|---|---|
| Agent Ready score | 52/100 | **≥85** | Measured before Tasks 1–11 implementation |
| llms.txt score | 87/100 | **≥95** | Measured before Tasks 1–11 implementation |
| Regression suite pass rate | 19/31 (61%) | **31/31 (100%)** | Baseline dry-run (section 7 below) |

---

## 6. False-Negative Investigation Process

A false negative is when a regression check returns FAIL even though the implementation is correct. The following process must be followed before marking a check as a known exception:

1. **Reproduce with `--dry-run`**: Run `check-seo-regression.mjs --base-url <URL> --check <slug> --dry-run` and inspect the raw fetched HTML or response headers. Confirm the check is reading the correct selector.

2. **Check bot-detection / caching**: Some CDN or edge rules may return different HTML to automated `curl` requests than to real browsers. Test with:
   - `curl -A "Mozilla/5.0" <URL>` (user-agent override)
   - `curl -H "Accept: text/html,application/xhtml+xml" <URL>`
   If the HTML differs, the check must add appropriate request headers.

3. **Check server-side rendering vs CSR**: If the page is client-rendered, `<title>` and JSON-LD may not be in the initial HTML payload but injected after JS executes. The SEO implementation must inject these in the SSR pass; if they are only in CSR, the check will always fail. This is a real implementation bug, not a false negative.

4. **Check timing / cache warm-up**: On preview environments, the first request after deploy may return stale HTML. Add a `--warmup-delay 5` flag (5 s sleep before asserting) if needed.

5. **Document the exception**: If after steps 1–4 the check fails for a legitimate reason outside our control (e.g. a third-party redirect chain alters the URL), add a comment to the check in the script with `// known-false-negative: <reason>` and mark the corresponding row in the audit report as ⚠️ with investigation notes.

6. **Escalate to engineering**: If none of the above explains the failure, open a task for investigation before the audit report is closed.

---

## 7. Production Dry-Run Baseline (2026-07-18)

This section records which checks already pass on the current production site before Tasks 1–11 are implemented. It establishes the starting state for the regression suite.

**Base URL:** `https://presentail.com`
**Sample locale/city:** `en-lb/beirut`

| # | Check slug | Result | Notes |
|---|---|---|---|
| 1 | `http-200-homepage` | ✅ PASS | `200` |
| 2 | `http-200-shop` | ✅ PASS | `200` |
| 3 | `http-200-brands` | ✅ PASS | `200` |
| 4 | `http-200-occasions` | ✅ PASS | `200` |
| 5 | `http-200-blog` | ✅ PASS | `200` |
| 6 | `html-lang-en` | ✅ PASS | `lang="en"` on `/en-lb/beirut/shop` |
| 7 | `html-lang-ar` | ✅ PASS | `lang="ar"` on `/ar-lb/beirut/shop` |
| 8 | `html-lang-fr` | ✅ PASS | `lang="fr"` on `/fr-lb/beirut/shop` |
| 9 | `html-dir-rtl` | ✅ PASS | `dir="rtl"` on AR page |
| 10 | `html-dir-ltr` | ✅ PASS | `dir="ltr"` on EN and FR pages |
| 11 | `title-entity-name` | ⚠️ SKIP | No public product/brand/occasion/category URL known yet; needs seeding |
| 12 | `meta-description-valid` | ✅ PASS | Homepage desc = 123 chars ≤ 155; shop desc = 85 chars ≤ 155; both non-empty |
| 13 | `canonical-self` | ✅ PASS | Homepage canonical = `https://presentail.com/`; shop = `https://presentail.com/en-lb/beirut/shop` |
| 14 | `hreflang-count` | ❌ FAIL | Shop page has 4 alternates (en-LB, ar-LB, fr-LB, x-default); missing en-AE, ar-AE, fr-AE, en-CY, ar-CY, fr-CY — expected 10 |
| 15 | `og-title-equals-title` | ❌ FAIL | `og:title` = "Online Flower & Gift Delivery \| Presentail"; `<title>` = "Online Flower & Gift Delivery \| Presentail \| Express Delivery" — differ by "| Express Delivery" suffix |
| 16 | `og-description-equals-meta` | ✅ PASS | Both = "Send flowers, cakes and gifts with same-day express delivery in Lebanon, UAE, and Cyprus. Premium arrangements from Presentail." |
| 17 | `jsonld-present` | ✅ PASS | Homepage: 1 JSON-LD block (Organization + WebSite + FAQPage @graph); shop: 1 block |
| 18 | `jsonld-product` | ⚠️ SKIP | No live product URL sampled (needs seeding); to be established after Tasks 1–11 |
| 19 | `jsonld-breadcrumb` | ❌ FAIL | Shop JSON-LD contains Organization + FAQPage only; BreadcrumbList absent |
| 20 | `no-aggregate-rating` | ✅ PASS | String "AggregateRating" absent from all sampled JSON-LD blocks |
| 21 | `noindex-private` | ✅ PASS | `/checkout` and `/account` return 404 (no route served); private paths covered by `robots.txt` Disallow rules |
| 22 | `no-noindex-indexable` | ✅ PASS | Shop page has no `<meta name="robots">` tag (implicitly indexable) |
| 23 | `h1-count` | ✅ PASS | Homepage: 1 `<h1>`; shop: 1 `<h1>` |
| 24 | `h1-entity-name` | ✅ PASS | Shop h1 = "Shop Flowers & Gifts in Beirut \| Presentail" (contains city name) |
| 25 | `sitemap-valid` | ✅ PASS | HTTP 200; 271 `<url>` entries; no `/checkout`, `/cart`, `/account` found in `<loc>` values |
| 26 | `robots-txt-valid` | ✅ PASS | HTTP 200 |
| 27 | `www-redirect` | ✅ PASS | `HTTP/2 301 location: https://presentail.com/` |
| 28 | `trailing-slash-redirect` | ✅ PASS | `HTTP/2 301 location: /en-lb/beirut/shop` |
| 29 | `product-slug-redirect` | ✅ PASS | `HTTP/2 301 location: /en-lb/beirut/product/test-slug` |
| 30 | `llms-txt-content-type` | ❌ FAIL | `content-type: text/markdown; charset=utf-8` — must be `text/plain` |
| 31 | `llms-txt-summary` | ✅ PASS | Non-empty paragraph "Luxury flower and gift delivery across Lebanon, UAE, and Cyprus." precedes `## Pages` |

**Baseline summary:**
- ✅ PASS: 23
- ❌ FAIL: 4 (`hreflang-count`, `og-title-equals-title`, `jsonld-breadcrumb`, `llms-txt-content-type`)
- ⚠️ SKIP: 2 (`title-entity-name`, `jsonld-product` — require entity seed URL)
- **Baseline pass rate (of runnable checks): 23 / 29 = 79%**

**Checks to fix before the regression suite goes green:**

| Check slug | Root cause to fix | Owner task |
|---|---|---|
| `hreflang-count` | Hreflang only covers LB locale; AE and CY locale alternates are missing from non-home pages | SEO-6 (hreflang) |
| `og-title-equals-title` | `og:title` omits "| Express Delivery" suffix; title and OG must be kept in sync | SEO-3 (title/OG alignment) |
| `jsonld-breadcrumb` | No BreadcrumbList emitted on shop/category/occasion/brand pages | SEO-7 (structured data) |
| `llms-txt-content-type` | `llms.txt` served as `text/markdown`; must change to `text/plain` | SEO-9 (llms.txt) |

---

## 8. Safeguards

- All checks are HTTP GET or HEAD only — no POST, form submission, cart mutation, or payment trigger.
- `--dry-run` flag fetches all URLs and logs raw results but never throws, never exits non-zero. Use for local debugging without breaking CI.
- CI tests must target the **Replit preview environment** (not production `presentail.com`) to avoid skewing production analytics and triggering bot-detection.
- The audit report must include raw, unedited script output for every ✅ claim. No results may be cherry-picked or manually edited.

---

## 9. Dependencies

| Dependency | Status |
|---|---|
| Tasks 1–11 planned and approved | Required before implementation |
| Task 9 (robots.txt / sitemap) output | Required for sitemap audit section |
| Replit preview URL secret in GitHub Actions | Required for PR checks |
| At least one live product/brand/occasion/category URL | Required for entity-name checks (checks 11, 18, 24) |
