---
name: CyberSource 3DS backend-driven completion
description: How the new cs_payment_attempts table and attempt lifecycle work; key decisions and gotchas for the backend-driven 3DS flow.
---

# CyberSource 3DS backend-driven completion

## The rule
After a 3DS challenge, do NOT rely on browser state. The backend owns the full validate→charge→order chain, keyed by `attemptId` from `cs_payment_attempts`.

**Why:** When the challenge opens a new tab or the iframe navigates top-level, all React/sessionStorage state is gone. Without a persistent server-side record, the order is never created.

## How to apply
- Frontend calls `POST /payment/cybersource/attempt` with full cart snapshot *before* payer-auth setup. Stores `beAttemptId` in a ref (never localStorage/sessionStorage).
- `returnUrl` for enrollment must include `?attempt=<beAttemptId>` so the relay handler finds the record.
- Relay HTML at `/api/payment/cybersource/payer-auth/return` fires `runCsAttemptCompleteChain` async, then serves context-aware HTML:
  - opener → postMessage(CYBERSOURCE_3DS_COMPLETE) + ACK wait + close
  - parent iframe → postMessage(CYBERSOURCE_3DS_COMPLETE) to parent
  - top-level → redirect to `/checkout/payment-resume?attempt=<id>`
- Frontend polls `GET /payment/cybersource/attempt/:id/status` every 2 s (max 45 polls = 90 s).
- `/checkout/payment-resume` page does the same polling for the top-level fallback.

## Key idempotency rules
- `runCsAttemptCompleteChain` returns immediately if status is already `COMPLETED`.
- If status is `AUTHORIZED`, skips validate+charge and only retries order creation.
- DB has unique partial indexes on `cs_authentication_transaction_id` and `cs_request_id` (non-null) — prevents double charge at storage layer.
- If charge succeeds but OS order fails, status stays `AUTHORIZED` → next poll retries order-only (no re-charge).

## Status enum
`CREATED → ENROLLED → CHALLENGE_OPENED → VALIDATED → AUTHORIZED → ORDER_CREATED → OS_SYNCED → COMPLETED | FAILED`

## Frictionless path
When enrollment returns `enrolled: false`, the existing client-side validate→charge flow runs unchanged. Backend completion only activates for `enrolled: true`.

## Concurrency safety
- `runCsAttemptCompleteChain` uses `pg_try_advisory_lock(abs(hashtext(attemptId)))` before the validate+charge phase. If another worker holds the lock, returns "processing in progress" immediately — caller retries via polling.
- Lock is released in a `finally` block via `pg_advisory_unlock`. If the DB connection drops, PostgreSQL releases the lock automatically (session-scoped).
- `sql` must be imported from `drizzle-orm` alongside `eq` to use the advisory lock queries.

## Frontend blocking of missing attemptId
- If `POST /payment/cybersource/attempt` fails or returns no `attemptId`, checkout blocks with `csSetupFailed` toast; the challenge path never proceeds with a client-only UUID.

## ChallengeModal strict attemptId correlation
- `CyberSourceChallengeModal` accepts `expectedAttemptId?: string | null` prop.
- When `expectedAttemptId` is set: reject messages where `payload["attemptId"]` is missing, not a string, or doesn't match exactly (no exceptions).
- Checkout.tsx passes `expectedAttemptId={csPaymentAttemptIdRef.current}`.

## Concurrent polling + cancel pattern (Checkout.tsx challenge path)
- When `beAttemptId` is set, challenge opens a `new Promise` that resolves on whichever comes first: background poll finds COMPLETED/FAILED/timeout, or modal cancel.
- A `settled` flag prevents double-resolution from concurrent paths.
- Polling runs 45 × 2 s = 90 s max regardless of postMessage timing.

## Same-tab refresh recovery
- `CS_3DS_ATTEMPT_KEY = "cs_3ds_active_attempt_id"` is written to sessionStorage when the challenge modal opens; cleared on completion/failure.
- On checkout mount, if sessionStorage has a valid attempt ID, `csRecoveryAttemptId` state is initialized and triggers a `useEffect` that immediately shows `authorization_pending` + polls the status endpoint.
- The `beforeunload` handler does NOT clear sessionStorage (intentional — leave it for recovery on remount).

## Active retry polling pattern
- Polling loops (challenge path, recovery effect, CheckoutPaymentResume) call GET /status first.
- If status is AUTHORIZED, ORDER_CREATED, or OS_SYNCED → also POST /attempt/:id/complete to drive order-creation retry.
- Pre-AUTHORIZED states (ENROLLED/CHALLENGE_OPENED/VALIDATED) only poll status; relay fires /complete for those.
- Advisory lock ensures only one /complete execution runs concurrently; multiple frontend calls are safe.

## Callback TransactionId correlation
- `handlePayerAuthChallengeReturn` looks up `csAuthenticationTransactionId` from DB before firing the chain.
- If storedTxnId and receivedTxnId both non-empty and differ → `shouldRunChain = false`, logs a warning.
- Relay HTML is always served regardless of match (browser tab must close/redirect even on mismatch).
- On DB lookup failure → fail-open (still fires chain) to avoid blocking legitimate payments.

## Known gaps
- Reconcile endpoint needs e2e test against a real Business Center authorization.
- No persistent retry if the browser tab is fully closed (not refreshed) during challenge; user must re-enter card details.
