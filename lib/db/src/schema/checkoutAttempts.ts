import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Tracks every orderId reservation, regardless of whether checkout was
 * completed or the shopper abandoned.
 *
 * Lifecycle:
 *   "initiated"      — orderId reserved via POST /orders/next-id
 *   "payment_failed" — order submitted via POST /woo/order but payment was
 *                      declined or could not be verified by the PSP
 *   "submitted"      — order successfully submitted (app_orders row exists)
 *
 * This table is the source of truth for abandoned-checkout analysis.
 * app_orders remains the authoritative record for successfully-placed and
 * payment-failed orders (those rows carry the full recipient/cart details).
 */
export const checkoutAttemptsTable = pgTable(
  "checkout_attempts",
  {
    id: serial("id").primaryKey(),
    // Human-readable orderId, e.g. "LB-1042". Unique per attempt.
    appOrderId: text("app_order_id").notNull(),
    // Two-letter country code resolved from the prefix (LB / AE / CY).
    countryCode: text("country_code").notNull(),
    // Client platform: "ios" | "android" | "web" | null (unknown).
    platform: text("platform"),
    // See table JSDoc above for valid values.
    status: text("status").notNull().default("initiated"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    appOrderIdIdx: uniqueIndex("checkout_attempts_app_order_id_idx").on(
      t.appOrderId,
    ),
    statusIdx: index("checkout_attempts_status_idx").on(t.status),
    createdAtIdx: index("checkout_attempts_created_at_idx").on(t.createdAt),
  }),
);

export type CheckoutAttempt = typeof checkoutAttemptsTable.$inferSelect;
export type InsertCheckoutAttempt = typeof checkoutAttemptsTable.$inferInsert;
