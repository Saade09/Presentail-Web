-- Migration: OS daily price snapshots for restart-proof price-change warning
--
-- This repo uses `drizzle-kit push` for schema changes in development (see
-- `pnpm --filter @workspace/db run push`). This file is the canonical SQL
-- to apply against environments where push is not run (e.g. production)
-- and a permanent record of the schema change.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS
-- so it is safe to run multiple times.

-- ── os_price_snapshots ──────────────────────────────────────────────────────
-- One row per (product_id, snapshot_date). Stores the USD base price for each
-- Presentail OS product as it was at the time of the daily snapshot write.
--
-- Purpose: the admin funnels dashboard warns operators when a upsell product's
-- price has changed since "yesterday". Previously this baseline was an
-- in-memory Map that reset on every server restart, making the warning useless
-- after deploys or crashes. Persisting one row per product per UTC day lets
-- the server re-seed the baseline from the DB at startup so the day-over-day
-- delta is always accurate regardless of restart frequency.
--
-- Retention: rows older than 7 days are pruned by the wooSync worker on each
-- daily persist so the table stays small (O(product_count) active rows).
CREATE TABLE IF NOT EXISTS os_price_snapshots (
  id            serial PRIMARY KEY,
  product_id    text NOT NULL,
  snapshot_date text NOT NULL,   -- YYYY-MM-DD UTC
  price_usd     real NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

-- Enforces first-write-wins: subsequent inserts for the same (product, day)
-- are silently discarded via ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS os_price_snapshots_product_date_uniq
  ON os_price_snapshots (product_id, snapshot_date);

-- Used by the startup seed query: find the most recent snapshot_date < today.
CREATE INDEX IF NOT EXISTS os_price_snapshots_date_idx
  ON os_price_snapshots (snapshot_date);
