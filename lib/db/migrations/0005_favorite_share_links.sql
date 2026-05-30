-- Migration: shareable favorites wish-list links
--
-- This repo uses `drizzle-kit push` for schema changes in development (see
-- `pnpm --filter @workspace/db run push`). This file is the canonical SQL
-- to apply against environments where push is not run (e.g. production)
-- and a permanent record of the schema change.
--
-- Idempotent: all statements use IF NOT EXISTS so it is safe to run
-- multiple times without error.

-- ── favorite_share_links ──────────────────────────────────────────────────────
-- One share link per customer. The token is a 32-char hex string generated
-- with crypto.randomBytes(16). Links expire 30 days after the most recent
-- POST /api/me/favorites/share call (the expiry is refreshed on each call
-- while the token is still valid; a new token is minted once it expires).
-- The GET /api/favorites/share/:token endpoint is public (no auth required).
CREATE TABLE IF NOT EXISTS favorite_share_links (
  id          serial PRIMARY KEY,
  token       text        NOT NULL,
  customer_id integer     NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS favorite_share_links_token_idx
  ON favorite_share_links (token);

CREATE UNIQUE INDEX IF NOT EXISTS favorite_share_links_customer_idx
  ON favorite_share_links (customer_id);
