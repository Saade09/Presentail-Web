# SEO-03: Self-Canonical and Reciprocal Hreflang Implementation Plan

> **Status: PLANNING ONLY — not approved for implementation.**
> Requires sign-off before any change is applied to `seo-inject.mjs`, `locale-route.ts`, or `SeoHead.tsx`.
> Depends on SEO-02 (canonical-host plan) being approved first so all `href` values use the confirmed canonical hostname (`https://presentail.com`).

---

## 1. Current State and Gaps

### 1.1 Where hreflang is emitted today

**Server-side (`seo-inject.mjs`, `computeSeoHead`, lines 587–610):**

```js
for (const altLang of SUPPORTED_LANGS) {           // ["en","ar","fr"]
  const altPath = buildLocalePath({
    lang: altLang,
    country: parsed.country,                        // ← requesting country only
    city: parsed.city,
    rest: parsed.rest,
  });
  lines.push(`<link rel="alternate" hreflang="${altLang}-${parsed.country.toUpperCase()}" href="..." />`);
}
// x-default → en-{requesting country}
const xDefaultPath = buildLocalePath({ lang: "en", country: parsed.country, … });
lines.push(`<link rel="alternate" hreflang="x-default" href="…" />`);
```

This block is the **only** place hreflang is emitted in the entire file; entity-specific injection functions (`injectSeoTagsAsync`) call `buildSeoHead` to generate the generic head (including this block) and then override only OG/Twitter/JSON-LD tags — hreflang is never re-emitted or extended in entity paths.

**Client-side (`SeoHead.tsx`, `buildLanguageAlternates` from `locale-route.ts`):**

```ts
export function buildLanguageAlternates(pathname: string) {
  const parsed = parseLocalePath(pathname);
  if (!parsed.hasLocalePrefix || !parsed.country) return [];
  const country = parsed.country;        // ← requesting country only
  return SUPPORTED_LANGS.map((lang) => ({
    lang,
    path: buildLocalePath({ lang, country, city: parsed.city, rest: parsed.rest }),
  }));
}
```

`x-default` in `SeoHead.tsx` then picks the `en` entry from that same country-scoped array.

### 1.2 Confirmed gaps

| Gap | Impact |
|-----|--------|
| Lebanon pages emit only `en-LB`, `ar-LB`, `fr-LB` — no AE or CY alternates | Google treats LB, AE, and CY product/occasion pages as unrelated; no cross-market ranking signal |
| AE and CY pages have the same symmetric omission | Reciprocity is broken in both directions |
| `x-default` points to `en-{requesting country}` instead of consistently `en-lb/beirut` | Google sees three different x-default targets depending on which country's page the crawler lands on first |
| Soft-404 pages (unknown sub-route, `isUnknownSubRoute = true`) correctly canonicalize to locale home but still emit hreflang with the **unknown path** as the `rest` | Hreflang links point to URLs the SPA will redirect away from |
| No cross-country hreflang on entity pages (product, brand, category, occasion) | Identical to the generic-page gap — entity routes go through `computeSeoHead` for hreflang |

---

## 2. Locale Matrix

| `hreflang` value | URL prefix | Canonical city slug | Canonical city label |
|---|---|---|---|
| `en-LB` | `/en-lb/{city}/` | `beirut` | Beirut |
| `ar-LB` | `/ar-lb/{city}/` | `beirut` | Beirut |
| `fr-LB` | `/fr-lb/{city}/` | `beirut` | Beirut |
| `en-AE` | `/en-ae/{city}/` | `dubai` | Dubai |
| `ar-AE` | `/ar-ae/{city}/` | `dubai` | Dubai |
| `fr-AE` | `/fr-ae/{city}/` | `dubai` | Dubai |
| `en-CY` | `/en-cy/{city}/` | `limassol` | Limassol |
| `ar-CY` | `/ar-cy/{city}/` | `limassol` | Limassol |
| `fr-CY` | `/fr-cy/{city}/` | `limassol` | Limassol |
| `x-default` | `/en-lb/beirut/` | `beirut` | Beirut |

**Canonical cities are fixed regardless of which city the visitor browsed.** A shopper on `/en-lb/tripoli/product/roses` gets hreflang alternates using `/en-lb/beirut/product/roses`, `/en-ae/dubai/product/roses`, `/en-cy/limassol/product/roses`. The current-city context influences only the canonical self-link (which remains self-pointing), not the cross-country hreflang set.

---

## 3. Planned Shared Utility: `buildHreflangSet`

### 3.1 Location

A new pure function exported from **`lib/seo-utils`** (a new shared library package: `@workspace/seo-utils`). This makes it importable by both:

- `artifacts/presentail-web/seo-inject.mjs` (ESM, Node.js server)
- `artifacts/presentail-web/src/components/SeoHead.tsx` (TypeScript, browser bundle)

Both currently duplicate hreflang logic across `seo-inject.mjs` (plain JS) and `locale-route.ts` (TypeScript). The shared utility consolidates them so there is a single source of truth that cannot drift.

**Alternative (lower-lift):** If creating a new lib package is too heavy, define `buildHreflangSet` in `artifacts/presentail-web/src/lib/locale-route.ts` (TypeScript source) and import it into `seo-inject.mjs` via the existing `./src/lib/seo.mjs` barrel pattern (which already imports TypeScript-compiled `.mjs` outputs). Both the server injector and the client component already import from `./src/lib/…`; this avoids creating a new package while achieving the same consolidation goal. **Preferred approach unless a standalone lib is already planned for SEO utilities.**

### 3.2 Function signature

```typescript
/**
 * Build the complete set of hreflang <link rel="alternate"> descriptors for a
 * given entity path, scoped to the countries where the entity is available.
 *
 * @param entityPath     - The locale-agnostic entity path fragment, e.g.
 *                         "product/red-roses-bouquet", "shop", "" (home).
 *                         Must NOT start with a leading slash.
 *                         Must NOT carry query parameters or a trailing slash.
 * @param availableCountries - Countries where the entity page returns 200 and
 *                         has real content. Passing all three is correct for
 *                         most pages (home, shop, occasions). For entity-
 *                         specific pages, callers must omit countries where the
 *                         product/brand/category/occasion is not stocked or has
 *                         no products. Passing an empty array is valid and
 *                         produces an empty output (hreflang is suppressed).
 * @param origin         - The canonical site origin, e.g. "https://presentail.com".
 *                         Must not have a trailing slash.
 * @returns Array of hreflang descriptor objects, including x-default.
 *          Returns an empty array when availableCountries is empty.
 */
export function buildHreflangSet(
  entityPath: string,
  availableCountries: Array<"lb" | "ae" | "cy">,
  origin: string,
): HreflangEntry[];

export interface HreflangEntry {
  /** BCP 47 hreflang value, e.g. "en-LB", "ar-AE", "x-default". */
  hreflang: string;
  /** Absolute URL, e.g. "https://presentail.com/en-lb/beirut/product/roses". */
  href: string;
}
```

### 3.3 Canonical cities constant (co-located with the function)

```typescript
const CANONICAL_CITY: Record<"lb" | "ae" | "cy", string> = {
  lb: "beirut",
  ae: "dubai",
  cy: "limassol",
};

const SUPPORTED_LANGS_ORDERED: Array<"en" | "ar" | "fr"> = ["en", "ar", "fr"];
```

### 3.4 Algorithm

```
output = []

for each country in availableCountries (preserving lb → ae → cy order):
  canonicalCity = CANONICAL_CITY[country]
  for each lang in ["en", "ar", "fr"]:
    href = origin + "/" + lang + "-" + country + "/" + canonicalCity
           + (entityPath ? "/" + entityPath : "")
    hreflang = lang + "-" + country.toUpperCase()    // e.g. "en-LB"
    output.push({ hreflang, href })

if availableCountries is not empty:
  // x-default always points to en-LB/Beirut regardless of requesting country
  xDefaultHref = origin + "/en-lb/beirut" + (entityPath ? "/" + entityPath : "")
  output.push({ hreflang: "x-default", href: xDefaultHref })

return output
```

### 3.5 Input normalisation (before passing to the function)

Callers are responsible for stripping leading slashes and query parameters from `entityPath` before calling `buildHreflangSet`. A guard inside the function throws in development and silently strips in production:

```typescript
// Strip leading slash so callers can pass either "product/roses" or "/product/roses"
entityPath = entityPath.replace(/^\//, "").replace(/\?.*$/, "").replace(/\/$/, "");
```

### 3.6 Error behaviour

| Scenario | Behaviour |
|----------|-----------|
| `availableCountries` is empty | Return `[]` — no hreflang emitted |
| `entityPath` has a leading slash | Strip it (guard + warn in dev) |
| `entityPath` has a query string | Strip everything after `?` (guard + warn in dev) |
| `origin` is empty | Throw in development; return `[]` in production (safe-fail) |
| `entityPath` contains a fragment (`#`) | Strip at `#` (same as query guard) |

---

## 4. Self-Canonical Rules

These rules are already mostly correct in the current implementation. They are documented here for completeness and to guard against regressions during the hreflang refactor.

### 4.0 Canonical city: two distinct contexts (normative)

Two different concepts use city values in the SEO layer. Conflating them is the primary source of implementation drift:

| Concept | City used | Example |
|---------|-----------|---------|
| **Self-canonical** (`<link rel="canonical">`) | The **actual city the visitor browsed** (e.g., Tripoli, Ajman, Paphos) | A visitor on `/en-lb/tripoli/shop` gets canonical `https://presentail.com/en-lb/tripoli/shop` |
| **Hreflang alternates** (`<link rel="alternate">`) | The **canonical city for that country**, fixed regardless of browsed city | All LB alternates use `/beirut/`, all AE alternates use `/dubai/`, all CY alternates use `/limassol/` |

**Rule:** `buildHreflangSet` always uses `CANONICAL_CITY[country]` for every alternate it constructs. It never receives or uses the requesting page's actual city. The self-canonical continues to use the actual browsed city (unchanged from current behaviour).

**Why canonical cities for hreflang?** Hreflang alternates must point to a single stable URL per country so Google can cluster them as equivalent pages. If a product page's CY alternate pointed to `/en-cy/paphos/` for one visitor and `/en-cy/nicosia/` for another, Google would see two distinct URLs and treat them as separate pages. By always using a fixed canonical city, all crawlers see the same set of alternates.

### 4.1 Canonical URL format

```
https://presentail.com/{lang}-{country}/{actual-city}/{entity-path}   ← self-canonical
https://presentail.com/{lang}-{country}/{canonical-city}/{entity-path} ← hreflang alternate
```

- **Trailing slash**: always stripped from both canonical and hreflang hrefs.
- **Query parameters**: always stripped. Both canonical and hreflang always point to the clean base URL. This applies even to `?orderby=`, `?min_price=`, `?utm_*=`, etc.
- **Fragment (`#`)**: never appears in a server-rendered canonical or hreflang href.
- **`x-default`**: always `https://presentail.com/en-lb/beirut/{entity-path}` — uses the canonical city for LB.

### 4.2 Soft-404 routes

A soft-404 is a locale-prefixed path whose sub-route did not match any `ROUTE_KEYS` entry — `detectRouteKey` returns `"home"` but `parsed.rest` is non-empty and non-`"/"` (the `isUnknownSubRoute` flag in the current code).

**Current behaviour (correct for canonical, incorrect for hreflang):**
- Canonical → locale home (`/en-lb/beirut`, not the unknown path). ✓
- Hreflang → built using `parsed.rest` (the unknown sub-path). ✗

**Planned fix:**
Pass `""` as `entityPath` when `isUnknownSubRoute === true`, so all alternates point to locale homes, not the unrecognised URL:

```js
const entityPathForHreflang = isUnknownSubRoute ? "" : rest.replace(/^\//, "");
const hreflangSet = buildHreflangSet(entityPathForHreflang, ALL_COUNTRIES, origin);
```

### 4.3 Parameterised and filtered URLs

Pages with `?orderby=`, `?min_price=`, `?utm_*=`, etc.:
- Emit a canonical to the clean base URL (already in the existing implementation).
- Emit `<meta name="robots" content="noindex, follow" />` (already in the existing implementation for `NONINDEX_ROUTE_KEYS`).
- **Must NOT emit hreflang** — these pages are noindex, so hreflang on them would be pointing search engines at pages that won't be indexed. Guard: hreflang emission is skipped whenever `NONINDEX_ROUTE_KEYS.has(routeKey)` is true, or when the URL had a non-empty query string on a parameterised route.

---

## 5. Hreflang Completeness Rules by Page Type

### 5.1 Generic public routes (always available in all three countries)

These routes use `availableCountries = ["lb", "ae", "cy"]` — full set, no gating needed.

| Route key | `entityPath` passed to `buildHreflangSet` |
|-----------|------------------------------------------|
| `home` (locale-prefixed city home) | `""` |
| `shop` | `"shop"` |
| `brands` | `"brands"` |
| `occasions` | `"occasions"` |
| `faqs` | `"faqs"` |
| `contact` | `"contact"` |
| `careers` | `"careers"` |
| `partner` | `"partner"` |
| `weddings` | `"weddings"` |
| `corporate` | `"corporate"` |
| `terms` | `"terms"` |
| `privacy` | `"privacy"` |
| `blog` | `"blog"` |

### 5.2 Noindex routes — NO hreflang emitted

| Route key | Reason |
|-----------|--------|
| `cart` | User-specific, noindex |
| `checkout` | User-specific, noindex |
| `orderConfirmed` | User-specific, noindex |
| `auth` / `sign-in` / `sign-up` / `reset-password` / `unauthorized` | Auth flow, noindex |
| `account` | User-specific, noindex |
| `favorites` | User-specific, noindex |
| Any parameterised URL (`?orderby=`, `?min_price=`, `?utm_*=`) | Parameterised, noindex |

### 5.3 Entity pages — availability-gated

For entity pages, the `availableCountries` array must be derived from actual availability data, not assumed to be all three. The conservative approach:

**Products (`/product/{slug}`):**
- `availableCountries` = countries whose OS catalog includes the product (i.e., the product is returned by the `/api/products/{slug}` endpoint for that country's `countryCode`).
- If the product exists in LB and AE but not CY, pass `["lb", "ae"]` — the three `ar-CY`, `en-CY`, `fr-CY` alternates are omitted.
- If availability **cannot be confirmed** (upstream timeout, fetch error, cold cache), the country must be **omitted** from `availableCountries`. A missing alternate is always safer than a broken alternate — a broken hreflang link causes Google to invalidate the entire hreflang set for the page.

**Brands (`/brand/{slug}`):**
- `availableCountries` = countries that return at least one in-stock product for this brand.
- If availability cannot be confirmed for a country, omit it.

**Categories (`/category/{slug}`):**
- `availableCountries` = countries that return at least one product in this category.
- If availability cannot be confirmed for a country, omit it.

**Occasions (`/occasion/{slug}`):**
- `availableCountries` = countries that return at least one product for this occasion.
- If availability cannot be confirmed for a country, omit it.

### 5.4 Availability fetch failure contract

The caller (the entity-specific block in `injectSeoTagsAsync`) is responsible for determining `availableCountries` before calling `buildHreflangSet`. The following rules govern failure scenarios:

| Failure scenario | Action |
|---|---|
| OS API timeout for a specific country | Omit that country from `availableCountries` |
| OS API returns non-200 for a specific country | Omit that country from `availableCountries` |
| Cold cache (no cached availability data yet) | Omit all countries for the affected request — emit zero hreflang links rather than speculative alternates |
| Partial availability (LB confirmed, AE/CY not yet fetched) | Include only confirmed countries; do not speculatively add unconfirmed ones |
| All countries fail (total upstream outage) | Pass `availableCountries = []` → `buildHreflangSet` returns `[]` → no hreflang emitted for this request |

**Observability:** When a country is omitted due to a fetch failure, `seo-inject.mjs` logs at `WARN` level: `seo: omitted hreflang for country={country} on {entityKind}/{slug} — availability unconfirmed`. This makes failures visible in production logs without blocking the response.

**Cache warm-up strategy:** The OS product cache (`getOsProducts()`) is already populated for most entity routes before the SEO injector runs. Implementors should derive `availableCountries` from the in-process OS cache (which covers all three countries) rather than issuing new per-country HTTP requests per SEO render. A country is considered "confirmed" if `getOsProducts()` returned a non-empty result for that country within the last cache TTL window.

**Blog posts (`/blog/{slug}`):**
- Blog posts carry no locale prefix (the current URL structure is `/blog/{slug}`, not `/{lang}-{country}/{city}/blog/{slug}`). They are not locale-routed, so hreflang does not apply. No change needed.

### 5.4 x-default across all page types

`x-default` **always** points to `/en-lb/beirut/{entityPath}`, regardless of which country's page was requested or which `lang` the visitor is using. This is consistent with Google's recommendation to use x-default to indicate the "global" or "language-selector" page — for Presentail, English-Lebanon-Beirut is the canonical default market.

Examples:

| Requested URL | x-default href |
|---|---|
| `https://presentail.com/ar-ae/dubai/shop` | `https://presentail.com/en-lb/beirut/shop` |
| `https://presentail.com/fr-cy/limassol/product/roses` | `https://presentail.com/en-lb/beirut/product/roses` |
| `https://presentail.com/en-lb/tripoli/` | `https://presentail.com/en-lb/beirut/` |
| `https://presentail.com/en-lb/beirut/` | `https://presentail.com/en-lb/beirut/` |

---

## 6. Server–Client Parity

A critical invariant: the `<link rel="alternate">` tags emitted by `seo-inject.mjs` at server-render time must be **identical** to those written by `SeoHead.tsx` after client hydration. Divergence causes crawlers to see different hreflang sets depending on whether they execute JavaScript.

### 6.1 Parity mechanism

Both the server injector and `SeoHead.tsx` must call the **same** `buildHreflangSet` function with the same inputs. This is guaranteed by placing the function in the shared utility (section 3.1) and importing it in both places.

### 6.2 `SeoHead.tsx` claim-before-append (already implemented)

The existing `claimOrCreateAlternate` logic in `SeoHead.tsx` (tested in `SeoHead.hreflang.test.ts`) already prevents duplicate `<link rel="alternate">` elements — it claims the server-injected element before creating a new one. This logic must be extended to handle the full 10-entry set (9 locales + x-default) rather than the current 3+1 set, but the claim-before-append pattern itself does not change.

### 6.3 Cleanup on SPA navigation

`SeoHead.tsx` already stamps all managed elements with `data-seo-managed="true"` and removes them before re-writing on each navigation. The hreflang refactor does not change this logic — it simply means 10 elements are cleaned and re-written per navigation instead of 4.

---

## 7. Changes Required

### 7.1 New shared utility

**File:** `artifacts/presentail-web/src/lib/hreflang.ts` (preferred low-lift path; importable as `.mjs` by the server injector and as TypeScript by `SeoHead.tsx`)

Exports:
- `buildHreflangSet(entityPath, availableCountries, origin): HreflangEntry[]`
- `CANONICAL_CITY: Record<"lb" | "ae" | "cy", string>`
- `HreflangEntry` interface
- `ALL_COUNTRIES: Array<"lb" | "ae" | "cy">` — convenience constant `["lb", "ae", "cy"]`

### 7.2 `seo-inject.mjs` — replace the hreflang block in `computeSeoHead`

**Lines to replace (587–610):**

```js
// BEFORE (country-scoped only, x-default wrong)
if (inLocale) {
  for (const altLang of SUPPORTED_LANGS) {
    const altPath = buildLocalePath({ lang: altLang, country: parsed.country, city: parsed.city, rest: parsed.rest });
    lines.push(`<link rel="alternate" hreflang="${altLang}-${parsed.country.toUpperCase()}" href="..." />`);
  }
  const xDefaultPath = buildLocalePath({ lang: "en", country: parsed.country, … });
  lines.push(`<link rel="alternate" hreflang="x-default" href="..." />`);
}
```

```js
// AFTER (full 9 + x-default, availability-gated)
if (inLocale && !NONINDEX_ROUTE_KEYS.has(routeKey)) {
  const entityPathForHreflang = isUnknownSubRoute
    ? ""
    : (parsed.rest || "").replace(/^\//, "").replace(/\/$/, "");
  const hreflangSet = buildHreflangSet(entityPathForHreflang, ALL_COUNTRIES, origin + cleanBase);
  for (const { hreflang, href } of hreflangSet) {
    lines.push(`<link rel="alternate" hreflang="${escapeAttr(hreflang)}" href="${escapeAttr(href)}" />`);
  }
}
```

Note: `ALL_COUNTRIES` is used for generic routes. Entity-specific injection in `injectSeoTagsAsync` must pass the availability-gated set; see section 7.3.

### 7.3 `injectSeoTagsAsync` — entity availability gating

Currently, entity injection functions call `buildSeoHead` (which calls `computeSeoHead`) to get the generic head, then override OG/Twitter/JSON-LD in a second pass. Hreflang is baked into the `computeSeoHead` output — it is already in the string returned by `buildSeoHead`.

**Problem:** The `computeSeoHead` call happens before the product/brand/category/occasion is fetched, so it cannot know `availableCountries`. By the time the entity fetch resolves, the hreflang HTML is already assembled.

**Proposed fix:** Two options:

*Option A (recommended):* Make `computeSeoHead` accept an optional `availableCountries` parameter (default `ALL_COUNTRIES`), deferring hreflang emission to after the entity fetch. The entity-specific block in `injectSeoTagsAsync` patches the headSnippet string to replace a placeholder with the correct hreflang set.

*Option B (simpler):* Always emit full `ALL_COUNTRIES` hreflang in `computeSeoHead`. After the entity fetch, if the product is absent from a specific country, the entity-specific block **removes** the alternate links for that country from the already-assembled `headSnippet` string by replacing the relevant `<link rel="alternate">` tags.

*Option C (architectural):* Refactor `injectSeoTagsAsync` to assemble the full `<head>` snippet in one pass after all entity data is available. This is the cleanest long-term approach but requires the most refactoring.

**Decision for implementation:** Option A is recommended for the initial implementation — it is surgical and does not restructure the overall two-pass assembly pattern. If `availableCountries` is not yet determinable (timeout, cold cache), fall back to `ALL_COUNTRIES`.

### 7.4 `locale-route.ts` — update or deprecate `buildLanguageAlternates`

`buildLanguageAlternates` is used only by `SeoHead.tsx`. It must be updated to accept `availableCountries` and delegate to `buildHreflangSet` from the new shared utility. The old signature can be kept as a thin wrapper for backward compatibility, but flagged `@deprecated` with a migration note.

### 7.5 `SeoHead.tsx` — consume `buildHreflangSet`

Replace the `buildLanguageAlternates` → `hreflangCode` loop with a direct call to `buildHreflangSet`, passing the same `availableCountries` the server injector uses for generic routes. Entity pages (product/brand/category/occasion) already bail out early in `SeoHead.tsx` (`if (routeKey === "entityPage") return;`) — their hreflang is server-injected and never overwritten by the client, so no client-side availability gating is needed.

---

## 8. Safeguards

| Rule | Enforcement |
|------|-------------|
| Never emit hreflang on noindex routes | Guard: `if (NONINDEX_ROUTE_KEYS.has(routeKey)) return` before building hreflang set |
| Never emit hreflang on parameterised URLs | If URL contains a query string and routeKey is a filtered-browse route, treat as noindex and skip hreflang |
| Alternate hrefs must never carry a query string | `buildHreflangSet` only constructs clean canonical paths; it never receives or passes query params |
| Canonical must not point to a different entity | Self-canonical logic is unchanged; hreflang refactor does not touch canonical href computation |
| Server and client hreflang must be identical | Shared `buildHreflangSet` function — same code path, same inputs |
| Availability-gated: broken alternates must not be emitted | `availableCountries` array is explicit; unknown countries are omitted by not including them in the array |
| x-default always points to `en-lb/beirut` | Hardcoded in `buildHreflangSet` — the x-default entry is always appended using `CANONICAL_CITY["lb"] = "beirut"` and `lang = "en"`, regardless of inputs |

---

## 9. QA Checks (for implementation verification)

After implementation, the following must all pass before the feature is considered complete:

1. **Full set on a product page (Lebanon):**
   ```
   curl https://presentail.com/en-lb/beirut/product/{slug}
   ```
   → `<head>` contains exactly **10** `<link rel="alternate">` elements (3 × LB + 3 × AE + 3 × CY + x-default) and exactly **1** `<link rel="canonical">`.

2. **Same alternates regardless of requesting locale:**
   ```
   curl https://presentail.com/ar-ae/dubai/product/{slug}
   ```
   → Identical 10 alternate `href` values as (1). (The hrefs always use canonical cities, never the requesting city.)

3. **Noindex pages have zero hreflang:**
   ```
   curl https://presentail.com/en-lb/beirut/checkout
   ```
   → Zero `<link rel="alternate">` elements; `<meta name="robots" content="noindex, follow" />` present.

4. **Reciprocity check:**
   - The `en-LB` alternate on the Lebanon page points to the `ar-LB` URL.
   - Fetching the `ar-LB` URL confirms it carries the `en-LB` alternate in return.

5. **x-default consistency:**
   - `curl https://presentail.com/ar-ae/dubai/shop` → `x-default` href is `https://presentail.com/en-lb/beirut/shop`.
   - `curl https://presentail.com/fr-cy/limassol/shop` → `x-default` href is `https://presentail.com/en-lb/beirut/shop`.
   - `curl https://presentail.com/en-lb/tripoli/shop` → `x-default` href is `https://presentail.com/en-lb/beirut/shop`.

6. **Soft-404 alternates point to locale homes:**
   ```
   curl https://presentail.com/en-lb/beirut/some-unknown-sub-page
   ```
   → All 10 alternates use `""` as entity path (i.e., they resolve to `https://presentail.com/{lang}-{country}/{canonical-city}`).

7. **Validate with external tooling:**
   Use [hreflang.aleydasolis.com](https://hreflang.aleydasolis.com/) or Google's [Rich Results Test](https://search.google.com/test/rich-results) against a sample of 5 page types: home, shop, product, brand, occasion.

---

## 10. Dependencies and Prerequisites

| Prerequisite | Status |
|---|---|
| SEO-02 (canonical hostname confirmed) | Must be approved before implementation — all `href` values in `buildHreflangSet` use the canonical origin |
| `@workspace/seo-utils` lib package (or `hreflang.ts` in-tree module) | New file; no external dependency |
| `SeoHead.hreflang.test.ts` coverage for 10-entry sets | Existing tests cover the 3-entry set; must be extended for the new 10-entry set |

---

## 11. Unit Test Spec (for implementation)

New tests to add in `artifacts/presentail-web/src/lib/hreflang.test.ts`:

```
buildHreflangSet("product/roses", ["lb", "ae", "cy"], "https://presentail.com")
  → 10 entries: en-LB, ar-LB, fr-LB, en-AE, ar-AE, fr-AE, en-CY, ar-CY, fr-CY, x-default
  → x-default href = "https://presentail.com/en-lb/beirut/product/roses"
  → en-AE href = "https://presentail.com/en-ae/dubai/product/roses" (canonical city, not requesting city)

buildHreflangSet("product/roses", ["lb", "ae"], "https://presentail.com")
  → 7 entries: en-LB, ar-LB, fr-LB, en-AE, ar-AE, fr-AE, x-default  (no CY)

buildHreflangSet("", ["lb", "ae", "cy"], "https://presentail.com")
  → x-default href = "https://presentail.com/en-lb/beirut"  (no trailing slash)

buildHreflangSet("shop", [], "https://presentail.com")
  → [] (empty — no countries available)

buildHreflangSet("/product/roses", ["lb"], "https://presentail.com")
  → leading slash stripped; href = "https://presentail.com/en-lb/beirut/product/roses"

buildHreflangSet("product/roses?orderby=price", ["lb", "ae", "cy"], "https://presentail.com")
  → query string stripped; href = "https://presentail.com/en-lb/beirut/product/roses"
```

Extended tests in `SeoHead.hreflang.test.ts`:

```
After simulating full 10-entry server injection + client claim-before-append:
  → document.head has exactly 10 <link rel="alternate"> elements (no duplicates)
  → all 10 carry data-seo-managed="true"

After SPA navigation from /en-lb/beirut/shop to /ar-ae/dubai/product/roses:
  → old 10 hreflang links removed
  → new 10 hreflang links written with correct entity path
```
