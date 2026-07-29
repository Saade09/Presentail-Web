// Slack notifications for UAE (AE) orders.
//
// Posts a message to a city-specific Slack channel when a UAE order is
// successfully finalized, using the Replit Slack connection (Web API
// chat.postMessage via the connectors proxy — no webhook URLs needed):
//   • Abu Dhabi               → #abudhabi-orders
//   • every other AE district → #dubai-order
//
// The message follows the ops team's manual posting format:
//
//   Below Order for today between 2 PM and 6 PM Dubai Time
//
//   Customer: <name> - <phone>
//   Receiver: <name>
//   Phone number: <phone>
//   Address: <address>, <district>, AE
//   Delivery date: Jul 29, 2026 · 2 PM - 6 PM
//   Items: 1× Red Roses Bouquet
//   Total: $84.50 USD (charged in AED)
//   Card message:
//
//   To: JP
//   HAPPY BIRTHDAY
//   From: E.
//
//   @channel please send picture here to check before delivery
//
// followed by the product image(s) as Slack image blocks.
//
// Channel names can be overridden via SLACK_ABUDHABI_ORDER_CHANNEL /
// SLACK_DUBAI_ORDER_CHANNEL (name like "#dubai-order" or a channel ID).
//
// Non-UAE orders never trigger a message. Sending is strictly best-effort:
// failures are logged at WARN and never affect the order response.

import { ReplitConnectors } from "@replit/connectors-sdk";
import { getLocalIso } from "@workspace/delivery";
import { logger } from "./logger";
import { countryForDistrict } from "./catalog";

const ABU_DHABI_DISTRICT = "Abu Dhabi";

/** Max product images attached to a single Slack message. */
const MAX_IMAGE_BLOCKS = 5;

export type UaeOrderChannel = "abudhabi" | "dubai";

/**
 * Pick the Slack channel for an order's delivery district.
 * Returns null for non-UAE districts (no notification).
 */
export function uaeOrderChannelForDistrict(district: string): UaeOrderChannel | null {
  if (countryForDistrict(district) !== "AE") return null;
  return district === ABU_DHABI_DISTRICT ? "abudhabi" : "dubai";
}

export function slackChannelName(channel: UaeOrderChannel): string {
  return channel === "abudhabi"
    ? process.env.SLACK_ABUDHABI_ORDER_CHANNEL || "#abudhabi-orders"
    : process.env.SLACK_DUBAI_ORDER_CHANNEL || "#dubai-order";
}

export type UaeOrderNotification = {
  orderId: string;
  osOrderId?: number | string | null;
  customerName: string;
  customerPhone?: string;
  recipientName?: string;
  recipientPhone?: string;
  /** Free-text delivery address (deliveryDetails). */
  address?: string;
  district: string;
  /** ISO date, e.g. "2026-07-29". */
  deliveryDate?: string;
  /** Slot label, e.g. "2 PM - 6 PM". */
  deliverySlot?: string;
  cardMessage?: string;
  cardTo?: string;
  cardFrom?: string;
  /** Authoritative order total in USD (when known). */
  totalUsd?: number | null;
  /** Currency the customer was charged in, e.g. "AED" (when known). */
  chargedCurrency?: string | null;
  items: { name: string; quantity: number; imageUrl?: string | null }[];
};

function formatDeliveryDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return isNaN(d.getTime())
    ? isoDate
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "2 PM - 6 PM" → "between 2 PM and 6 PM"; other labels → "at <label>". */
function slotPhrase(slot: string): string {
  const parts = slot.split(/\s*[-–]\s*/);
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `between ${parts[0].trim()} and ${parts[1].trim()}`;
  }
  return `at ${slot.trim()}`;
}

export function formatUaeOrderMessage(n: UaeOrderNotification): string {
  // Header: "Below Order for today between 2 PM and 6 PM Dubai Time"
  const isToday = !!n.deliveryDate && n.deliveryDate === getLocalIso("AE");
  const when = isToday
    ? "today"
    : n.deliveryDate
      ? formatDeliveryDate(n.deliveryDate)
      : "today";
  const slotPart = n.deliverySlot ? ` ${slotPhrase(n.deliverySlot)}` : "";
  const lines: string[] = [`Below Order for ${when}${slotPart} Dubai Time`, ""];

  const customerPhone = n.customerPhone ? ` - ${n.customerPhone}` : "";
  lines.push(`Customer: ${n.customerName}${customerPhone}`);
  if (n.recipientName) lines.push(`Receiver: ${n.recipientName}`);
  if (n.recipientPhone) lines.push(`Phone number: ${n.recipientPhone}`);
  const addressParts = [n.address, n.district, "AE"].filter(Boolean);
  lines.push(`Address: ${addressParts.join(", ")}`);
  if (n.deliveryDate || n.deliverySlot) {
    const datePart = n.deliveryDate ? formatDeliveryDate(n.deliveryDate) : "";
    lines.push(
      `Delivery date: ${[datePart, n.deliverySlot].filter(Boolean).join(" · ")}`,
    );
  }
  if (n.items.length > 0) {
    lines.push(`Items: ${n.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}`);
  }
  if (n.totalUsd != null && n.totalUsd > 0) {
    const charged =
      n.chargedCurrency && n.chargedCurrency.toUpperCase() !== "USD"
        ? ` (charged in ${n.chargedCurrency.toUpperCase()})`
        : "";
    lines.push(`Total: $${n.totalUsd.toFixed(2)} USD${charged}`);
  }
  if (n.cardMessage && n.cardMessage.trim()) {
    lines.push("Card message:", "");
    if (n.cardTo) lines.push(`To: ${n.cardTo}`);
    lines.push(n.cardMessage.trim());
    if (n.cardFrom) lines.push(`From: ${n.cardFrom}`);
  }
  lines.push("", "<!channel> please send picture here to check before delivery");
  return lines.join("\n");
}

type SlackBlock =
  | { type: "section"; text: { type: "mrkdwn"; text: string } }
  | { type: "image"; image_url: string; alt_text: string };

/** Message text + image blocks for the order's product photo(s). */
export function buildUaeOrderBlocks(n: UaeOrderNotification): SlackBlock[] {
  const blocks: SlackBlock[] = [
    { type: "section", text: { type: "mrkdwn", text: formatUaeOrderMessage(n) } },
  ];
  const seen = new Set<string>();
  for (const item of n.items) {
    if (!item.imageUrl || seen.has(item.imageUrl)) continue;
    seen.add(item.imageUrl);
    blocks.push({ type: "image", image_url: item.imageUrl, alt_text: item.name });
    if (seen.size >= MAX_IMAGE_BLOCKS) break;
  }
  return blocks;
}

async function postSlackMessage(
  channel: string,
  n: UaeOrderNotification,
): Promise<{ ok: boolean; error?: string }> {
  // Never cache the client — the SDK refreshes tokens per call.
  const connectors = new ReplitConnectors();
  const res = await connectors.proxy("slack", "/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: {
      channel,
      // Fallback text for notifications/clients that don't render blocks.
      text: formatUaeOrderMessage(n),
      blocks: buildUaeOrderBlocks(n),
    },
  });
  if (!res.ok) {
    return { ok: false, error: `http_${res.status}` };
  }
  const data = (await res.json()) as { ok?: boolean; error?: string };
  return { ok: data.ok === true, error: data.error };
}

/**
 * Send the UAE order Slack notification. Resolves the channel from the
 * delivery district; returns false (without sending) when the order is not
 * a UAE order. Never throws — all failures are caught and logged.
 */
export async function sendUaeOrderSlackNotification(
  n: UaeOrderNotification,
  log: { warn?: (obj: unknown, msg?: string) => void } = logger,
): Promise<boolean> {
  try {
    const channel = uaeOrderChannelForDistrict(n.district);
    if (!channel) return false;
    const channelName = slackChannelName(channel);
    const result = await postSlackMessage(channelName, n);
    if (!result.ok) {
      log.warn?.(
        { channel: channelName, error: result.error, appOrderId: n.orderId },
        "orderSlackNotify: Slack chat.postMessage failed",
      );
      return false;
    }
    return true;
  } catch (err: unknown) {
    log.warn?.(
      { err: (err as Error)?.message, appOrderId: n.orderId },
      "orderSlackNotify: send failed (non-fatal)",
    );
    return false;
  }
}
