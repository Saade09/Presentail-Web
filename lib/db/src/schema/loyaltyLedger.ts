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

// Per-customer loyalty points ledger. One row per credit / reversal so the
// running balance is auditable. The current balance is computed as the sum of
// `points` across rows for a customer (credits are positive, reversals are
// negative). Reasons:
//   - "order_delivered": credit when an order moves to delivered.
//   - "order_reversed":  reversal when a delivered order is cancelled or
//                        refunded.
//   - "backfill":        one-shot credit emitted by the backfill script.
//
// Idempotency contract: `(customerId, source, reason)` is unique. Source is
// `${storeKey}:${wcOrderId}` for order-driven entries (e.g. "abudhabi:12345").
// `storeKey` (lebanon|dubai|abudhabi|cyprus) is used instead of country
// because Dubai and Abu Dhabi are separate WooCommerce stores that both
// resolve to country `AE` — using country as the source key would let the
// same `wcOrderId` collide between those stores and silently drop credits.
export const loyaltyLedgerTable = pgTable(
  "loyalty_ledger",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    points: integer("points").notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull(),
    wcOrderId: integer("wc_order_id"),
    storeKey: text("store_key"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    customerIdx: index("loyalty_ledger_customer_idx").on(t.customerId),
    sourceUniq: uniqueIndex("loyalty_ledger_source_uniq").on(
      t.customerId,
      t.source,
      t.reason,
    ),
  }),
);

export type LoyaltyLedgerRow = typeof loyaltyLedgerTable.$inferSelect;
export type InsertLoyaltyLedgerRow = typeof loyaltyLedgerTable.$inferInsert;
