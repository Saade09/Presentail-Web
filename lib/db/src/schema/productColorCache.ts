import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const productColorCacheTable = pgTable("product_color_cache", {
  productSlug: text("product_slug").primaryKey(),
  productNameHash: text("product_name_hash").notNull(),
  inferredColor: text("inferred_color"),
  inferredAt: timestamp("inferred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProductColorCacheRow = typeof productColorCacheTable.$inferSelect;
export type InsertProductColorCache = typeof productColorCacheTable.$inferInsert;
