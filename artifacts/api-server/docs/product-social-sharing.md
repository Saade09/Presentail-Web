# Product social-sharing cards

Product pages use `GET /api/og-image/product/:slug?v=:version` for their Open
Graph and Twitter images. It always returns a 1200×630 JPEG: the ivory
Presentail template with the unaltered catalog photo, a restrained wordmark,
gold divider, deep-green typography, and `Luxury gifting, delivered.`

## Editorial precedence

The source photo is selected in this order:

1. `customImageUrl` (a private `/objects/...` asset or Presentail-owned HTTPS URL)
2. `preferredImageUrl`
3. The catalog primary image
4. The first usable catalog gallery image
5. The generic branded fallback

The URL version is a hash of the chosen source, all positioning controls, the
source version, and the template version. It changes whenever artwork can
change; no product title, price, availability, delivery date, or discount is
rendered into the card.

## Admin API contract

All endpoints require `x-push-admin-token` (or `x-admin-token`) with
`PUSH_ADMIN_TOKEN`.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/admin/product-social/:slug` | Read selected source, controls, diagnostics, version, full preview and thumbnail URLs. |
| `PATCH /api/admin/product-social/:slug` | Save `customImageUrl`, `preferredImageUrl`, `layout`, `focalX/Y`, `scale`, and `positionX/Y`. Layout is `product`, `portrait`, `photo`, or `custom`. |
| `POST /api/admin/product-social/:slug/regenerate` | Bump the source version and purge the in-process card cache. |
| `POST /api/admin/product-social/:slug/upload-url` | Receive a private, 15-minute PUT URL plus an `/objects/...` reference to set as `customImageUrl` after upload. |
| `GET /api/admin/product-social/backfill` | Return the repeatable cache-warm inventory and command. |

`GET /api/admin/product-social` is the in-repo **Social sharing preview**
dashboard. It uses the same token-protected API contract to show the full card
and thumbnail, metadata, selected image, controls, quality flags, save/upload
reference, and regenerate action before publication.

Diagnostics include missing/unusable and absent-primary images, generic
fallbacks, low-resolution/transparent/portrait sources, small occupancy,
safe-margin contact, crop risk, and a pre-recompression oversized-output flag.
Cards are compressed toward the 1 MB output target.

## Backfill and template updates

On the first populated catalog after every deployment, the API automatically
warms all active product cards with four bounded workers. Run
`pnpm --filter @workspace/api-server run backfill:product-social -- <api-base>`
for an explicit retry or one-off operator run. The job
discovers active products, uses four concurrent requests, emits a retry-safe
JSON summary, and exits non-zero only for failed cards. To ship a visual
template update, bump `SOCIAL_CARD_TEMPLATE_VERSION`, deploy, then backfill;
the derived URL version makes social crawlers discover the new image.