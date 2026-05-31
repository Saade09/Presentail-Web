CREATE TABLE IF NOT EXISTS "image_dims" (
  "url"        text PRIMARY KEY,
  "width"      integer,
  "height"     integer,
  "fetched_at" timestamptz NOT NULL DEFAULT now()
);
