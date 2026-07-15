import {
  boolean,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const pageContextualDescriptionsTable = pgTable(
  "page_contextual_descriptions",
  {
    id: serial("id").primaryKey(),
    pageType: text("page_type").notNull().$type<"category" | "occasion">(),
    pageSlug: text("page_slug").notNull(),
    deliveryAreaId: text("delivery_area_id").notNull(),
    language: text("language").notNull().$type<"en" | "ar" | "fr">(),
    description: text("description"),
    isManualOverride: boolean("is_manual_override").notNull().default(false),
    generationStatus: text("generation_status")
      .notNull()
      .default("pending")
      .$type<"pending" | "generating" | "done" | "failed">(),
    failureReason: text("failure_reason"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqueIdx: uniqueIndex("page_contextual_descriptions_unique_idx").on(
      t.pageType,
      t.pageSlug,
      t.deliveryAreaId,
      t.language,
    ),
  }),
);

export type PageContextualDescriptionRow =
  typeof pageContextualDescriptionsTable.$inferSelect;
export type InsertPageContextualDescription =
  typeof pageContextualDescriptionsTable.$inferInsert;
