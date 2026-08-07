---
name: Prod internal API base URL
description: Web serve.mjs → API server fetches fail in production if pointed at localhost:80; must use the public apex domain.
---

**Rule:** In production, the web and API artifacts run as SEPARATE autoscale deployments — there is no localhost path-routing proxy. Any server-side fetch from serve.mjs to `/api/...` must go through the public apex (`https://presentail.com`), where edge routing sends `/api` to the API deployment.

**Why:** `INTERNAL_API_BASE_URL` defaulted to `http://localhost:80` (dev-container proxy). In prod every entity fetch silently failed → product/category pages emitted Organization-only JSON-LD (no Product/BreadcrumbList/ItemList) and sitemaps served the static fallback with zero product/category URLs (Aug 2026, found by user on live site).

**How to apply:** serve.mjs has `resolveInternalApiBaseUrl()` (env override → prod: first REPLIT_DOMAINS entry → dev: localhost:80), and the production env var `INTERNAL_API_BASE_URL=https://presentail.com` is set explicitly as a safeguard against REPLIT_DOMAINS ordering. Any new server-side catalog fetch must use `INTERNAL_API_BASE_URL`, and prod symptoms of "generic SEO output everywhere but public API fine" should point here first. Test prod-path locally with `NODE_ENV=production REPLIT_DOMAINS=presentail.com node serve.mjs`.
