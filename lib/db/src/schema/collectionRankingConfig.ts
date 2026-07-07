import {
  boolean,
  index,
  jsonb,
  pgTable,
  real,
  serial,
  smallint,
  text,
} from "drizzle-orm/pg-core";

/**
 * Per-slug ranking configuration for homepage category and occasion carousels.
 *
 * A row controls how one slug is ranked relative to its peers:
 *   - manualBoost: additive bonus applied on top of the computed performance score
 *   - pinnedPosition: when set, this item is placed at this 1-based index
 *     after the performance-based sort (1 = first)
 *   - hiddenOverride: when true the slug is excluded entirely regardless of score
 *   - seasonalBoosts: array of date-window boosts active only within their window
 *   - countryCode: when null the row is a global default; a specific countryCode
 *     row takes precedence over the global row for that country
 */
export const collectionRankingConfigTable = pgTable(
  "collection_ranking_config",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull().$type<"category" | "occasion">(),
    slug: text("slug").notNull(),
    countryCode: text("country_code"),
    manualBoost: real("manual_boost").notNull().default(0),
    pinnedPosition: smallint("pinned_position"),
    hiddenOverride: boolean("hidden_override").notNull().default(false),
    seasonalBoosts: jsonb("seasonal_boosts")
      .$type<Array<{ label: string; startMmDd: string; endMmDd: string; boost: number }>>()
      .default([]),
  },
  (t) => ({
    kindSlugIdx: index("collection_ranking_config_kind_slug_idx").on(t.kind, t.slug),
    kindSlugCountryIdx: index("collection_ranking_config_kind_slug_country_idx").on(
      t.kind,
      t.slug,
      t.countryCode,
    ),
  }),
);

export type CollectionRankingConfigRow = typeof collectionRankingConfigTable.$inferSelect;
export type InsertCollectionRankingConfigRow = typeof collectionRankingConfigTable.$inferInsert;
