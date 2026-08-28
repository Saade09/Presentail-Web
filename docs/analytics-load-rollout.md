# Analytics load reduction rollout

## Baseline

The 27 August 2026 production audit measured 767,323 analytics rows over 30
days (25,577/day): 329,808 web-vital rows, 266,318 page/product views, and
49,955 SEO entity-fetch failures.

## Policy

- Web vitals: stable 10% session cohort.
- Poor/error vitals: retained at 100% as `web_vital_outlier`, outside the
  percentile sample, so operational visibility does not bias p50/p75/p95.
- Sessionless vitals: retained as `web_vital_unattributed` in enforce mode and
  marked `selected: false` in shadow mode, so they cannot bias the cohort.
- Page and product views: stable 50% session cohort in the local database.
- The Presentail OS web-event stream remains complete.
- Revenue, payment, order, authentication/security, experiment, conversion,
  and all other low-volume events remain at full fidelity.
- Definitive SEO 404s are not failures. Transient SEO failures emit at most
  once per entity kind per five minutes.
- Product lifecycle 410 events emit at most once per slug per process per day,
  intentionally suppressing repeated crawler hits for the same retired URL.
- Repeated lifecycle-ingestion failures log once per status/error class per
  five-minute window. The next emitted warning includes the number suppressed;
  a new failure class still logs immediately.

## Runtime controls

- `ANALYTICS_SAMPLING_MODE=shadow` persists all events while logging the
  stable-cohort decision for dashboard comparison.
- `ANALYTICS_SAMPLING_MODE=enforce` applies the drop policy. This is the
  default after the approved rollout.
- `ANALYTICS_WEB_VITAL_SAMPLE_RATE` defaults to `0.1`.
- `ANALYTICS_VIEW_SAMPLE_RATE` defaults to `0.5`.

Sampled analytics request logs include the sampling mode, rate, selection,
exception-retention, and actual persistence result. `selected` always means
membership in the stable cohort; it never includes outliers retained outside
that cohort. Conversion/payment/auth/security and other non-view events keep
their full event logs. `DEBUG_ANALYTICS_LOGGING=1` temporarily restores all
analytics success logs. Sampled rows carry their rate, reason, and
inverse-probability weight in `properties_json.analyticsSampling`.

The web-vitals dashboard and daily monitor apply those inverse-probability
weights to counts and weighted percentiles. Rows retained as
`web_vital_outlier` or `web_vital_unattributed` are reported separately and
excluded from percentile calculations. Shadow-mode rows always use weight 1
because the complete stream is present; only enforced sampled rows carry
inverse-probability weight. `WEB_VITALS_OUTLIER_WARN_COUNT` defaults to 1 so a
retained poor/error observation is visible even when the sampled cohort is too
small for a percentile alert.

## Database connection budgets

The shared PostgreSQL pool is explicitly bounded. Defaults are based on the
two-replica envelope measured in the August audit:

- `DB_POOL_MAX=10` connections per replica.
- `DB_POOL_MAX_REPLICAS=2`, documenting a default maximum envelope of 20
  application connections. Raise this only after confirming the database
  connection limit and measured peak replica count.
- `DB_POOL_CONNECTION_TIMEOUT_MS=5000` acquisition/connection deadline.
- `DB_POOL_IDLE_TIMEOUT_MS=30000` idle-client lifetime.
- `DB_POOL_STATEMENT_TIMEOUT_MS=15000` server-enforced statement deadline.
- `DB_POOL_QUERY_TIMEOUT_MS=20000` client-side query deadline.
- The web server's image-dimension cache has a separate
  `WEB_IMAGE_DIMS_DB_POOL_MAX=2` pool and inherits the four database timeout
  values above. It reports its bounded configuration at startup and reports
  total/idle/waiting pressure on idle-client errors.

`GET /api/healthz/metrics` reports total, active, idle and waiting clients,
the configured per-replica and fleet envelopes, acquisitions, connection
errors, acquisition/query/statement timeouts, and idle-client errors. It
contains no SQL, connection strings, or customer data.

At the measured maximum of two replicas for each service, the defaults reserve
at most 20 API connections plus 4 image-cache connections. Confirm that this
24-connection application envelope plus deployment and administrative headroom
fits the database connection limit before increasing either pool.

Rollback is configuration-only: restore prior capacity by increasing
`DB_POOL_MAX` or deadlines and redeploy. Do not set a timeout to zero; invalid
or non-positive values intentionally fall back to the documented safe default.

## Request and analytics log budgets

- Routine successful HTTP requests use stable request-ID sampling at
  `REQUEST_SUCCESS_LOG_RATE=0.05`.
- HTTP errors, slow requests, and auth/checkout/payment/webhook/admin/security
  paths remain full fidelity.
- `SLOW_REQUEST_LOG_MS=1000` controls the slow-path threshold.
- `DEBUG_REQUEST_LOGGING=1` temporarily restores all request completion logs.
- Aggregate request results continue to be counted even when a completion log
  is suppressed.

`GET /api/healthz/metrics` reports emitted versus suppressed HTTP completion
logs and process-lifetime analytics evaluated/persisted/sampled-out counts.
Correlation IDs remain attached to every emitted request log.

## Rollout checks

Run shadow mode for seven complete UTC days before enforcing in production.
Compare dashboard p50/p75/p95 and country/platform/day view shares for the full
rows versus rows where `properties_json.analyticsSampling.selected` is true.
Do not enforce if a primary dashboard exceeds the owner-approved variance.

After enforcement, record daily:

```sql
SELECT
  created_at::date AS day,
  name,
  count(*) AS inserts
FROM analytics_events
WHERE created_at >= now() - interval '14 days'
GROUP BY 1, 2
ORDER BY 1, 2;
```

Record relation growth at the same UTC time each day:

```sql
SELECT
  pg_total_relation_size('analytics_events') AS total_bytes,
  pg_relation_size('analytics_events') AS table_bytes,
  pg_indexes_size('analytics_events') AS index_bytes;
```

Compare the first seven enforced days with the seven shadow days. Expected
direction from the measured baseline is approximately 90% fewer ordinary
web-vital rows, 50% fewer local page/product-view rows, and near-elimination
of the historical definitive-404 SEO failure stream. Keep the prior dashboard
queries available until the seven-day variance check is signed off.

Use the same admin metrics snapshots before and after the change to report:

1. Inserts/day and total/index/table growth from the SQL above.
2. Pool peak active/waiting clients plus connection/query/statement timeouts.
3. HTTP log `emitted / total` and analytics `persisted / evaluated`.
4. Counts of HTTP errors, slow requests, payment/security route logs, and
   retained web-vital outliers to prove diagnostic visibility.
5. Weighted dashboard totals and p50/p75/p95 versus shadow-mode full data,
   including absolute and percentage variance by day/platform/country.

The 27 August baseline was 25,577 inserts/day and 236 MiB total relation size.
The enforced target is approximately 11,244 fewer web-vital inserts/day and
4,439 fewer page/product-view inserts/day, subject to the seven-day weighted
variance check. Production after-values are intentionally collected by the
queued verification task after a complete observation window rather than
invented from a local test run.