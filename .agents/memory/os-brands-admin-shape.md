---
name: OS brands admin endpoint shape
description: The OS /api/brands endpoint returns an admin shape (no slug, numeric id) — must be mapped manually before caching.
---

## Rule
The OS `/api/brands` endpoint is an admin-facing endpoint. Its response shape is:
`{id: number, name, description, target_cogs, has_card_message, has_logo, product_count, ...}`
— **no `slug` field**, and `id` is a number, not a string.

This is different from the `OSProductBrand` type (`{id: string, slug: string, name, image?}`)
that product-embedded brand objects use.

**Why:** The `/api/brands` endpoint was never used for the public catalog originally — product-embedded brands (with slugs) were the intended source. The admin endpoint has a different contract.

**How to apply:** In `osProductsCache.ts`, the `fetchAndStore` function uses a `toSlug(name)` helper to derive a URL-safe slug from the brand name, then maps the admin shape to `OSProductBrand` before caching. Product-embedded brand objects (which do have slugs) are merged in as a supplement for count accuracy once products exist.

`toSlug` logic: lowercase → strip apostrophes/quotes → replace non-alphanumeric runs with `-` → trim leading/trailing hyphens.
