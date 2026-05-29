-- Migration: store sender phone on app_orders for SMS/WhatsApp delivery updates
--
-- This repo uses `drizzle-kit push` for schema changes in development (see
-- `pnpm --filter @workspace/db run push`). This file is the canonical SQL
-- to apply against environments where push is not run (e.g. production)
-- and a permanent record of the schema change.
--
-- Idempotent: uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS so it is safe
-- to run multiple times.

-- ── app_orders.sender_phone ──────────────────────────────────────────────────
-- Stores the billing phone (E.164) of the person who placed the order. Used by
-- the SMS/WhatsApp delivery-update notifier (lib/smsNotify.ts) so it can reach
-- the sender when an order state changes without a round-trip to WooCommerce.
-- Nullable for legacy rows and guest orders where no phone was captured.
ALTER TABLE app_orders
  ADD COLUMN IF NOT EXISTS sender_phone text;
