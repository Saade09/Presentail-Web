# Mobile static delivery canary

**Owner:** Presentail mobile/web platform  
**Scope:** Expo Go download page, Expo manifests, bundles, and bundled assets  
**Status:** Ready for a controlled canary; the existing `/app/` service remains the rollback path.

## Delivery split

- `/app/` continues to run the existing Node service. It owns the landing page and the
  `expo-platform: ios|android` manifest negotiation.
- `/app-static/` is the static canary. It serves the build output directly from
  `static-build/`, including the generated landing page, bundles, and assets.
- Every build writes matching Node and static bundle/manifest variants. The Node service
  assigns a stable percentage cohort with `STATIC_ASSET_CANARY_PERCENT` (default `0`) and
  returns `x-presentail-asset-delivery: node|static` for measurement.
- Content-hashed/timestamped text assets have Brotli and gzip sidecars. The static
  service applies long-lived immutable caching; the Node fallback negotiates the same
  sidecars when it serves those bytes during rollback.

The static path must not be used for `/app/` manifest negotiation. A static host cannot
select the iOS or Android body from the `expo-platform` request header.

## Preflight checks

1. Publish with `STATIC_ASSET_CANARY_PERCENT=0`, `BASE_PATH=/app/`, and
   `STATIC_ASSET_BASE_PATH=/app-static/`.
2. From the published host, request `/app/` with `expo-platform: ios` and `android`.
   Save the decoded response bodies and headers.
3. Confirm each response is valid JSON and retains:
   - `expo-protocol-version: 1`
   - `expo-sfv-version: 0`
    - the platform-specific launch bundle URL under `/app/`
   - the expected `content-type`
4. Request one bundle with `Accept-Encoding: br, gzip` and confirm:
   - `content-encoding` is `br` or `gzip`
   - `cache-control` contains `max-age=31536000` and `immutable`
   - a second request returns the same decoded bytes
5. Run the smoke check with `node`, then set `STATIC_ASSET_CANARY_PERCENT=100`,
   restart the Node service, and run it with `static`. This deployment-only preflight
   is the compression gate: do not send shopper traffic unless the static response
   negotiates both Brotli and gzip.
6. Verify the landing page at `/app/` and `/app-static/` both render, and that the
   `exps://` link uses the published host.

The local smoke check can be run after a production build:

```sh
pnpm --filter @workspace/presentail run check:static-delivery \
  https://<published-host> \
  /app/ \
  static
```

## Canary measurements

Raise `STATIC_ASSET_CANARY_PERCENT` gradually (for example 1, 5, 25, then 100) and
run the Node and static cohorts side by side for at least two complete traffic windows.
Record the same window and timezone for both paths:

| Signal | Baseline | Canary | Decision guardrail |
|---|---:|---:|---|
| Requests by path/status | publishing analytics | publishing analytics | No unexplained increase in 4xx/5xx |
| p50/p95 latency | publishing monitoring | publishing monitoring | Canary p95 no worse than baseline by 10% |
| Manifest success rate | sampled iOS/Android requests | sampled iOS/Android requests | 100% valid JSON and platform-correct bodies |
| Wire bytes per bundle/asset | response headers/analytics | response headers/analytics | Compression enabled; material reduction expected |
| Runtime CPU/instance-hours | deployment monitoring | deployment monitoring | Static path should not add mobile runtime work |
| Expo Go open/launch success | QR/manual smoke sample | QR/manual smoke sample | No regression; stop immediately on a failed platform |

Traffic is measured from the deployment analytics path/status counters, not from
origin logs alone. Runtime usage is measured from the deployment monitoring surface,
not inferred from request count. Keep the baseline route live throughout the canary.

## Rollback

Rollback does not require a rebuild or code revert:

1. Set `STATIC_ASSET_CANARY_PERCENT=0` and restart the Node service.
2. Confirm `x-presentail-asset-delivery: node` and `/app/` bundle URLs on iOS and Android.
3. Keep `/app/` serving through `server/serve.js`; its Node bundle variant remains
   available while the static path is investigated.
4. Re-run the iOS and Android manifest checks before attempting another canary.

Do not delete `static-build/` or remove the Node service during the canary. The static
deployment is additive until the two-window comparison and Expo client checks pass.