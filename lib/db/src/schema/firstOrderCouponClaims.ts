import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Durable in-flight claim for the FIRST10 first-order coupon.
 *
 * A row is inserted (keyed by normalised email) when a Stripe PaymentIntent or
 * Checkout Session is created with the FIRST10 discount. This prevents two
 * concurrent checkout sessions from both applying the 10 % discount before
 * either creates an `app_orders` row (which is the normal post-payment guard).
 *
 * Claims expire automatically after 15 minutes via the `ON CONFLICT … WHERE`
 * logic in `acquireFirst10LockDurable` — no background job required.
 *
 * See `artifacts/api-server/src/lib/couponValidation.ts` for the claim logic.
 */
export const firstOrderCouponClaimsTable = pgTable("first_order_coupon_claims", {
  /** Normalised (lowercase) email of the shopper claiming the discount. PK = unique constraint. */
  email: text("email").primaryKey(),
  /** The app orderId whose PI holds the claim. Used for idempotent re-acquisition. */
  orderId: text("order_id").notNull(),
  /** When the claim was last acquired or refreshed. Used for TTL expiry. */
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FirstOrderCouponClaimRow = typeof firstOrderCouponClaimsTable.$inferSelect;
