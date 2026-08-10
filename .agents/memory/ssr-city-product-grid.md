---
name: SSR city product grid
description: Pattern and pitfalls for server-rendered product cards on city home pages (Tripoli first; Batroun etc. to follow)
---

City homes listed in `SSR_PRODUCT_CITY_KEYS` (seo-inject) get a server-rendered product grid spliced into the `SSR_PRODUCTS_SLOT` comment marker in the generic body, plus ItemList JSON-LD and an LCP image preload. Enabling another city = add its `{country}-{city}` key (heading map covers en/ar/fr).

**Why:** Google shouldn't need JS to see products; but the cached sync `buildSeoHead` path must stay product-free — inject only in the async layer on a copy (never mutate the cached `generic`).

**How to apply:**
- The embedded JSON payload (`data-ssr-products-data`) MUST carry `discountPriceValue`/`discountPriceAed` — the hydrated ProductCard/SalePrice reads them; omitting them silently drops sale prices after hydration (code review rejected the first attempt for this).
- React adoption must read the DOM in a `useState` lazy initializer (first render runs before `createRoot` replaces `#root` children) and disable the best-sellers query via `query: { enabled: false }` (generated hooks require an explicit `queryKey` when overriding query options).
- `fetchCityProducts` caches per-URL 5 min and returns `[]` on any failure so the page never hangs.
