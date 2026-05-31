import { db, pushTokensTable, customersTable } from "@workspace/db";
import { eq, inArray, or } from "drizzle-orm";
import { logger } from "./logger";
import { sendExpoPush, type ExpoPushMessage } from "./expoPush";

export type OrderState =
  | "confirmed"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refunded";

// Supported notification languages. Matches CUSTOMER_LANGS in the DB schema.
type Lang = "en" | "ar" | "fr";

function normalizeLang(raw: string | null | undefined): Lang {
  if (raw === "ar" || raw === "fr") return raw;
  return "en";
}

type CopyEntry = {
  title: string;
  body: (orderId: string, recipient?: string | null) => string;
};

// Locale-aware push notification copy. Each state has translations for EN,
// AR, and FR. The correct variant is chosen at send time from the customer's
// `preferredLang` column (default: "en"). Annotated with i18n-ignore because
// these ARE the translated strings — they are intentionally in the target
// language and are not accidentally hardcoded English prose.
const COPY: Record<OrderState, Record<Lang, CopyEntry>> = {
  confirmed: {
    en: {
      title: "Order confirmed", // i18n-ignore
      body: (id) => `We've received your order ${id}. Our atelier is preparing it now.`, // i18n-ignore
    },
    ar: {
      title: "تم تأكيد الطلب",
      body: (id) => `لقد استلمنا طلبك ${id}. يقوم الأتيليه بتحضيره الآن.`,
    },
    fr: {
      title: "Commande confirmée", // i18n-ignore
      body: (id) => `Nous avons bien reçu votre commande ${id}. Notre atelier la prépare.`, // i18n-ignore
    },
  },
  out_for_delivery: {
    en: {
      title: "Out for delivery", // i18n-ignore
      body: (id, recipient) =>
        recipient
          ? `Your gift for ${recipient} (${id}) has left the atelier and is on its way.` // i18n-ignore
          : `Your order ${id} has left the atelier and is on its way.`, // i18n-ignore
    },
    ar: {
      title: "في طريقه إليك",
      body: (id, recipient) =>
        recipient
          ? `هديتك لـ${recipient} (${id}) غادرت الأتيليه وهي في الطريق إليك.`
          : `طلبك ${id} غادر الأتيليه وهو في الطريق إليك.`,
    },
    fr: {
      title: "En cours de livraison", // i18n-ignore
      body: (id, recipient) =>
        recipient
          ? `Votre cadeau pour ${recipient} (${id}) a quitté l'atelier et est en route.` // i18n-ignore
          : `Votre commande ${id} a quitté l'atelier et est en route.`, // i18n-ignore
    },
  },
  delivered: {
    en: {
      title: "Delivered", // i18n-ignore
      body: (id, recipient) =>
        recipient
          ? `Your gift for ${recipient} (${id}) has been delivered. Thank you for choosing Presentail.` // i18n-ignore
          : `Your order ${id} has been delivered. Thank you for choosing Presentail.`, // i18n-ignore
    },
    ar: {
      title: "تم التوصيل",
      body: (id, recipient) =>
        recipient
          ? `تم تسليم هديتك لـ${recipient} (${id}). شكراً لاختيارك Presentail.`
          : `تم تسليم طلبك ${id}. شكراً لاختيارك Presentail.`,
    },
    fr: {
      title: "Livré", // i18n-ignore
      body: (id, recipient) =>
        recipient
          ? `Votre cadeau pour ${recipient} (${id}) a été livré. Merci de choisir Presentail.` // i18n-ignore
          : `Votre commande ${id} a été livrée. Merci de choisir Presentail.`, // i18n-ignore
    },
  },
  cancelled: {
    en: {
      title: "Order cancelled", // i18n-ignore
      body: (id) =>
        `Your order ${id} has been cancelled. Any loyalty points credited for it have been reversed.`, // i18n-ignore
    },
    ar: {
      title: "تم إلغاء الطلب",
      body: (id) =>
        `تم إلغاء طلبك ${id}. سيتم استعادة أي نقاط ولاء مضافة إليه.`,
    },
    fr: {
      title: "Commande annulée", // i18n-ignore
      body: (id) =>
        `Votre commande ${id} a été annulée. Les points de fidélité crédités ont été annulés.`, // i18n-ignore
    },
  },
  refunded: {
    en: {
      title: "Order refunded", // i18n-ignore
      body: (id) =>
        `Your order ${id} has been refunded. Any loyalty points credited for it have been reversed.`, // i18n-ignore
    },
    ar: {
      title: "تم استرداد الطلب",
      body: (id) =>
        `تم استرداد مبلغ طلبك ${id}. سيتم استعادة أي نقاط ولاء مضافة إليه.`,
    },
    fr: {
      title: "Commande remboursée", // i18n-ignore
      body: (id) =>
        `Votre commande ${id} a été remboursée. Les points de fidélité crédités ont été annulés.`, // i18n-ignore
    },
  },
};

export type SendOrderEventInput = {
  state: OrderState;
  appOrderId: string;
  wcOrderId?: number | null;
  userId?: number | null;
  deviceId?: string | null;
  recipientName?: string | null;
  customTitle?: string;
  customBody?: string;
};

// Look up the customer's preferred language from the local customers table.
// `userId` here is the WC customer id stored on push tokens and app orders.
// Returns "en" when the row doesn't exist or has no language preference set.
async function resolveCustomerLang(userId: number): Promise<Lang> {
  try {
    const rows = await db
      .select({ preferredLang: customersTable.preferredLang })
      .from(customersTable)
      .where(eq(customersTable.wcCustomerId, userId))
      .limit(1);
    return normalizeLang(rows[0]?.preferredLang ?? null);
  } catch {
    return "en";
  }
}

// Look up registered push tokens for the recipient and send a state push.
// Best-effort: returns 0 when there is no recipient or no tokens, never throws.
export async function sendOrderEventPush(
  input: SendOrderEventInput,
): Promise<number> {
  const { state, appOrderId, wcOrderId, userId, deviceId, recipientName } = input;
  if (userId == null && !deviceId) return 0;

  let tokens: { token: string }[] = [];
  try {
    const conditions = [];
    if (userId != null) conditions.push(eq(pushTokensTable.userId, userId));
    if (deviceId) conditions.push(eq(pushTokensTable.deviceId, deviceId));
    const where = conditions.length === 1 ? conditions[0] : or(...conditions);
    tokens = await db
      .select({ token: pushTokensTable.token })
      .from(pushTokensTable)
      .where(where);
  } catch (err) {
    logger.warn({ err, appOrderId }, "orderEvents: lookup failed");
    return 0;
  }

  // De-duplicate (a user may have signed in on a device that was previously
  // registered with the same token under a deviceId).
  const unique = Array.from(new Set(tokens.map((r) => r.token))).filter(Boolean);
  if (!unique.length) return 0;

  // Resolve the customer's preferred language for locale-aware copy.
  // Falls back to "en" for guest orders or when the customer row isn't found.
  const lang = userId != null ? await resolveCustomerLang(userId) : "en";

  const copy = COPY[state][lang];
  const title = input.customTitle ?? copy.title;
  const body = input.customBody ?? copy.body(appOrderId, recipientName ?? null);

  const trackingUrl =
    wcOrderId != null
      ? `https://orderstatus.presentail.com?order=${wcOrderId}`
      : undefined;

  const messages: ExpoPushMessage[] = unique.map((to) => ({
    to,
    title,
    body,
    sound: "default",
    priority: "high",
    data: {
      type: "order_event",
      state,
      appOrderId,
      ...(wcOrderId != null ? { wcOrderId } : {}),
      ...(trackingUrl ? { url: trackingUrl } : {}),
    },
  }));

  const result = await sendExpoPush(messages);

  if (result.invalidTokens.length) {
    try {
      await db
        .delete(pushTokensTable)
        .where(inArray(pushTokensTable.token, result.invalidTokens));
    } catch (err) {
      logger.warn(
        { err, count: result.invalidTokens.length },
        "orderEvents: failed to prune invalid tokens",
      );
    }
  }

  return result.sent;
}
