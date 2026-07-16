import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const plantEnvironmentCacheTable = pgTable("plant_environment_cache", {
  osProductId: text("os_product_id").primaryKey(),
  classification: text("classification").notNull().$type<"indoor" | "outdoor">(),
  source: text("source").notNull().$type<"ai" | "admin" | "fallback">(),
  needsReview: boolean("needs_review").notNull().default(false),
  contentHash: text("content_hash").notNull(),
  classifiedAt: timestamp("classified_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PlantEnvironmentCacheRow = typeof plantEnvironmentCacheTable.$inferSelect;
export type InsertPlantEnvironmentCache = typeof plantEnvironmentCacheTable.$inferInsert;
