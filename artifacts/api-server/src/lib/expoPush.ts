import { logger } from "./logger";

export type ExpoPushMessage = {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  channelId?: string;
  priority?: "default" | "normal" | "high";
};

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoSendResult = {
  data?: ExpoTicket[];
  errors?: { code?: string; message?: string }[];
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Tokens that are no longer deliverable. Caller should remove these.
export type SendResult = {
  sent: number;
  invalidTokens: string[];
};

// Send a batch of Expo push messages. Returns delivery counters and the
// subset of `to` tokens reported by Expo as DeviceNotRegistered so the
// caller can prune them.
//
// Best-effort: network errors are logged and do not throw — push delivery
// must never bring down an order-creation flow.
export async function sendExpoPush(
  messages: ExpoPushMessage[],
): Promise<SendResult> {
  const result: SendResult = { sent: 0, invalidTokens: [] };
  if (!messages.length) return result;

  // Expo accepts at most 100 messages per request.
  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    try {
      const r = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });
      const json = (await r.json().catch(() => ({}))) as ExpoSendResult;
      if (!r.ok) {
        logger.warn(
          { status: r.status, errors: json.errors },
          "expoPush: non-ok response",
        );
        continue;
      }
      const tickets = json.data ?? [];
      tickets.forEach((ticket, idx) => {
        const target = chunk[idx];
        if (ticket.status === "ok") {
          result.sent += 1;
        } else if (
          ticket.details?.error === "DeviceNotRegistered" ||
          ticket.message?.includes("not a registered push notification recipient")
        ) {
          if (target) result.invalidTokens.push(target.to);
        } else {
          logger.warn(
            { ticket },
            "expoPush: ticket reported error",
          );
        }
      });
    } catch (err) {
      logger.warn({ err }, "expoPush: send failed");
    }
  }

  return result;
}
