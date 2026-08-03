-- Migration: freeze cs_payment_attempts as read-only legacy data
--
-- The CyberSource payment integration has been removed from the active codebase.
-- This table contains historical 3DS transaction records that must remain
-- readable for order-history display but must no longer receive new rows.
--
-- No application code inserts into this table after this migration.
-- The Drizzle schema (lib/db/src/schema/csPaymentAttempts.ts) is retained
-- for read-only display queries on historical orders only.
--
-- A trigger function rejects all INSERT, UPDATE, and DELETE operations
-- so existing rows are fully preserved and no new rows can be added,
-- even if application code accidentally references this table.

CREATE OR REPLACE FUNCTION cs_payment_attempts_readonly()
  RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  RAISE EXCEPTION
    'cs_payment_attempts is a legacy read-only table. '
    'The CyberSource integration was removed on 2026-08-03. '
    'INSERT, UPDATE, and DELETE are not permitted.';
END;
$$;

CREATE TRIGGER cs_payment_attempts_no_write
  BEFORE INSERT OR UPDATE OR DELETE ON cs_payment_attempts
  FOR EACH ROW EXECUTE FUNCTION cs_payment_attempts_readonly();

COMMENT ON TABLE cs_payment_attempts IS
  'Legacy read-only table: CyberSource 3DS payment attempts recorded before '
  'the CyberSource integration was removed (2026-08-03). All writes are blocked '
  'by trigger cs_payment_attempts_no_write. See lib/db/migrations/0018_cs_legacy_readonly.sql.';
