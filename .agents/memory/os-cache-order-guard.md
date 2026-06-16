---
name: hasOsProducts cold-cache order failures
description: Why OS orders fail with "Catalog not yet loaded" and the two-layer fix applied
---

## The problem
`hasOsProducts()` can return `false` even when the OS product cache is populated — confirmed in production logs where 336 products were loaded at T+8s yet orders failed at T+45s with "Catalog not yet loaded". The guard in `attemptCreateOsOrder` was too broad: it blocked *all* orders with catalog items whenever `hasOsProducts()` was false.

**Why:**
- The original guard (`if (catalogItemInputs.length > 0 && !storeHasProducts)`) was added to prevent forwarding raw WC numeric IDs to OS (which causes OS HTTP 500).
- But all OS-native products have `osSlug` — they don't need the cache to avoid the WC-ID forwarding risk.
- Additionally, Stripe/Mamo/PayPal-paid orders have already had their prices validated at PaymentIntent creation — re-validating from the cache adds no security value and adds a fragile runtime dependency.

## Fix applied
Two complementary layers in `wooOrders.ts attemptCreateOsOrder`:

**Layer 1 — Relaxed guard (fixes Whish/offline payments):**
```ts
const hasWcOnlyItems = opts.preVerifiedItems === undefined &&
  catalogItemInputs.some((i) => (i.wcId != null && i.wcId > 0) && !i.osSlug);
if (hasWcOnlyItems && !hasOsProducts(opts.store?.storeKey) && !hasOsProducts()) {
  return 503 "Catalog not yet loaded..."
}
```
Only blocks if items have `wcId > 0` AND no `osSlug` AND all store caches are empty.

**Layer 2 — preVerifiedItems (fixes Stripe/Mamo/PayPal payments):**
- In `woo.ts`, after each payment branch's cart snapshot verification, save `snapshotItems = intent.snapshot.items`.
- Pass `preVerifiedItems: snapshotItems` to `attemptCreateOsOrder`.
- When provided, these snapshot prices are used directly (bypassing both the guard and cache lookup). The OS product ID is still resolved from cache when available; falls back to `item.osSlug`.

**How to apply:** Any future change to `attemptCreateOsOrder` signature should preserve both the `preVerifiedItems` parameter and the narrowed guard.
