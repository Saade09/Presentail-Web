import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Co-purchase affinity scores between product pairs.
 *
 * Each row represents a unique unordered pair of product slugs that appeared
 * together in at least one order. The pair is stored in canonical alphabetical
 * order (`slug_a < slug_b`) so each pair has exactly one row.
 *
 * Populated by `scripts/src/computeProductAffinity.ts` and kept fresh by a
 * nightly recompute job wired in the API server.
 */
export const productPairAffinityTable = pgTable(
  "product_pair_affinity",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    productSlugA: text("product_slug_a").notNull(),
    productSlugB: text("product_slug_b").notNull(),
    coPurchaseCount: integer("co_purchase_count").notNull().default(0),
    lastComputedAt: timestamp("last_computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pairUniqueIdx: uniqueIndex("product_pair_affinity_pair_idx").on(
      t.productSlugA,
      t.productSlugB,
    ),
    slugAIdx: index("product_pair_affinity_slug_a_idx").on(t.productSlugA),
    slugBIdx: index("product_pair_affinity_slug_b_idx").on(t.productSlugB),
  }),
);

export type ProductPairAffinity = typeof productPairAffinityTable.$inferSelect;
export type InsertProductPairAffinity =
  typeof productPairAffinityTable.$inferInsert;
