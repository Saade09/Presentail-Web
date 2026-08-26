# Global storefront performance report

Date: 2026-08-26

## Scope and profile

The repeatable benchmark is `pnpm --filter @workspace/presentail-web benchmark:storefront`.
Its fixed matrix contains 17 Semrush-reported/representative affected routes and
10 comparisons across UAE and Lebanon, English/Arabic/French, and product, city,
FAQ, contact, corporate, category, occasion, and brand pages.

The network profile uses curl with redirect following, negotiated Brotli/gzip,
a crawler user agent, one cache-bypassing request, and configurable repeated
warm requests. It records DNS, TCP, TLS, TTFB, full HTML time, transfer size,
status, redirect count, effective URL, cache headers, encoding, age, vary, and
Server-Timing. `--browser` adds navigation timing, LCP, a deterministic
non-mutating Event Timing probe, and CLS. `--enforce-budgets` fails closed when
browser metrics are missing or any target is exceeded.

## Verified root causes

1. The origin combined `public`/`s-maxage` with browser `no-cache` and
   `Expires: 0`. The deployed edge rewrote the effective response to
   `private, no-cache`, preventing shared caching despite the origin's intended
   public policy.
2. Every uncached entity/listing HTML response could duplicate the same catalog
   and translation-facing work during concurrent crawler bursts.
3. Bare product, brand, category, and occasion share routes bypassed negotiated
   HTML compression. This reproduced the Semrush `/category/balloons` finding.
4. The HTML path synchronously re-read/stat'ed immutable shell/static data.
5. Default dynamic Brotli work took roughly 16–44 ms in the first local phase
   trace and dominated otherwise-fast HTML assembly.

## Changes

- Public, indexable HTML now sends unambiguous browser and edge directives:
  `public, max-age=0, s-maxage=300, stale-while-revalidate=60`,
  `CDN-Cache-Control`, and `Surrogate-Control`, without `Expires: 0`.
- Checkout, cart, order confirmation, noindex/faceted HTML, 406 responses, and
  other private paths remain `no-store`; existing 404/410 lifecycle semantics
  remain unchanged.
- All HTML branches negotiate Brotli/gzip with q-value, wildcard, identity, and
  refusal handling. Bare share HTML is compressed; an impossible negotiation
  returns 406 instead of silently violating `Accept-Encoding`.
- Dynamic Brotli quality 4 and gzip best-speed avoid thread-pool pressure;
  immutable assets continue using build-time `.br`/`.gz` sidecars.
- The startup-loaded shell is reused and static-file stat work is asynchronous.
- Concurrent SEO entity and listing requests are coalesced. Listing results use
  a bounded 15-second LRU-style cache; failures are not cached and expiry is
  regression-tested. Existing entity ETag/Last-Modified validation remains.
- `Server-Timing` reports route, SEO, entity, listing, assembly, compression,
  and total phases. Structured logs emit only for HTML requests over 500 ms and
  expose route family/status rather than URLs or sensitive internals.
- No shared client regression justified a bundle change: route splitting,
  non-blocking analytics, locale behavior, LCP-image hints, and compressed
  static assets were retained.

## Measurements

### Production baseline before deployment

25 successful pages in the 27-route matrix (the expected discontinued product
was 410; one old comparison brand was replaced in the final matrix):

| Metric | p50 | p95 | max |
| --- | ---: | ---: | ---: |
| TTFB | 76.2 ms | 179.8 ms | 233.1 ms |
| Full HTML | 76.6 ms | 180.7 ms | 233.7 ms |

All successful responses were effectively
`private, no-cache, s-maxage=300, stale-while-revalidate=60`. Warm latency was
already below the target, but the edge could not reuse those responses.

### Fixed local production server

26 successful pages plus the expected 410:

| Metric | p50 | p95 | max |
| --- | ---: | ---: | ---: |
| Warm origin TTFB | 2.3 ms | 7.2 ms | 8.0 ms |
| Warm full HTML | 2.5 ms | 7.5 ms | 8.3 ms |
| Browser HTML completion | 5.4 ms | 8.8 ms | 11.5 ms |
| Synthetic interaction latency | 24 ms | 40 ms | 40 ms |
| CLS | 0 | 0.0334 | 0.0334 |

There were no measured budget failures. Public pages emitted all three public
shared-cache directives and Brotli; private/noindex pages emitted `no-store`.
Final `Server-Timing` samples put dynamic compression around 0.8–1.0 ms.

These local origin numbers and production network numbers are not an
apples-to-apples geographic comparison. The important verified deltas are the
effective cache policy, removal of duplicate cold work, complete compression
coverage, and phase-level origin cost.

## Environment-limited exception

The workspace's headless Chromium emitted no LCP entries for the hydrated 200
pages in this run, although it did emit paint data for the static 410 page.
Therefore LCP is recorded as unavailable, not passed. Enforced benchmark runs
now fail on this condition. Build-time critical-path checks passed, and the
real-browser smoke test confirmed non-blank hydration across homepage, product,
FAQ, category, and corporate routes. Production LCP must be re-measured after
deployment with field/RUM or a browser environment that emits LCP.

## Validation

- Production web build and TypeScript application check: pass.
- Cache/compression/negotiation serve E2E: 9/9 pass.
- New coalescing and listing-TTL tests: 3/3 pass.
- Existing cache/ETag/listing SEO groups: 14/14 pass.
- Full SEO unit suite: 480/485 pass; five unrelated baseline expectation drifts
  remain (Arabic homepage copy and existing breadcrumb-schema assertions).
- Compression, blocked-sidecar, and web-vitals critical-path checks: pass.
- Fresh-browser representative route smoke test: pass, with no fatal console or
  document errors.
- Broader legacy serve suite: 24 pass, 14 fail, 10 skip, 15 not run; failures
  use stale live-catalog fixtures (`rose-bouquet`, removed brands/products) and
  are unrelated to these server changes.

## Remaining deployment verification

After this change is deployed, rerun the benchmark against
`https://presentail.com`. Confirm the effective response no longer becomes
`private`, repeated requests show edge reuse/age where supported, and collect
production LCP. If the platform still rewrites responses despite the dedicated
edge directives, that is a deployment-edge configuration issue rather than an
origin-policy ambiguity.