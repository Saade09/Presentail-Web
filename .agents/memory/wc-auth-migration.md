---
name: WC auth migration (Phase 4)
description: WC_AUTH_ENABLED feature flag pattern — how local-only auth works after WC is severed.
---

# WC Auth Migration (Phase 4)

## The pattern

`WC_AUTH_ENABLED` env var (default false/unset) gates all remaining WooCommerce/WordPress auth calls.
Read via `isWcAuthEnabled()` in `artifacts/api-server/src/lib/auth.ts`.

**Truthy**: `"1"` / `"true"` / `"yes"` — enables legacy WP JWT login and WC sync.
**Falsy**: unset / `""` / `"0"` / `"false"` — local-only mode, /auth/login returns 410.

## JWT shape

`signServerToken` with `localCustomer: true` sets `local_customer: true` + `local_customer_id` in payload.
`verifyServerToken` extracts `localCustomerId` from `local_customer_id` claim.
Routes that need to identify a customer check `auth.localCustomerId` first, then fall back to `auth.customerId` (WC id).

## Key behaviour by route

- `/auth/login` → 410 Gone, code `login_deprecated` (mobile AuthContext surfaces friendly message)
- `/auth/register` → creates local customer row, skips WC; calls `ensureClerkUserInBackground`
- `/auth/exists` → `classifyAuthExists` called with `localOnly: !wcAuthEnabled`; local miss = definitive `exists_false`
- `/auth/me` GET → resolves via `auth.localCustomerId` → `getCustomerById` → `getCustomerByWcId` (transition)
- `/auth/me` PUT → patches `customersTable` by `id` when `auth.localCustomerId` is set or WC disabled
- `/auth/me` DELETE → anonymises local row only; best-effort Clerk delete; no WC REST calls
- `issueSocialSession` → skips `syncCustomerToWoo` when WC disabled

## Migration prerequisites before setting WC_AUTH_ENABLED=false in prod

1. Run `pnpm --filter @workspace/scripts run backup-before-migration`
2. Run `pnpm --filter @workspace/scripts run audit-wc-customers` → confirm wc_only count
3. Run `pnpm --filter @workspace/scripts run import-wc-customers` (--dry-run first)
4. Re-audit until 0 wc_only rows remain

**Why:** Setting the flag before import means returning WC-only shoppers get routed to sign-up (bad).

## Migration log table

`wp_customer_id_map` in `lib/db/src/schema/wpCustomerIdMap.ts` records each imported WC customer row.
Exported from `lib/db/src/schema/index.ts`.
