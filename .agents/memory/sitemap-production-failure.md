---
name: Sitemap production failure root cause
description: Why the production sitemap serves only 272 static URLs instead of catalog URLs
---

## The rule

`INTERNAL_API_BASE_URL` must be set in production env vars AND a deployment must happen after it is set for the running server to use it. Setting the env var without redeploying has no effect on the running process.

## Why

`INTERNAL_API_BASE_URL` is read at module load time (const, line 91 of serve.mjs). The production autoscale instance caches this value for its lifetime. If the env var was added to the Replit environment but no new publish happened, the running server still uses the old fallback (`https://${REPLIT_DOMAINS}` = `.replit.dev` subdomain). The `.replit.dev` domain serves the web artifact (no API path routing), so all three `fetchSitemapJson` calls get SPA HTML, JSON parse fails, all three return null, and `generateSitemap` returns a valid but catalog-free 272-URL sitemap. This gets cached as "fresh" and is served for 15 minutes per TTL.

## How to apply

Whenever the sitemap is wrong and `INTERNAL_API_BASE_URL` is already set in the Replit env, check whether the production instance was redeployed AFTER the env var was set. If not, the fix is to deploy (not just set the env var). After deployment, the sitemap regenerates with real catalog data (1476+ URLs in local serve.mjs test with LB catalog).

## Hardening added

`generateSitemap()` in sitemap.mjs now throws when all 3 catalog fetches return null, so `resolveSitemap` serves stale/static-fallback and retries after 5 min instead of caching the empty result as fresh.
