-- Account lifecycle columns:
--   deleted_at              — soft-delete tombstone; set on account deletion
--   email_verified          — false until the user clicks the verification link
--   email_verification_token / email_verification_token_expires_at
--                           — single-use 32-byte hex token issued at registration

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "email_verification_token" text,
  ADD COLUMN IF NOT EXISTS "email_verification_token_expires_at" timestamp with time zone;
