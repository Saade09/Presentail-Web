import {
  getLocalIso,
  isExpressDeliveryAvailable,
  type TimeSlot,
} from "@workspace/delivery";
import type { DeliveryCity } from "@/contexts/LocationContext";
import { displayedSlotsForDate } from "./displayedSlots";
import { checkStaleSlotSelection } from "./staleSlotCheck";
import type { DeliverySelection } from "@/contexts/DeliverySelectionContext";

export type CartDeliveryInvalidationReason = "expired" | "unavailable";

export type CartDeliveryAvailability =
  | { valid: true }
  | { valid: false; reason: CartDeliveryInvalidationReason };

function slotsForDate(city: DeliveryCity, dateIso: string, todayIso: string): TimeSlot[] {
  const weekday = new Date(`${dateIso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
  }).toLowerCase();
  const source =
    city.slotsByDay && Object.prototype.hasOwnProperty.call(city.slotsByDay, weekday)
      ? city.slotsByDay[weekday] ?? []
      : city.timeSlots ?? [];
  const tomorrow = new Date(`${todayIso}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  return displayedSlotsForDate(source, dateIso, todayIso, tomorrowIso, city.id);
}

/**
 * Classify a persisted cart selection without ever choosing a replacement.
 * Clock-driven failures are kept separate from live catalogue/operations
 * failures so the cart can explain the right recovery path.
 */
export function classifyCartDeliverySelection(args: {
  selection: DeliverySelection;
  city: DeliveryCity | null;
  countryCode: string | null;
  now?: Date;
}): CartDeliveryAvailability {
  const { selection, city, countryCode, now = new Date() } = args;
  if (!selection.mode) return { valid: true };
  if (!city || city.isActive === false) {
    return { valid: false, reason: "unavailable" };
  }

  if (selection.mode === "express") {
    return city.expressAvailable === true && isExpressDeliveryAvailable(countryCode, now)
      ? { valid: true }
      : { valid: false, reason: "unavailable" };
  }

  if (!selection.date || !selection.slotLabel) {
    return { valid: false, reason: "unavailable" };
  }

  const todayIso = getLocalIso(countryCode, now);
  const slots = slotsForDate(city, selection.date, todayIso);
  const selectedSlot =
    (selection.slotId ? slots.find((slot) => slot.slotId === selection.slotId) : undefined) ??
    slots.find((slot) => slot.label === selection.slotLabel);
  // A schedule/configuration change is operational unavailability, not a
  // clock expiry. Do not let the stale-slot helper's legacy label fallback
  // accidentally keep this now-removed choice alive for a future date.
  if (!selectedSlot) return { valid: false, reason: "unavailable" };
  const outcome = checkStaleSlotSelection({
    deliveryMode: "schedule",
    deliverySlot: selection.slotLabel,
    deliverySlotId: selection.slotId ?? undefined,
    deliveryDate: selection.date,
    timeSlots: slots,
    countryCode,
    sameDayCutoffHour: city.sameDayCutoffHour,
    enforceSlotCutoff: true,
    cityId: selection.cityId ?? city.id,
    now,
  });
  if (outcome.bookable) return { valid: true };

  const clockExpiry = new Set(["past_date", "same_day_cutoff_passed", "slot_window_ended"]);
  return {
    valid: false,
    reason: clockExpiry.has(outcome.reason ?? "") ? "expired" : "unavailable",
  };
}