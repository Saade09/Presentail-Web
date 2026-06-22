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
    // Source platform that placed the order ("ios" / "android" / "web" / null
    // for legacy rows). Used to break revenue down per platform on the admin
    // funnel dashboard alongside the analytics-event counts.
    platform: text("platform"),
    // Authoritative order total in USD cents (catalog subtotal + delivery fee
    // + express surcharge + non-catalog fee items). USD is the canonical wire
    // currency on this codebase; presented currency is a display concern only.
    // Nullable for legacy rows created before the column existed.
    totalUsdCents: integer("total_usd_cents"),
    // Canonical store key the order was placed against
    // (lebanon|dubai|abudhabi|cyprus). Required for loyalty crediting because
    // Dubai and Abu Dhabi share country code AE — using the country alone
    // would let their wcOrderIds collide. Nullable for legacy rows.
    storeKey: text("store_key"),
    // Billing phone (E.164) of the person who placed the order. Stored so
    // the SMS/WhatsApp delivery-update notifier can reach the sender without
    // a round-trip to WooCommerce. Nullable for legacy rows and guest orders
    // where no phone was captured.
    senderPhone: text("sender_phone"),
    // Presentail OS order id (UUID) returned by POST /api/orders. Nullable for
    // legacy rows created before OS order submission was wired up, and for rows
    // created during the startup window before OS is available.
    osOrderId: text("os_order_id"),
    // JSON-serialised snapshot of order line items at the time of placement.
    // Shape: [{name: string, quantity: number, priceUsdCents: number}]
    // Populated for OS-path orders (mobile + web checkout since Phase 3).
    // Null for legacy rows created before this column existed.
    lineItemsJson: text("line_items_json"),
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
