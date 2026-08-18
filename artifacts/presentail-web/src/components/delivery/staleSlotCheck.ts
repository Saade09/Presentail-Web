// Submission-time re-validation of the checkout delivery selection.
//
// Slot filtering only happens while the delivery picker is open; a stale tab
// can still submit a same-day slot whose window has already ended (order
// LB-2152). This pure helper is called from Checkout.handleSubmit BEFORE any
// payment is initiated so the shopper gets a friendly re-pick prompt instead
// of a raw server error. The server enforces the same rule authoritatively
// (code "expired_delivery_slot").

import {
  isSlotStillBookable,
  type SlotBookability,
  type TimeSlot,
} from "@workspace/delivery";

export function checkStaleSlotSelection(opts: {
  deliveryMode: "express" | "schedule";
  deliverySlot: string;
  deliverySlotId?: string;
  /** Selected delivery date (YYYY-MM-DD); empty string counts as today. */
  deliveryDate: string;
  timeSlots: TimeSlot[];
  countryCode?: string | null;
  sameDayCutoffHour?: number;
  now?: Date;
}): SlotBookability {
  // Express has its own availability gate; nothing to re-validate here.
  if (opts.deliveryMode === "express") return { bookable: true };
  const slot =
    (opts.deliverySlotId
      ? opts.timeSlots.find((s) => s.slotId === opts.deliverySlotId)
      : undefined) ??
    opts.timeSlots.find((s) => s.label === opts.deliverySlot) ??
    // Unknown label (city config changed) — fall back to label parsing.
    (opts.deliverySlot ? { label: opts.deliverySlot } : null);
  return isSlotStillBookable({
    deliveryDate: opts.deliveryDate,
    slot,
    countryCode: opts.countryCode,
    sameDayCutoffHour: opts.sameDayCutoffHour,
    now: opts.now,
  });
}
