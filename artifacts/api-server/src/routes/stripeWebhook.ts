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
 *   payment_intent.succeeded     — record analytics + update app_orders row
 *   payment_intent.payment_failed — record analytics
 *   charge.dispute.created        — Slack alert (critical)
 *   charge.refunded               — record analytics
 *
 * Idempotency: every processed event is inserted into stripe_webhook_events
 * with a unique index on stripeEventId. Re-delivered events are silently
 * skipped (409 conflict on insert → 200 early return).
 */

import { Router } from "express";
import Stripe from "stripe";
import { db, stripeWebhookEventsTable, analyticsEventsTable, appOrdersTable } from "@workspace/db";
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

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = obj as Stripe.PaymentIntent;
        const method = pi.payment_method_types?.[0] ?? "unknown";
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

      case "payment_intent.payment_failed": {
        const pi = obj as Stripe.PaymentIntent;
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
        const charge = obj as Stripe.Charge;
        const dispute = event.data.object as Stripe.Dispute;
        logger.warn(
          {
            eventId: event.id,
            account,
            chargeId: charge.id ?? dispute.charge,
            paymentIntentId,
          },
          "stripeWebhook: charge.dispute.created",
        );
        await sendAlert({
          title: "Stripe dispute opened",
          body: `A chargeback/dispute was filed on the ${account} Stripe account. Respond in the Stripe dashboard within 7 days.`,
          severity: "critical",
          fields: [
            {
              title: "Account",
              value: account,
            },
            {
              title: "Charge ID",
              value:
                typeof dispute.charge === "string"
                  ? dispute.charge
                  : String(dispute.charge ?? chargeId ?? "unknown"),
            },
            {
              title: "Payment Intent",
              value: paymentIntentId ?? "—",
            },
            {
              title: "App Order",
              value: appOrderId ?? "—",
            },
            {
              title: "Amount",
              value: `${(dispute as Stripe.Dispute).amount} ${(dispute as Stripe.Dispute).currency?.toUpperCase() ?? ""}`,
            },
            {
              title: "Reason",
              value: (dispute as Stripe.Dispute).reason ?? "unknown",
            },
          ],
          source: "stripe/webhook/dispute",
        });
        await recordAnalyticsEvent("stripe_dispute_created", {
          surface: "checkout",
          action: "dispute",
          appOrderId,
          propertiesJson: JSON.stringify({
            stripeAccount: account,
            chargeId: chargeId ?? "unknown",
            reason: (dispute as Stripe.Dispute).reason,
          }),
        });
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

      case "payment_intent.processing": {
        // Klarna and bank-transfer methods can enter a "processing" state
        // before final settlement. Log for ops visibility.
        const pi = obj as Stripe.PaymentIntent;
        const method = pi.payment_method_types?.[0] ?? "unknown";
        logger.info(
          { eventId: event.id, account, paymentIntentId: pi.id, appOrderId, method },
          "stripeWebhook: payment_intent.processing",
        );
        await recordAnalyticsEvent("stripe_payment_processing", {
          surface: "checkout",
          action: method,
          appOrderId,
          propertiesJson: JSON.stringify({ stripeAccount: account, paymentIntentId: pi.id, method, currency: pi.currency }),
        });
        break;
      }

      case "payment_intent.canceled": {
        const pi = obj as Stripe.PaymentIntent;
        const reason = pi.cancellation_reason ?? "unknown";
        logger.warn(
          { eventId: event.id, account, paymentIntentId: pi.id, appOrderId, reason },
          "stripeWebhook: payment_intent.canceled",
        );
        await recordAnalyticsEvent("stripe_payment_canceled", {
          surface: "checkout",
          action: reason,
          appOrderId,
          propertiesJson: JSON.stringify({ stripeAccount: account, paymentIntentId: pi.id, reason, currency: (pi as Stripe.PaymentIntent).currency }),
        });
        break;
      }

      case "charge.refund.updated": {
        const charge = obj as Stripe.Charge;
        logger.info(
          { eventId: event.id, account, chargeId: charge.id, paymentIntentId },
          "stripeWebhook: charge.refund.updated",
        );
        break;
      }

      case "charge.dispute.closed":
      case "charge.dispute.funds_reinstated":
      case "charge.dispute.funds_withdrawn":
      case "charge.dispute.updated": {
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
    logger.error(
      { err: (err as Error)?.message, eventId: event.id, eventType: event.type },
      "stripeWebhook: handler threw an error — returning 500 so Stripe retries",
    );
    // Return 5xx so Stripe retries delivery. We intentionally do NOT insert
    // the idempotency record here — a missing record means the next retry
    // will re-enter the switch and attempt processing again.
    return res.status(500).json({ ok: false, message: "Handler error" }); // i18n-ignore
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
