---
name: API server test mocking patterns
description: Key pitfalls and patterns for vitest mocks in the api-server test suite
---

## pino-http in clerkShim-style tests (vi.resetModules)

Mock `pino-http` directly, NOT the logger module:

```ts
vi.mock("pino-http", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));
```

**Why:** `pinoHttp()` reads `logger.values` and `logger.levels` (pino internals) synchronously when building the middleware. A plain object `{ info, warn, error }` mock crashes with `Cannot read properties of undefined (reading 'values')`. Mocking pino-http at the outer level sidesteps this entirely. Avoid mocking `../src/lib/logger` — its shape is not sufficient for pino-http.

## wooWebhook must be mocked in clerkShim

`vi.mock("../src/routes/wooWebhook", () => ({ default: noopHandler }))` is required whenever `src/app.ts` is dynamically imported in tests. Without it, wooWebhook's transitive imports (db, push, etc.) run and cause hangs.

## woo.order — country forwarding tests after OS migration

Route now calls `attemptCreateOsOrder(body, ...)` instead of WC fetch. Country forwarding assertions must target the OS mock call args, not the WC fetch spy:

```ts
import { attemptCreateOsOrder } from "../src/lib/wooOrders";
const sentBody = vi.mocked(attemptCreateOsOrder).mock.calls[0][0];
expect(sentBody.billingCountry).toBe("AE");
```

`billingCountry`/`shippingCountry` are `undefined` in the OS body when the client omits them (the LB default lives inside the OS submission logic, not the route body).

## recordSuccessfulWcOrder — do not mock in appDeviceId tests

Do NOT put `recordSuccessfulWcOrder` in the wooOrders `vi.mock` block when DB-insert assertions are needed. The real implementation calls `db.insert(...)` which is already mocked via `dbMock`; mocking `recordSuccessfulWcOrder` as a no-op suppresses those DB calls.

## syncCustomerToWoo failure is non-fatal (post-OS migration)

The woo.ts route wraps `syncCustomerToWoo` in a try/catch that logs a warning and proceeds. Tests expecting 502 `customer_sync_failed` must be updated to expect 200.
