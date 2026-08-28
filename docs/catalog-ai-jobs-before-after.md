# Catalog AI jobs: before/after report

## Scope and measurement method

This report covers the production catalog AI workflows only: full product translation, batch product-name translation, banner translation, category/occasion translation, product color inference, bear-size inference, newborn-gender inference, personalisation-required inference, plant-environment inference, and page-description generation.

The baseline was reconstructed from the pre-change call sites and existing caches. Verification used deterministic provider doubles so prompts, credentials, customer data, and full responses were never logged or exported. Production latency and pricing are intentionally not invented; the new token telemetry makes those values measurable from real traffic after release.

## Before

| Measure | Baseline |
| --- | --- |
| Model call sites | 10 chat-completion paths across 9 modules |
| Client construction | 9 separate builders with two credential-selection patterns |
| Explicit per-attempt timeout | 2/10 paths |
| Bounded retries | 1/10 paths |
| In-flight deduplication | Full product translation and category/occasion translation only |
| Persistent/reusable cache | Existing DB caches for product translations and selected classifiers; process caches for banners, names, bear size, and newborn gender |
| Token visibility | None |
| Latency/retry/timeout visibility | Inconsistent free-form warnings |
| Failure bound | Seven paths could wait for the SDK/network default; one path allowed up to about 47.5 seconds over three attempts |
| Logged model content | Several malformed-output warnings included the full response body |

## After

| Measure | Result |
| --- | --- |
| Model call sites | All 10 use the shared request boundary |
| Client construction | One lazy process-wide managed client |
| Explicit per-attempt timeout | 10/10 paths, 15 seconds |
| Bounded retries | 10/10 paths, at most two retries for timeout, transport, 408/409/429, and 5xx failures |
| In-flight deduplication | All safe batch/request paths use content-keyed in-flight sharing; active entries are never evicted, cleanup is identity-safe, and new unique work is rejected at bounded capacity |
| Cache behavior | Existing DB and in-process cache formats and TTLs are unchanged; deterministic rules still run before model calls |
| Token visibility | Input, output, and total tokens recorded when returned by the provider |
| Observability | Distinct structured invocation, cache-status, provider-request, and fallback events with workflow, model, call count, latency, retries, timeout, token usage, and outcome |
| Failure bound | SDK retries are disabled; at most three 15-second attempts plus 250/500 ms backoff (about 45.75 seconds worst case) |
| Privacy | No credentials, prompts, product/customer text, or full model responses in catalog AI telemetry |

## Representative call and cost comparison

These are deterministic workload estimates based on call counts; token totals vary with live catalog text.

| Workload | Before | After | Estimated effect |
| --- | ---: | ---: | --- |
| Five concurrent identical cold banner/category/classifier requests | Up to 5 model calls | 1 model call | Up to 80% lower model-call cost and duplicate token use |
| Repeated warm request with an existing cache | 0 model calls | 0 model calls | No behavior or cost change |
| 100 product names in 50-item chunks | 2 model calls | 2 model calls | Same token/call cost; each call is now bounded and observable |
| One transient 503 followed by success | SDK/default-dependent or no retry on most paths | 2 calls, one recorded retry | Small bounded retry cost in exchange for higher completion rate |
| Persistent transient failure | SDK/default-dependent | 3 calls maximum | Cost and latency capped |

The absolute estimated cost for a completed request is now calculable as:

`(input tokens × active model input rate) + (output tokens × active model output rate)`

Because Replit-managed provider/model rates can change, dashboards should apply the current configured rates to the emitted token counts rather than hard-coding a stale price here. For duplicate bursts, the relative estimate is stable: one shared call costs approximately 20% of five identical calls.

## Failure and retry comparison

Before this change, retry and timeout rates could not be calculated consistently. After release:

- provider failure rate = `catalog_ai_provider_request outcome=error / all catalog_ai_provider_request events`
- fallback rate = `catalog_ai_workflow_fallback events / catalog_ai_workflow_invocation events`
- retry rate = `sum(retries) / sum(callCount)` over `catalog_ai_provider_request`
- timeout rate = `timedOut=true / all catalog_ai_provider_request events`
- item cache-hit rate = `sum(cacheHitCount) / (sum(cacheHitCount) + sum(cacheMissCount))`

## Behavior compatibility

- Existing model choices, prompts, completion budgets, translation wording, classifier rules, cache tables, cache keys, TTLs, and caller fallback values are unchanged.
- Empty/deterministic inputs still avoid model calls.
- Malformed output remains fail-open and is not persisted as a successful classification.
- Page descriptions still return `null` for the queue to replace with its deterministic fallback.