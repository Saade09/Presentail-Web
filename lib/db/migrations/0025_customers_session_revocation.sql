-- Invalidate server-issued bearer sessions when a customer completes a
-- password reset. Existing tokens without a version are treated as version 0.
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "session_version" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "session_revoked_at" timestamptz;