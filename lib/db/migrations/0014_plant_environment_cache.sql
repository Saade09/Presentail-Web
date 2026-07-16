CREATE TABLE IF NOT EXISTS "plant_environment_cache" (
  "os_product_id" text PRIMARY KEY NOT NULL,
  "classification" text NOT NULL,
  "source" text NOT NULL DEFAULT 'heuristic',
  "needs_review" boolean NOT NULL DEFAULT false,
  "content_hash" text NOT NULL DEFAULT '',
  "classified_at" timestamp with time zone NOT NULL DEFAULT now()
);
