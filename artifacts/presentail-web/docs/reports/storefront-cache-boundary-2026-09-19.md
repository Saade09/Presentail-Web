# Storefront cache boundary — 2026-09-19

## Decision

The current production deployment uses Replit's autoscale application router.
That router establishes the `GAESA` affinity cookie on a completely anonymous
first request and rewrites that response to `Cache-Control: private`. Origin
headers, `CDN-Cache-Control`, `Surrogate-Control`, and `.replit` response-header
rules cannot bypass this post-origin behavior.

Therefore:

- HTML remains `private, no-store`, including anonymous storefront pages.
- Hashed assets retain `public, max-age=31536000, immutable` at the application
  boundary, but the first anonymous response is reported separately.
- URL-addressed public images and catalog/reference JSON retain finite public
  policies. The checker verifies the affinity-established application policy
  and reports the anonymous platform rewrite without persisting cookie values.
- Geo/currency, auth, account, cart, checkout, payment, and order responses are
  not part of the public cache boundary.

A genuinely cookie-free first response requires a separate static/CDN origin or
a hosting capability that disables affinity for selected paths. It cannot be
implemented safely inside the current single autoscale application deployment.

## Public policies

| Resource | Policy |
| --- | --- |
| Content-hashed JS/CSS/fonts/assets | `public, max-age=31536000, immutable` |
| Image proxy and catalog images | `public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400` |
| Currencies/catalog/brands | `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` |
| FX rates | `public, max-age=60, s-maxage=300, stale-while-revalidate=600` |
| Delivery locations | `public, max-age=300, s-maxage=900, stale-while-revalidate=3600` |
| Homepage categories/occasions/banners | `public, max-age=120, s-maxage=600, stale-while-revalidate=1800` |
| Geo/currency and HTML | `private, no-store` |

Every public response variation is represented in its URL: country, city,
language, device, pagination, image source, width, format, and quality. Debug
homepage responses are explicitly private.

## Delivery-locations transfer reduction

The legacy/default response remains unchanged for shipped clients. Updated web
clients request `profile=summary&cityId=<selected-city>`. The summary profile
keeps all country, city, fee, Express, cutoff, operations-verification, and
free-delivery fields, but includes `timeSlots` and `slotsByDay` only for the
selected city. Server-side checkout validation continues to read the complete
OS cache.

Measure both forms with:

```sh
curl -sS http://localhost:80/api/delivery-locations -o /tmp/locations-full.json
curl -sS 'http://localhost:80/api/delivery-locations?profile=summary&cityId=lb-beirut' \
  -o /tmp/locations-summary.json
wc -c /tmp/locations-full.json /tmp/locations-summary.json
gzip -c /tmp/locations-full.json | wc -c
gzip -c /tmp/locations-summary.json | wc -c
```

Local verification against the live OS cache contained 38 cities:

| Payload | Raw | gzip |
| --- | ---: | ---: |
| Legacy full response | 100,419 bytes | 6,830 bytes |
| Lebanon / Beirut summary | 17,111 bytes | 2,624 bytes |
| UAE / Dubai summary | 16,411 bytes | 2,454 bytes |
| Cyprus / Nicosia summary | 12,528 bytes | 2,210 bytes |

The selected-market summaries reduced raw transfer by 83.0%, 83.7%, and 87.5%
respectively. Gzip transfer fell by 61.6%, 64.1%, and 67.6%. Verification also
confirmed that all countries/cities remained present while schedule fields were
retained only for the selected Beirut, Dubai, or Nicosia city.

## Production verification

Run:

```sh
pnpm --filter @workspace/presentail-web check:public-cache-boundary
```

The report separates `anonymous` and `affinityEstablished` responses. It may
hold the affinity cookie in memory for the second request, but output contains
only cookie names and `valuesPersisted: false`; cookie values are never logged
or written.