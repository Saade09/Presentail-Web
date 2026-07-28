CREATE TABLE IF NOT EXISTS "cs_payment_attempts" (
  "attempt_id" text PRIMARY KEY NOT NULL,
  "order_id" text,
  "os_order_id" text,
  "cart_snapshot" jsonb,
  "customer_id" text,
  "guest_session_id" text,
  "amount" text NOT NULL,
  "currency" text NOT NULL,
  "cs_authentication_transaction_id" text,
  "cs_request_id" text,
  "status" text DEFAULT 'CREATED' NOT NULL,
  "error_details" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "cs_payment_attempts_cs_auth_txn_idx"
  ON "cs_payment_attempts" ("cs_authentication_transaction_id")
  WHERE "cs_authentication_transaction_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "cs_payment_attempts_cs_request_id_idx"
  ON "cs_payment_attempts" ("cs_request_id")
  WHERE "cs_request_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "cs_payment_attempts_status_idx"
  ON "cs_payment_attempts" ("status");

CREATE INDEX IF NOT EXISTS "cs_payment_attempts_created_at_idx"
  ON "cs_payment_attempts" ("created_at");
