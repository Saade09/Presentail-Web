---
name: OS product slug derivation
description: The Presentail OS API has no slug field on products; slugs are derived from product names and deduplicated with a numeric suffix.
---

## Rule

The OS `/api/products` endpoint returns `{ id: number, name: string, ... }` — no `slug` field. Product URL slugs must be derived from the name.

**How to apply:** In both `lib/presentail-os/src/client.ts` (server/API path) and `artifacts/presentail-web/src/lib/osClient.ts` (web direct-fetch path), `normaliseProduct()` converts `raw.name` to a slug via `nameToSlug()`. After collecting all pages, `deduplicateSlugs()` appends `--{numericId}` to any products that share the same derived slug.

`nameToSlug` algorithm: lowercase → strip apostrophes → `&` → `and` → non-alphanumeric → `-` → strip leading/trailing `-`.

**Why:** Without this, product URLs are numeric (`/product/562`) which is bad for SEO and UX. The OS API may add a native `slug` field in future; `normaliseProduct` already prefers `raw.slug` if present.

**Collision handling:** `deduplicateSlugs()` counts slug occurrences across the full product list and appends `--{rawNumericId}` only for colliding slugs. Unique slugs stay clean (e.g. `happy-fathers-day-balloon`); duplicates become `bloom-clat-basket--587` / `bloom-clat-basket--612`.

**Data flow summary:** `fetchOsProducts (lib)` → `normaliseProduct + deduplicateSlugs` → `OSProduct.id = slug` → `mapOsProductToWcShape (woo.ts)`: `slug: p.id` → `transformProduct`: `id: p.slug` → API response `id = name slug`. `osProductsCache.ts` calls `fetchOsProducts` from the lib so it inherits deduplication automatically.
