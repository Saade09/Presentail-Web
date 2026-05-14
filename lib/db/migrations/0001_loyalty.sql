-- Migration: loyalty points scheme (Task #378)
--
-- This repo uses `drizzle-kit push` for schema changes in development (see
-- `pnpm --filter @workspace/db run push`). This file is the canonical SQL
-- to apply against environments where push is not run (e.g. production)
-- and a permanent record of the schema changes that introduce loyalty.
--
-- Idempotent: every statement uses IF [NOT] EXISTS so it is safe to run
-- multiple times.

-- ── loyalty_ledger ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id              serial PRIMARY KEY,
  customer_id     integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  points          integer NOT NULL,
  reason          text NOT NULL,
  source          text NOT NULL,
  wc_order_id     integer,
  store_key       text,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loyalty_ledger_customer_idx
  ON loyalty_ledger (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_source_uniq
  ON loyalty_ledger (customer_id, source, reason);

-- ── loyalty_coupons ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_coupons (
  id                 serial PRIMARY KEY,
  customer_id        integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tier               text NOT NULL,
  discount_percent   integer NOT NULL,
  wc_coupon_id       integer,
  code               text NOT NULL,
  store_key          text,
  status             text NOT NULL DEFAULT 'active',
  wc_usage_count     integer NOT NULL DEFAULT 0,
  last_synced_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loyalty_coupons_customer_idx
  ON loyalty_coupons (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_coupons_code_uniq
  ON loyalty_coupons (code);
-- Only one row may be `active` per (customer, tier) at a time.
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_coupons_active_per_tier_uniq
  ON loyalty_coupons (customer_id, tier)
  WHERE status = 'active';

-- ── app_orders.store_key ───────────────────────────────────────────────
-- Required by the loyalty engine: Dubai and Abu Dhabi share country code AE,
-- so the canonical store key is needed to disambiguate ledger source keys.
ALTER TABLE app_orders ADD COLUMN IF NOT EXISTS store_key text;
