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

## Runtime controls

- `ANALYTICS_SAMPLING_MODE=shadow` persists all events while logging the
  stable-cohort decision for dashboard comparison.
- `ANALYTICS_SAMPLING_MODE=enforce` applies the drop policy. This is the
  default after the approved rollout.
- `ANALYTICS_WEB_VITAL_SAMPLE_RATE` defaults to `0.1`.
- `ANALYTICS_VIEW_SAMPLE_RATE` defaults to `0.5`.

Every analytics request log includes the sampling mode, rate, selection, and
exception-retention, and actual persistence result. `selected` always means
membership in the stable cohort; it never includes outliers retained outside
that cohort. Web-event logs also include accepted, persisted,
sampled-out, and shadow-would-persist counts. Sampled rows carry their rate,
reason, and inverse-probability weight in `properties_json.analyticsSampling`.

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