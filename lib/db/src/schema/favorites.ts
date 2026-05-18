import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { customersTable } from "./customers";

export const favoritesTable = pgTable(
  "favorites",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    productSlug: text("product_slug").notNull(),
    countryCode: text("country_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    customerProductIdx: uniqueIndex("favorites_customer_product_idx").on(
      t.customerId,
      t.productSlug,
    ),
    customerIdx: index("favorites_customer_idx").on(t.customerId),
  }),
);

export type Favorite = typeof favoritesTable.$inferSelect;
export type InsertFavorite = typeof favoritesTable.$inferInsert;
