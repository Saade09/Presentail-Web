CREATE TABLE IF NOT EXISTS "order_id_sequences" (
  "prefix"   text    PRIMARY KEY,
  "next_val" integer NOT NULL DEFAULT 1000
);

INSERT INTO "order_id_sequences" ("prefix", "next_val")
  VALUES ('LB', 1000), ('AE', 1000), ('CY', 1000)
  ON CONFLICT ("prefix") DO NOTHING;
