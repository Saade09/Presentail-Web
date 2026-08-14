---
name: Store-resolved prices in catalog API responses
description: Product-surfacing API endpoints must return store display-currency prices, not USD-only
---

Any new API endpoint that surfaces products with prices (recommendations, upsells, rails) must resolve prices to the **store's display currency**, not just OSProduct.price (always USD).

**Why:** The Complete Your Gift endpoint was rejected in code review for hard-coding `currency: "USD"` — Dubai/Abu Dhabi shoppers see AED, Cyprus EUR.

**How to apply:**
- Store currency comes from `resolveStoreByKey(storeKey).currencyCode` (lebanon USD, dubai/abudhabi AED, cyprus EUR).
- For AED discounted products, prefer the OS-authored `discountPriceAed` from `getOsProductPricingMap()` over FX conversion.
- Otherwise convert with `getRate()` + `roundForCurrency()` from `lib/fx` (fail open to USD reference on FX errors).
- Also: don't accept a `date`/delivery param as a no-op — gate against `getDeliverySlots(cityId)` (same-day cutoffs in the store timezone) or reviewers will reject it.
