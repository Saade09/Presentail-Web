import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const personalisationRequirementCacheTable = pgTable("personalisation_requirement_cache", {
  osNumericId: text("os_numeric_id").primaryKey(),
  required: boolean("required").notNull(),
  classifiedAt: timestamp("classified_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PersonalisationRequirementCacheRow = typeof personalisationRequirementCacheTable.$inferSelect;
export type InsertPersonalisationRequirementCache = typeof personalisationRequirementCacheTable.$inferInsert;
