/**
 * Pending-checkout sweeper — the last-resort safety net for charged-but-lost
 * orders (e.g. LB-2029: card charge succeeded, browser never completed the
 * /woo/order POST, no webhook secret configured → order silently lost).
 *
 * Every 2 minutes it scans klarna_pending_checkouts for rows that:
 *   - have an orderPayload (stored by the frontend BEFORE payment confirm),
 *   - have no wooOrderRef yet (order not created),
 *   - are in a non-terminal status ("pending" / "payment_succeeded"),
 *   - are older than 90 s (gives the normal browser flow time to finish),
 *   - are younger than 24 h (matches the Stripe PI/session lifetime).
 *
 * For each row it probes Stripe directly (both accounts) for the PI status.
 * If the PI succeeded, it submits the stored payload to /api/woo/order —
 * which is idempotent by appOrderId — and records the resulting order ref.
 *
 * This works WITHOUT webhook secrets: the sweeper pulls state from Stripe's
 * API using the regular secret keys, so it covers deployments where the
 * payment_intent.succeeded webhook is not (yet) configured.
 */

import { and, gt, isNull, lt, inArray, isNotNull } from "drizzle-orm";
import { db, klarnaPendingCheckoutsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { sendAlert } from "./alerts";
import { fetchStripePaymentIntentDetails } from "./catalog";

const SWEEP_INTERVAL_MS = 2 * 60_000;
const MIN_AGE_MS = 90_000;
const MAX_AGE_MS = 24 * 60 * 60_000;
const BATCH_LIMIT = 50;

let sweeping = false;

export async function sweepPendingCheckoutsOnce(): Promise<void> {
  if (sweeping) return; // prevent overlapping sweeps
  sweeping = true;
  try {
    const now = Date.now();
    const rows = await db
      .select({
        orderId: klarnaPendingCheckoutsTable.orderId,
        piId: klarnaPendingCheckoutsTable.piId,
        status: klarnaPendingCheckoutsTable.status,
        orderPayload: klarnaPendingCheckoutsTable.orderPayload,
      })
      .from(klarnaPendingCheckoutsTable)
      .where(
        and(
          isNull(klarnaPendingCheckoutsTable.wooOrderRef),
          isNotNull(klarnaPendingCheckoutsTable.orderPayload),
          inArray(klarnaPendingCheckoutsTable.status, ["pending", "payment_succeeded"]),
          lt(klarnaPendingCheckoutsTable.createdAt, new Date(now - MIN_AGE_MS)),
          gt(klarnaPendingCheckoutsTable.createdAt, new Date(now - MAX_AGE_MS)),
        ),
      )
      // Oldest first so a backlog of unpaid rows cannot starve older paid
      // rows out of the batch before the 24 h cutoff.
      .orderBy(klarnaPendingCheckoutsTable.createdAt)
      .limit(BATCH_LIMIT);

    if (rows.length === 0) return;

    const stripeKeys = [
      process.env.STRIPE_SECRET_KEY,
      process.env.STRIPE_SECRET_KEY_GULF,
    ].filter((k): k is string => !!k);

    for (const row of rows) {
      try {
        // Probe Stripe directly (both accounts). Returns non-null only when
        // the PI succeeded AND its metadata.orderId matches this row.
        let details: Awaited<ReturnType<typeof fetchStripePaymentIntentDetails>> = null;
        for (const key of stripeKeys) {
          details = await fetchStripePaymentIntentDetails(row.piId, row.orderId, key);
          if (details) break;
        }
        if (!details) continue; // not (yet) paid — check again next sweep

        const port = process.env.PORT ?? "8080";
        const storedPm = (row.orderPayload as Record<string, unknown>)?.["paymentMethod"];
        const body = JSON.stringify({
          ...(row.orderPayload as Record<string, unknown>),
          paymentRef: row.piId,
          paymentMethod: typeof storedPm === "string" && storedPm ? storedPm : "card",
        });
        const resp = await fetch(`http://127.0.0.1:${port}/api/woo/order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(60_000),
        });
        const respBody = (await resp.json()) as {
          ok?: boolean;
          osOrderId?: string;
          wcOrderId?: string;
          alreadyCreated?: boolean;
          message?: string;
        };
        if (resp.ok && respBody.ok) {
          const wooOrderRef = String(respBody.osOrderId ?? respBody.wcOrderId ?? row.orderId);
          await db
            .update(klarnaPendingCheckoutsTable)
            .set({ wooOrderRef, status: "payment_succeeded", updatedAt: new Date() })
            .where(eq(klarnaPendingCheckoutsTable.orderId, row.orderId));
          if (!respBody.alreadyCreated) {
            logger.warn(
              { orderId: row.orderId, piId: row.piId, wooOrderRef },
              "pendingCheckoutSweeper: rescued a paid order that was never submitted", // i18n-ignore
            );
            await sendAlert({
              title: ":life_ring: Sweeper rescued a paid order", // i18n-ignore
              body: `A payment succeeded but the order was never submitted by the browser or webhook. The sweeper created it from the stored payload.`, // i18n-ignore
              severity: "warn",
              fields: [
                { title: "Order", value: row.orderId }, // i18n-ignore
                { title: "PaymentIntent", value: row.piId }, // i18n-ignore
                { title: "OS order ref", value: wooOrderRef }, // i18n-ignore
              ],
              source: "pendingCheckoutSweeper",
            }).catch(() => {});
          } else {
            // Order already existed (browser/webhook won the race) — just
            // back-fill wooOrderRef so this row stops being swept.
            logger.info(
              { orderId: row.orderId, wooOrderRef },
              "pendingCheckoutSweeper: order already existed — back-filled wooOrderRef", // i18n-ignore
            );
          }
        } else {
          logger.warn(
            { orderId: row.orderId, piId: row.piId, httpStatus: resp.status, message: respBody.message },
            "pendingCheckoutSweeper: order submission failed — will retry next sweep", // i18n-ignore
          );
        }
      } catch (err: any) {
        logger.warn(
          { err: err?.message, orderId: row.orderId, piId: row.piId },
          "pendingCheckoutSweeper: row sweep failed (non-fatal)", // i18n-ignore
        );
      }
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "pendingCheckoutSweeper: sweep failed (non-fatal)"); // i18n-ignore
  } finally {
    sweeping = false;
  }
}

export function startPendingCheckoutSweeper(): void {
  // First sweep shortly after boot so a restart doesn't delay rescues.
  setTimeout(() => void sweepPendingCheckoutsOnce(), 30_000);
  setInterval(() => void sweepPendingCheckoutsOnce(), SWEEP_INTERVAL_MS);
  logger.info("pendingCheckoutSweeper: started"); // i18n-ignore
}
