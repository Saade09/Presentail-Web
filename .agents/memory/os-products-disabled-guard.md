---
name: hasOsProducts vs getOsProducts under OS_PRODUCTS_DISABLED
description: Why read-only OS catalog endpoints must not gate on hasOsProducts()
---

# hasOsProducts() honors OS_PRODUCTS_DISABLED; getOsProducts() does not

In `artifacts/api-server/src/lib/osProductsCache.ts`:
- `hasOsProducts(storeKey)` returns **false** whenever `process.env.OS_PRODUCTS_DISABLED === "1"`, regardless of whether the in-process cache is actually populated.
- `getOsProducts(storeKey)` ignores that flag entirely and returns the cached products whenever the background OS fetch has populated them.

The dev (and possibly prod) environment sets `OS_PRODUCTS_DISABLED=1`. The background OS fetch still runs and populates the cache, so product browsing works (`/api/woo/products` reads via `getOsProducts`), but any route that gates on `hasOsProducts()` will 503 / fall back to WooCommerce even though catalog data is available.

**Why:** `OS_PRODUCTS_DISABLED` is a "force WooCommerce for order/checkout flows" switch, NOT a "the catalog is empty" signal. Gating a read-only classification/derivation endpoint on `hasOsProducts()` silently disables it in every environment where that flag is set.

**How to apply:** For read-only endpoints that only classify or derive from existing catalog data (e.g. the bear-size inference route `/api/categories/stuffed-animals/sizes`), read the catalog via `getOsProducts(storeKey)` and 503 only when the returned array is null/empty. Reserve `hasOsProducts()` for order/checkout paths that genuinely need the OS-vs-WooCommerce source decision.

**Symptom that led here:** a new endpoint returned 503 "Product catalog not yet available" on every call while `/api/woo/products` returned 200 with data in the same process — the tell-tale signature of the flag divergence.
