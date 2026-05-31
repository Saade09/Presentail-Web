/**
 * WooCommerce order status webhook.
 *
 * POST /api/woo/webhook/order
 *
 *   Receives order.updated (and order.status_updated) events from WooCommerce.
 *   When an order transitions to a key status we look it up in app_orders and
 *   send the shopper a push notification via Expo.
 *
 *   Authentication: HMAC-SHA256 of the raw request body with WC_WEBHOOK_SECRET,
 *   compared against the `x-wc-webhook-signature` header.  The comparison is
 *   timing-safe to prevent timing-oracle attacks.
 *
 *   If WC_WEBHOOK_SECRET is not configured the endpoint returns 503 so it is
 *   never an open unauthenticated trigger.
 *
 *   WooCommerce retries delivery on non-2xx responses, so we return 200 quickly
 *   and do the slow DB + push work in the same synchronous handler (the entire
 *   thing is fast — a DB read + an Expo HTTP call).
 *
 *   Env vars:
 *     WC_WEBHOOK_SECRET          Required.  Secret token shared with WooCommerce
 *                                (Dashboard → WooCommerce → Settings → Advanced →
 *                                Webhooks → Secret).
 */

import { Router, type IRouter } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db, appOrdersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendOrderEventPush, type OrderState } from "../lib/orderEvents";
import { getCustomerByWcId } from "../lib/customers";
import { creditDeliveredOrder, reverseDeliveredOrder } from "../lib/loyalty";

const router: IRouter = Router();

// ── WC status → our OrderState ──────────────────────────────────────────────
//
// WooCommerce ships "core" statuses plus whatever custom statuses a site adds.
// Map every status we recognise to an OrderState; unknown statuses are silently
// skipped (no push, no DB update) so we never spam shoppers on irrelevant
// internal status transitions.
const WC_STATUS_MAP: Record<string, OrderState | null> = {
  processing: "confirmed",
  completed: "delivered",
  cancelled: "cancelled",
  refunded: "refunded",
  // Common custom statuses used by Presentail sites for delivery tracking:
  shipped: "out_for_delivery",
  "out-for-delivery": "out_for_delivery",
  "out_for_delivery": "out_for_delivery",
  // Statuses we deliberately ignore (no notification warranted):
  "on-hold": null,
  pending: null,
  failed: null,
};

function mapWcStatus(wcStatus: string): OrderState | null {
  const normalised = wcStatus.trim().toLowerCase().replace(/^wc-/, "");
  return WC_STATUS_MAP[normalised] ?? null;
}

// ── HMAC verification ────────────────────────────────────────────────────────

function verifyWcSignature(secret: string, rawBody: Buffer, signature: string): boolean {
  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

// ── Minimal WC order payload schema ─────────────────────────────────────────
//
// We only parse the fields we actually need; the full WC order object is much
// larger. Using safeParse so a schema change on WC's side surfaces as a warn,
// not a 500.
const WcOrderPayload = z.object({
  id: z.number().int().positive(),
  status: z.string(),
});

// ── Webhook handler ──────────────────────────────────────────────────────────

router.post("/woo/webhook/order", async (req, res): Promise<void> => {
  const secret = process.env.WC_WEBHOOK_SECRET ?? "";
  if (!secret) {
    req.log.warn("wooWebhook: WC_WEBHOOK_SECRET is not configured — rejecting webhook");
    res.status(503).json({ ok: false, message: "Webhook secret not configured" }); // i18n-ignore
    return;
  }

  // The raw body is a Buffer (express.raw middleware is mounted in app.ts for
  // this path before express.json()).
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    res.status(400).json({ ok: false, message: "Empty or non-raw body" }); // i18n-ignore
    return;
  }

  const signature = req.header("x-wc-webhook-signature") ?? "";
  if (!signature) {
    res.status(401).json({ ok: false, message: "Missing x-wc-webhook-signature" }); // i18n-ignore
    return;
  }

  if (!verifyWcSignature(secret, rawBody, signature)) {
    req.log.warn({ topic: req.header("x-wc-webhook-topic") }, "wooWebhook: signature mismatch");
    res.status(401).json({ ok: false, message: "Invalid signature" }); // i18n-ignore
    return;
  }

  // Parse and validate the payload.
  let parsed: z.infer<typeof WcOrderPayload>;
  try {
    const json: unknown = JSON.parse(rawBody.toString("utf8"));
    const result = WcOrderPayload.safeParse(json);
    if (!result.success) {
      req.log.warn({ err: result.error.issues }, "wooWebhook: unexpected payload shape");
      // Return 200 so WC doesn't keep retrying an event we can't act on.
      res.json({ ok: true, action: "skipped", reason: "unrecognised payload" });
      return;
    }
    parsed = result.data;
  } catch (err: any) {
    req.log.warn({ err: err?.message }, "wooWebhook: JSON parse error");
    res.status(400).json({ ok: false, message: "Invalid JSON" }); // i18n-ignore
    return;
  }

  const { id: wcOrderId, status: wcStatus } = parsed;
  const topic = req.header("x-wc-webhook-topic") ?? "unknown";
  req.log.info({ wcOrderId, wcStatus, topic }, "wooWebhook: received order event");

  const state = mapWcStatus(wcStatus);
  if (!state) {
    req.log.info({ wcOrderId, wcStatus }, "wooWebhook: status not mapped — skipping push");
    res.json({ ok: true, action: "skipped", reason: "status not mapped" });
    return;
  }

  // Look up the matching app_orders row.
  const rows = await db
    .select()
    .from(appOrdersTable)
    .where(eq(appOrdersTable.wcOrderId, wcOrderId))
    .limit(1)
    .catch((err: unknown) => {
      req.log.error({ err, wcOrderId }, "wooWebhook: DB lookup failed");
      return [] as typeof appOrdersTable.$inferSelect[];
    });

  const order = rows[0];
  if (!order) {
    // No app_orders row for this WC order — might be a web order or test event.
    req.log.info({ wcOrderId, wcStatus }, "wooWebhook: no app_orders row — skipping push");
    res.json({ ok: true, action: "skipped", reason: "order not found" });
    return;
  }

  // Idempotency guard: skip if the order is already in this state so WC
  // retries and duplicate webhooks don't re-notify the shopper.
  if (order.state === state) {
    req.log.info(
      { wcOrderId, state },
      "wooWebhook: order already in target state — skipping push",
    );
    res.json({ ok: true, action: "skipped", reason: "already in state" });
    return;
  }

  const previousState = order.state;

  // Update the app_orders state first (best-effort — don't let a DB error
  // block the push, but do log it).
  await db
    .update(appOrdersTable)
    .set({ state, updatedAt: new Date() })
    .where(eq(appOrdersTable.id, order.id))
    .catch((err: unknown) => {
      req.log.error({ err, appOrderId: order.appOrderId }, "wooWebhook: state update failed");
    });

  // Send the push notification.
  const sent = await sendOrderEventPush({
    state,
    appOrderId: order.appOrderId,
    wcOrderId,
    userId: order.userId,
    deviceId: order.deviceId,
    recipientName: order.recipientName,
  });

  req.log.info(
    { wcOrderId, appOrderId: order.appOrderId, state, sent },
    "wooWebhook: push sent",
  );

  // Loyalty side-effects (same logic as /push/order-event — best-effort).
  try {
    if (order.userId != null && order.wcOrderId != null) {
      const customer = await getCustomerByWcId(order.userId);
      if (customer) {
        if (state === "delivered" && previousState !== "delivered") {
          await creditDeliveredOrder({
            customerId: customer.id,
            wcOrderId: order.wcOrderId,
            totalUsdCents: order.totalUsdCents ?? 0,
            storeKey: order.storeKey ?? null,
            log: req.log,
          });
        } else if (
          (state === "cancelled" || state === "refunded") &&
          previousState === "delivered"
        ) {
          await reverseDeliveredOrder({
            customerId: customer.id,
            wcOrderId: order.wcOrderId,
            storeKey: order.storeKey ?? null,
            reason: state,
            log: req.log,
          });
        }
      }
    }
  } catch (err: any) {
    req.log.warn(
      { err: err?.message, appOrderId: order.appOrderId },
      "wooWebhook: loyalty hook failed (non-fatal)",
    );
  }

  res.json({ ok: true, action: "pushed", sent });
});

export default router;
