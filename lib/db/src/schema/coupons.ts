import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const couponsTable = pgTable(
  "coupons",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    description: text("description"),
    discountType: text("discount_type").notNull(),
    discountValue: numeric("discount_value", { precision: 10, scale: 4 }).notNull(),
    minOrderUsd: numeric("min_order_usd", { precision: 10, scale: 2 }),
    usageLimit: integer("usage_limit"),
    usageLimitPerUser: integer("usage_limit_per_user"),
    usageCount: integer("usage_count").notNull().default(0),
    includedProductSlugs: text("included_product_slugs").array(),
    excludedProductSlugs: text("excluded_product_slugs").array(),
    includedCategoryIds: text("included_category_ids").array(),
    excludedCategoryIds: text("excluded_category_ids").array(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeUniq: uniqueIndex("coupons_code_uniq").on(sql`lower(${t.code})`),
    activeIdx: index("coupons_active_idx").on(t.active),
  }),
);

export const couponRedemptionsTable = pgTable(
  "coupon_redemptions",
  {
    id: serial("id").primaryKey(),
    couponId: integer("coupon_id")
      .notNull()
      .references(() => couponsTable.id),
    customerEmail: text("customer_email").notNull(),
    orderId: text("order_id").notNull(),
    discountAmountUsd: numeric("discount_amount_usd", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    couponIdIdx: index("coupon_redemptions_coupon_id_idx").on(t.couponId),
    orderIdUniq: uniqueIndex("coupon_redemptions_order_id_uniq").on(t.orderId),
    emailIdx: index("coupon_redemptions_email_idx").on(t.customerEmail),
  }),
);

export type CouponRow = typeof couponsTable.$inferSelect;
export type InsertCouponRow = typeof couponsTable.$inferInsert;
export type CouponRedemptionRow = typeof couponRedemptionsTable.$inferSelect;
