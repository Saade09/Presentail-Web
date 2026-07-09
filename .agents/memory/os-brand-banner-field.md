---
name: OS brand banner field name
description: The OS API returns the brand banner/cover photo as banner_image_url, not cover_image; the OSCatalogAttributeBrand type had an incorrect anticipation.
---

## Rule
When reading the brand banner/cover photo from `OSCatalogAttributeBrand` (raw catalog brands cache), use `rawBrandEntry?.banner_image_url` as the primary field. `cover_image` is kept as a forward-compat alias but was never populated by the actual OS API.

## Why
The OS `/api/catalog-attributes/brands` endpoint returns the brand banner as `banner_image_url` (an absolute CDN URL, e.g. `https://os.presentail.com/api/storage/public-objects/catalog_brands_banners/{id}.png`). The TypeScript type `OSCatalogAttributeBrand` originally only declared `cover_image` which is a field the OS has never actually sent. Using `cover_image` directly always produced `null` even when the OS admin had a banner image set.

## How to apply
In any route/handler that reads the brand banner from `getOsRawCatalogBrands()`:
```ts
const cover = rawBrandEntry?.banner_image_url ?? rawBrandEntry?.cover_image ?? null;
```
The `?? cover_image` fallback guards against a future OS API rename.

The banner URL is an OS storage URL (`os.presentail.com/api/storage/...`) so `buildBrandHeroSrcset` / `buildOsImageSrcset` handle it correctly via the `/api/img/proxy` route without any extra changes.
