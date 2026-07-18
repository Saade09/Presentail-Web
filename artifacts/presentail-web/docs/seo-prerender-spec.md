# SEO-06: Server-Rendered HTML Discoverability — Specification

> **Status: PLANNED — not yet implemented.**
> Implementation requires a separate review and sign-off before any change to
> `seo-inject.mjs`, `serve.mjs`, or the prerendered HTML injected into `#root`.

---

## Background

The web storefront is a client-side React SPA. On every request the Express
production server (`serve.mjs`) calls `injectSeoTagsAsync()` from
`seo-inject.mjs` to modify the raw `dist/index.html` shell before it is sent
to the browser. The injection writes:

- `<head>` — `<title>`, `<meta>`, OG/Twitter tags, `<link rel="canonical">`,
  hreflang alternates, and one or more `<script type="application/ld+json">`
  blocks.
- `<body>` — a **`<div style="display:none">`** inserted as the first child of
  `<div id="root">`. React replaces this block during hydration so human users
  never see it; AI crawlers and bots that do not execute JavaScript read it
  directly.

The hidden body block is currently minimal. This document specifies additions
to expand discoverability for product and collection pages without introducing
cloaking risk.

---

## Current State (as-built, July 2025)

### Product detail pages — `buildProductBodyHtml()`

```html
<div style="display:none">
  <img src="{imageUrl}" alt="{name}" loading="lazy" />
  <h1>{name}</h1>
  <p>{full description, HTML stripped}</p>
  <p>From ${priceValue} USD</p>            <!-- omitted when price=0 -->
  <nav>
    <a href="{localeBase}/">Home</a> ›
    <a href="{localeBase}/shop">Shop</a>
  </nav>
</div>
```

**Gaps vs. full client-rendered view:** brand name, explicit availability label
(In Stock / Out of Stock), delivery city label, associated category and
occasion names.

---

### Category / Occasion listing pages — `buildShopEntityHead()` inline

```html
<div style="display:none">
  <h1>{entityName}</h1>
  <p>{entity description, HTML stripped, clamped to 300 chars}</p>
  <h2>{localised SEO heading, e.g. "Flowers Delivery in Beirut"}</h2>
  <p>{localised intro paragraph}</p>
  <nav>
    <a href="{localeBase}/">Home</a> ›
    <a href="{localeBase}/shop">Shop</a>
  </nav>
</div>
```

**Gaps:** no product listing links, no product count sentence. The top-10
product list is currently only in the `ItemList` JSON-LD schema — invisible
to crawlers that parse schema as data rather than text.

---

### Brand detail pages — `buildBrandHead()` inline

```html
<div style="display:none">
  <h1>{brandName}</h1>
  <p>{brand description, HTML stripped, clamped to 300 chars}</p>
  <h2>{localised brand heading, e.g. "Brand Delivery in Beirut"}</h2>
  <p>{brand intro — always the "general" variant; flowers/food variants not used}</p>
  <nav>
    <a href="{localeBase}/">Home</a> ›
    <a href="{localeBase}/brands">Brands</a>
  </nav>
</div>
```

**Gaps:** no product listing links, no product count sentence, brand intro
always uses the general template (not the flowers/food-specific copy).

---

### Shop (all products) / City homepage — `buildGenericBodyHtml()`

```html
<div style="display:none">
  <h1>{page title}</h1>
  <p>{page description}</p>
  <p>{ROUTE_BODY_INTRO content}</p>
  <nav>…links to Home, Shop, Brands, Occasions, Contact, FAQs…</nav>
</div>
```

**Gaps for city homepage:** no district/area delivery coverage, no featured
collection subheadings.  
**Gaps for Shop page:** no featured category subheadings.

---

## Planned Additions

Each addition is described by:

- **HTML elements to add** (what and where inside the hidden block)
- **Data source** (what field on what already-fetched object supplies the value)
- **Cloaking confirmation** (the same content is rendered by the React component
  for human users; links to the relevant component)
- **Byte estimate** (worst-case UTF-8 characters added to the block)

---

### 1. Product detail pages

**Goal:** let crawlers understand who made the product, whether it is in stock,
and which occasion/category it belongs to.

#### 1a. Brand attribution `<p>`

Add immediately after the `<h1>`:

```html
<p>By {brand name}</p>
```

- **Data source:** `product.brandNames[0]` (the `transformProduct()` result
  returned by `/api/woo/product`). `brandNames` is an array of HTML-decoded
  brand name strings; use index 0. If the array is empty, omit this element.
- **Cloaking confirmation:** The `ProductDetail` React component renders the
  brand name as a clickable link beneath the product name. This is always
  visible to signed-in and guest users.
- **Byte estimate:** ≈ 30 bytes (`<p>By Brand Name</p>` where brand name ≤ 50
  chars).

#### 1b. Availability `<p>`

Replace the current bare price line with a combined price+availability line:

```html
<p>From ${priceValue} USD — In Stock</p>
<!-- or -->
<p>Out of Stock</p>
```

- **Data source:** `product.inStock` (boolean on `transformProduct()` result);
  `product.priceValue` (already used). When `inStock` is false, suppress the
  price and emit only "Out of Stock". When `inStock` is true and price > 0,
  emit both.
- **Cloaking confirmation:** Availability is shown in the React product page
  via a stock-status badge. Out-of-stock products show an explicit "Out of
  Stock" overlay. No new information is introduced.
- **Byte estimate:** ≈ 55 bytes.

#### 1c. Delivery city `<p>`

Add after availability:

```html
<p>Delivered to {cityLabel}</p>
```

- **Data source:** `cityLabel` is already resolved by `buildProductHead()` from
  the locale path (e.g. `/en-lb/beirut/product/…` → `"Beirut"`). It is
  available as a local variable in the same scope as `buildProductBodyHtml()`.
  Pass it as a new argument to `buildProductBodyHtml()`.
- **Cloaking confirmation:** The product page shows the delivery city in the
  delivery-date picker ("Deliver to Beirut" label). No new information.
- **Byte estimate:** ≈ 40 bytes.

#### 1d. Category and occasion names `<ul>`

Add after the delivery city paragraph:

```html
<ul>
  <li><a href="{localeBase}/category/{slug}">{categoryName}</a></li>
  <!-- one entry per occasion the product belongs to -->
  <li><a href="{localeBase}/occasion/{slug}">{occasionName}</a></li>
</ul>
```

- **Data source:** `product.categories` contains the product's primary
  category slugs. `product.occasions` is an array of `{ name, slug }` objects
  embedded by `transformProduct()` (derived from the OS product occasions
  field). Use both arrays; deduplicate and limit to a maximum of 5 entries
  combined.
- **Cloaking confirmation:** Category and occasion labels are shown in the
  product breadcrumb and in the "You may also like" section. Occasion tags are
  displayed in the product metadata section of `ProductDetail.tsx`. All links
  lead to browseable collection pages.
- **Byte estimate:** ≈ 200 bytes for 5 entries (40 bytes per `<li>` with slug
  and display name ≤ 30 chars).

#### Total estimated addition for product pages

≈ 325 bytes (brand 30 + availability 55 + city 40 + list 200). Well within a
1 kB budget ceiling that has negligible effect on TTFB.

---

### 2. Category listing pages

**Goal:** expose the product list as crawlable text links (not just JSON-LD),
and state the product count explicitly.

#### 2a. Product count `<p>`

Add after the intro paragraph:

```html
<p>{count} products available</p>
```

- **Data source:** `listing.count` — already fetched by
  `fetchListingProductsForSeo()` and passed as `productCount` to
  `buildCategoryHead()`. Pass it on into `buildShopEntityHead()` (it already
  arrives as `productCount`). The value is already used to gate JSON-LD
  emission.
- **Cloaking confirmation:** The Shop page shows a product count ("N results")
  in the results header. Always visible.
- **Byte estimate:** ≈ 35 bytes.

#### 2b. Product links `<ul>`

Add after the product count:

```html
<ul>
  <li><a href="{localeBase}/product/{slug}">{name}</a></li>
  <!-- up to 10 entries -->
</ul>
```

- **Data source:** `listing.items` — already fetched by
  `fetchListingProductsForSeo()` and passed as `items` to
  `buildCategoryHead()`. Each item is `{ name, slug, image }`. The slug is
  the product slug (the `id` field from `transformProduct()`), not the
  numeric ID.
- **Cloaking confirmation:** The React `Shop.tsx` component renders exactly
  these products as visible `ProductCard` tiles. Every product link in the
  hidden block also appears as a rendered card. This is not additional
  information — it is the same data shown to the user, rendered as anchor
  tags instead of React components.
- **Byte estimate:** ≈ 600 bytes for 10 entries (60 bytes per `<li>` assuming
  an average product name of 25 chars and a slug of 20 chars).

#### Total estimated addition for category pages

≈ 635 bytes. Block grows from ≈ 400 bytes to ≈ 1,035 bytes per request — well
under a 2 kB ceiling.

---

### 3. Occasion listing pages

Identical additions to category pages:

#### 3a. Product count `<p>` — same spec as §2a

- **Data source:** `listing.count` (occasion listing uses the same
  `fetchListingProductsForSeo({ kind: "occasion" })` call that already returns
  `count`).

#### 3b. Product links `<ul>` — same spec as §2b

- **Data source:** `listing.items` from the occasion listing fetch.
- **Cloaking confirmation:** Occasion pages render these exact products in
  `OccasionGrid.tsx`. All listed items are visible to the user.

#### Total estimated addition for occasion pages

≈ 635 bytes. Same budget as category pages.

---

### 4. Brand listing pages

**Goal:** expose the top product list and product count so crawlers see the
brand's offer, matching the visible page content.

#### 4a. Product count `<p>`

```html
<p>{count} products available from {brandName}</p>
```

- **Data source:** `productCount` is already fetched by
  `fetchBrandProductCountForSeo()` and passed into `buildBrandHead()`. The
  `count` field is already used to gate FAQ JSON-LD.
- **Cloaking confirmation:** Brand pages show an inline product count alongside
  the product grid in `BrandDetail.tsx`.
- **Byte estimate:** ≈ 55 bytes.

#### 4b. Product links `<ul>`

The brand page currently fetches only a count, not individual product records,
from `/api/woo/brand-products`. To add product links the spec requires one of:

**Option A (preferred — reuse existing endpoint):** Extend
`fetchBrandProductCountForSeo()` to return the first 10 products (name + slug)
from the same `/api/woo/brand-products` response. The endpoint already returns
full product records in the `products` array; the SEO fetcher currently reads
only `count`. The change is a local read of `body.products.slice(0, 10)` with
no new API call.

**Option B (no server change):** Accept that brand pages have a count paragraph
but no product list until Option A is approved. The count alone is already a
meaningful improvement.

Assuming Option A is approved:

```html
<ul>
  <li><a href="{localeBase}/product/{slug}">{name}</a></li>
  <!-- up to 10 entries -->
</ul>
```

- **Data source:** `products[].id` (slug) and `products[].name` from
  `/api/woo/brand-products` response.
- **Cloaking confirmation:** `BrandDetail.tsx` renders these products as
  `ProductCard` components visible to all users.
- **Byte estimate:** ≈ 600 bytes for 10 entries.

#### 4c. Brand intro variant selection

Currently the brand body HTML always uses `BRAND_INTRO_GENERAL_COPY`. The
API's `/api/woo/brand` response includes a `type` field (`"flowers"`,
`"food"`, `"general"`). Pass it into `buildBrandHead()` and select
`BRAND_INTRO_FLOWERS_COPY` / `BRAND_INTRO_FOOD_COPY` as appropriate. This is
a one-line template switch with no data fetching overhead.

- **Cloaking confirmation:** `SEOContentSection.tsx` on the brand page already
  picks the correct intro variant based on brand type. The server block will
  now match the client output exactly, removing the current minor divergence.
- **Byte delta:** ≈ 0 (same paragraph length; different template content).

#### Total estimated addition for brand pages

≈ 655 bytes with Option A (55 count + 600 list). Without Option A: ≈ 55 bytes.

---

### 5. Shop page (all products)

**Goal:** surface featured categories as crawlable subheadings so the page
signals breadth of offer.

Add after the existing intro paragraph:

```html
<h2>Shop by Category</h2>
<ul>
  <li><a href="{localeBase}/category/flowers">Flowers</a></li>
  <li><a href="{localeBase}/category/cakes">Cakes</a></li>
  <!-- … up to 8 featured categories … -->
</ul>
```

- **Data source:** The featured category list is a static constant in the
  codebase (the same `OCCASIONS` / category arrays already used by `Shop.tsx`
  for the category pills). The server injector can hard-code the same list
  with no API call. Alternatively, use the `/api/catalog/nav` endpoint which
  is already available (it supplies the megamenu). Because `buildSeoHead()`
  is synchronous and cached, the cleanest approach is a small static list
  maintained in `seo-inject.mjs` (analogous to how FAQ copy is kept in
  `seo-shop-faqs.mjs`).
- **Cloaking confirmation:** `Shop.tsx` renders category pills and a category
  grid as the primary navigation layer. Every item in the subheading list
  appears as a visible element on the page.
- **Byte estimate:** ≈ 400 bytes for 8 categories.

---

### 6. City homepage

**Goal:** name delivery coverage areas and featured product types explicitly
so the local-intent signal is strong without executing JS.

Add after the existing description paragraph:

```html
<p>
  Presentail delivers flowers, cakes, chocolates, plants and gifts across
  {cityLabel}, {countryLabel}. Same-day delivery available when ordered
  before midday.
</p>
<h2>Shop by Occasion in {cityLabel}</h2>
<ul>
  <li><a href="{localeBase}/occasion/birthday">Birthday Flowers &amp; Gifts</a></li>
  <li><a href="{localeBase}/occasion/anniversary">Anniversary Gifts</a></li>
  <!-- … up to 6 featured occasions … -->
</ul>
```

- **Data source:** City and country labels are already resolved in
  `buildSeoHead()` via `CITY_NAMES` and `COUNTRY_NAMES`. The featured occasion
  list mirrors the static list used by the homepage carousel
  (`DEFAULT_OCCASION_SLUGS` in `artifacts/api-server/src/routes/homepage.ts`)
  and can be duplicated into a static constant in `seo-inject.mjs`. Because
  `buildSeoHead()` is synchronous, no new API call is introduced.
- **Cloaking confirmation:** The city homepage renders an occasions carousel
  (visible immediately below the hero banner) and a delivery-coverage paragraph
  in the SEO content section. All listed occasions appear as carousel tiles.
- **Byte estimate:** ≈ 350 bytes (intro paragraph 150 + h2 50 + list 150).

---

## Cloaking Risk Assessment

The `display:none` technique is an accepted crawlability pattern for SPAs
provided that Googlebot's JS-rendering pipeline sees the fully hydrated React
output, not the hidden block. The following table confirms compliance for each
planned addition:

| Addition | In React-rendered view? | Cloaking risk |
|---|---|---|
| Product brand attribution | Yes — brand link below product title | None |
| Product availability label | Yes — stock badge on product page | None |
| Product delivery city | Yes — delivery picker header | None |
| Product category/occasion links | Yes — breadcrumb + occasion tags | None |
| Category/occasion product list | Yes — ProductCard grid (same items) | None |
| Product count sentence | Yes — results count in shop header | None |
| Brand product list | Yes — ProductCard grid on brand page | None |
| Brand intro variant | Yes — SEOContentSection on brand page | None |
| Shop category subheadings | Yes — category pills + grid | None |
| City homepage occasion list | Yes — occasions carousel | None |
| City intro paragraph | Yes — SEO content section on homepage | None |

**Googlebot check:** Googlebot's rendering tier executes JavaScript and
hydrates React. After hydration, React replaces the `display:none` block with
the live React tree. Googlebot therefore indexes the fully hydrated content,
not the prerendered fallback, so there is no ambiguity about the rendered vs.
crawled content. This can be verified per-URL using Google Search Console →
URL Inspection → "Test Live URL" → "View Tested Page".

**Anti-cloaking rule (must be enforced during implementation):** the prerendered
block must contain only content that is also rendered by the React component
for that page. Any text, link, or structured element added to the hidden block
must have an identifiable counterpart in the React component tree. If a
planned addition cannot be confirmed to appear in the React view, it must not
be added to the prerendered block.

---

## Data Sources Summary

| Page type | Entity fetch endpoint | Extra SEO fetch | New fields needed |
|---|---|---|---|
| Product | `/api/woo/product` | none | `brandNames[0]`, `inStock`, `categories`, `occasions` (all already on `transformProduct()` result) |
| Category | `/api/woo/category` + `/api/woo/category-products` | none | `listing.count`, `listing.items` (both already fetched) |
| Occasion | `/api/woo/occasion` + `/api/woo/occasion-products` | none | same as category |
| Brand | `/api/woo/brand` + `/api/woo/brand-products` | none | `productCount.count` (already fetched); `products[].name/slug` requires reading `body.products` in fetcher (currently reads only `count`) |
| Shop | static | static category list | no API call; static constant in `seo-inject.mjs` |
| City home | none | none | static occasion list + city/country labels (all already available in `buildSeoHead()`) |

No new API endpoints are required. The only server-side change beyond
`seo-inject.mjs` is extending `fetchBrandProductCountForSeo()` to return
product records alongside the count (Option A for brand pages).

---

## Byte Size Estimates per Page Type

| Page type | Current block size (est.) | Addition (est.) | Post-change size (est.) |
|---|---|---|---|
| Product detail | ≈ 600 bytes | ≈ 325 bytes | ≈ 925 bytes |
| Category listing | ≈ 400 bytes | ≈ 635 bytes | ≈ 1,035 bytes |
| Occasion listing | ≈ 400 bytes | ≈ 635 bytes | ≈ 1,035 bytes |
| Brand detail | ≈ 350 bytes | ≈ 655 bytes | ≈ 1,005 bytes |
| Shop | ≈ 200 bytes | ≈ 400 bytes | ≈ 600 bytes |
| City homepage | ≈ 250 bytes | ≈ 350 bytes | ≈ 600 bytes |

These are worst-case UTF-8 estimates for English content. Arabic content is
larger per character (multi-byte UTF-8) but shorter in token count; the byte
delta is approximately 1.5–2× for Arabic text. Even at 2× the largest block
(≈ 2,070 bytes for a category page in Arabic) is well under any meaningful TTFB
impact threshold — the block is injected synchronously but synchronously
assembled as a string in memory, not from an additional I/O call.

---

## QA Checks (to run after implementation)

These checks are defined in the task acceptance criteria and should be
run against the production URL after the changes ship:

```
# Product page — confirm brand, price, description in raw HTML
curl -s https://presentail.com/en-lb/beirut/product/{slug} \
  | grep -E "By |From \$|In Stock|Out of Stock|Delivered to"

# Category page — confirm name, product count, and ≥5 product links
curl -s https://presentail.com/en-lb/beirut/category/flowers \
  | grep -E "products available|<a href.*product"

# Single H1 per page
curl -s https://presentail.com/en-lb/beirut/product/{slug} \
  | grep -c "<h1"
# Expected: 1

# Confirm Google rendering shows hydrated React (not the hidden block)
# → Use Google Search Console: URL Inspection → Test Live URL → View Tested Page
# → The visible content should match the React-rendered page, not the plain-text fallback
```

---

## Implementation Checklist (for the implementing task)

- [ ] `buildProductBodyHtml()`: add `cityLabel` parameter; add brand `<p>`;
      change availability format; add city `<p>`; add category/occasion `<ul>`.
- [ ] `buildShopEntityHead()`: add product count `<p>` and product links `<ul>`
      from already-available `listing.count` / `listing.items`.
- [ ] `buildBrandHead()`: add product count `<p>`; add product links `<ul>`
      (requires `fetchBrandProductCountForSeo()` to return `products` list);
      add brand type parameter to select correct intro template.
- [ ] `buildGenericBodyHtml()` (shop route): add static category subheadings.
- [ ] `buildGenericBodyHtml()` (home route): add city intro paragraph and
      static occasion links.
- [ ] Update `seo-inject.test.ts` assertions to cover the new elements.
- [ ] Run `pnpm --filter @workspace/presentail-web run test:e2e` to confirm no
      regression in page rendering.
- [ ] Verify H1 count with `grep -c "<h1"` on raw curl output for each page
      type. Must always return 1.
- [ ] Run Google Search Console URL Inspection on one product URL and one
      category URL post-deploy to confirm Googlebot sees the hydrated React
      view, not the prerendered block.
