---
name: Best-seller badge annotation
description: Why OS totalSales is 0 for all products and how isBestSeller must be computed across both data paths
---

## The rule

`osProductsCache.ts` must blend `app_orders` DB data with OS `totalSales` when annotating `isBestSeller` on cached products. The OS-direct web path must fetch best-seller IDs from `/api/catalog/best-seller-ids` rather than computing from OS `totalSales`.

**Why:** The OS API returns `totalSales = 0` for every product. The homepage best-sellers rail has always worked because it uses a DB-first path (`fetchLocalSales` → `app_orders`). All other catalog pages read `isBestSeller` from the annotated cache, so they silently showed no badges. Additionally, when `VITE_OS_API_KEY` is set (production web builds that fetch OS directly), the browser computed `bestSellerIds` from `totalSales > 0` client-side — also always empty.

**How to apply:**
1. **Server** (`osProductsCache.ts`): After each OS product refresh, query `app_orders` (states: confirmed/out_for_delivery/delivered), tally line-item quantities by normalised product name, map to product IDs, add to OS `totalSales` as a blended score. Store result in `cachedBestSellerIdSet`. Only products with blended score > 0 can be best sellers. DB query is best-effort.
2. **Server** (`catalog.ts`): `GET /api/catalog/best-seller-ids` exposes `getCachedBestSellerIds()` as `{ ok, ids: string[] }` with 60s cache.
3. **Web** (`queries.ts`): Both `useOsAllProducts` and `useBrandProducts` OS-direct paths call `fetchBestSellerIds()` (hits `/api/catalog/best-seller-ids`) in the `Promise.all` alongside the OS fetch. This replaces the old `totalSales > 0` computation.

Any change to best-seller ranking logic should be applied to both `osProductsCache.ts` AND `homepage.ts` `fetchLocalSales` to keep the homepage rail and catalog badges in sync.

**Dev environment note:** In the dev Replit environment, only a small number of test orders exist in `app_orders`. The best-seller product(s) may have no brand/category associations, so collection pages (brand, category, occasion) won't show badges in dev — this is expected. The fix is verified correct in production where real order data covers many branded products.
