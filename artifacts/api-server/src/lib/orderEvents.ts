import { db, pushTokensTable } from "@workspace/db";
import { eq, inArray, or } from "drizzle-orm";
import { logger } from "./logger";
import { sendExpoPush, type ExpoPushMessage } from "./expoPush";

export type OrderState =
  | "confirmed"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refunded";

const COPY: Record<
  OrderState,
  { title: string; body: (orderId: string, recipient?: string | null) => string }
> = {
  confirmed: {
    title: "Order confirmed",
    body: (id) =>
      `We've received your order ${id}. Our atelier is preparing it now.`,
  },
  out_for_delivery: {
    title: "Out for delivery",
    body: (id, recipient) =>
      recipient
        ? `Your gift for ${recipient} (${id}) has left the atelier and is on its way.`
        : `Your order ${id} has left the atelier and is on its way.`,
  },
  delivered: {
    title: "Delivered",
    body: (id, recipient) =>
      recipient
        ? `Your gift for ${recipient} (${id}) has been delivered. Thank you for choosing Presentail.`
        : `Your order ${id} has been delivered. Thank you for choosing Presentail.`,
  },
  cancelled: {
    title: "Order cancelled",
    body: (id) =>
      `Your order ${id} has been cancelled. Any loyalty points credited for it have been reversed.`,
  },
  refunded: {
    title: "Order refunded",
    body: (id) =>
      `Your order ${id} has been refunded. Any loyalty points credited for it have been reversed.`,
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

  const copy = COPY[state];
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
