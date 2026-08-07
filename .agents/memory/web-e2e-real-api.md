---
name: Web e2e against the real dev API
description: Patterns for Playwright specs that must exercise the real API server (auth/token behaviour) instead of page.route stubs.
---

# E2E specs that need the real API server

Most presentail-web e2e specs stub `/api` via page.route. When the behaviour under test lives in the API server itself (e.g. JWT verification), stubs defeat the purpose — run against the dev proxy (`http://localhost:80`, web + API workflows running).

**Rules learned:**
- `POST /auth/register` is rate-limited to 5/hour per IP. Never register a fresh account per run/retry/project — reuse a fixed per-project email: try `/auth/login` first, register only on the first-ever run. Only clean up seeded data, keep the account.
- Seed `app_orders` rows directly via `pg` (a presentail-web dependency) + `DATABASE_URL` rather than driving checkout (checkout would create real OS orders). Leave `wc_order_id`/`os_order_id` null so `/me/orders` skips external enrichment.
- Store context is sent by `apiFetch` via `x-store-country` / `x-store-city` headers derived from `presentail_delivery_location_v1`; the same headers on register/login pick the store whose baseUrl lands in the JWT's `store_base_url` claim.
- Auth session in the browser = localStorage `presentail_web_token` + `presentail_web_provider` set via addInitScript.

# AuthContext restore race (fixed Aug 2026)

The `/auth/me` token-restore effect must commit `setUser` and `setIsLoading(false)` in the SAME React update (both inside `startTransition`). Splitting them (user in a transition, isLoading in `finally`) let React commit `isLoading=false, user=null` first, so a signed-in user direct-loading `/account` was bounced to `/sign-in`.
