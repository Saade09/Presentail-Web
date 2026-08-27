# Product image delivery hardening report

Date: 2026-08-26

## Incident attribution

Semrush reported 32 intermittent HTTP 503 responses from `/api/img/proxy` among
41,876 successful image requests. The supplied incident snapshot included ten
affected page URLs and one representative image URL, not the complete list of
32 image URLs.

The representative source,
`/api/storage/public-objects/products/318/main.png`, is healthy:

- Direct OS response: HTTP 200, `image/png`, 483,334 bytes.
- Transformed response: HTTP 200, `image/webp`, 28,734 bytes.
- The asset is referenced by both supplied Hallab product-page locales, so one
  shared asset can produce multiple page-level findings.

No matching image-proxy 5xx remained in the available production log window,
and the historical crawl-time logs were not retained. Therefore, it is not
possible to prove one historical network exception after the fact. The
controlled baseline does rule out a permanently missing or corrupt asset and
identifies the proxy as the vulnerable layer:

- Production marked successful proxy responses `private`, defeating edge
  reuse despite an intended immutable policy.
- A 25-request cold burst performed 25 independent upstream fetch/transforms.
- Average latency rose from 407 ms at concurrency 1 to 1,185 ms at concurrency
  25, with a 1,737 ms maximum.
- The old pipeline had a five-second source timeout, unbounded distinct
  in-flight fetches/source buffers, no request coalescing, and no transform
  queue. A larger crawler burst could therefore exhaust connections/memory or
  hit the timeout and emit the reported 503.

The best-supported root cause is an intermittent cold-cache proxy stampede
under crawler concurrency, amplified by ineffective production edge caching;
the evidence does not support a bad `products/318/main.png` object or
crawler-specific blocking.

## Permanent fix

- Restricted the public proxy to credential-free HTTPS URLs on
  `os.presentail.com` under `/api/storage/public-objects/`. Private storage
  paths, alternate hosts, credentials, redirects, and malformed URLs are
  rejected before fetch.
- Canonicalized a source URL once and nested it with `encodeURIComponent`
  across API validation, runtime image builders, account images, and SEO/LCP
  preload generation. Bare `%`, spaces, Unicode, `+`, `&`, and nested query
  parameters are covered.
- Coalesced identical cold variants so one upstream fetch/transform serves all
  simultaneous requests.
- Bounded distinct cold work before fetch: at most eight active loads and 32
  waiting loads. Transforms are separately limited to four active and 32
  waiting.
- Limited source bodies to 12 MiB using both `Content-Length` and streamed-byte
  enforcement. Sharp is capped at 12 million decoded input pixels.
- Added a 12-second timeout and exactly one 100 ms retry for network/timeouts
  and upstream 502/503/504. Redirects, 4xx, 429, missing objects, invalid
  payloads, and queue saturation are not retried.
- Added distinct response semantics: 400 invalid request, 404 missing/removed,
  413 oversized, 415 non-image, 422 empty/corrupt, 502 upstream/redirect,
  503 rate-limit/queue saturation, and 504 timeout.
- The transform gate lives in the shared transform utility, so product,
  catalog, and health-check transforms share one global four-operation budget.
- Product, brand, occasion, and category image routes also share one global
  eight-load admission gate and the same 12 MiB streamed body limit.
- Added a 200-entry/50 MiB process LRU with a 24-hour expiry, strong SHA-256
  ETags, conditional 304 responses, and finite public caching:
  `max-age=86400, s-maxage=604800, stale-while-revalidate=86400`.
- Mounted the public image route before authentication middleware so
  session-dependent headers/cookies cannot make image responses private.
- Added browser recovery from proxy to the raw public source, followed by a
  neutral accessible fallback. HTTP errors remain visible to crawlers and
  monitoring; the server never returns a placeholder 200.
- Added structured in-process metrics for outcomes, upstream statuses,
  duration, cache hit/miss/coalescing, queue rejection, and current/peak load
  and transform pressure. The admin metrics endpoint is protected by the
  existing admin token.
- Added a deduplicated 5xx-rate alert (10% over a 100-request window, 15-minute
  cooldown) and a daily sampled catalog health monitor. The reusable health
  check detects missing references, disallowed URLs, missing objects,
  non-images, empty/oversized bodies, and proxy-equivalent transform failures.

OS object paths are treated as replaceable because they are stable
`products/<id>/main.png` paths rather than content hashes. Immutable caching
would serve stale replacements indefinitely, so finite TTL plus ETag
revalidation is used.

## Before versus after

| Check | Production baseline | Hardened local service |
| --- | --- | --- |
| Browser/curl/Semrush/Googlebot | 4/4 HTTP 200 | 4/4 HTTP 200 |
| Effective cache policy | `private, max-age=31536000, immutable` | `public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400` |
| Warm repeats | 329 ms, then 26/29 ms | 738 ms, then 2/2 ms |
| 5 identical cold requests | 5 MISS, 543 ms average | 1 MISS + 4 COALESCED, 286 ms average |
| 10 identical cold requests | 10 MISS, 697 ms average | 1 MISS + 9 COALESCED, 275 ms average |
| 25 identical cold requests | 25 MISS, 1,185 ms average, 1,737 ms max | 1 MISS + 24 COALESCED, 591 ms average, 593 ms max |
| Reported page sample | 10/10 HTTP 200 | 10/10 HTTP 200 |
| Cross-market catalog image sample | Not captured | 40/40 HTTP 200; zero unexpected 5xx |

Machine-readable evidence:

- `image-delivery-before-production.json`
- `image-delivery-after-local-final.json`
- `catalog-image-crawl-after-local.json`

The production baseline was captured before this code was published. Replit
publishing is user-initiated, so the production cache-header and post-deploy
crawl must be rerun after publication. The reusable command is:

```sh
BASE_URL=https://presentail.com \
OUTPUT_PATH=reports/image-delivery-after-production.json \
pnpm --filter @workspace/api-server run check:image-delivery
```

## Verification

- Product proxy route/failure/cache/concurrency tests: 11 passing.
- Catalog image route/cache/resource-limit tests: 23 passing.
- Catalog image-health tests: 1 passing.
- Shared transform pixel-budget tests: 1 passing.
- Focused web image utility/component tests: 87 passing.
- API production and test TypeScript checks: passing.
- Web production TypeScript check: passing.
- API and web production builds: passing.
- Browser verification: English Hallab product image rendered through
  `/api/img/proxy` at 402×408 natural pixels and remained loaded after reload.
- Visual snapshot: `screenshots/image-delivery-product.jpg`.

The full web test-typecheck and broad SEO suite retain unrelated pre-existing
failures in delivery-slot fixtures, blog JSON-LD typing, city breadcrumbs, and
Arabic homepage copy. Focused image suites and the production web typecheck
pass.

## Production verification after publication

Captured on 27 August 2026 against `https://presentail.com` after the hardened
API and web builds were live.

| Production check | Result |
| --- | --- |
| Browser/curl/Semrush/Googlebot | 4/4 HTTP 200 with strong ETags and finite public caching |
| Warm repeats | 316 ms MISS, then 35/35 ms HIT |
| 1 identical cold request | 1/1 HTTP 200; 1 MISS; 317 ms |
| 5 identical cold requests | 5/5 HTTP 200; 1 MISS + 4 COALESCED; 300 ms average |
| 10 identical cold requests | 10/10 HTTP 200; 1 MISS + 9 COALESCED; 345 ms average |
| 25 identical cold requests | 25/25 HTTP 200; 1 MISS + 24 COALESCED; 304 ms average, 318 ms max |
| Semrush-reported pages available in the supplied report | 10/10 HTTP 200 |
| Multilingual catalog APIs | 9/9 HTTP 200 across LB/AE/CY and en/ar/fr/el |
| Cross-market catalog image sample | 69/69 HTTP 200; zero unexpected 5xx; 69/69 strong ETags |
| Real-browser production pass | 4/4 pages HTTP 200; 88 image responses observed; zero `/api/img/proxy` 5xx |

The production catalog sample covered 24 products per market/language catalog:
Lebanon in English, Arabic, and French; UAE in English, Arabic, and French;
and Cyprus in English, French, and Greek. Source URLs shared across locales
were deduplicated before testing, producing 69 unique transformed image
requests. All retained the intended policy:
`public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400`.

The browser pass visited English Lebanon, Arabic Lebanon, French UAE, and Greek
Cyprus pages. Visible product images completed with non-zero natural
dimensions. Four static logo requests were aborted by the browser, but no
server error or product-image failure occurred.

### Replit autoscale affinity-cookie observation

A completely cookie-less first request receives Replit's `GAESA` autoscale
affinity cookie. On that one response, the platform rewrites the otherwise
public application cache policy to `private` while retaining the finite TTL,
strong ETag, and HTTP 200 response. Once the platform cookie is established,
the same browser, curl, Semrush, and Googlebot requests retain the application's
public policy. The production checker now records both the anonymous first
response and the affinity-established matrix without persisting the cookie
value.

This platform behavior does not affect image availability, warm in-process
HITs, or cold-request coalescing, but it means a client's first cookie-less
response is not shared-cache eligible. The production evidence therefore
distinguishes that platform response from the public application behavior
rather than hiding it.

Machine-readable production evidence:

- `image-delivery-after-production.json`
- `catalog-image-crawl-after-production.json`

## External blocker / OS recommendation

The OS uploader source is not in this workspace. OS should independently add
upload-time rejection for zero-byte, non-image, corrupt, decompression-bomb,
and excessively large assets. Until that is available, the API-side health
check and strict delivery guardrails detect these conditions without masking
them.