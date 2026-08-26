import {
  getLocalIso,
  isExpressDeliveryAvailable,
  isMidnightSlot,
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

type IdentifiedTimeSlot = TimeSlot & {
  slotId?: string;
  enabled?: boolean;
};

function rawSlotsForDate(city: DeliveryCity, dateIso: string): TimeSlot[] {
  const weekday = new Date(`${dateIso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
  }).toLowerCase();
  return (
    city.slotsByDay && Object.prototype.hasOwnProperty.call(city.slotsByDay, weekday)
      ? city.slotsByDay[weekday] ?? []
      : city.timeSlots ?? []
  );
}

function slotsForDate(city: DeliveryCity, dateIso: string, todayIso: string): TimeSlot[] {
  const source = rawSlotsForDate(city, dateIso);
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
  // An active Midnight continuation after local midnight is intentionally an
  // exception to generic same-day/next-day flags: its selected date is now
  // yesterday, but the exact OS row remains valid until the absolute 01:00 end.
  const rawSlots = rawSlotsForDate(city, selection.date);
  const exactPersistedContinuation =
    selection.cityId === city.id && !!selection.slotId
      ? rawSlots.find(
          (rawSlot) => {
            const slot = rawSlot as IdentifiedTimeSlot;
            const overnight =
              typeof slot.startHour === "number" &&
              typeof slot.endHour === "number" &&
              (slot.endHour >= 24 || slot.endHour <= slot.startHour);
            return (
              slot.slotId === selection.slotId &&
              slot.label === selection.slotLabel &&
              slot.enabled !== false &&
              (isMidnightSlot(slot, city.id) ||
                (selection.date! < todayIso && overnight))
            );
          },
        ) as IdentifiedTimeSlot | undefined
      : undefined;
  if (exactPersistedContinuation) {
    const midnightOutcome = checkStaleSlotSelection({
      deliveryMode: "schedule",
      deliverySlot: selection.slotLabel,
      deliverySlotId: selection.slotId ?? undefined,
      deliveryDate: selection.date,
      timeSlots: [exactPersistedContinuation],
      countryCode,
      cityId: city.id,
      now,
    });
    if (midnightOutcome.bookable) return { valid: true };
    return {
      valid: false,
      reason:
        midnightOutcome.reason === "slot_window_ended" ||
        midnightOutcome.reason === "past_date"
          ? "expired"
          : "unavailable",
    };
  }
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
