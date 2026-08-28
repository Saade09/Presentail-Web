# Presentail Comprehensive Cost Optimization Audit

**Audit date:** 27 August 2026  
**Production site:** `https://presentail.com`  
**Deployment model:** Replit Autoscale  
**Scope:** Production API, web, and mobile-serving services; PostgreSQL; Object Storage and catalog-image delivery; CI/builds; client requests; AI and third-party integrations  
**Method:** Read-only repository inspection, read-only production database queries, production deployment/log inspection, and low-volume live HTTP observations  
**Change status:** The mobile static-delivery canary implementation described in
`docs/mobile-static-delivery-canary.md` has been added; no production publish or
traffic shift was performed.

## Evidence and cost-figure rules

This report deliberately does not invent a dollar total. Exact Replit billing history, compute units, CPU, memory, instance-hours, request counts, egress, Object Storage usage, build minutes, AI tokens, and third-party invoices were not available through the read-only surfaces accessible during the audit.

Every quantitative statement is tagged as one of:

- **Measured:** Directly observed in production, the production database, the repository, a local build artifact, or a live HTTP response.
- **Estimated:** Derived from a measured value and an explicit assumption. It is not an invoice or usage-meter result.
- **Unavailable:** The metric could not be obtained. No substitute value is presented as fact.

Confidence describes confidence in the quantity stated, not confidence that it maps directly to a specific dollar amount.

### Evidence register

| ID | Status | Observation | Source | Period / timestamp | Confidence |
|---|---|---|---|---|---|
| M-DEP-1 | Measured | Production is deployed successfully as Replit Autoscale and serves `presentail.com`; API, web, and mobile artifacts have separate production build/run definitions. | Replit deployment inspection; artifact manifests | 27 Aug 2026 | High |
| M-REP-1 | Measured/documented | Replit Autoscale cost surfaces include compute, requests, and data transfer; database and Object Storage have their own compute/capacity/transfer usage surfaces. | Official Replit documentation reviewed during the audit | 27 Aug 2026 | High |
| U-DEP-1 | Unavailable | Compute units, CPU, memory, instance-hours, scale events, requests, egress, uptime history, and current-period Replit charges. | Not exposed by accessible read-only deployment interfaces | Current and prior billing periods | High confidence that this is a data gap |
| M-LOG-1 | Measured | Two API process IDs, 21 and 22, each refreshed all four OS store views within 4.8 seconds of one another. | Production deployment logs | 27 Aug 2026, 09:39:57–09:40:02 UTC | High |
| M-LOG-2 | Measured | The same two process IDs each ran catalog-image health checks within 2.9 seconds. | Production deployment logs | 27 Aug 2026, 09:44:59–09:45:03 UTC | High |
| M-LOG-3 | Measured | 21 `product_lifecycle_410 event POST responded 400` lines appeared in the accessible log excerpt. | Production deployment logs | Accessible excerpt around 09:41–10:04 UTC, 27 Aug 2026 | High for the excerpt; low for monthly extrapolation |
| M-RUN-1 | Measured | The API startup path invokes 27 workers, monitors, sweepers, or warmers in every process. | `artifacts/api-server/src/index.ts` | Repository state on 27 Aug 2026 | High |
| M-RUN-2 | Measured | OS products and locations poll on a default 15-minute cadence. Woo sync also defaults to 15 minutes when enabled. | Worker source code | Repository state on 27 Aug 2026 | High |
| M-RUN-3 | Measured | Order reconciliation and pending-checkout sweeping poll every two minutes. Numerous independent monitors tick hourly; translation warming runs every six hours; catalog-image health runs daily. | Worker source code | Repository state on 27 Aug 2026 | High |
| M-DB-1 | Measured | Production PostgreSQL database size was 254 MiB / 266,117,120 bytes. | Read-only `pg_database_size` query | 27 Aug 2026, 10:06 UTC | High |
| M-DB-2 | Measured | `analytics_events` occupied 236 MiB: approximately 145 MiB table data and 91 MiB indexes. | Read-only PostgreSQL relation-size query | 27 Aug 2026 | High |
| M-DB-3 | Measured | `analytics_events` had 767,535 rows; 767,323 were created in the prior 30 days; only 212 were older than 30 days. Average was 25,577 rows/day. | Read-only aggregate query | 28 Jul–27 Aug 2026 | High |
| M-DB-4 | Measured | Last-30-day analytics included 329,808 `web_vital`, 266,318 combined `page_view`/`product_view`, and 49,955 `seo_entity_fetch_failed` rows. | Read-only aggregate query | 28 Jul–27 Aug 2026 | High |
| M-DB-5 | Measured | `app_orders` had 778 rows total and 429 rows in the prior 30 days. | Read-only aggregate query | 28 Jul–27 Aug 2026 | High |
| M-DB-6 | Measured | Selected row counts: 6,605 contextual descriptions, 1,492 Stripe webhook events, 958 customers, 948 product translations, 119 Klarna pending checkouts, 8 pending Woo orders, and 0 `image_dims` rows. | Read-only count query | 27 Aug 2026 | High |
| U-DB-1 | Unavailable | Query latency distribution, query calls, buffer hits, CPU attribution, connection saturation, sequential-scan frequency, and reliable dead-row statistics. `pg_stat_user_tables` counters were zero/unavailable on the accessible production read surface. | Production database read surface | Current period | High confidence that this is a data gap |
| M-NET-1 | Measured | Home HTML transferred 3,175 bytes Brotli-compressed and decoded to 11,645 bytes; it advertised 5-minute surrogate caching plus 60-second stale-while-revalidate. | Live GET | 27 Aug 2026 | High for the single request |
| M-NET-2 | Measured | `/api/woo/products?countryCode=LB` transferred 30,029 bytes with Brotli and decoded to 316,771 bytes, a 90.5% transfer reduction. | Live GET | 27 Aug 2026 | High for the single request |
| M-NET-3 | Measured | `/app/` transferred 12,410 bytes without visible content encoding or cache-control headers. | Live GET | 27 Aug 2026 | High for the single request |
| U-NET-1 | Unavailable | Monthly traffic, endpoint request counts, cache hit ratio, CDN origin ratio, and egress bytes. | Replit/account traffic metrics unavailable | Current and prior periods | High confidence that this is a data gap |
| M-BLD-1 | Measured | Existing build outputs: web 18,149,458 bytes, API 18,467,733 bytes, Expo static build 11,992,966 bytes. A broader mobile directory measurement was 57,281,312 bytes because it included more than the production static output. | Local artifact file sizes | Existing outputs on 27 Aug 2026 | High |
| M-BLD-2 | Measured | Largest web JavaScript chunk was 630,377 raw bytes. The web output included 730,304 bytes of Brotli sidecars and 873,132 bytes of gzip sidecars. Several catalog images were 300–627 KB each. | Local artifact file sizes | Existing outputs on 27 Aug 2026 | High |
| M-CI-1 | Measured | Repository contains 22 GitHub Actions workflows. Five separate workflow definitions invoke a full Presentail web build. | `.github/workflows` inspection | Repository state on 27 Aug 2026 | High |
| M-CI-2 | Measured | Git history contains 452 commits in the previous 30 days. This is an activity proxy, not a workflow-run count. | Local Git history | 28 Jul–27 Aug 2026 | High for commits; not evidence of 452 CI runs |
| U-CI-1 | Unavailable | Actual GitHub Actions runs, minutes, cache hit rate, failed/retried runs, EAS build minutes, Replit deployment-build minutes, and associated charges. | Provider usage/billing unavailable | Current and prior periods | High confidence that this is a data gap |
| M-AI-1 | Measured | Product-translation and contextual-description caches contain 948 and 6,605 rows respectively. Code includes caching, retries, batching/concurrency controls, and scheduled warming. | Production row counts and source inspection | 27 Aug 2026 | High |
| U-AI-1 | Unavailable | OpenAI requests, model mix, input/output tokens, cache hit ratio, image/audio generation usage, latency, retry volume, and spend by feature. | Provider billing/usage unavailable; no complete internal cost ledger | Current and prior periods | High confidence that this is a data gap |
| U-OBJ-1 | Unavailable | Object Storage capacity, object count, age distribution, duplicate/orphan objects, transfer, operations, and cost. A bucket is configured, but usage inventory was not available through the accessible authorization path. | Replit Object Storage surface | Current period | High confidence that this is a data gap |
| U-EXT-1 | Unavailable | Presentail OS, WooCommerce, Stripe, Clerk, Google, Twilio/SMS, email, Meta, Slack, Expo, payment-provider, and other external-service invoices and request metrics. | Provider dashboards/invoices unavailable | Current and prior periods | High confidence that this is a data gap |
| M-BAS-1 | Measured | A serial isolated baseline measured API/web/mobile build duration, artifact sizes, startup readiness, process memory, pool gauges, six fixed-route responses, and 13 regression checks: 12 passed, none failed, and the isolated catalog check was unavailable by design. | `docs/reports/optimization-baseline-2026-08-27.json` | 27 Aug 2026, 18:48:36–18:50:23 UTC | High for this workspace window |
| M-BAS-2 | Measured/implemented | Admin-protected `/api/healthz/metrics` exposes bounded process-local aggregate request, worker, outbound, pool, and image-proxy counters without request bodies, query strings, prompts, payment data, credentials, or customer identifiers. | API source and focused tests | Repository state on 27 Aug 2026 | High |
| U-BAS-1 | Unavailable by design | Worker and outbound counters were zero in the isolated baseline because startup integrations and workers were disabled to avoid database/provider side effects. An authorized normal-process snapshot can expose them in a future bounded window. | Baseline isolation mode | 107-second local window | High confidence that zero is not a production activity estimate |

---

## Reproducible optimization baseline

The executable architecture inventory, commands, privacy rules, raw results,
regression budgets, override policy, and data gaps are documented in
[`docs/optimization-baseline-2026-08-27.md`](optimization-baseline-2026-08-27.md).
The machine-readable reference is
[`docs/reports/optimization-baseline-2026-08-27.json`](reports/optimization-baseline-2026-08-27.json).

The baseline collector defaults to isolated local services and six GET requests.
Production URLs must be supplied explicitly; the collector does not run a load
test, modify live traffic, change worker cadence, or mutate database data.

# 1. Executive Summary

## Bottom line

The audit cannot responsibly state Presentail's current monthly dollar cost because the necessary Replit and provider billing exports were inaccessible. It can, however, identify several high-confidence sources of avoidable work.

The strongest finding is architectural: **every Autoscale API process starts the same set of 27 background jobs**. Production logs prove that at least two active processes independently performed the same OS catalog refreshes and catalog-image health check within seconds [M-LOG-1, M-LOG-2, M-RUN-1]. Process-local locks prevent overlap inside one process but do not prevent duplicates across Autoscale replicas.

The second strongest finding is telemetry volume: **analytics is 236 MiB, or 92.9% of the entire 254 MiB database allocation** [M-DB-1, M-DB-2]. In the last 30 days, 84.2% of analytics rows were web vitals, page/product views, or SEO entity-fetch failures [M-DB-3, M-DB-4]. A conservative sampling and failure-remediation policy could avoid approximately **480,000 inserts per month, 62.6% of current analytics volume**. This is an estimate derived from sampling 90% of web-vital rows, eliminating the current SEO entity-fetch failure stream, and sampling 50% of page/product views. It is high confidence as a row-volume estimate, but database-compute and dollar savings cannot be known without query/CPU billing metrics. The separately observed lifecycle-event HTTP 400 stream may have a different root cause and is not included in the 480,000-row calculation.

The mobile web artifact is another concrete candidate. Its production Node server performs static-file serving plus two small request-header-dependent routes, while `/app/` currently lacks visible compression and cache headers [M-NET-3]. Preserving Expo manifest behavior while moving static bytes to CDN/static hosting could eliminate **up to 100% of the mobile web service's dynamic runtime compute**. That percentage applies only to this service, not to native app delivery or total project spend; traffic and service charges are unavailable.

CI is structurally repetitive: five workflows independently build the web application, and the repository saw 452 commits in 30 days [M-CI-1, M-CI-2]. Actual workflow runs were not accessible. Reusable build artifacts and stricter path/concurrency controls should reduce **30–60% of web-build minutes on affected CI runs**; this is a medium-confidence configuration-based estimate, not measured provider usage.

Existing safeguards already working include Brotli compression on the large catalog response (90.5% reduction in the observed request), short surrogate caching for HTML, durable Stripe webhook deduplication, translation caches, retry limits in several integrations, and approximately 30-day analytics retention [M-NET-1, M-NET-2, M-DB-3].

## Priority ranking

| Rank | Opportunity | Expected monthly unit saving | Expected percentage saving | Confidence | Why it ranks here |
|---|---|---:|---:|---|---|
| P0 | Centralize or durably lock per-process background jobs | Approximately 43,200 duplicate two-minute poll ticks plus 5,760 duplicate 15-minute sync ticks if two API processes remain active for a full 30-day month | 50% of affected job executions at two replicas; `(N-1)/N` at `N` replicas | High for duplicate mechanism; medium for monthly extrapolation | Duplication is proven in production and grows directly with Autoscale replicas. |
| P0 | Fix the SEO/lifecycle failure loop | Approximately 49,955 analytics writes/month plus repeated failed POSTs and error logs | 6.5% of analytics rows; request/log savings unavailable | High | It is both a correctness signal and a recurring cost stream. |
| P1 | Sample and aggregate high-volume analytics | Approximately 430,000 additional writes/month under the stated policy; combined with P0 approximately 480,000/month | 56.1% additional, 62.6% combined, of analytics inserts | High for rows; medium for database cost | Analytics dominates database allocation and write volume. |
| P1 | Convert mobile static delivery away from dynamic runtime | Runtime instance-hours for the mobile web-serving service; exact hours unavailable | Up to 100% of that service's compute; unknown share of total | Medium-high | The server is predominantly static, but Expo header-manifest compatibility must be retained. |
| P1 | Consolidate CI web builds | Build minutes unavailable | Estimated 30–60% of web-build minutes on affected runs | Medium | Five independent workflows build the same web artifact. |
| P2 | Reduce catalog/client overfetch and improve conditional caching | Requests and egress unavailable | Estimated 15–40% of catalog API request/egress category | Medium-low until traffic metrics exist | Each observed LB catalog response decodes to 316,771 bytes, although compression already performs well. |
| P2 | Control logs, retries, and external-call budgets | Log lines, external calls, and dollars unavailable | Estimated 20–60% of low-value success logs and retry-amplified calls | Medium-low | Broad request logging and repeated failure paths can scale with traffic and replicas. |
| P3 | Optimize image variants and Object Storage lifecycle | Object bytes/transfer unavailable | Estimated 20–40% of image egress after request-mix measurement | Low-medium | Several bundled catalog images are 300–627 KB, but actual image traffic and storage inventory are absent. |
| P3 | Meter and right-size AI calls by feature | Tokens and spend unavailable | Estimated 20–50% of AI category after instrumentation | Low | Caches exist, but spend, token, and cache-hit evidence is missing. |

## Urgent anomalies and scaling risks

1. **Per-replica background duplication — urgent.** Two API PIDs refreshed the same four OS store views within 4.8 seconds, and both ran the same daily image-health task within 2.9 seconds [M-LOG-1, M-LOG-2]. At two replicas, any job protected only by an in-memory flag does twice the intended work. At five replicas, 80% of those executions are duplicates.
2. **SEO/lifecycle failure amplification — urgent.** The database recorded 49,955 `seo_entity_fetch_failed` rows in 30 days, while production logs separately show a lifecycle-event POST repeatedly receiving HTTP 400 [M-DB-4, M-LOG-3]. These are two proven failure streams, not a proven shared root cause. Together they create request, database, index, and logging work while masking underlying defects.
3. **Two-minute polling versus order volume — high priority.** At a continuously active single process, each two-minute job ticks 21,600 times/month. Two jobs across the two observed processes imply 86,400 configured loop ticks/month, compared with 429 orders in the measured 30-day period [M-RUN-3, M-DB-5]. This is an estimated cadence extrapolation; scale-to-zero and process churn can lower actual ticks.
4. **Autoscale connection multiplication — safety risk.** The PostgreSQL pool has no explicit application-level maximum, connection timeout, idle timeout, or statement timeout. The `pg` default pool maximum is commonly 10 per process; if unchanged at runtime, database connection capacity grows roughly as `10 × API processes`. Actual active connections and plan limits were unavailable.
5. **Known-missing/fallback external paths — investigate immediately.** Source inspection shows fallback calls and recurring monitors around OS catalog/metadata availability. Accessible log searches were insufficient to derive a trustworthy monthly count of the reported OS 404 fallback path, so no numerical saving is claimed. Instrument endpoint/status counts before changing behavior.
6. **No cost telemetry feedback loop — urgent governance gap.** Replit and provider charges cannot currently be reconciled to service, endpoint, worker, feature, deployment, or customer action from repository/application evidence.

---

# 2. Current Cost Breakdown

## 2.1 Replit deployment and compute

### Current state

- Official Replit documentation identifies Autoscale compute, requests, and data transfer as usage surfaces, with separate database and Object Storage usage surfaces [M-REP-1].
- Production is an active Replit Autoscale deployment with separately configured API, web, and mobile artifacts [M-DEP-1].
- The API process starts 27 recurring or startup background components in addition to serving requests [M-RUN-1].
- The web service performs request-time routing, SEO/SSR injection, sitemap/LLM route generation, compression, caching, image-dimension work, and some analytics side effects.
- The mobile-serving service is a dependency-free Node HTTP server that reads a landing page and Expo manifests and synchronously reads static files from disk.

### Cost attribution

| Component | Measured activity | Current monthly dollars | Likely driver | Confidence |
|---|---|---:|---|---|
| API Autoscale compute | Two simultaneous PIDs observed; 27 jobs started per process; duplicate jobs proven | Unavailable [U-DEP-1] | Request serving plus duplicated polling, monitors, cache warming, image checks, SEO audits, retries | High that avoidable work exists; unavailable dollar share |
| Web Autoscale compute | Live dynamic HTML response, SSR/SEO injection code, sitemap and content routes | Unavailable [U-DEP-1] | Request-time HTML work and cache misses | Medium; request/cache metrics unavailable |
| Mobile-serving compute | Static server behavior and uncompressed `/app/` response measured | Unavailable [U-DEP-1] | Mostly static delivery from a dynamic Node service | Medium-high; traffic unavailable |
| Replit requests/egress | Two live response sizes measured | Unavailable [U-NET-1] | Catalog JSON, HTML, JavaScript, images, mobile static assets | Low confidence in rank without traffic mix |
| Development workspace usage | Four development workflows are configured/running in the audit workspace snapshot | Unavailable | Interactive development servers and validation builds | Low; snapshot is not billing history |

**Directional conclusion:** API compute is the most evidence-supported avoidable Replit runtime category because duplicate work is directly observed. It cannot be declared the largest billed category without Replit usage data.

Current-period versus prior-period reconciliation was not possible: the accessible surfaces did not expose historical Replit usage or billing [U-DEP-1]. The implementation plan therefore starts by obtaining a consistent 60–90 day export rather than inferring a trend from repository configuration.

## 2.2 Runtime workers, polling, schedules, and retries

### Startup inventory

The API startup path invokes:

- OS locations and products synchronization
- Order reconciliation and pending-checkout sweeping
- Optional Woo synchronization
- Clerk catch-up synchronization
- Checkout login and purchase funnel monitors
- Auth-exists, social-auth, session-coverage, and Clerk fallback monitors
- Upsell conversion and funnel monitors
- SMS, FX fallback, geo/currency fallback, Google Ads, and web-vitals monitors
- SEO audit and product-lifecycle monitors
- Product affinity and product-metrics synchronization
- Plant classification and product-translation warming
- Merchant-listing suggestions and catalog-image health checks

This is **27 startup calls** [M-RUN-1]. Some modules may no-op behind feature flags, durable database locks, or empty work queues, but they still add startup/control-path complexity. Actual per-job CPU and call counts are unavailable.

### Cadence model

| Job family | Configured cadence | One process, 30-day cadence estimate | Two continuously active processes | Duplication/idempotency assessment |
|---|---:|---:|---:|---|
| Order reconciliation | Every 2 minutes | 21,600 ticks | 43,200 ticks | Process-local scheduling; durable order idempotency exists in portions of order flow, but polling itself duplicates |
| Pending checkout sweeper | Every 2 minutes | 21,600 ticks | 43,200 ticks | Same per-process duplication risk |
| OS product synchronization | Default every 15 minutes | 2,880 ticks | 5,760 ticks | Duplicate refresh proven in logs |
| OS location synchronization | Default every 15 minutes | 2,880 ticks | 5,760 ticks | Same architecture; production duplicate count not separately measured |
| Optional Woo synchronization | Default every 15 minutes when enabled | 2,880 ticks | 5,760 ticks | Must confirm production flag and call volume before action |
| Hourly monitor | Hourly per monitor | 720 ticks | 1,440 ticks | Multiplied by the number of enabled monitors |
| Translation warm job | Every 6 hours | 120 ticks | 240 ticks | Cache and some lock behavior exist; external AI work must be durably single-owner |
| Catalog-image health | Daily after startup delay | 30 scheduled runs | 60 scheduled runs | Duplicate run proven in logs |

All monthly figures in this table are **estimates** based on source cadence, 30 days, and one or two continuously alive processes. Autoscale sleep, process replacement, and disabled flags can lower actual totals. Confidence is high in the arithmetic and medium in realized monthly executions.

### Retry and failure amplification

- Several integrations implement retries, backoff, timeouts, cache TTLs, or alert cooldowns. These are positive controls.
- Retries remain per process unless coordinated. During upstream failure, two replicas can independently retry, alert, log, and record analytics.
- The observed HTTP 400 lifecycle-event loop is not a transient condition that should be retried indefinitely [M-LOG-3].
- SEO audit code performs many outbound fetches with per-request timeouts. Running the same audit in multiple replicas multiplies origin traffic and can cause the monitor itself to influence storefront cost and logs.

## 2.3 PostgreSQL

### Allocated size and growth

| Relation/category | Measured size/rows | Period | Cost implication |
|---|---:|---|---|
| Entire database | 254 MiB | Snapshot, 27 Aug 2026 | Small absolute storage footprint; compute/write amplification matters more than capacity today |
| `analytics_events` | 236 MiB; 767,535 rows | Snapshot | 92.9% of database bytes; dominant storage/index/write target |
| Analytics table data | Approximately 145 MiB | Snapshot | High insert and retention churn |
| Analytics indexes | Approximately 91 MiB | Snapshot | Every insert updates date/name indexes |
| 30-day analytics | 767,323 rows; 25,577/day average | 28 Jul–27 Aug 2026 | Near-total current table is one retention window |
| Orders | 778 total; 429 in 30 days | Snapshot/30 days | Orders are not the storage driver |

The measured allocation averages roughly **322 bytes per analytics row including its share of the table and indexes** (`236 MiB ÷ 767,535`). This is an estimate for planning, not a guarantee of immediate disk reclamation after deletion or sampling. PostgreSQL may retain free space for reuse until maintenance/rewrite.

### Analytics composition

| Event group | Rows in 30 days | Share of 30-day analytics | Assessment |
|---|---:|---:|---|
| `web_vital` | 329,808 | 43.0% | Sample or aggregate; full-fidelity per-page-event storage is rarely required |
| `page_view` + `product_view` | 266,318 | 34.7% | Retain business analytics, but consider sampling, daily rollups, or external analytics as source of detail |
| `seo_entity_fetch_failed` | 49,955 | 6.5% | Fix root cause; store rate-limited aggregates rather than one row per failure |
| All other events | 121,242 | 15.8% | Review individually; order/payment/security events should retain higher fidelity |

The database saw about **1,789 analytics rows per order** in the same 30-day window (`767,323 ÷ 429`). This measured ratio is contextual only; many sessions do not order, so it is not a causal cost-per-order metric.

### Query and connection efficiency

- Analytics payloads are stored in text JSON columns. This avoids JSON indexing overhead but makes structured analysis parse-heavy and can retain verbose client payloads.
- Only created-time and name-plus-created-time indexes are defined for analytics. They are suitable for retention and event/time reporting, but actual index usefulness cannot be proven without query statistics.
- The database pool is lazy but lacks explicit application limits and timeouts.
- Reliable sequential-scan, dead-row, buffer-hit, statement-frequency, and connection-pressure evidence was unavailable [U-DB-1].

No index should be added or removed solely from this audit. First capture `pg_stat_statements` or equivalent production query evidence.

## 2.4 Object Storage and catalog-image delivery

### What is known

- A Replit Object Storage bucket is configured.
- Application code uses image proxying, uploads, image metadata/dimension handling, generated social images, and catalog imagery.
- The local web build contains several catalog images between approximately 300 KB and 627 KB [M-BLD-2].
- The production API performs scheduled catalog-image health checks, and duplicate checks were observed [M-LOG-2].
- The `image_dims` database table currently has zero rows [M-DB-6]; web-serving code also maintains process-local image-dimension caching.

### What is not known

Capacity, object count, age, orphan/duplicate volume, operation count, cache hit ratio, transformed-image misses, transfer, and dollars are unavailable [U-OBJ-1]. Therefore:

- The audit does **not** recommend deleting any object.
- It does **not** claim Object Storage is expensive or unused.
- Local build image size is not treated as proof of production image traffic.

## 2.5 Network, frontend, and bundle behavior

### Working controls

- Home HTML is Brotli-compressed and advertises five-minute surrogate caching with stale-while-revalidate [M-NET-1].
- The observed catalog API response is already Brotli-compressed from 316,771 decoded bytes to 30,029 transferred bytes, a 90.5% reduction [M-NET-2].
- React Query and server caches reduce portions of repeated client and origin work.

### Opportunities

- The catalog endpoint still requires the client to decode and parse 316 KB in the sampled market. Field projection, route-specific payloads, ETags, and longer stale caching can reduce CPU and requests even when wire compression is good.
- Some web code performs direct fetches outside shared query caching, and prefetching can fetch data users never consume. Actual duplicate-request rate is unavailable.
- The main web JavaScript chunk is 630,377 raw bytes [M-BLD-2]. Route-level attribution and real-user transfer data are needed before changing split points.
- `/app/` returned 12,410 uncompressed bytes without visible cache headers [M-NET-3], and its static assets are served by synchronous file reads.
- Large bundled product images suggest responsive variants and stricter size budgets, but the highest-traffic assets are unknown.

## 2.6 Builds, deployments, and CI

### Measured structure

- There are 22 GitHub Actions workflows [M-CI-1].
- Five workflows perform a full web build: web serving checks, SEO regression, iOS TestFlight, iOS App Store, and Android Play Store [M-CI-1].
- Git history shows 452 commits in 30 days [M-CI-2]. Path filters mean this must not be multiplied by five and called actual build usage.
- Production artifact outputs are approximately 18.1 MB web, 18.5 MB API, and 12.0 MB mobile static [M-BLD-1].
- API deployment build configuration runs schema push as part of the build sequence. Even when idempotent, tying schema operations to every deployment adds database contact, lock risk, and deploy duration.

### Cost assessment

Actual CI/deployment minutes and charges are unavailable [U-CI-1]. Configuration evidence nevertheless supports:

- Build-once/reuse-many for web artifacts consumed by native publish workflows.
- Concurrency cancellation for superseded branch/PR runs.
- More precise path filters.
- Dependency-store and build-output caching keyed by lockfile/source inputs.
- Separate, explicit schema migration from ordinary API builds.

## 2.7 AI and paid integrations

### AI

OpenAI-backed code paths include product translation, banner/category/occasion translation, content/description generation, classification, and potentially image/audio/social generation. Existing caches, batching, retry limits, and concurrency controls are valuable.

The 948 product-translation and 6,605 contextual-description cache rows prove cached outputs exist, but do **not** reveal the number of calls, tokens, models, retries, or dollars [M-AI-1, U-AI-1].

### External services

The codebase integrates or retains paths for:

- Presentail OS and legacy WooCommerce catalog/order operations
- Stripe and other payment methods/providers
- Clerk/auth synchronization and local JWT auth
- Google APIs, Ads/conversions, service-account operations, and Sheets
- Meta conversions
- SMS/Twilio-style messaging and email
- Slack order alerts
- Expo/EAS and app-store publishing
- Search/indexing and merchant-listing services

Positive controls include durable Stripe webhook event deduplication, order-level timestamps for some external side effects, signature verification, caches, feature flags, and retry/backoff logic.

Remaining risks:

- Per-replica polling and retries
- Partial rather than universal durable idempotency for email/SMS/Slack/Meta/Google side effects
- Polling where webhooks or change tokens may be available
- Missing per-provider call, status, retry, latency, and cost ledgers
- AI warming work that may run without demand or across replicas
- Legacy integration paths that may still initialize monitors despite no storefront use

Provider request metrics and invoices are unavailable [U-EXT-1], so no provider is assigned a fabricated dollar rank.

---

# 3. Optimization Opportunities

## 3.1 Prioritized opportunity register

All monthly savings below are estimates unless explicitly labeled measured. “Percent saving” refers to the affected category, not total company spend, unless stated otherwise.

| ID / priority / category | Root cause and evidence | Expected monthly saving | Effort | Risk and performance impact | Affected areas | Verification method |
|---|---|---|---|---|---|---|
| O1 / P0 / Runtime & external APIs | All 27 jobs start per API process; duplicate OS refresh and image checks are proven [M-RUN-1, M-LOG-1, M-LOG-2]. | **Estimated:** at two continuous replicas, avoid ~43,200 duplicate two-minute poll ticks and ~5,760 duplicate OS product/location ticks/month; **50% of affected executions**. At `N` replicas, duplicate share is `(N-1)/N`. Dollar saving unavailable. Confidence: medium-high. | Medium | Low customer risk if lease handoff is correct. Lower API CPU, DB queries, logs, and outbound calls. A broken lease could stop a job; stale lease could duplicate it. | API startup, all monitors/workers, DB advisory locks or scheduler | Per-job run counter by owner/replica; prove one execution per due window during forced scale-out and process termination; compare API compute/external-call metrics for 14 days. |
| O2 / P0 / Correctness & telemetry | 49,955 SEO fetch-failure events in 30 days and a separate repeated lifecycle-event HTTP 400 stream [M-DB-4, M-LOG-3]. The audit does not assume one root cause. | **Measured baseline:** 49,955 SEO failure rows/30d. **Estimated saving:** 45,000–49,955 writes/month plus separately avoidable failed lifecycle requests/logs, **5.9–6.5% of analytics volume**. About 14–15 MiB of allocation-equivalent churn at 322 bytes/row. Confidence: high for rows, medium for storage. | Small–medium | Positive performance and observability impact. Risk is hiding genuine failures if events are merely dropped; each root cause must be fixed first, then residuals aggregated/rate-limited. | Web SEO fetch/lifecycle emitters, API analytics route/schema, logs | Error ratio by event and status; 7-day event rate; valid 404/410 lifecycle route tests; alert on aggregates, not each occurrence. |
| O3 / P1 / Database & analytics | Web vitals and views produce 596,126 rows/30d, 77.7% of analytics [M-DB-4]. | **Estimated policy:** sample away 90% of web vitals and 50% of page/product views: ~429,986 writes/month, **56.0% of analytics volume**. Combined with O2: ~479,941 rows, **62.6%**. Allocation-equivalent reduction ~132 MiB for O3 or ~148 MiB combined. Dollar/DB CPU saving unavailable. Confidence: high for row math; medium for cost. | Medium | Lower ingest/query/index load. Risk to analytics granularity; protect conversion, payment, security, and experiment events. Client performance should improve slightly from fewer beacons. | Web/mobile analytics clients, analytics API, reporting queries | Shadow-count sampled versus full events for 7 days; validate dashboards; compare inserts/day, DB compute, query latency, database growth, and business KPI variance. |
| O4 / P1 / Mobile service & network | Mobile production server mostly serves static bytes; `/app/` lacks visible compression/cache headers [M-NET-3]. | **Estimated:** up to **100% of mobile web-serving dynamic compute**, plus **40–80% of compressible text transfer** after CDN/static migration. Actual instance-hours/traffic unavailable. Confidence: medium. | Medium | Faster static delivery and lower compute. Risk to Expo `expo-platform` manifest negotiation and base-path behavior. No expected native-app regression if manifests remain equivalent. | Mobile artifact server, manifests, routing/deployment | Golden tests for iOS/Android manifest headers and every asset; compare checksums/headers; canary `/app`; retain old service for instant route rollback. |
| O5 / P1 / CI & builds | Five workflows independently build web; 22 workflows; high repository activity [M-CI-1, M-CI-2]. | **Estimated:** **30–60% of web-build minutes on affected CI runs** via artifact reuse, path filtering, caching, and concurrency cancellation. Actual minutes/dollars unavailable. Confidence: medium. | Medium | Faster CI with no runtime impact. Risk of reusing stale artifacts if cache keys omit inputs. | GitHub Actions, native publishing, SEO/web checks | Record baseline workflow minutes/cache hits for 30 days; use content-addressed artifact hashes; compare output checksums; force clean-build validation weekly. |
| O6 / P1 / Polling & orders | Two two-minute workers create up to 86,400 configured loop ticks/month at two continuous processes versus 429 orders/30d [M-RUN-3, M-DB-5]. | **Estimated:** centralization alone saves 43,200 ticks/month; webhook-first plus one 10-minute fallback can save ~77,760 of 86,400 ticks, **90%**, under the two-process continuous assumption. Actual DB calls per tick unavailable. Confidence: medium. | Medium-high | Lower DB wakeups/API CPU. Risk of delayed reconciliation if webhooks fail; fallback and queue-age alerts are mandatory. | Reconcile worker, pending sweeper, payment webhooks, order queues | Chaos-test missed webhooks; measure max queue age, time-to-reconcile, poll queries, and recovered orders; rollback cadence independently. |
| O7 / P2 / Catalog APIs & clients | 15-minute OS polling per process; sampled catalog response decodes to 316,771 bytes; direct client fetch/prefetch paths coexist [M-RUN-2, M-NET-2]. | **Estimated:** **50% of sync calls** at two replicas from centralization; an additional **15–40% of catalog request/egress category** from ETag/delta payloads and deduplicated clients. Actual request volume unavailable. Confidence: medium-low. | Medium-high | Faster clients and less origin work. Risks stale catalog, prices, availability, and locale/country leakage in cache keys. | OS caches, Woo fallback, catalog routes, React Query/mobile fetches | Per-endpoint call/byte/cache metrics; contract tests by country/currency/language; forced invalidation tests; compare stale-product incidents and origin egress. |
| O8 / P2 / Logs & observability | Request logging and repeated failures can emit one or more records per request/process; log billing/retention unavailable. | **Estimated:** **40–80% of routine 2xx application log volume** by sampling successes while retaining errors, slow requests, payments, security, and trace aggregates. Total log-cost percentage unavailable. Confidence: low-medium. | Small–medium | Lower logging I/O and clearer signal. Risk of losing forensic detail; use trace sampling and temporary debug overrides. | API pino HTTP logging, web server logs, worker alerts | Compare bytes/day, error-detection latency, sampled trace availability, and incident reconstruction during a canary. |
| O9 / P2 / Deployment & database safety | API build performs schema push; DB pool/timeouts are not explicitly bounded. | **Estimated:** **1–5% of deployment/build time** plus avoided lock/failure risk; runtime cost saving not reliably quantifiable. Confidence: low for cost, high for safety. | Small–medium | Safer deploys and bounded resource use. Incorrect pool limits can cause queueing; explicit migrations need release discipline. | API artifact build, DB initialization, release workflow | Record build/migration duration; load-free connection tests; monitor pool wait, timeouts, DB connections, deploy success; rollback pool settings independently. |
| O10 / P2 / AI | No per-feature token/cost ledger; warmers and retries may spend independent of demand; caches exist [M-AI-1, U-AI-1]. | **Estimated after metering:** **20–50% of AI category** through cache-hit enforcement, demand-aware warming, prompt trimming, model routing, and duplicate suppression. No dollar baseline. Confidence: low. | Medium | Lower latency/cost on hits. Risk to translation/content quality from smaller models or stale caches. | Translation, descriptions, classification, image/audio generation | Log feature/model/token/cache/retry metrics without prompt PII; offline quality set; 5% canary; provider invoice reconciliation. |
| O11 / P3 / Images & Object Storage | Some bundled catalog images are 300–627 KB; no storage/traffic inventory [M-BLD-2, U-OBJ-1]. | **Estimated:** **20–40% of image egress category** from responsive variants, format/quality budgets, immutable caching, and transform dedupe. No capacity saving claimed. Confidence: low-medium. | Medium | Faster pages. Risk of visual degradation or cache-key explosion. | Web catalog assets, image proxy, Object Storage, social image generation | Inventory first; top-object traffic report; visual regression; LCP/bytes; transform miss ratio; storage growth and egress comparison. |
| O12 / P3 / Legacy/unused resources | Empty `image_dims`; retained legacy payment/catalog/auth paths; feature-gated workers may no-op but still initialize [M-DB-6 and code inspection]. | **Estimated:** likely **<1–5% of runtime/build category** until usage proves otherwise. No deletion saving claimed. Confidence: low. | Medium | Reduces complexity and accidental calls. High business risk if a “legacy” path still supports reconciliation or historical orders. | DB table, CyberSource/Woo/Clerk paths, dependencies, monitors | 30–60 day zero-use counters; owner sign-off; dependency graph; archive/runbook; reversible feature flag before removal. |

## 3.2 Quick wins

1. Fix the lifecycle/SEO 400 contract and aggregate residual failure events.
2. Add durable single-owner execution to the highest-frequency and highest-fan-out workers.
3. Add metrics before tuning: job runs, provider calls/status, endpoint bytes, cache hits, log bytes, AI tokens.
4. Sample web-vital events while protecting conversion and error fidelity.
5. Add CI concurrency cancellation and build artifact reuse.
6. Add explicit database pool and timeout configuration after measuring the plan's connection limit.

## 3.3 Medium changes

1. Make order recovery webhook-first with a slower safety sweep.
2. Make catalog refresh event/version-driven where Presentail OS supports it; retain a low-frequency fallback.
3. Move `/app` static bytes to static/CDN delivery while preserving Expo manifest semantics.
4. Consolidate catalog client queries and add correct country/currency/language-aware conditional caching.
5. Introduce analytics rollups and bounded retention by event class.

## 3.4 Architectural work

1. Separate request-serving processes from scheduled work using one scheduler/queue consumer or durable leases.
2. Create a cost attribution ledger covering Replit services, endpoints, jobs, providers, and AI features.
3. Introduce webhook/queue idempotency keys for every paid or customer-visible side effect.
4. Build image/object lifecycle decisions from access inventory rather than repository assumptions.

---

# 4. Unused Resources

No resource should be deleted or disabled based only on this audit. The following are candidates for usage proof and owner review.

| Candidate | Evidence | Current conclusion | Required proof before removal/change |
|---|---|---|---|
| `image_dims` table | Zero rows in production [M-DB-6] | Apparently unused as persistent storage; may be reserved for a disabled path | Search all reads/writes, observe 30 days, confirm no deployment migration dependency |
| Dynamic mobile web-serving runtime | Server is predominantly static; `/app/` response measured [M-NET-3] | Potentially over-provisioned delivery mechanism, not an unused product | Route traffic, Expo manifest consumers, asset/header equivalence, rollback route |
| CyberSource storefront code paths | Storefront UI is removed while backend compatibility/history paths remain | Do not delete; may support historical records/webhooks | 60-day route/event count, finance/support sign-off, retention obligations |
| Legacy Woo synchronization/fallbacks | Worker is feature-gated but source remains and default interval is 15 minutes when enabled | Actual production enablement/call volume not proven | Effective flag inventory, call counters, order/catalog dependency review |
| Clerk catch-up/fallback monitors | Web uses local JWT auth, but migration/catch-up support remains | Could be transitional safety machinery | Zero-use metrics, migration completeness, auth owner approval |
| Pending Woo rows | Eight rows [M-DB-6] | Not unused; likely recovery state requiring examination | Read-only age/status review, order owner decision; never delete blindly |
| Klarna pending checkouts | 119 rows [M-DB-6] | Could be historical/expired, but not enough schema/status evidence to classify | Age/status/retention query and payment reconciliation review |
| Stripe webhook rows | 1,492 rows [M-DB-6] and explicit retention intent | Active idempotency resource, not waste by default | Verify age distribution and cleanup job; retain enough for retry horizon |
| Duplicate build outputs in CI | Five workflows build web independently [M-CI-1] | Repeated computation candidate, not an unused artifact | Actual Actions run/minute export and artifact hash comparison |
| Object Storage objects | Usage inventory unavailable [U-OBJ-1] | Unknown; no unused-resource claim | Object listing with size, last access where available, reference scan, backup/retention policy |
| Dependencies and generated assets | Build outputs are 12–18.5 MB [M-BLD-1] | Size alone does not prove runtime or deployment cost | Bundle composition and deployment upload/cache metrics |

### Resources that do not currently look wasteful

- Analytics retention appears to keep almost all rows within approximately 30 days: only 212 of 767,535 rows were older at the snapshot [M-DB-3]. The problem is event generation, not clearly unbounded retention.
- Brotli compression on web HTML and catalog JSON is working [M-NET-1, M-NET-2].
- Stripe webhook deduplication is a necessary reliability control; optimize retention only after validating provider retry horizons.
- Translation/content caches are cost controls, not obvious waste. Their hit rates and refresh behavior need measurement.

---

# 5. Recommended Implementation Plan

This audit began as an approval-ready plan. The mobile delivery slice in O4 has now
been implemented as a reversible static canary; the remaining opportunities remain
recommendations until separately shipped.

## Phase 1 — Stop proven leaks and establish attribution

**Target duration:** 1–2 weeks  
**Goal:** Stop duplicate/failing work and make future savings measurable.

### Intended changes

1. Reconcile monthly provider invoices to internal call/token/operation counters.
2. Enforce per-feature AI budgets, model allowlists, token ceilings, retry ceilings, cache-before-call, and demand-aware warmers.
3. Replace polling with signed webhooks/change tokens where providers guarantee delivery; retain bounded reconciliation.
4. Require durable idempotency keys for every SMS, email, Slack, Meta, Google Ads, payment, and order side effect.
5. Inventory Object Storage by prefix, bytes, age, reference status, operation count, and transfer before proposing lifecycle rules.
6. Measure image-transform hit/miss ratios and prevent duplicate concurrent transforms with a durable/single-flight key.
7. Set owner-approved Autoscale minimum/maximum and per-service budgets after observing traffic percentiles and cold-start behavior.
8. Run a weekly cost anomaly report and a monthly cost-per-order review.

### Durable job ownership implementation

The first duplicate-work control is now implemented for OS products, OS
locations, catalog-image health, SEO audit, product translation warming, order
reconciliation, and pending-checkout sweeping.

- `background_job_leases` stores one atomic due-window claim per named job,
  owner token, fencing generation, heartbeat expiry, completion status, and
  run/success/skip/failure/duration metrics.
- Each elected run also holds a PostgreSQL session advisory lock for its full
  lifetime. This prevents a paused but still-live process from overlapping a
  replacement; PostgreSQL releases the lock automatically if the process or
  connection stops.
- `background_job_snapshots` lets the elected OS refresher publish products
  and locations so every API replica hydrates its in-process request cache
  without repeating Presentail OS calls.
- Lease acquisition fails closed: a database outage skips shared work rather
  than allowing every replica to run it.
- A stopped owner is replaced after lease expiry; heartbeat renewal prevents a
  healthy long-running job from being taken over.
- Set `DISTRIBUTED_JOB_LEASES_ENABLED=false` to roll back all leases. To roll
  back one job independently, set
  `DISTRIBUTED_JOB_<JOB_NAME>_LEASE_ENABLED=false`, replacing punctuation with
  underscores (for example,
  `DISTRIBUTED_JOB_CATALOG_IMAGE_HEALTH_LEASE_ENABLED=false`).

### Expected savings

- **Estimated AI category:** 20–50%.
- **Estimated paid API/retry category:** 20–60% where duplicate retries/polls are found.
- **Estimated image/storage transfer category:** 20–40% after inventory.
- **Autoscale:** percentage unavailable until service-level instance-hour and latency data exist.

### Risks

- Smaller AI models can reduce quality.
- Webhooks can be missed or delivered out of order.
- Storage lifecycle mistakes can delete needed customer/order media.
- Aggressive scaling caps can increase latency or errors.

### Tests and rollout

- Curated multilingual quality set and human review for AI model routing.
- Provider webhook replay/duplicate/out-of-order tests.
- Dry-run-only storage lifecycle report for at least 30 days.
- Load replay against non-production for scale caps; production canary with error/latency rollback thresholds.
- Monthly invoice-to-ledger reconciliation with variance alert.

### Rollback

- Feature-specific AI model and budget flags.
- Keep reconciliation polling at a low fallback cadence.
- No destructive storage lifecycle until two-person approval and recoverability are proven.
- Restore prior Autoscale bounds immediately on latency/error threshold breach.

## Phase 2 — Reduce database, polling, and logging work

**Target duration:** 2–3 weeks after Phase 1 metrics stabilize  
**Goal:** Reduce high-frequency low-value work without losing revenue, reliability, or diagnostic fidelity.

### Intended changes

1. Reconcile monthly provider invoices to internal call/token/operation counters.
2. Enforce per-feature AI budgets, model allowlists, token ceilings, retry ceilings, cache-before-call, and demand-aware warmers.
3. Replace polling with signed webhooks/change tokens where providers guarantee delivery; retain bounded reconciliation.
4. Require durable idempotency keys for every SMS, email, Slack, Meta, Google Ads, payment, and order side effect.
5. Inventory Object Storage by prefix, bytes, age, reference status, operation count, and transfer before proposing lifecycle rules.
6. Measure image-transform hit/miss ratios and prevent duplicate concurrent transforms with a durable/single-flight key.
7. Set owner-approved Autoscale minimum/maximum and per-service budgets after observing traffic percentiles and cold-start behavior.
8. Run a weekly cost anomaly report and a monthly cost-per-order review.

### Expected savings

- **Estimated AI category:** 20–50%.
- **Estimated paid API/retry category:** 20–60% where duplicate retries/polls are found.
- **Estimated image/storage transfer category:** 20–40% after inventory.
- **Autoscale:** percentage unavailable until service-level instance-hour and latency data exist.

### Risks

- Smaller AI models can reduce quality.
- Webhooks can be missed or delivered out of order.
- Storage lifecycle mistakes can delete needed customer/order media.
- Aggressive scaling caps can increase latency or errors.

### Tests and rollout

- Curated multilingual quality set and human review for AI model routing.
- Provider webhook replay/duplicate/out-of-order tests.
- Dry-run-only storage lifecycle report for at least 30 days.
- Load replay against non-production for scale caps; production canary with error/latency rollback thresholds.
- Monthly invoice-to-ledger reconciliation with variance alert.

### Rollback

- Feature-specific AI model and budget flags.
- Keep reconciliation polling at a low fallback cadence.
- No destructive storage lifecycle until two-person approval and recoverability are proven.
- Restore prior Autoscale bounds immediately on latency/error threshold breach.

## Phase 3 — Optimize delivery and build pipelines

**Target duration:** 3–5 weeks  
**Goal:** Remove dynamic compute and repeated builds from static or cacheable work.

### Intended changes

1. Reconcile monthly provider invoices to internal call/token/operation counters.
2. Enforce per-feature AI budgets, model allowlists, token ceilings, retry ceilings, cache-before-call, and demand-aware warmers.
3. Replace polling with signed webhooks/change tokens where providers guarantee delivery; retain bounded reconciliation.
4. Require durable idempotency keys for every SMS, email, Slack, Meta, Google Ads, payment, and order side effect.
5. Inventory Object Storage by prefix, bytes, age, reference status, operation count, and transfer before proposing lifecycle rules.
6. Measure image-transform hit/miss ratios and prevent duplicate concurrent transforms with a durable/single-flight key.
7. Set owner-approved Autoscale minimum/maximum and per-service budgets after observing traffic percentiles and cold-start behavior.
8. Run a weekly cost anomaly report and a monthly cost-per-order review.

### Expected savings

- **Estimated AI category:** 20–50%.
- **Estimated paid API/retry category:** 20–60% where duplicate retries/polls are found.
- **Estimated image/storage transfer category:** 20–40% after inventory.
- **Autoscale:** percentage unavailable until service-level instance-hour and latency data exist.

### Risks

- Smaller AI models can reduce quality.
- Webhooks can be missed or delivered out of order.
- Storage lifecycle mistakes can delete needed customer/order media.
- Aggressive scaling caps can increase latency or errors.

### Tests and rollout

- Curated multilingual quality set and human review for AI model routing.
- Provider webhook replay/duplicate/out-of-order tests.
- Dry-run-only storage lifecycle report for at least 30 days.
- Load replay against non-production for scale caps; production canary with error/latency rollback thresholds.
- Monthly invoice-to-ledger reconciliation with variance alert.

### Rollback

- Feature-specific AI model and budget flags.
- Keep reconciliation polling at a low fallback cadence.
- No destructive storage lifecycle until two-person approval and recoverability are proven.
- Restore prior Autoscale bounds immediately on latency/error threshold breach.

## Phase 4 — Provider, AI, storage, and scaling governance

**Target duration:** 4–8 weeks, then ongoing  
**Goal:** Make cost regression difficult and optimization continuous.

### Intended changes

1. Reconcile monthly provider invoices to internal call/token/operation counters.
2. Enforce per-feature AI budgets, model allowlists, token ceilings, retry ceilings, cache-before-call, and demand-aware warmers.
3. Replace polling with signed webhooks/change tokens where providers guarantee delivery; retain bounded reconciliation.
4. Require durable idempotency keys for every SMS, email, Slack, Meta, Google Ads, payment, and order side effect.
5. Inventory Object Storage by prefix, bytes, age, reference status, operation count, and transfer before proposing lifecycle rules.
6. Measure image-transform hit/miss ratios and prevent duplicate concurrent transforms with a durable/single-flight key.
7. Set owner-approved Autoscale minimum/maximum and per-service budgets after observing traffic percentiles and cold-start behavior.
8. Run a weekly cost anomaly report and a monthly cost-per-order review.

### Expected savings

- **Estimated AI category:** 20–50%.
- **Estimated paid API/retry category:** 20–60% where duplicate retries/polls are found.
- **Estimated image/storage transfer category:** 20–40% after inventory.
- **Autoscale:** percentage unavailable until service-level instance-hour and latency data exist.

### Risks

- Smaller AI models can reduce quality.
- Webhooks can be missed or delivered out of order.
- Storage lifecycle mistakes can delete needed customer/order media.
- Aggressive scaling caps can increase latency or errors.

### Tests and rollout

- Curated multilingual quality set and human review for AI model routing.
- Provider webhook replay/duplicate/out-of-order tests.
- Dry-run-only storage lifecycle report for at least 30 days.
- Load replay against non-production for scale caps; production canary with error/latency rollback thresholds.
- Monthly invoice-to-ledger reconciliation with variance alert.

### Rollback

- Feature-specific AI model and budget flags.
- Keep reconciliation polling at a low fallback cadence.
- No destructive storage lifecycle until two-person approval and recoverability are proven.
- Restore prior Autoscale bounds immediately on latency/error threshold breach.

## Approval sequence

1. Approve Phase 1 instrumentation and single-owner execution separately.
2. Review two weeks of attributable usage before approving projected dollar savings.
3. Approve analytics sampling rules with product/marketing/finance owners.
4. Approve mobile static migration only after Expo manifest equivalence.
5. Approve storage lifecycle and autoscale changes only from measured inventory and traffic percentiles.

---

# 6. Cost Safeguards

## 6.1 Budgets and alerts

1. Set provider-native monthly budgets and threshold alerts wherever available at 50%, 75%, 90%, and 100% of the owner-approved budget.
2. Add daily anomaly alerts for:
   - Replit compute/request/egress versus seven-day baseline
   - DB compute, connections, storage, and writes
   - Object Storage bytes, operations, and transfer
   - AI calls/tokens/cost by feature and model
   - External calls, retries, and non-2xx status by provider
   - CI/deployment minutes and failed/retried builds
3. Route each alert to a named owner and require a runbook link. Alerts without ownership become logging cost rather than control.

Exact budget amounts must come from billing exports and business tolerance; this audit does not invent them.

## 6.2 Autoscale and runtime safeguards

- Set explicit service-level minimum and maximum instances after measuring p50/p95/p99 load and cold starts.
- Never rely on in-memory locks for singleton work in Autoscale.
- Require every recurring job to declare owner, cadence, timeout, concurrency, durable lock, idempotency key, retry ceiling, external dependencies, and cost metric.
- Add “runs due / runs executed / runs skipped as duplicate” dashboards.
- Stop retrying permanent 4xx responses except documented rate-limit/auth refresh cases.
- Add circuit breakers and jittered backoff for upstream outages.
- Bound SEO crawls and image checks by URL/object count, concurrency, timeout, and daily request budget.

## 6.3 Database safeguards

- Explicitly cap pool size per service and account for maximum Autoscale replicas.
- Set connection, acquisition, idle, and statement timeouts.
- Enable/query a supported statement-statistics surface and track top queries by total time, calls, rows, and temp bytes.
- Alert on connection saturation, long transactions, lock waits, replication lag, and abnormal write rate.
- Set event-class retention: short for sampled operational telemetry, longer for financial/security records.
- Use aggregate failure counters instead of one database row per repeated identical failure.
- Review index use from live statistics before schema changes.

## 6.4 Storage and image safeguards

- Inventory objects before lifecycle rules; never infer orphan status from age alone.
- Tag/prefix objects by purpose, owner, retention class, and source record.
- Use immutable content hashes and long caching for generated/static assets.
- Enforce maximum source pixels, output dimensions, quality range, and transformed-byte budgets.
- Single-flight identical image transforms and record hit/miss/bytes saved.
- Alert on sudden object-count, storage-byte, transform-miss, or transfer growth.
- Require dry-run reports and recoverability before deletion.

## 6.5 Network and client safeguards

- Track request count, decoded bytes, wire bytes, cache status, and latency per route.
- Set payload budgets for catalog list/detail routes and initial page bundles.
- Use ETags/version tokens and stale-while-revalidate only with complete cache keys.
- Deduplicate client fetches and cap speculative prefetch concurrency.
- Preserve existing Brotli behavior; include GET-based compression checks because HEAD responses can misrepresent body compression.
- Run country/currency/language/auth cache-isolation tests in CI.

## 6.6 CI and deployment safeguards

- Build once per source hash and verify artifact provenance.
- Cancel superseded branch/PR runs.
- Use exact path filters and reusable workflows.
- Track cache-hit rate, duration, failures, retries, and artifact size per workflow.
- Keep schema migrations explicit, reviewed, and separate from ordinary build repetition.
- Add artifact-size regression limits with intentional override documentation.
- Run periodic clean builds to catch poisoned or incomplete caches.

## 6.7 AI and external-service safeguards

- Log feature, provider, model, tokens/units, cache result, latency, status, retries, and estimated provider cost—never secret values or raw sensitive prompts.
- Enforce per-call input/output limits and per-feature daily/monthly ceilings.
- Route low-risk tasks to the least expensive model that passes a fixed quality set.
- Cache by normalized semantic input and version prompts so invalidation is deliberate.
- Make warm jobs demand-aware and durably single-owner.
- Give every customer-visible or paid side effect a durable idempotency key.
- Reconcile provider invoices to internal counters monthly; alert on unexplained variance.

## 6.8 Weekly cost scorecard

The permanent scorecard should include:

- Replit compute units, instance-hours, requests, and egress by service
- DB compute, average/max connections, writes, top queries, and allocated bytes
- Object Storage bytes, operations, and transfer by prefix
- API requests, response bytes, cache hits, and error rate by route
- Background runs, duplicate skips, duration, and failures by job
- Analytics inserts/day and rows by event name
- Log bytes/day by level/service
- AI tokens/calls/cost/cache hit by feature/model
- External calls/retries/failures by provider
- CI/deployment minutes, cache hit, and artifact bytes
- Orders and gross margin denominator, yielding cost per successful order

## Data required to convert this report into dollars

Obtain the following for the same 60–90 day window:

1. Replit invoices and usage exports for Autoscale compute, requests, egress, database compute/storage, Object Storage, development, builds/deployments, and AI/Agent usage.
2. Per-service instance/CPU/memory/request/egress time series.
3. Database statement, connection, CPU, and storage time series.
4. Object inventory and transfer/operation reports.
5. GitHub Actions and Expo/EAS run/minute exports.
6. OpenAI and every paid integration's request/unit/invoice export.
7. Internal order/revenue/margin totals for cost-per-order and percent-of-margin decisions.

Until those are available, the savings ranges in this report should be treated as **engineering work-reduction estimates**, not financial forecasts.

---

## Final assessment

Presentail's immediate optimization opportunity is not “use a smaller server” or “delete storage.” The strongest evidence supports removing work that multiplies with replicas, preventing one failure from generating tens of thousands of events, and reducing low-value telemetry that dominates the database. Static delivery and CI reuse are the next safest structural savings. AI, images, Object Storage, and provider-specific savings could be material, but must first be metered.

The recommended sequence protects correctness: establish attribution and singleton execution first, reduce data and polling second, optimize delivery/builds third, then use measured invoices and usage to set service, AI, storage, and external-provider budgets.
