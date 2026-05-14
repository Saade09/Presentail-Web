import { sql } from "drizzle-orm";
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

// Per-customer issued WooCommerce coupons. Minted by the loyalty engine when
// a tier threshold is first crossed, and re-minted at the same tier whenever
// the previous one is detected as used in WooCommerce.
//
// Status transitions:
//   - "active":  freshly minted, available to the customer.
//   - "used":    redeemed at checkout (set when WC reports usage_count >= 1).
//   - "replaced": superseded by a newer coupon (e.g. higher tier unlocked).
//
// `storeKey` is the canonical store identifier (lebanon|dubai|abudhabi|cyprus)
// — coupons live in a single WC store, so we need this rather than country
// to ensure replacement coupons get minted in the right store.
//
// Only one row may be `active` per (customer, tier) at a time — enforced by
// a partial unique index. The WC coupon code is also globally unique.
export const loyaltyCouponsTable = pgTable(
  "loyalty_coupons",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    tier: text("tier").notNull(),
    discountPercent: integer("discount_percent").notNull(),
    wcCouponId: integer("wc_coupon_id"),
    code: text("code").notNull(),
    storeKey: text("store_key"),
    status: text("status").notNull().default("active"),
    wcUsageCount: integer("wc_usage_count").notNull().default(0),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    customerIdx: index("loyalty_coupons_customer_idx").on(t.customerId),
    codeUniq: uniqueIndex("loyalty_coupons_code_uniq").on(t.code),
    activePerTier: uniqueIndex("loyalty_coupons_active_per_tier_uniq")
      .on(t.customerId, t.tier)
      .where(sql`status = 'active'`),
  }),
);

export type LoyaltyCouponRow = typeof loyaltyCouponsTable.$inferSelect;
export type InsertLoyaltyCouponRow = typeof loyaltyCouponsTable.$inferInsert;
