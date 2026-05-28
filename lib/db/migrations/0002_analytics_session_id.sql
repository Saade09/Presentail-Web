-- Migration: add session_id to analytics_events
--
-- This repo uses `drizzle-kit push` for schema changes in development (see
-- `pnpm --filter @workspace/db run push`). This file is the canonical SQL
-- to apply against environments where push is not run (e.g. production)
-- and a permanent record of the schema change.
--
-- Idempotent: uses ADD COLUMN IF NOT EXISTS so it is safe to run multiple times.

-- ── analytics_events.session_id ────────────────────────────────────────────
-- Client-generated UUID v4 session identifier. Created once per app launch
-- (mobile) or page load (web) and attached to every analytics event so
-- upsell_item_added → order_placed attribution can be computed at the session
-- level rather than the coarser (platform, day) co-occurrence approximation.
--
-- Nullable: events from clients predating this field have session_id = NULL.
-- Those rows are excluded from the session-level attribution query so old
-- traffic never dilutes the conversion rate.
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS session_id text;
