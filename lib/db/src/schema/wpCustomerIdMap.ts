import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { customersTable } from "./customers";

// Migration log for the WP → local DB customer import.
// Records one row per WC customer processed by the import script so ops
// can track which rows were created, which already existed, and which
// were skipped. The `wcCustomerId` is the WooCommerce `customers.id`.
// `wcStoreKey` is one of "lebanon" | "dubai" | "abudhabi" | "cyprus".
// `status` is one of "imported" | "already_exists" | "skipped_duplicate" | "failed".
// Retained indefinitely as a historical cross-reference.
export const wpCustomerIdMapTable = pgTable(
  "wp_customer_id_map",
  {
    id: serial("id").primaryKey(),
    customersId: integer("customers_id").references(() => customersTable.id),
    wcCustomerId: integer("wc_customer_id"),
    wcStoreKey: text("wc_store_key"),
    status: text("status").notNull(),
    notes: text("notes"),
    migratedAt: timestamp("migrated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    customersIdx: index("wp_customer_id_map_customers_idx").on(t.customersId),
    wcCustomerIdx: index("wp_customer_id_map_wc_customer_idx").on(t.wcCustomerId),
    storeIdx: index("wp_customer_id_map_store_idx").on(t.wcStoreKey),
  }),
);

export type WpCustomerIdMap = typeof wpCustomerIdMapTable.$inferSelect;
export type InsertWpCustomerIdMap = typeof wpCustomerIdMapTable.$inferInsert;
