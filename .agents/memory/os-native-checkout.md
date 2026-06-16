---
name: OS-native product checkout (wcId=0)
description: OS-native products have wcId=0; the entire checkout stack must accept wcId=0 alongside an osSlug field to identify the product for catalog price lookup.
---

## Rule

OS-native products (not mirrored in WooCommerce) have `wcId: 0`. Every layer that processes cart items must treat `(wcId > 0) OR osSlug` as a valid catalog item, never `wcId > 0` alone.

**Why:** `osProductMapper.ts` sets `wcId: 0` for products that exist only in Presentail OS. Before the fix, every layer that did `!item.wcId` or `z.number().int().positive()` rejected these, causing all payments to fail with "Product 0 not found in catalog" or "Each item must have a valid wcId".

## How to apply

When adding any new checkout route or cart validation:
- Accept `osSlug?: string` on item types alongside `wcId`
- Validate as: `(wcId > 0) || !!osSlug` — not just `wcId > 0`
- For OS catalog lookup: if `wcId > 0` use `getOsProductByWcId`; if `wcId === 0 && osSlug` use `getOsProductBySlug`

## Key files changed

- `lib/api-spec/openapi.yaml` — `CheckoutPaymentIntentCartItem`: added `osSlug`, removed `wcId` from required, changed minimum to 0
- `artifacts/api-server/src/lib/catalog.ts` — `resolveCartItems`: accepts `osSlug`, slug-based OS cache lookup when `wcId === 0`
- `artifacts/api-server/src/lib/checkoutIntents.ts` — `CartSnapshot.items`: added `osSlug`; `verifyCartMatchesSnapshot`: string key using wcId or osSlug
- `artifacts/api-server/src/routes/checkout.ts` — validation changed from `!i.wcId` to `(!i.wcId && !i.osSlug)`; snapshots include `osSlug`
- `artifacts/api-server/src/lib/wooOrders.ts` — schema: `wcId` nonnegative + `osSlug` field; `attemptCreateOsOrder`: slug-based price lookup
- `artifacts/presentail-web/src/pages/Checkout.tsx` — all 5 item maps now include `osSlug: i.product.id`
