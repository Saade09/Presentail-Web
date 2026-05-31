import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const imageDimsTable = pgTable("image_dims", {
  url: text("url").primaryKey(),
  width: integer("width"),
  height: integer("height"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ImageDimsRow = typeof imageDimsTable.$inferSelect;
export type InsertImageDims = typeof imageDimsTable.$inferInsert;
