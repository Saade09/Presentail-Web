/**
 * Guest-order reconciliation helper.
 *
 * When a shopper places an order before verifying their email (or as a guest
 * whose email matches an existing account), the checkout route leaves
 * `app_orders.customer_id = NULL`.  This helper back-fills those rows once
 * the customer is verified and authenticated, ensuring their full order
 * history is visible.
 *
 * The function is intentionally non-fatal: any DB error is swallowed and
 * logged at warning level so it never blocks the main response path.
 */

import { isNull, eq, sql } from "drizzle-orm";
import { db, appOrdersTable } from "@workspace/db";
import type { Logger } from "pino";

/**
 * Back-fill `app_orders.customer_id` for rows whose `sender_email` matches
 * the authenticated customer's email but whose `customer_id` is still NULL.
 *
 * @param customerId  The canonical `customers.id` to assign.
 * @param email       The customer's email address (used for matching).
 * @param log         Optional pino-style logger; falls back to console.warn.
 */
export async function reconcileGuestOrders(
  customerId: number,
  email: string,
  log?: Pick<Logger, "info" | "warn">,
): Promise<void> {
  const warn = log?.warn.bind(log) ?? console.warn;
  const info = log?.info.bind(log) ?? console.info;
  try {
    const result = await db
      .update(appOrdersTable)
      .set({ customerId, updatedAt: new Date() })
      .where(
        sql`${appOrdersTable.senderEmail} = ${email} AND ${appOrdersTable.customerId} IS NULL`,
      )
      .returning({ id: appOrdersTable.id });

    const count = result.length;
    if (count > 0) {
      info({ customerId, email, count }, "reconcileGuestOrders: back-filled orders"); // i18n-ignore
    }
  } catch (err: any) {
    warn({ customerId, email, err: err?.message }, "reconcileGuestOrders: failed (non-fatal)"); // i18n-ignore
  }
}
