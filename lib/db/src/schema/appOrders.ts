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

export const appOrdersTable = pgTable(
  "app_orders",
  {
    id: serial("id").primaryKey(),
    appOrderId: text("app_order_id").notNull(),
    wcOrderId: integer("wc_order_id"),
    userId: integer("user_id"),
    customerId: integer("customer_id").references(() => customersTable.id, {
      onDelete: "set null",
    }),
    deviceId: text("device_id"),
    recipientName: text("recipient_name"),
    deliveryDate: text("delivery_date"),
    deliverySlot: text("delivery_slot"),
    state: text("state").notNull().default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    appOrderIdx: uniqueIndex("app_orders_app_order_idx").on(t.appOrderId),
    wcOrderIdx: index("app_orders_wc_order_idx").on(t.wcOrderId),
    userIdx: index("app_orders_user_idx").on(t.userId),
    customerIdx: index("app_orders_customer_idx").on(t.customerId),
  }),
);

export type AppOrder = typeof appOrdersTable.$inferSelect;
export type InsertAppOrder = typeof appOrdersTable.$inferInsert;
