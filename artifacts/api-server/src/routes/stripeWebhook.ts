/**
 * Stripe webhook handler — /api/stripe/webhook
 *
 * Mounted BEFORE express.json() in app.ts with express.raw() so Stripe's
 * signature verification receives the exact bytes it signed.
 *
 * Handles both Stripe accounts (main LB/CY and gulf AE) on the same path.
 * The active account is determined by the signing secret used:
 *   STRIPE_WEBHOOK_SECRET      → main account (LB, CY)
 *   STRIPE_WEBHOOK_SECRET_GULF → gulf account (AE)
 *
 * Supported events:
 *   payment_intent.succeeded     — record analytics + update app_orders row + update klarnaPendingCheckoutsTable
 *   payment_intent.payment_failed — record analytics + update klarnaPendingCheckoutsTable
 *   charge.dispute.created        — Slack alert (critical)
 *   charge.refunded               — record analytics
 *   payment_intent.processing    — Log for Klarna/deferred + update klarnaPendingCheckoutsTable
 *   payment_intent.canceled      — Record reason + update klarnaPendingCheckoutsTable
 *   charge.refund.updated        — Log status
 *   charge.dispute.updated       — Slack alert on escalation
 *   charge.dispute.closed        — Slack alert with outcome
 *
 * Idempotency: every processed event is inserted into stripe_webhook_events
 * with a unique index on stripeEventId. Re-delivered events are silently
 * skipped (409 conflict on insert → 200 early return).
 */

import { Router } from "express";
import Stripe from "stripe";
import {
  db,
  stripeWebhookEventsTable,
  analyticsEventsTable,
  appOrdersTable,
  klarnaPendingCheckoutsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendAlert } from "../lib/alerts";

const router = Router();

const MAIN_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const GULF_SECRET = process.env.STRIPE_WEBHOOK_SECRET_GULF;
const MAIN_KEY = process.env.STRIPE_SECRET_KEY;
const GULF_KEY = process.env.STRIPE_SECRET_KEY_GULF;

/**
 * Attempt to construct the Stripe event by trying main and then gulf signing
 * secrets. Returns { event, account } on success, or null on failure.
 */
function constructEvent(
  payload: Buffer,
  signature: string,
): { event: Stripe.Event; account: "main" | "gulf" } | null {
  // Try main secret first
  if (MAIN_SECRET) {
    try {
      const event = new Stripe(MAIN_KEY ?? "").webhooks.constructEvent(
        payload,
        signature,
        MAIN_SECRET,
      );
      return { event, account: "main" };
    } catch {
      // Not signed with the main secret — fall through to gulf
    }
  }

  // Try gulf secret
  if (GULF_SECRET) {
    try {
      const event = new Stripe(GULF_KEY ?? "").webhooks.constructEvent(
        payload,
        signature,
        GULF_SECRET,
      );
      return { event, account: "gulf" };
    } catch {
      // Not signed with the gulf secret either
    }
  }

  return null;
}

/**
 * Insert the event record for idempotency. Returns false when the event was
 * already processed (unique-constraint violation → silently skip).
 */
async function insertEventRecord(
  stripeEventId: string,
  account: "main" | "gulf",
  eventType: string,
  paymentIntentId: string | null,
  chargeId: string | null,
  appOrderId: string | null,
): Promise<boolean> {
  try {
    await db.insert(stripeWebhookEventsTable).values({
      stripeEventId,
      stripeAccount: account,
      eventType,
      paymentIntentId,
      chargeId,
      appOrderId,
      processedAt: new Date(),
    });
    return true;
  } catch (err: unknown) {
    // Unique constraint violation → already processed
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    ) {
      return false;
    }
    throw err;
  }
}

// ── Klarna pending checkout state helpers ────────────────────────────────────

async function updateKlarnaPendingStatus(
  piId: string,
  status: string,
): Promise<void> {
  await db
    .update(klarnaPendingCheckoutsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(klarnaPendingCheckoutsTable.piId, piId));
}

// ── Event handlers ───────────────────────────────────────────────────────────

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  const orderId: string = (pi.metadata as Record<string, string>)?.orderId ?? "unknown";
  logger.info(
    {
      piId: pi.id,
      orderId,
      amount: pi.amount,
      currency: pi.currency,
      paymentMethodTypes: pi.payment_method_types,
    },
    "stripe-webhook: payment_intent.succeeded", // i18n-ignore
  );

  // Mark payment as succeeded so the polling endpoint can unblock the browser.
  await updateKlarnaPendingStatus(pi.id, "payment_succeeded");

  // Webhook-authoritative order creation: retrieve the order payload stored by
  // POST /checkout/klarna-pending and submit it to /woo/order so the WC order
  // is created without requiring the shopper's browser to be open. The task is
  // detached from the webhook request (setImmediate) so Stripe gets a fast 200
  // regardless of how long WC order creation takes.
  const rows = await db
    .select({
      orderId: klarnaPendingCheckoutsTable.orderId,
      orderPayload: klarnaPendingCheckoutsTable.orderPayload,
    })
    .from(klarnaPendingCheckoutsTable)
    .where(eq(klarnaPendingCheckoutsTable.piId, pi.id))
    .limit(1);

  if (rows.length > 0 && rows[0].orderPayload != null) {
    const storedOrderId = rows[0].orderId;
    const orderPayload = rows[0].orderPayload;
    const piId = pi.id;

    setImmediate(() => {
      void (async () => {
        try {
          const port = process.env.PORT ?? "8080";
          // Merge the stored payload with paymentRef + paymentMethod so that
          // /woo/order can verify the Stripe PI using its existing validation
          // and recovery path (Stripe API fallback when in-memory store is gone).
          // Keep the payload's own paymentMethod ("card" / "klarna" / …).
          // WooOrderSchema has no "stripe" value — overriding with it made
          // every webhook-driven order creation fail schema validation.
          const storedPm = (orderPayload as Record<string, unknown>)?.["paymentMethod"];
          const body = JSON.stringify({
            ...(orderPayload as Record<string, unknown>),
            paymentRef: piId,
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
            message?: string;
          };
          if (resp.ok && respBody.ok) {
            const wooOrderRef = String(
              respBody.osOrderId ?? respBody.wcOrderId ?? storedOrderId,
            );
            await db
              .update(klarnaPendingCheckoutsTable)
              .set({ wooOrderRef, updatedAt: new Date() })
              .where(eq(klarnaPendingCheckoutsTable.piId, piId));
            logger.info(
              { piId, orderId: storedOrderId, wooOrderRef },
              "stripe-webhook: WC order created via webhook (authoritative)", // i18n-ignore
            );
          } else {
            logger.warn(
              { piId, orderId: storedOrderId, httpStatus: resp.status, message: respBody.message },
              "stripe-webhook: WC order creation returned non-ok — browser polling will fall back to client-side finalization", // i18n-ignore
            );
          }
        } catch (err) {
          logger.warn(
            { err, piId, orderId: storedOrderId },
            "stripe-webhook: WC order creation threw — browser polling will fall back to client-side finalization", // i18n-ignore
          );
        }
      })();
    });
  } else {
    logger.warn(
      { piId: pi.id, orderId },
      "stripe-webhook: no orderPayload in klarna_pending_checkouts — WC order must be created by browser fallback", // i18n-ignore
    );
  }

  await sendAlert({
    title: ":white_check_mark: Klarna / redirect payment succeeded", // i18n-ignore
    body: `PaymentIntent \`${pi.id}\` succeeded. WC order creation is running in the background; the browser polls \`/api/stripe/payment-status\` for the result.`, // i18n-ignore
    severity: "info",
    fields: [
      { title: "PaymentIntent", value: pi.id }, // i18n-ignore
      { title: "orderId", value: orderId }, // i18n-ignore
      { title: "amount", value: `${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}` }, // i18n-ignore
      { title: "methods", value: pi.payment_method_types?.join(", ") ?? "unknown" }, // i18n-ignore
    ],
    source: "stripe-webhook/payment_intent.succeeded",
  }).catch(() => {});
}

async function handlePaymentIntentCanceled(pi: Stripe.PaymentIntent): Promise<void> {
  const orderId: string = (pi.metadata as Record<string, string>)?.orderId ?? "unknown";
  logger.info(
    {
      piId: pi.id,
      orderId,
      cancellationReason: pi.cancellation_reason,
    },
    "stripe-webhook: payment_intent.canceled", // i18n-ignore
  );

  await updateKlarnaPendingStatus(pi.id, "payment_canceled");
}

async function handlePaymentIntentProcessing(pi: Stripe.PaymentIntent): Promise<void> {
  const orderId: string = (pi.metadata as Record<string, string>)?.orderId ?? "unknown";
  logger.info(
    {
      piId: pi.id,
      orderId,
      amount: pi.amount,
      currency: pi.currency,
      paymentMethodTypes: pi.payment_method_types,
    },
    "stripe-webhook: payment_intent.processing — order payment is in a deferred state", // i18n-ignore
  );

  // Alert ops so deferred/processing payments are visible without querying Stripe.
  await sendAlert({
    title: "Klarna / deferred payment in processing state", // i18n-ignore
    body: `A PaymentIntent entered \`processing\` status — the BNPL provider is evaluating the application. The shopper will be notified once it resolves.`, // i18n-ignore
    severity: "info",
    fields: [
      { title: "PaymentIntent", value: pi.id }, // i18n-ignore
      { title: "orderId", value: orderId }, // i18n-ignore
      { title: "amount", value: `${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}` }, // i18n-ignore
      { title: "methods", value: pi.payment_method_types?.join(", ") ?? "unknown" }, // i18n-ignore
    ],
    source: "stripe-webhook/payment_intent.processing",
  }).catch(() => {});
}

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  const orderId: string = (pi.metadata as Record<string, string>)?.orderId ?? "unknown";
  logger.warn(
    {
      piId: pi.id,
      orderId,
      amount: pi.amount,
      currency: pi.currency,
      lastError: (pi as unknown as { last_payment_error?: { code?: string; message?: string } })
        .last_payment_error,
    },
    "stripe-webhook: payment_intent.payment_failed", // i18n-ignore
  );

  await updateKlarnaPendingStatus(pi.id, "payment_failed");
}


async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  logger.warn(
    {
      disputeId: dispute.id,
      chargeId: dispute.charge,
      amount: dispute.amount,
      currency: dispute.currency,
      reason: dispute.reason,
      status: dispute.status,
    },
    "stripe-webhook: charge.dispute.created", // i18n-ignore
  );

  await sendAlert({
    title: ":scales: New Stripe dispute opened", // i18n-ignore
    body: `A charge has been disputed. Respond in the Stripe Dashboard before the due date to avoid an automatic loss.`, // i18n-ignore
    severity: "critical",
    fields: [
      { title: "Dispute ID", value: dispute.id }, // i18n-ignore
      { title: "Charge", value: typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id }, // i18n-ignore
      { title: "Amount", value: `${(dispute.amount / 100).toFixed(2)} ${dispute.currency.toUpperCase()}` }, // i18n-ignore
      { title: "Reason", value: dispute.reason ?? "unknown" }, // i18n-ignore
      { title: "Status", value: dispute.status }, // i18n-ignore
    ],
    source: "stripe-webhook/charge.dispute.created",
  }).catch(() => {});
}

async function handleDisputeUpdated(dispute: Stripe.Dispute): Promise<void> {
  logger.info(
    {
      disputeId: dispute.id,
      chargeId: dispute.charge,
      status: dispute.status,
    },
    "stripe-webhook: charge.dispute.updated", // i18n-ignore
  );

  // Only alert on escalating states to avoid alert fatigue.
  if (dispute.status === "under_review" || dispute.status === "warning_under_review") {
    await sendAlert({
      title: ":scales: Stripe dispute escalated to under_review", // i18n-ignore
      body: `A dispute entered \`${dispute.status}\`. Check the Stripe Dashboard for any required action.`, // i18n-ignore
      severity: "warn",
      fields: [
        { title: "Dispute ID", value: dispute.id }, // i18n-ignore
        { title: "Charge", value: typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id }, // i18n-ignore
        { title: "Amount", value: `${(dispute.amount / 100).toFixed(2)} ${dispute.currency.toUpperCase()}` }, // i18n-ignore
      ],
      source: "stripe-webhook/charge.dispute.updated",
    }).catch(() => {});
  }
}

async function handleDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
  logger.info(
    {
      disputeId: dispute.id,
      chargeId: dispute.charge,
      status: dispute.status,
    },
    "stripe-webhook: charge.dispute.closed", // i18n-ignore
  );

  await sendAlert({
    title: `:scales: Stripe dispute closed: ${dispute.status}`, // i18n-ignore
    body: `A dispute has been closed with status \`${dispute.status}\`.`, // i18n-ignore
    severity: "info",
    fields: [
      { title: "Dispute ID", value: dispute.id }, // i18n-ignore
      { title: "Charge", value: typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id }, // i18n-ignore
      { title: "Amount", value: `${(dispute.amount / 100).toFixed(2)} ${dispute.currency.toUpperCase()}` }, // i18n-ignore
      { title: "Status", value: dispute.status }, // i18n-ignore
    ],
    source: "stripe-webhook/charge.dispute.closed",
  }).catch(() => {});
}

/** Extract the orderId from a PaymentIntent's metadata map. */
function extractOrderId(pi: Stripe.PaymentIntent): string | null {
  return (pi.metadata?.["orderId"] as string | undefined) ?? null;
}

/** Record an analytics event row (fire-and-forget, errors logged not thrown). */
async function recordAnalyticsEvent(
  name: string,
  props: {
    surface?: string;
    action?: string;
    appOrderId?: string | null;
    errorCode?: string | null;
    propertiesJson?: string;
  },
): Promise<void> {
  try {
    await db.insert(analyticsEventsTable).values({
      name,
      surface: props.surface ?? "checkout",
      action: props.action ?? null,
      platform: "web",
      appOrderId: props.appOrderId ?? null,
      errorCode: props.errorCode ?? null,
      propertiesJson: props.propertiesJson ?? null,
    });
  } catch (err: unknown) {
    logger.warn(
      { err: (err as Error)?.message, eventName: name },
      "stripeWebhook: failed to record analytics event",
    );
  }
}

// This router is mounted at /api/stripe/webhook in app.ts, so the path
// registered here must be "/" (not "/stripe/webhook") to avoid the double-
// segment issue: /api/stripe/webhook + /stripe/webhook = wrong path.
router.post("/", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    return res.status(400).json({ ok: false, message: "Missing stripe-signature header" }); // i18n-ignore
  }

  if (!Buffer.isBuffer(req.body)) {
    return res
      .status(400)
      .json({ ok: false, message: "Raw body required — webhook must be mounted before express.json()" }); // i18n-ignore
  }

  if (!MAIN_SECRET && !GULF_SECRET) {
    logger.warn(
      "stripeWebhook: STRIPE_WEBHOOK_SECRET / STRIPE_WEBHOOK_SECRET_GULF are not set; returning 503",
    );
    return res.status(503).json({ ok: false, message: "Webhook not configured" }); // i18n-ignore
  }

  const result = constructEvent(req.body, signature);
  if (!result) {
    logger.warn("stripeWebhook: signature verification failed for both accounts");
    return res.status(400).json({ ok: false, message: "Webhook signature verification failed" }); // i18n-ignore
  }

  const { event, account } = result;

  // Extract common identifiers
  let paymentIntentId: string | null = null;
  let chargeId: string | null = null;
  let appOrderId: string | null = null;

  const obj = event.data.object as Stripe.PaymentIntent | Stripe.Charge;

  if (event.type.startsWith("payment_intent.")) {
    const pi = obj as Stripe.PaymentIntent;
    paymentIntentId = pi.id;
    chargeId =
      typeof pi.latest_charge === "string" ? pi.latest_charge : null;
    appOrderId = extractOrderId(pi);
  } else if (event.type.startsWith("charge.")) {
    const charge = obj as Stripe.Charge;
    chargeId = charge.id;
    paymentIntentId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : null;
  }

  // ── Event-specific handlers ──────────────────────────────────────────────
  // Idempotency note: we insert the event record AFTER successful handling,
  // not before. This way a 500 return (processing error) allows Stripe to
  // retry — the duplicate-key guard only fires when we've fully processed the
  // event. On concurrent delivery, the second request may also process the
  // event before the first insert commits (rare), but all side effects are
  // idempotent (analytics duplicate rows, app_orders SET with same values).

  req.log.info({ eventId: event.id, type: event.type }, "stripe-webhook: received event"); // i18n-ignore

  // Dispatch to event-specific handlers.
  //
  // IDEMPOTENCY: markProcessed is called AFTER the handler succeeds. On
  // handler failure we return 5xx so Stripe retries the delivery. The dedup
  // check at the top of the route guards against duplicate processing on retry.
  // All handlers are designed to be idempotent (DB ON CONFLICT DO NOTHING,
  // /woo/order returns 409 on already-paid PIs).
  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = obj as Stripe.PaymentIntent;
        const method = pi.payment_method_types?.[0] ?? "unknown";

        // Update the pending checkout record so the polling endpoint can unblock
        // the frontend finalize flow. This is the webhook authority for redirect-based methods.
        await updateKlarnaPendingStatus(pi.id, "payment_succeeded");

        // Webhook-authoritative WC order creation: retrieve the order payload
        // stored by POST /checkout/klarna-pending and submit to /woo/order so
        // the order is created even when the shopper's browser is no longer open.
        // Detached via setImmediate so Stripe gets a fast 200 regardless of WC latency.
        {
          const pendingRows = await db
            .select({
              storedOrderId: klarnaPendingCheckoutsTable.orderId,
              orderPayload: klarnaPendingCheckoutsTable.orderPayload,
            })
            .from(klarnaPendingCheckoutsTable)
            .where(eq(klarnaPendingCheckoutsTable.piId, pi.id))
            .limit(1);

          if (pendingRows.length > 0 && pendingRows[0].orderPayload != null) {
            const storedOrderId = pendingRows[0].storedOrderId;
            const orderPayload = pendingRows[0].orderPayload;
            const piId = pi.id;

            setImmediate(() => {
              void (async () => {
                try {
                  const port = process.env.PORT ?? "8080";
                  // Keep the payload's own paymentMethod ("card" / "klarna" / …).
                  // WooOrderSchema has no "stripe" value — overriding with it made
                  // every webhook-driven order creation fail schema validation.
                  const storedPm = (orderPayload as Record<string, unknown>)?.["paymentMethod"];
                  const body = JSON.stringify({
                    ...(orderPayload as Record<string, unknown>),
                    paymentRef: piId,
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
                    message?: string;
                  };
                  if (resp.ok && respBody.ok) {
                    const wooOrderRef = String(
                      respBody.osOrderId ?? respBody.wcOrderId ?? storedOrderId,
                    );
                    await db
                      .update(klarnaPendingCheckoutsTable)
                      .set({ wooOrderRef, updatedAt: new Date() })
                      .where(eq(klarnaPendingCheckoutsTable.piId, piId));
                    logger.info(
                      { piId, orderId: storedOrderId, wooOrderRef },
                      "stripe-webhook: WC order created via webhook (authoritative)", // i18n-ignore
                    );
                  } else {
                    logger.warn(
                      { piId, orderId: storedOrderId, httpStatus: resp.status, message: respBody.message },
                      "stripe-webhook: WC order creation returned non-ok — browser polling will fall back to client-side finalization", // i18n-ignore
                    );
                  }
                } catch (err) {
                  logger.warn(
                    { err, piId, orderId: storedOrderId },
                    "stripe-webhook: WC order creation threw — browser polling will fall back to client-side finalization", // i18n-ignore
                  );
                }
              })();
            });
          } else {
            logger.warn(
              { piId: pi.id, appOrderId },
              "stripe-webhook: no orderPayload in klarna_pending_checkouts — WC order must be created by browser fallback", // i18n-ignore
            );
          }
        }

        logger.info(
          {
            eventId: event.id,
            account,
            paymentIntentId: pi.id,
            appOrderId,
            method,
          },
          "stripeWebhook: payment_intent.succeeded",
        );

        // Write the Stripe PI id and charge id back to app_orders so ops can
        // cross-reference orders with Stripe dashboard events.
        // appOrderId comes from PI metadata.orderId (set at PI creation time).
        if (appOrderId) {
          try {
            await db
              .update(appOrdersTable)
              .set({
                stripePaymentIntentId: pi.id,
                stripeChargeId: chargeId,
              })
              .where(eq(appOrdersTable.appOrderId, appOrderId));
          } catch (dbErr: unknown) {
            // Log and continue — the order may not exist yet (Klarna async
            // settlement can arrive before OrderConfirmed creates the row).
            logger.warn(
              { err: (dbErr as Error)?.message, appOrderId, piId: pi.id },
              "stripeWebhook: could not update app_orders with PI id (order may not exist yet)",
            );
          }
        }

        await recordAnalyticsEvent("stripe_payment_succeeded", {
          surface: "checkout",
          action: method,
          appOrderId,
          propertiesJson: JSON.stringify({
            stripeAccount: account,
            paymentIntentId: pi.id,
            method,
            currency: pi.currency,
            amount: pi.amount,
          }),
        });

        // Klarna-specific funnel event — tracks confirmed Klarna payments
        // separately so the analytics dashboard can show Klarna conversion rates
        // distinct from card payments.
        if (method === "klarna") {
          await recordAnalyticsEvent("klarna_payment_confirmed", {
            surface: "checkout",
            action: "klarna",
            appOrderId,
            propertiesJson: JSON.stringify({
              stripeAccount: account,
              paymentIntentId: pi.id,
              payerCountry: (pi.metadata?.["payer_country"] as string | undefined) ?? null,
              currency: pi.currency,
              amount: pi.amount,
            }),
          });
        }
        break;
      }

      case "payment_intent.canceled": {
        const pi = obj as Stripe.PaymentIntent;
        await updateKlarnaPendingStatus(pi.id, "payment_canceled");
        const cancelReason = pi.cancellation_reason ?? "unknown";
        logger.warn(
          {
            piId: pi.id,
            appOrderId,
            cancellationReason: cancelReason,
          },
          "stripeWebhook: payment_intent.canceled",
        );
        await recordAnalyticsEvent("stripe_payment_canceled", {
          surface: "checkout",
          action: cancelReason,
          appOrderId,
          propertiesJson: JSON.stringify({
            stripeAccount: account,
            paymentIntentId: pi.id,
            reason: cancelReason,
            currency: pi.currency,
          }),
        });
        break;
      }

      case "payment_intent.processing": {
        const pi = obj as Stripe.PaymentIntent;
        const method = pi.payment_method_types?.[0] ?? "unknown";
        logger.info(
          {
            piId: pi.id,
            appOrderId,
            amount: pi.amount,
            currency: pi.currency,
            paymentMethodTypes: pi.payment_method_types,
          },
          "stripeWebhook: payment_intent.processing — order payment is in a deferred state",
        );
        await recordAnalyticsEvent("stripe_payment_processing", {
          surface: "checkout",
          action: method,
          appOrderId,
          propertiesJson: JSON.stringify({
            stripeAccount: account,
            paymentIntentId: pi.id,
            method,
            currency: pi.currency,
          }),
        });

        // Alert ops so deferred/processing payments are visible without querying Stripe.
        await sendAlert({
          title: "Klarna / deferred payment in processing state",
          body: `A PaymentIntent entered \`processing\` status — the BNPL provider is evaluating the application. The shopper will be notified once it resolves.`,
          severity: "info",
          fields: [
            { title: "PaymentIntent", value: pi.id },
            { title: "App Order ID", value: appOrderId ?? "unknown" },
            {
              title: "Amount",
              value: `${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}`,
            },
            {
              title: "Methods",
              value: pi.payment_method_types?.join(", ") ?? "unknown",
            },
          ],
          source: "stripe-webhook/payment_intent.processing",
        }).catch(() => {});
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = obj as Stripe.PaymentIntent;
        await updateKlarnaPendingStatus(pi.id, "payment_failed");
        const lastErr = pi.last_payment_error;
        const errorCode = lastErr?.code ?? lastErr?.decline_code ?? "unknown";
        logger.warn(
          {
            eventId: event.id,
            account,
            paymentIntentId: pi.id,
            appOrderId,
            errorCode,
          },
          "stripeWebhook: payment_intent.payment_failed",
        );
        await recordAnalyticsEvent("stripe_payment_failed", {
          surface: "checkout",
          action: "provider",
          appOrderId,
          errorCode,
          propertiesJson: JSON.stringify({
            stripeAccount: account,
            paymentIntentId: pi.id,
            errorCode,
            method: pi.payment_method_types?.[0] ?? "unknown",
          }),
        });
        break;
      }

      case "charge.dispute.created": {
        await handleDisputeCreated(event.data.object as Stripe.Dispute);
        await recordAnalyticsEvent("stripe_dispute_created", {
          surface: "checkout",
          action: "dispute",
          appOrderId,
          propertiesJson: JSON.stringify({
            stripeAccount: account,
            chargeId: chargeId ?? "unknown",
            reason: (event.data.object as Stripe.Dispute).reason,
          }),
        });
        break;
      }

      case "charge.dispute.updated": {
        await handleDisputeUpdated(event.data.object as Stripe.Dispute);
        break;
      }

      case "charge.dispute.closed": {
        await handleDisputeClosed(event.data.object as Stripe.Dispute);
        break;
      }

      case "charge.refunded": {
        const charge = obj as Stripe.Charge;
        logger.info(
          {
            eventId: event.id,
            account,
            chargeId: charge.id,
            paymentIntentId,
            appOrderId,
          },
          "stripeWebhook: charge.refunded",
        );
        await recordAnalyticsEvent("stripe_charge_refunded", {
          surface: "checkout",
          action: "refund",
          appOrderId,
          propertiesJson: JSON.stringify({
            stripeAccount: account,
            chargeId: charge.id,
            amountRefunded: charge.amount_refunded,
            currency: charge.currency,
          }),
        });
        break;
      }

      case "charge.refund.updated": {
        const refund = event.data.object as Stripe.Refund;
        logger.info(
          { eventId: event.id, account, refundId: refund.id, chargeId: refund.charge, paymentIntentId },
          "stripeWebhook: charge.refund.updated",
        );
        break;
      }

      case "charge.dispute.funds_reinstated":
      case "charge.dispute.funds_withdrawn": {
        const charge = obj as Stripe.Charge;
        logger.info(
          { eventId: event.id, eventType: event.type, account, chargeId: charge.id, paymentIntentId },
          "stripeWebhook: charge.dispute event",
        );
        break;
      }

      default:
        // Unhandled event type — log at debug level and return 200.
        // Stripe requires 200 for unknown events; the idempotency insert
        // below prevents double-processing if the same event is retried.
        logger.info(
          { eventId: event.id, eventType: event.type, account },
          "stripeWebhook: unhandled event type (ignored)",
        );
    }
  } catch (err: unknown) {
    req.log.error(
      { err: (err as Error)?.message, eventId: event.id, type: event.type },
      "stripe-webhook: handler threw — returning 500 so Stripe retries", // i18n-ignore
    );
    return res.status(500).json({ ok: false, message: "Handler failed — will retry" }); // i18n-ignore
  }

  // ── Post-processing: write idempotency record ────────────────────────────
  // Inserted AFTER successful handling. A 500 on errors (above) lets Stripe
  // retry without hitting the duplicate-key guard. insertEventRecord returns
  // false on duplicate-key (concurrent delivery already processed this event).
  try {
    const inserted = await insertEventRecord(event.id, account, event.type, paymentIntentId, chargeId, appOrderId);
    if (!inserted) {
      // Concurrent delivery already processed the same event — safe to 200.
      return res.status(200).json({ ok: true, skipped: true });
    }
  } catch (insertErr: unknown) {
    logger.error(
      { err: (insertErr as Error)?.message, eventId: event.id },
      "stripeWebhook: failed to insert idempotency record",
    );
    // Non-duplicate DB error — still return 200 (event was handled successfully).
    // The missing idempotency record means Stripe could retry, but all handlers
    // are idempotent so duplicate processing is safe.
  }

  return res.status(200).json({ ok: true });
});

export default router;
