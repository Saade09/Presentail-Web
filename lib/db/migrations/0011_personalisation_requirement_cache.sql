CREATE TABLE IF NOT EXISTS "personalisation_requirement_cache" (
  "os_numeric_id" text PRIMARY KEY NOT NULL,
  "required" boolean NOT NULL,
  "classified_at" timestamp with time zone NOT NULL DEFAULT now()
);
