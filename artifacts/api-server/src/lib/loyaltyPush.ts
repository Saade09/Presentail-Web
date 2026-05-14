import { db, pushTokensTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { sendExpoPush, type ExpoPushMessage } from "./expoPush";

export type LoyaltyUnlockPushInput = {
  userId: number;
  tierLabel: string;
  discountPercent: number;
  code: string;
};

// Best-effort push notification fired when a customer unlocks (or replaces)
// a tier coupon. Looks up all push tokens registered to the user — never
// throws so loyalty crediting is never blocked by a notification failure.
export async function sendLoyaltyUnlockPush(
  input: LoyaltyUnlockPushInput,
): Promise<number> {
  let tokens: { token: string }[] = [];
  try {
    tokens = await db
      .select({ token: pushTokensTable.token })
      .from(pushTokensTable)
      .where(eq(pushTokensTable.userId, input.userId));
  } catch (err) {
    logger.warn({ err, userId: input.userId }, "loyaltyPush: token lookup failed");
    return 0;
  }
  const unique = Array.from(new Set(tokens.map((r) => r.token))).filter(
    Boolean,
  );
  if (!unique.length) return 0;

  const messages: ExpoPushMessage[] = unique.map((to) => ({
    to,
    title: `${input.tierLabel} unlocked`,
    body: `Enjoy ${input.discountPercent}% off your next order with code ${input.code}.`,
    sound: "default",
    priority: "high",
    data: {
      type: "loyalty_unlock",
      tierLabel: input.tierLabel,
      discountPercent: input.discountPercent,
      code: input.code,
    },
  }));

  try {
    const result = await sendExpoPush(messages);
    if (result.invalidTokens.length) {
      try {
        await db
          .delete(pushTokensTable)
          .where(inArray(pushTokensTable.token, result.invalidTokens));
      } catch {
        // best-effort prune
      }
    }
    return result.sent;
  } catch (err) {
    logger.warn({ err, userId: input.userId }, "loyaltyPush: send failed");
    return 0;
  }
}
