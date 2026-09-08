---
name: Real-delivery social proof
description: Privacy, image proxy, and OS API contract for the flower landing page social-proof section.
---

# Real-delivery social proof — key decisions

## OS pre-filters all eligibility; storefront just checks `eligibility.*`
`isPublishableRealDeliveryPhoto()` checks all four `eligibility` booleans (`approved`, `completed`, `product_active`, `in_stock`) plus a valid OS `asset_url`. That is the only gate — no local moderation flags, no city re-filtering.

**Why:** The OS contract (`GET /api/storefront/real-deliveries?country=LB&city=Beirut`) returns only eligible photos. The storefront guard is a defensive second check for the `asset_url` boundary.

## OS API query uses `country` + `city` (name, not ID); key is `PRESENTAIL_OS_API_KEY`
`fetchOsRealDeliveryPhotos` passes `?country=LB&city=Beirut` with `x-api-key`. `cityIdToDisplayName("lb-beirut")` strips the `lb-` prefix and capitalises each hyphen-separated word — covers multi-word cities like `ae-abu-dhabi` → `Abu Dhabi`.

**Why:** OS expects a human-readable city name, not the internal prefixed storefront ID.

## Product slug is looked up from the local catalog by `osNumericId`
`photo.product.id` (numeric) is matched against `OSProduct.osNumericId` in the store cache. If not found, the photo is skipped (fail-closed) — we cannot build a valid storefront URL without the slug.

**Why:** The OS response gives a numeric DB PK, not a URL slug.

## Delivery references use AES-256-GCM encryption
`buildSignedDeliveryRef` / `resolveSignedDeliveryRef`. Token = `base64url(iv[12] || ciphertext[n] || authTag[16])`. Key = `SHA-256(SESSION_SECRET)`.

**Why:** HMAC-signed base64url encodes the OS path — any recipient can decode it. AES-GCM ciphertext is opaque without the key; the OS object path cannot be recovered from the public token.

**How to apply:** `SESSION_SECRET` must be ≥16 chars or the section stays hidden. Stateless — no registry.

## Minimum 3 photos before the section becomes visible
`getRealDeliveryFeed` returns `items: []` when fewer than 3 photos survive all guards.

## Analytics events end-to-end through OpenAPI
`real_delivery_shop_click` and `real_delivery_view_more_click` are in `openapi.yaml` `AnalyticsEventName`. Dimensions `productName`, `carouselPosition`, `selectedCity`, `landingPath` are in `AnalyticsEventRequest` and persisted via `propertiesJson`.
