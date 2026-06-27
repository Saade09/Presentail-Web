// SMS / WhatsApp delivery-update notifier using the Twilio Messages REST API.
//
// Intentionally uses `fetch` directly (no `twilio` npm package) to keep
// the server bundle small and consistent with how `expoPush.ts` works.
//
// Required environment variables (when SMS notifications are desired):
//   TWILIO_ACCOUNT_SID   — Twilio Account SID (starts with "AC")
//   TWILIO_AUTH_TOKEN    — Twilio Auth Token
//   TWILIO_FROM          — Default sender: E.164 number ("+12223334455"),
//                          Twilio Messaging Service SID ("MG…"), or
//                          alphanumeric sender ID where supported.
//
// Optional environment variables:
//   TWILIO_FROM_LB       — Lebanon-specific sender override.
//   TWILIO_FROM_AE       — UAE-specific sender override (Dubai + Abu Dhabi).
//   TWILIO_FROM_CY       — Cyprus-specific sender override.
//   TWILIO_WHATSAPP_FROM — WhatsApp-enabled sender, e.g. "whatsapp:+14155238886".
//                          Required when SMS_CHANNEL includes "whatsapp".
//   SMS_CHANNEL          — "sms" | "whatsapp" | "both" (default: "sms").
//   SMS_NOTIFY_STATES    — Comma-separated OrderState values that trigger an
//                          SMS (default: "out_for_delivery,delivered").
//   SMS_TRACKING_URL_BASE — Base URL for the tracking deep-link included in
//                          the message body (default: "https://presentail.com/orders").

import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import type { OrderState } from "./orderEvents";

// ---------------------------------------------------------------------------
// Per-country sender selection
// ---------------------------------------------------------------------------

// Maps the canonical storeKey → ISO-2 country for env-var lookup.
const STORE_COUNTRY: Record<string, "LB" | "AE" | "CY"> = {
  lebanon: "LB",
  dubai: "AE",
  abudhabi: "AE",
  cyprus: "CY",
};

function senderForStore(storeKey: string | null | undefined): string {
  const country = storeKey ? STORE_COUNTRY[storeKey.toLowerCase()] : undefined;
  if (country === "LB" && process.env.TWILIO_FROM_LB) return process.env.TWILIO_FROM_LB;
  if (country === "AE" && process.env.TWILIO_FROM_AE) return process.env.TWILIO_FROM_AE;
  if (country === "CY" && process.env.TWILIO_FROM_CY) return process.env.TWILIO_FROM_CY;
  return process.env.TWILIO_FROM ?? "";
}

// ---------------------------------------------------------------------------
// Message copy
// ---------------------------------------------------------------------------

const TRACKING_URL_BASE = () =>
  (process.env.SMS_TRACKING_URL_BASE ?? "https://presentail.com/orders").replace(/\/$/, "");

function buildMessageBody(
  state: OrderState,
  appOrderId: string,
  recipientName: string | null | undefined,
): string {
  const trackUrl = `${TRACKING_URL_BASE()}/${encodeURIComponent(appOrderId)}`;
  const recipient = recipientName ? ` for ${recipientName}` : "";
  switch (state) {
    case "out_for_delivery":
      return (
        `Presentail: Your gift${recipient} (Order ${appOrderId}) has left our atelier and is on its way. ` + // i18n-ignore
        `Track here: ${trackUrl}`
      );
    case "delivered":
      return (
        `Presentail: Your gift${recipient} (Order ${appOrderId}) has been delivered. ` + // i18n-ignore
        `Thank you for choosing Presentail! ${trackUrl}` // i18n-ignore
      );
    case "confirmed":
      return (
        `Presentail: We've received your order ${appOrderId}. Our atelier is preparing it now. ` +
        `Track here: ${trackUrl}`
      );
    case "cancelled":
      return `Presentail: Your order ${appOrderId} has been cancelled. Reply or call us if you have questions.`; // i18n-ignore
    case "refunded":
      return `Presentail: Your order ${appOrderId} has been refunded. Reply or call us if you have questions.`; // i18n-ignore
    default:
      return `Presentail: Update on order ${appOrderId}. Track here: ${trackUrl}`; // i18n-ignore
  }
}

// ---------------------------------------------------------------------------
// Twilio REST call
// ---------------------------------------------------------------------------

async function twilioSend(opts: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${opts.accountSid}/Messages.json`;
  const credentials = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64");

  const params = new URLSearchParams({
    From: opts.from,
    To: opts.to,
    Body: opts.body,
  });

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const json = (await r.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
      error_message?: string;
    };
    if (!r.ok) {
      return { ok: false, error: json.message ?? json.error_message ?? `HTTP ${r.status}` };
    }
    return { ok: true, sid: json.sid };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "fetch failed" }; // i18n-ignore
  }
}

// ---------------------------------------------------------------------------
// Analytics event persistence
//
// Column mapping:
//   name      → "sms_notify_sent" | "sms_notify_failed"
//   action    → channel: "sms" | "whatsapp"
//   platform  → storeKey (normalised to lowercase, e.g. "lebanon", "dubai")
//   productId → appOrderId (reused as a short opaque identifier)
//   errorCode → error message on failure (clipped to 200 chars)
// ---------------------------------------------------------------------------

function recordSmsEvent(opts: {
  eventName: "sms_notify_sent" | "sms_notify_failed";
  channel: "sms" | "whatsapp";
  appOrderId: string;
  storeKey: string | null | undefined;
  error?: string;
}): void {
  const clippedError = opts.error
    ? opts.error.length > 200
      ? `${opts.error.slice(0, 200)}…`
      : opts.error
    : null;
  void db
    .insert(analyticsEventsTable)
    .values({
      name: opts.eventName,
      action: opts.channel,
      platform: opts.storeKey ? opts.storeKey.toLowerCase() : null,
      productId: opts.appOrderId.slice(0, 64),
      errorCode: clippedError,
      signedIn: false,
    })
    .catch((err: unknown) => {
      logger.warn(
        { err: (err as Error)?.message, appOrderId: opts.appOrderId },
        "smsNotify: failed to persist analytics event (non-fatal)",
      );
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type SmsNotifyInput = {
  state: OrderState;
  appOrderId: string;
  senderPhone: string | null | undefined;
  recipientName?: string | null;
  storeKey?: string | null;
};

export type SmsNotifyResult = {
  smsSent: number;
  smsSkipped: boolean;
};

// Resolve which states trigger an SMS (env-configurable; default: out_for_delivery, delivered).
function notifyStates(): Set<string> {
  const raw = process.env.SMS_NOTIFY_STATES ?? "out_for_delivery,delivered";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

// SMS_CHANNEL: "sms" | "whatsapp" | "both" (default: "sms")
function channels(): Array<"sms" | "whatsapp"> {
  const ch = (process.env.SMS_CHANNEL ?? "sms").toLowerCase();
  if (ch === "whatsapp") return ["whatsapp"];
  if (ch === "both") return ["sms", "whatsapp"];
  return ["sms"];
}

// Best-effort: never throws, always returns a result. Mirrors the design of
// `sendOrderEventPush` — SMS delivery must never fail an order-event request.
export async function sendOrderEventSms(
  input: SmsNotifyInput,
): Promise<SmsNotifyResult> {
  const { state, appOrderId, senderPhone, recipientName, storeKey } = input;

  // Skip immediately when Twilio credentials are not configured.
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return { smsSent: 0, smsSkipped: true };
  }

  // Skip when the state is not in the notify list.
  if (!notifyStates().has(state)) {
    return { smsSent: 0, smsSkipped: true };
  }

  // Skip when there is no phone to send to.
  if (!senderPhone) {
    return { smsSent: 0, smsSkipped: true };
  }

  const messageBody = buildMessageBody(state, appOrderId, recipientName);
  let smsSent = 0;

  for (const channel of channels()) {
    if (channel === "whatsapp") {
      const waFrom = process.env.TWILIO_WHATSAPP_FROM;
      if (!waFrom) {
        logger.warn(
          { appOrderId },
          "smsNotify: SMS_CHANNEL includes whatsapp but TWILIO_WHATSAPP_FROM is not set; skipping WhatsApp leg",
        );
        continue;
      }
      const waTo = senderPhone.startsWith("whatsapp:") ? senderPhone : `whatsapp:${senderPhone}`;
      const result = await twilioSend({
        accountSid,
        authToken,
        from: waFrom.startsWith("whatsapp:") ? waFrom : `whatsapp:${waFrom}`,
        to: waTo,
        body: messageBody,
      });
      if (result.ok) {
        smsSent += 1;
        logger.info({ appOrderId, sid: result.sid }, "smsNotify: WhatsApp sent");
        recordSmsEvent({ eventName: "sms_notify_sent", channel: "whatsapp", appOrderId, storeKey });
      } else {
        logger.warn(
          { appOrderId, error: result.error },
          "smsNotify: WhatsApp delivery failed (non-fatal)",
        );
        recordSmsEvent({
          eventName: "sms_notify_failed",
          channel: "whatsapp",
          appOrderId,
          storeKey,
          error: result.error,
        });
      }
    } else {
      const from = senderForStore(storeKey);
      if (!from) {
        logger.warn(
          { appOrderId, storeKey },
          "smsNotify: no TWILIO_FROM configured for SMS; skipping SMS leg",
        );
        continue;
      }
      const to = senderPhone.startsWith("whatsapp:") ? senderPhone.slice(9) : senderPhone;
      const result = await twilioSend({ accountSid, authToken, from, to, body: messageBody });
      if (result.ok) {
        smsSent += 1;
        logger.info({ appOrderId, sid: result.sid }, "smsNotify: SMS sent");
        recordSmsEvent({ eventName: "sms_notify_sent", channel: "sms", appOrderId, storeKey });
      } else {
        logger.warn(
          { appOrderId, error: result.error },
          "smsNotify: SMS delivery failed (non-fatal)",
        );
        recordSmsEvent({
          eventName: "sms_notify_failed",
          channel: "sms",
          appOrderId,
          storeKey,
          error: result.error,
        });
      }
    }
  }

  return { smsSent, smsSkipped: false };
}
