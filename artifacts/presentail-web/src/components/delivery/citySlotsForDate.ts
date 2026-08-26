import type { TimeSlot } from "@workspace/delivery";

export function weekdayKeyForIsoDate(dateIso: string): string {
  return new Date(`${dateIso}T12:00:00`)
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();
}

/**
 * Resolve the exact OS slot list for a city and delivery date.
 *
 * Once OS supplies `slotsByDay`, that schedule is authoritative. A missing or
 * empty weekday means standard delivery is unavailable that day; it must not
 * fall back to a merged flat list. The flat list remains compatible with older
 * OS payloads that do not expose weekday schedules at all.
 */
export function citySlotsForDate(
  flatSlots: TimeSlot[],
  slotsByDay: Record<string, TimeSlot[]> | undefined,
  dateIso: string,
): TimeSlot[] {
  const raw = slotsByDay
    ? (slotsByDay[weekdayKeyForIsoDate(dateIso)] ?? [])
    : flatSlots;

  return [...raw].sort(
    (a, b) => (a.startHour ?? a.cutoffHour) - (b.startHour ?? b.cutoffHour),
  );
}