// Order-event transactional email notifier using nodemailer + SMTP.
//
// Mirrors the design of smsNotify.ts: best-effort, never throws, records
// analytics events on send/failure.
//
// Required environment variables (when email notifications are desired):
//   SMTP_HOST   — SMTP server hostname.
//   SMTP_PORT   — SMTP port (default: 587).
//   SMTP_SECURE — "true" for TLS-from-the-start (port 465); omit for STARTTLS.
//   SMTP_USER   — SMTP username; also used as the fallback From address.
//   SMTP_PASS   — SMTP password.
//
// Optional environment variables:
//   EMAIL_FROM         — Sender address (e.g. "orders@presentail.com").
//                        Falls back to SMTP_USER when unset.
//   EMAIL_NOTIFY_STATES — Comma-separated OrderState values that trigger an
//                        email (default: "confirmed,delivered").

import { createTransport } from "nodemailer";
import { db, analyticsEventsTable } from "@workspace/db";
import { logger } from "./logger";
import type { OrderState } from "./orderEvents";

// ---------------------------------------------------------------------------
// Locale-aware email copy (subject + plain-text body)
// ---------------------------------------------------------------------------

type Lang = "en" | "ar" | "fr";

function normalizeLang(raw: string | null | undefined): Lang {
  if (raw === "ar" || raw === "fr") return raw;
  return "en";
}

type EmailCopy = {
  subject: string;
  body: string;
};

const TRACKING_URL_BASE = () =>
  (process.env.SMS_TRACKING_URL_BASE ?? "https://presentail.com/orders").replace(/\/$/, "");

// Format an amount in minor units for display, using the ISO currency code.
// When currencyCode is "USD" or absent, falls back to the legacy "$" prefix.
// For other currencies, emits e.g. "AUD 510.00", "AED 125.00".
// All known currencies use 2 decimal places; this is correct for the currencies
// Presentail currently supports (USD, AED, AUD, SAR, KWD, OMR, QAR, etc.).
function formatAmount(cents: number, currencyCode?: string | null): string {
  const amount = (cents / 100).toFixed(2);
  const code = (currencyCode ?? "").toUpperCase().trim();
  if (!code || code === "USD") return `$${amount}`; // i18n-ignore
  return `${code} ${amount}`; // i18n-ignore
}

type EmailLineItem = { name: string; quantity: number; priceUsdCents: number };

function buildEmailCopy(
  state: OrderState,
  appOrderId: string,
  recipientName: string | null | undefined,
  lang: Lang,
  opts?: {
    deliveryDate?: string | null;
    deliverySlot?: string | null;
    totalUsdCents?: number | null;
    lineItems?: EmailLineItem[] | null;
    /** ISO 4217 currency code the customer actually paid in (e.g. "AUD", "AED"). */
    currencyCode?: string | null;
  },
): EmailCopy {
  const trackUrl = `${TRACKING_URL_BASE()}/${encodeURIComponent(appOrderId)}`;
  const recipient = recipientName ? ` for ${recipientName}` : "";
  const currency = opts?.currencyCode ?? null;

  // Line items store priceUsdCents in USD. When the payment currency is not USD,
  // we omit per-item prices from the email rather than showing misleading USD
  // amounts to a customer who paid in a different currency. The order total is
  // always shown in the correct payment currency (totalUsdCents stores payment-
  // currency minor units despite the field name). Full currency-aware itemisation
  // is a separate future task.
  const showItemPrices = !currency || currency.toUpperCase() === "USD";

  // Render one line per item, e.g. "  - Red Rose Bouquet × 2  ($58.00)"
  // Price is omitted for non-USD orders to avoid showing USD amounts to a
  // customer who paid in a different currency.
  function itemLinesEn(): string[] {
    if (!opts?.lineItems?.length) return [];
    return [
      `Items:`, // i18n-ignore
      ...opts.lineItems.map((it) =>
        showItemPrices
          ? `  - ${it.name} × ${it.quantity}  (${formatAmount(it.priceUsdCents, "USD")})` // i18n-ignore
          : `  - ${it.name} × ${it.quantity}`, // i18n-ignore
      ),
      ``,
    ];
  }
  function itemLinesAr(): string[] {
    if (!opts?.lineItems?.length) return [];
    return [
      `المنتجات:`, // i18n-ignore
      ...opts.lineItems.map((it) =>
        showItemPrices
          ? `  - ${it.name} × ${it.quantity}  (${formatAmount(it.priceUsdCents, "USD")})` // i18n-ignore
          : `  - ${it.name} × ${it.quantity}`, // i18n-ignore
      ),
      ``,
    ];
  }
  function itemLinesFr(): string[] {
    if (!opts?.lineItems?.length) return [];
    return [
      `Articles :`, // i18n-ignore
      ...opts.lineItems.map((it) =>
        showItemPrices
          ? `  - ${it.name} × ${it.quantity}  (${formatAmount(it.priceUsdCents, "USD")})` // i18n-ignore
          : `  - ${it.name} × ${it.quantity}`, // i18n-ignore
      ),
      ``,
    ];
  }

  // Build a summary block for the confirmed email.
  function confirmedSummaryEn(): string[] {
    const lines: string[] = [];
    lines.push(`Order reference : ${appOrderId}`); // i18n-ignore
    if (recipientName) lines.push(`For              : ${recipientName}`); // i18n-ignore
    if (opts?.deliveryDate) lines.push(`Delivery date    : ${opts.deliveryDate}`); // i18n-ignore
    if (opts?.deliverySlot) lines.push(`Delivery slot    : ${opts.deliverySlot}`); // i18n-ignore
    lines.push(``);
    lines.push(...itemLinesEn());
    if (opts?.totalUsdCents != null) lines.push(`Order total      : ${formatAmount(opts.totalUsdCents, currency)}`); // i18n-ignore
    return lines;
  }
  function confirmedSummaryAr(): string[] {
    const lines: string[] = [];
    lines.push(`رقم الطلب: ${appOrderId}`); // i18n-ignore
    if (recipientName) lines.push(`المستلم: ${recipientName}`); // i18n-ignore
    if (opts?.deliveryDate) lines.push(`تاريخ التوصيل: ${opts.deliveryDate}`); // i18n-ignore
    if (opts?.deliverySlot) lines.push(`وقت التوصيل: ${opts.deliverySlot}`); // i18n-ignore
    lines.push(``);
    lines.push(...itemLinesAr());
    if (opts?.totalUsdCents != null) lines.push(`إجمالي الطلب: ${formatAmount(opts.totalUsdCents, currency)}`); // i18n-ignore
    return lines;
  }
  function confirmedSummaryFr(): string[] {
    const lines: string[] = [];
    lines.push(`Référence de commande : ${appOrderId}`); // i18n-ignore
    if (recipientName) lines.push(`Pour                  : ${recipientName}`); // i18n-ignore
    if (opts?.deliveryDate) lines.push(`Date de livraison     : ${opts.deliveryDate}`); // i18n-ignore
    if (opts?.deliverySlot) lines.push(`Créneau de livraison  : ${opts.deliverySlot}`); // i18n-ignore
    lines.push(``);
    lines.push(...itemLinesFr());
    if (opts?.totalUsdCents != null) lines.push(`Total de la commande  : ${formatAmount(opts.totalUsdCents, currency)}`); // i18n-ignore
    return lines;
  }

  // Annotated i18n-ignore: these ARE the translated strings in the target language.
  if (state === "confirmed") {
    if (lang === "ar") {
      const summary = confirmedSummaryAr();
      return {
        subject: `تم تأكيد طلبك ${appOrderId}`, // i18n-ignore
        body: [
          `شكراً لطلبك من Presentail!`, // i18n-ignore
          ``,
          `لقد استلمنا طلبك. يقوم الأتيليه بتحضيره الآن.`, // i18n-ignore
          ``,
          ...summary,
          ``,
          `تتبّع طلبك هنا: ${trackUrl}`, // i18n-ignore
          ``,
          `فريق Presentail`, // i18n-ignore
        ].join("\n"),
      };
    }
    if (lang === "fr") {
      const summary = confirmedSummaryFr();
      return {
        subject: `Commande confirmée ${appOrderId}`, // i18n-ignore
        body: [
          `Merci pour votre commande Presentail !`, // i18n-ignore
          ``,
          `Nous avons bien reçu votre commande. Notre atelier la prépare.`, // i18n-ignore
          ``,
          ...summary,
          ``,
          `Suivez votre commande ici : ${trackUrl}`, // i18n-ignore
          ``,
          `L'équipe Presentail`, // i18n-ignore
        ].join("\n"),
      };
    }
    const summary = confirmedSummaryEn();
    return {
      subject: `Order confirmed — ${appOrderId}`, // i18n-ignore
      body: [
        `Thank you for your Presentail order!`, // i18n-ignore
        ``,
        `We've received your order. Our atelier is preparing it now.`, // i18n-ignore
        ``,
        ...summary,
        ``,
        `Track your order here: ${trackUrl}`, // i18n-ignore
        ``,
        `The Presentail Team`, // i18n-ignore
      ].join("\n"),
    };
  }

  if (state === "delivered") {
    if (lang === "ar") {
      const recipientAr = recipientName ? ` لـ${recipientName}` : "";
      return {
        subject: `تم تسليم طلبك ${appOrderId}`, // i18n-ignore
        body: [
          `تم توصيل هديتك${recipientAr} (${appOrderId}) بنجاح.`, // i18n-ignore
          ``,
          `شكراً لاختيارك Presentail. نأمل أن يكون المستلم سعيداً بهديتك!`, // i18n-ignore
          ``,
          `تفاصيل الطلب: ${trackUrl}`, // i18n-ignore
          ``,
          `فريق Presentail`, // i18n-ignore
        ].join("\n"),
      };
    }
    if (lang === "fr") {
      return {
        subject: `Livraison effectuée — ${appOrderId}`, // i18n-ignore
        body: [
          `Votre cadeau${recipient} (${appOrderId}) a été livré !`, // i18n-ignore
          ``,
          `Merci de choisir Presentail. Nous espérons que le destinataire sera ravi !`, // i18n-ignore
          ``,
          `Détails de la commande : ${trackUrl}`, // i18n-ignore
          ``,
          `L'équipe Presentail`, // i18n-ignore
        ].join("\n"),
      };
    }
    return {
      subject: `Delivered — ${appOrderId}`, // i18n-ignore
      body: [
        `Your gift${recipient} (${appOrderId}) has been delivered!`, // i18n-ignore
        ``,
        `Thank you for choosing Presentail. We hope the recipient loves it!`, // i18n-ignore
        ``,
        `Order details: ${trackUrl}`, // i18n-ignore
        ``,
        `The Presentail Team`, // i18n-ignore
      ].join("\n"),
    };
  }

  // Fallback for any other states added via EMAIL_NOTIFY_STATES in the future.
  return {
    subject: `Update on your order ${appOrderId}`, // i18n-ignore
    body: [
      `There is an update on your Presentail order ${appOrderId}.`, // i18n-ignore
      ``,
      `Track your order here: ${trackUrl}`, // i18n-ignore
      ``,
      `The Presentail Team`, // i18n-ignore
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Analytics event persistence
//
// Column mapping (same convention as smsNotify):
//   name      → "email_notify_sent" | "email_notify_failed"
//   action    → "email"
//   productId → appOrderId (opaque short identifier)
//   errorCode → error message on failure (clipped to 200 chars)
// ---------------------------------------------------------------------------

function recordEmailEvent(opts: {
  eventName: "email_notify_sent" | "email_notify_failed";
  appOrderId: string;
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
      action: "email",
      productId: opts.appOrderId.slice(0, 64),
      errorCode: clippedError,
      signedIn: false,
    })
    .catch((err: unknown) => {
      logger.warn(
        { err: (err as Error)?.message, appOrderId: opts.appOrderId },
        "emailNotify: failed to persist analytics event (non-fatal)",
      );
    });
}

// ---------------------------------------------------------------------------
// SMTP transport helper
// ---------------------------------------------------------------------------

function buildTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
}

// ---------------------------------------------------------------------------
// Notify-state config
// ---------------------------------------------------------------------------

function notifyStates(): Set<string> {
  const raw = process.env.EMAIL_NOTIFY_STATES ?? "confirmed,delivered"; // i18n-ignore
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type EmailNotifyInput = {
  state: OrderState;
  appOrderId: string;
  customerEmail: string | null | undefined;
  recipientName?: string | null;
  lang?: string | null;
  /** ISO date string (YYYY-MM-DD) for the scheduled delivery. */
  deliveryDate?: string | null;
  /** Human-readable slot label (e.g. "Morning (9am–1pm)"). */
  deliverySlot?: string | null;
  /**
   * Order total in the payment currency's minor units.
   * Despite the field name, this stores payment-currency minor units
   * (e.g. 51000 for AUD 510.00) — not necessarily USD cents.
   * Pair with `currencyCode` to display the correct amount and symbol.
   */
  totalUsdCents?: number | null;
  /** Resolved line item snapshot — rendered in the confirmed email body. */
  lineItems?: { name: string; quantity: number; priceUsdCents: number }[] | null;
  /**
   * ISO 4217 currency code the customer actually paid in (e.g. "AUD", "AED").
   * When present and non-USD, the total is rendered with the currency code
   * (e.g. "AUD 510.00"). Line-item prices are omitted for non-USD orders
   * because they are stored in USD and would be misleading.
   * Absent → falls back to USD formatting.
   */
  currencyCode?: string | null;
};

export type EmailNotifyResult = {
  emailSent: boolean;
  emailSkipped: boolean;
};

// ---------------------------------------------------------------------------
// Ops new-order notification (internal team email to hello@presentail.com)
// ---------------------------------------------------------------------------

export type OpsOrderEmailInput = {
  appOrderId: string;
  platform: string | null;
  storeKey: string | null;
  senderName: string | null;
  senderEmail: string | null;
  senderPhone: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  deliveryDate: string | null;
  deliverySlot: string | null;
  deliveryDistrict: string | null;
  deliveryAddress: string | null;
  cardMessage: string | null;
  paymentMethod: string | null;
  currencyCode: string | null;
  totalPaymentCents: number | null;
  couponCode: string | null;
  lineItems: { name: string; quantity: number }[] | null;
  osOrderId: string | number | null;
};

/**
 * Send a new-order notification email to the ops inbox (hello@presentail.com).
 *
 * Best-effort: never throws. A missing SMTP config results in a silent skip.
 * This is an ADDITIONAL step — it does not replace any existing flow.
 */
export async function sendOpsNewOrderEmail(input: OpsOrderEmailInput): Promise<void> {
  const transport = buildTransport();
  if (!transport) return;

  const to = process.env.OPS_ORDER_EMAIL ?? "hello@presentail.com"; // i18n-ignore
  const from = process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? "orders@presentail.com"; // i18n-ignore

  const amount =
    input.totalPaymentCents != null
      ? formatAmount(input.totalPaymentCents, input.currencyCode)
      : "—"; // i18n-ignore

  const itemLines = (input.lineItems ?? [])
    .map((it) => `  - ${it.name} × ${it.quantity}`) // i18n-ignore
    .join("\n");

  const lines: string[] = [
    `New order: ${input.appOrderId}`, // i18n-ignore
    `Platform: ${input.platform ?? "—"} | Store: ${input.storeKey ?? "—"} | Payment: ${input.paymentMethod ?? "—"}`, // i18n-ignore
    `Amount: ${amount}${input.couponCode ? ` (coupon: ${input.couponCode})` : ""}`, // i18n-ignore
    `OS Order: ${input.osOrderId ?? "pending"}`, // i18n-ignore
    ``,
    `── Sender ──`, // i18n-ignore
    `Name:  ${input.senderName ?? "—"}`, // i18n-ignore
    `Email: ${input.senderEmail ?? "—"}`, // i18n-ignore
    `Phone: ${input.senderPhone ?? "—"}`, // i18n-ignore
    ``,
    `── Recipient ──`, // i18n-ignore
    `Name:  ${input.recipientName ?? "—"}`, // i18n-ignore
    `Phone: ${input.recipientPhone ?? "—"}`, // i18n-ignore
    ``,
    `── Delivery ──`, // i18n-ignore
    `Date:     ${input.deliveryDate ?? "—"}  |  Slot: ${input.deliverySlot ?? "—"}`, // i18n-ignore
    `District: ${input.deliveryDistrict ?? "—"}`, // i18n-ignore
    `Address:  ${input.deliveryAddress ?? "—"}`, // i18n-ignore
    ``,
    `── Items ──`, // i18n-ignore
    itemLines || "  (none)", // i18n-ignore
  ];

  if (input.cardMessage) {
    lines.push(``, `Card message: "${input.cardMessage}"`); // i18n-ignore
  }

  try {
    await transport.sendMail({
      from,
      to,
      subject: `New order ${input.appOrderId}${input.storeKey ? ` — ${input.storeKey}` : ""}`, // i18n-ignore
      text: lines.join("\n"),
    });
    logger.info({ appOrderId: input.appOrderId, to }, "emailNotify: ops new-order email sent"); // i18n-ignore
  } catch (err: unknown) {
    logger.warn(
      { appOrderId: input.appOrderId, to, error: (err as Error)?.message },
      "emailNotify: ops new-order email failed (non-fatal)", // i18n-ignore
    );
  }
}

/**
 * Send a transactional order-event email to the customer.
 *
 * Best-effort: never throws. A missing email, unconfigured SMTP, or a send
 * failure all result in a graceful skip + WARN log. Errors never block the
 * calling webhook handler.
 */
export async function sendOrderEventEmail(
  input: EmailNotifyInput,
): Promise<EmailNotifyResult> {
  const { state, appOrderId, customerEmail, recipientName, lang, deliveryDate, deliverySlot, totalUsdCents, lineItems, currencyCode } = input;

  // Skip when the state is not in the notify list.
  if (!notifyStates().has(state)) {
    return { emailSent: false, emailSkipped: true };
  }

  // Skip when there is no customer email to send to.
  if (!customerEmail) {
    logger.info(
      { appOrderId, state },
      "emailNotify: no customer email on file — skipping email",
    );
    return { emailSent: false, emailSkipped: true };
  }

  // Skip when SMTP is not configured.
  const transport = buildTransport();
  if (!transport) {
    return { emailSent: false, emailSkipped: true };
  }

  const from =
    process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? "orders@presentail.com"; // i18n-ignore
  const normalizedLang = normalizeLang(lang);
  const { subject, body } = buildEmailCopy(state, appOrderId, recipientName, normalizedLang, {
    deliveryDate,
    deliverySlot,
    totalUsdCents,
    lineItems,
    currencyCode,
  });

  try {
    await transport.sendMail({
      from,
      to: customerEmail,
      subject,
      text: body,
    });
    logger.info({ appOrderId, state, to: customerEmail }, "emailNotify: email sent");
    recordEmailEvent({ eventName: "email_notify_sent", appOrderId });
    return { emailSent: true, emailSkipped: false };
  } catch (err: unknown) {
    const message = (err as Error)?.message ?? "unknown error"; // i18n-ignore
    logger.warn(
      { appOrderId, state, to: customerEmail, error: message },
      "emailNotify: email delivery failed (non-fatal)",
    );
    recordEmailEvent({ eventName: "email_notify_failed", appOrderId, error: message });
    return { emailSent: false, emailSkipped: false };
  }
}
