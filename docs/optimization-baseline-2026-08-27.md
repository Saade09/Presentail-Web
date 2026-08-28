# Presentail Optimization Baseline

**Baseline date:** 27 August 2026  
**Raw report:** [`reports/optimization-baseline-2026-08-27.json`](reports/optimization-baseline-2026-08-27.json)  
**Collector:** `scripts/src/optimizationBaseline.ts`  
**Related audit:** [`cost-optimization-audit-2026-08-27.md`](cost-optimization-audit-2026-08-27.md)

## Safety and evidence rules

The collector is bounded and privacy-safe:

- Local isolated services are the default. The API starts with
  `BASELINE_DISABLE_WORKERS=1`, which leaves HTTP serving enabled but prevents
  startup workers and integrations from running.
- Production is queried only when its URL is supplied explicitly. The fixed
  production-safe matrix performs six GETs, sends no body, does not authenticate,
  and does not create load.
- Supplied targets must be bare HTTP(S) origins. Userinfo, paths, query strings,
  and fragments are rejected before services start so signed URLs or credentials
  cannot enter the report.
- Reports contain aggregate route labels, status codes, durations, byte counts,
  cache classes, pool gauges, worker/provider labels, and process memory only.
- Query strings are discarded by runtime request metrics. Matched Express route
  templates are used, and unmatched paths collapse to `/:unmatched`. The raw
  report names only the collector's fixed non-sensitive routes.
- Route, worker, worker-reason, and provider dimensions have hard caps with
  overflow aggregation, so process-lifetime cardinality remains bounded.
- No headers, cookies, authorization values, request/response payloads, raw
  prompts, payment data, connection strings, credentials, or customer identifiers
  are recorded.
- Dollar cost and savings are never inferred from these measurements.

Every result is interpreted as:

- **Measured:** directly observed during the stated local or remote window.
- **Estimated:** derived from a measured value and an explicit comparison rule.
- **Unavailable:** not exposed by the collector, Replit, or a provider surface.

## Executable architecture inventory

### Artifacts and request entry points

| Component | Development entry point | Production build | Production run / request entry |
|---|---|---|---|
| API (`@workspace/api-server`) | `pnpm --filter @workspace/api-server run dev`; builds then starts on port 8080 | Database `push-force`, API build, non-fatal SEO dispatch | `node --enable-source-maps artifacts/api-server/dist/index.mjs`; `/api`, `/feeds`; startup health `/api/healthz` |
| Web (`@workspace/presentail-web`) | Vite on port 24188 | Web typecheck then Vite/build-integrity/compression build | `node artifacts/presentail-web/serve.mjs`; path `/`; dynamic HTML/SEO/SSR plus static assets |
| Mobile manifest/landing (`@workspace/presentail`) | Expo dev server on port 20808 | Mobile typecheck then Expo static build | `node artifacts/presentail/server/serve.js`; `/app/`; header-negotiated manifests plus landing/static fallback |
| Mobile static cohort | Static landing server on port 20809 | Same mobile build | Replit static service from `artifacts/presentail/static-build`; `/app-static/` |
| Canvas (`@workspace/mockup-sandbox`) | Vite component preview | Build script exists but no production service is registered | Development-only `/__mockup` design artifact |

The project-level deployment target is Replit Autoscale with application routing.
Production stores are pruned after deployment builds. The artifact manifests are
the source of truth for service paths and production commands; `.replit` is the
source for the deployment target, shared response headers, validation workflows,
and post-build pruning.

### Database boundary

- `@workspace/db` owns the lazy PostgreSQL `pg.Pool` and Drizzle database.
- API routes, monitors, workers, and shared scripts cross this boundary through
  that package.
- The baseline endpoint exposes only `totalCount`, `idleCount`, `waitingCount`,
  and configured `max`. It does not run a diagnostic query.
- Production query distribution, CPU, buffer hits, statement frequency, and plan
  connection limits remain unavailable.

### Startup and recurring work

Every ordinary API process starts the following families after listening:

1. OS location and product synchronization
2. Order reconciliation and pending-checkout sweeping
3. Optional Woo synchronization
4. Clerk catch-up
5. Checkout login and purchase funnel monitors
6. Auth-exists, social-auth, session-coverage, and Clerk fallback monitors
7. Upsell conversion and funnel monitors
8. SMS, FX, geo/currency, Google Ads, and web-vitals monitors
9. SEO audit and product-lifecycle monitors
10. Product affinity and product-metrics synchronization
11. Plant classification and product-translation warming
12. Merchant-listing suggestions and catalog-image health
13. Catalog-triggered page-description and social-card warmers

Seven recurring families currently use the shared distributed-job runner. That
runner now records per-job runs, ownership skips, database-error skips, failures,
total duration, maximum duration, and average duration. Other process-local
monitors remain unavailable in this counter until they use the same runner or
explicitly record an outcome.

### External boundaries

Runtime code crosses env-backed boundaries for Presentail OS, legacy
WooCommerce, Stripe and retained payment providers, Clerk, Google APIs/Ads,
Meta, email/SMS, Slack, Expo/EAS, Object Storage, and OpenAI-backed generation.
The metrics surface currently has:

- Provider/status/duration/retry counters for instrumented outbound helpers
  (initially the Google Rich Results monitor).
- Existing cache/upstream-status/outcome/queue/duration counters for the image
  proxy.
- No URL, request body, provider response body, token count, prompt, or API key.

Complete provider call counts, retry counts, usage, and invoices remain
unavailable until each boundary opts into the aggregate recorder.

## Repeatable commands

### Full isolated local baseline

Run from a clean checkout because normal web/mobile builds regenerate their
production output directories:

```sh
pnpm baseline:optimization -- \
  --output docs/reports/optimization-baseline-latest.json \
  --enforce-budgets
```

This serially measures API, web, and mobile builds; inventories artifacts and
bundle extensions; starts isolated production servers on ports 19280–19282;
records startup, process memory, active process counts, API pool/counter state,
and one request per fixed route; then stops the services.

### Low-volume production-safe network sample

```sh
pnpm baseline:optimization -- \
  --skip-build --no-start \
  --api-url https://presentail.com \
  --web-url https://presentail.com \
  --mobile-url https://presentail.com \
  --output /tmp/presentail-production-baseline.json
```

This makes six GET requests total. It is not a load test. For the larger
27-route curl/browser matrix and transfer-byte timing, use:

```sh
pnpm --filter @workspace/presentail-web benchmark:storefront -- \
  --base-url https://presentail.com --repeats 1 \
  --output /tmp/storefront-performance.json
```

### Compare a future run

```sh
pnpm baseline:optimization -- \
  --compare docs/reports/optimization-baseline-2026-08-27.json \
  --output /tmp/optimization-baseline-candidate.json \
  --enforce-budgets
```

For an intentional size/duration change, omit `--enforce-budgets` or pass
`--allow-regressions`, preserve the candidate JSON, and document why the new
baseline is preferable before replacing the reference.

## Captured baseline

**Observation window:** 2026-08-27 18:48:36.646–18:50:23.554 UTC  
**Environment:** isolated local Linux x64 workspace, Node 24.13.0, 8 reported
CPUs, 16.79 GB host memory  
**Traffic:** no production traffic; no request bodies; startup integrations and
workers disabled

### Builds and outputs

| Measurement | Result | Status / source |
|---|---:|---|
| API build | 2,069.84 ms | Measured, serial local command |
| Web build | 19,187.58 ms | Measured, serial local command |
| Mobile build | 76,858.04 ms | Measured, serial local command |
| API output | 18,596,542 bytes / 11 files | Measured from `dist` |
| Web output | 19,219,082 bytes / 421 files | Measured from `dist` |
| Mobile output | 56,077,194 bytes / 130 files | Measured from generated `static-build` before cleanup |

The mobile build dominated the measured build window. Its same-build Node/static
cohorts duplicate the approximately 6.79 MB raw iOS and Android bundles, which
explains why this fresh production output is materially larger than the older
partial output quoted in the cost audit. The largest web JavaScript chunk was
642,131 raw bytes. The API source map was 10,945,950 bytes and the API runtime
bundle was 5,280,605 bytes.

### Startup, memory, and pool

| Measurement | Result | Status / source |
|---|---:|---|
| API readiness | 8,270.07 ms | Measured to `/api/healthz`; workers disabled |
| Web readiness | 95.75 ms | Measured to `/` after prebuild |
| Mobile readiness | 37.49 ms | Measured to `/app/` after prebuild |
| API RSS | 326,443,008 bytes | Measured at 8.42 s uptime |
| API heap used | 141,175,880 bytes | Measured at 8.42 s uptime |
| Pool state | total 0, idle 0, waiting 0, max 10 | Measured aggregate; no query issued |

Active process names were counted once from `ps`; arguments and environments
were not captured. This is a workspace snapshot, not evidence of production
replica count or instance-hours.

### Representative local responses

| Service / route | Status | Total time | Decoded bytes | Encoding / cache |
|---|---:|---:|---:|---|
| API `/api/healthz` | 200 | 7.03 ms | 15 | identity; no cache header |
| API `/api/woo/products?countryCode=LB` | 503 | 9.04 ms | 93 | isolated catalog unavailable |
| Web `/` | 200 | 16.26 ms | 10,021 | Brotli; shared 5-minute edge policy |
| Web `/en-lb/beirut` | 200 | 10.96 ms | 14,318 | Brotli; shared 5-minute edge policy |
| Mobile `/app/` | 200 | 4.46 ms | 12,540 | Brotli; 5-minute cache |
| Mobile `/app/manifest` (iOS) | 200 | 21.14 ms | 7,158 | gzip; `no-store` |

Node fetch reports decoded body bytes, not transfer bytes. Compression headers
confirm negotiation but are not used to calculate a compression ratio. Use the
curl storefront benchmark for transfer-byte comparisons.

The catalog 503 is an expected limitation of the isolated startup: workers were
disabled and the repository environment had OS products disabled. It is not a
production availability result. The earlier audit's measured production catalog
response remains the production reference until a future explicit low-volume
run replaces it.

### Operational counters

During this 107-second isolated window:

- Request counters recorded two health responses and one catalog-readiness 503,
  including duration, content-length bytes, cache classification, and status.
- Worker, outbound-provider, and image-proxy counters were zero because
  background work was intentionally disabled and no image was requested.
- Pool pressure was zero active/idle/waiting connections with configured max 10.

On an ordinary API process, the admin-token-protected
`/api/healthz/metrics` returns the same aggregate schema so an authorized future
observation window can record actual worker ownership, failures, durations,
provider status/retries, request distribution, memory, and pool pressure. The
endpoint is available without a token only inside the isolated baseline process.
Counters are process-local and reset on process restart; snapshots from different
Autoscale replicas must not be treated as one global total.

## Budgets and comparison policy

The captured run passed 12 checks, failed none, and marked the intentionally
unavailable isolated catalog response as unavailable rather than passing it.

| Budget | Threshold | Failure meaning |
|---|---:|---|
| Any isolated service readiness | 30,000 ms | Service failed to become ready promptly |
| Any fixed-route total response | 1,500 ms | Representative local response regressed materially |
| API output | 25,000,000 bytes | API artifact grew beyond current headroom |
| Web output | 30,000,000 bytes | Web artifact grew beyond current headroom |
| Mobile output | 65,000,000 bytes | Same-build mobile cohorts grew beyond current headroom |
| API RSS | 512,000,000 bytes | Isolated API startup memory regressed materially |
| Compared build duration | 120% of baseline | Serial build became more than 20% slower |
| Compared artifact size | 125% of baseline | Artifact became more than 25% larger |

Single-run timings can vary with workspace contention. A failed duration budget
should be rerun once in a comparable environment before changing code. Size
failures are deterministic enough to investigate immediately. Budgets do not
authorize changing worker cadence, Autoscale bounds, traffic, retention, or
database data.

## Bottlenecks and data gaps

### Measured bottlenecks

1. Mobile was 78% of the three serial build durations and produced the largest
   artifact because both delivery cohorts are retained.
2. API startup RSS was about 325 MB even with workers disabled; dependencies and
   eager module initialization, not worker execution, dominate this isolated
   snapshot.
3. API source maps account for about 59% of API output bytes.
4. The largest web chunk remains roughly 642 KB raw, consistent with the prior
   storefront audit.

### Unavailable

- Replit compute units, CPU, instance-hours, Autoscale events, request totals,
  transfer, deployment minutes, and charges
- Production pool saturation and query distributions
- A global worker total across Autoscale replicas
- Complete outbound provider outcomes/retries and all provider invoices
- Object Storage inventory, operations, transfer, and charges
- Real-user browser vitals for this local run

No savings or billing claims should be derived from these gaps.