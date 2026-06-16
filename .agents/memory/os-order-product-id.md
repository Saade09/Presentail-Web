---
name: OS order productId must be numeric DB PK, not slug
description: The OS /api/orders endpoint rejects orders when productId is a slug; it requires the raw numeric database PK.
---

## Rule

Always use the raw OS numeric database PK (`osNumericId`) as `productId` when submitting orders to `POST /api/orders` on the OS API. Never use the slug (e.g. `"red-roses"`).

**Why:** The OS `/api/orders` endpoint looks up products by their DB PK, not by slug. Sending the slug causes a generic HTTP 500 `{"success":false,"error":"Failed to create order"}` with no further detail. This was the root cause of 0 orders ever completing through the OS API.

**How to apply:**
- `lib/presentail-os/src/client.ts` — `deduplicateSlugs()` now preserves the raw numeric id as `osNumericId` on each `OSProduct` (rather than discarding it).
- `lib/presentail-os/src/types.ts` — `OSProduct` has `osNumericId?: number | string` for this purpose.
- `artifacts/api-server/src/lib/wooOrders.ts` — `attemptCreateOsOrder` builds `lineItemData` with `osNumericId?: string` from each cache lookup, then uses `d.osNumericId ?? d.osProductId` as `productId` in the OS payload.
- The OS products cache populates within ~22 s of startup (confirmed in production: 336 products/store from `fetchOsProducts`). The `osNumericId` field is available on every cached product once the cache is warm.

**Diagnostic log:** A `logger.info` line ("woo.order: submitting OS order") logs each item's `productId` and `productName` right before `createOsOrder` is called — use this to confirm numeric IDs are being sent.
