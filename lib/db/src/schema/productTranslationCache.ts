import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

/**
 * Persistent cache of AI product translations (name + description) so the
 * cache survives restarts and is shared across autoscale replicas — the
 * in-process Map alone meant every replica/deploy re-translated the whole
 * catalog, and cold caches under crawler load caused English fallbacks on
 * localized pages (hreflang/content mismatch).
 */
export const productTranslationCacheTable = pgTable(
  "product_translation_cache",
  {
    osProductId: text("os_product_id").notNull(),
    lang: text("lang").notNull().$type<"ar" | "fr">(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    translatedAt: timestamp("translated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.osProductId, t.lang] })],
);

export type ProductTranslationCacheRow =
  typeof productTranslationCacheTable.$inferSelect;
export type InsertProductTranslationCache =
  typeof productTranslationCacheTable.$inferInsert;
