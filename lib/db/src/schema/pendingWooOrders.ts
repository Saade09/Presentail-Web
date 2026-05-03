import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const pendingWooOrdersTable = pgTable(
  "pending_woo_orders",
  {
    id: serial("id").primaryKey(),
    appOrderId: text("app_order_id").notNull(),
    paymentRef: text("payment_ref"),
    payload: jsonb("payload").notNull(),
    userId: integer("user_id"),
    deviceId: text("device_id"),
    lastError: text("last_error"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: text("status").notNull().default("pending"),
    wcOrderId: integer("wc_order_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    appOrderIdx: uniqueIndex("pending_woo_orders_app_order_idx").on(
      t.appOrderId,
    ),
    paymentRefIdx: index("pending_woo_orders_payment_ref_idx").on(t.paymentRef),
    dueIdx: index("pending_woo_orders_due_idx").on(t.status, t.nextAttemptAt),
  }),
);

export type PendingWooOrder = typeof pendingWooOrdersTable.$inferSelect;
export type InsertPendingWooOrder = typeof pendingWooOrdersTable.$inferInsert;
