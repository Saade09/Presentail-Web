import { and, eq, isNull, sql } from "drizzle-orm";
import { db, customersTable, appOrdersTable } from "@workspace/db";
import { wooAuthHeader, type WooStoreConfig } from "./wooStore";
import { logger } from "./logger";

// Pull customers from a WooCommerce store and reconcile them into the
// local `customers` table. For every WC customer whose email matches an
// existing local customer that isn't yet linked to WC, persist the
// `wcCustomerId`. Then backfill `app_orders.user_id` for any rows that
// reference that local customer but were created before the WC link was
// known (e.g. guest order placed first, account claimed later).
//
// This is a bounded, best-effort job: at most MAX_PAGES * PAGE_SIZE
// customers per store per run. Returns the number of newly-linked local
// customer rows.
export async function reconcileCustomersForStore(
  store: WooStoreConfig,
): Promise<number> {
  if (!store.consumerKey) return 0;

  const PAGE_SIZE = 100;
  const MAX_PAGES = 5;
  let updatedCustomers = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    let list: Array<{ id: number; email?: string | null }>;
    try {
      const r = await fetch(
        `${store.baseUrl}/customers?per_page=${PAGE_SIZE}&page=${page}&orderby=registered_date&order=desc`,
        {
          headers: {
            Authorization: wooAuthHeader(store),
            "Content-Type": "application/json",
            "User-Agent": "PresentailApp/1.0",
          },
        },
      );
      if (!r.ok) {
        logger.warn(
          { status: r.status, baseUrl: store.baseUrl, page },
          "reconcileCustomersForStore: WC list request failed",
        );
        break;
      }
      list = (await r.json()) as Array<{ id: number; email?: string | null }>;
    } catch (err: any) {
      logger.warn(
        { err: err?.message, baseUrl: store.baseUrl, page },
        "reconcileCustomersForStore: WC list request crashed",
      );
      break;
    }
    if (!Array.isArray(list) || list.length === 0) break;

    for (const wc of list) {
      const email =
        typeof wc.email === "string" ? wc.email.trim().toLowerCase() : "";
      if (!email || !wc.id) continue;

      const linked = await db
        .update(customersTable)
        .set({ wcCustomerId: wc.id, updatedAt: new Date() })
        .where(
          and(
            eq(customersTable.email, email),
            isNull(customersTable.wcCustomerId),
          ),
        )
        .returning({ id: customersTable.id });

      if (linked.length > 0) {
        updatedCustomers += linked.length;
        const localId = linked[0].id;
        try {
          await db.execute(sql`
            UPDATE ${appOrdersTable}
            SET user_id = ${wc.id}, updated_at = now()
            WHERE customer_id = ${localId} AND user_id IS NULL
          `);
        } catch (err: any) {
          logger.warn(
            { err: err?.message, localId, wcId: wc.id },
            "reconcileCustomersForStore: app_orders backfill failed",
          );
        }
      }
    }

    if (list.length < PAGE_SIZE) break;
  }

  return updatedCustomers;
}
