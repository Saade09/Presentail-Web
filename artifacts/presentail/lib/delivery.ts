export type TimeSlot = { label: string; cutoffHour: number };

export const LB_EXPRESS_SURCHARGE = 15;
export const AE_EXPRESS_SURCHARGE = 4.9;

export function expressSurchargeForCountry(code?: string | null): number {
  if (code === "AE") return AE_EXPRESS_SURCHARGE;
  return LB_EXPRESS_SURCHARGE;
}

const LB_TIME_SLOTS: TimeSlot[] = [
  { label: "9:00 AM – 2:00 PM", cutoffHour: 9 },
  { label: "2:00 PM – 6:00 PM", cutoffHour: 14 },
  { label: "6:00 PM – 9:00 PM", cutoffHour: 18 },
  { label: "9:00 PM – 11:00 PM", cutoffHour: 21 },
];
const AE_TIME_SLOTS: TimeSlot[] = [
  { label: "7:00 AM – 1:00 PM", cutoffHour: 7 },
  { label: "1:00 PM – 4:00 PM", cutoffHour: 13 },
  { label: "4:00 PM – 8:00 PM", cutoffHour: 16 },
  { label: "8:00 PM – 11:00 PM", cutoffHour: 20 },
];

export function timeSlotsForCountry(code?: string | null): TimeSlot[] {
  if (code === "AE") return AE_TIME_SLOTS;
  return LB_TIME_SLOTS;
}

/**
 * Pick the first slot from `slots` whose cutoff has not already passed.
 *
 * When the selected date is "today", a slot is considered past if the
 * current local hour is at or beyond its `cutoffHour`. For future dates
 * every slot is available — the caller can simply use `slots[0]`.
 *
 * Returns `null` when the day is already over (no slots remain) so the
 * caller can fall back to a next-day default.
 */
export function firstAvailableSlot(
  slots: TimeSlot[],
  isToday: boolean,
  currentHour: number,
): TimeSlot | null {
  if (!isToday) return slots[0] ?? null;
  return slots.find((s) => s.cutoffHour > currentHour) ?? null;
}

/**
 * Return `slotLabel` as-is if it is still a valid choice for the given
 * date in the given slot list, otherwise return the next available slot's
 * label (or null if none).
 *
 * Used on hydrate (cart) and on mount (checkout) to guarantee a stored
 * slot that's now in the past doesn't display as if it were still bookable.
 */
export function resolveSlotLabel(
  slotLabel: string | null | undefined,
  slots: TimeSlot[],
  isToday: boolean,
  currentHour: number,
): string | null {
  if (slotLabel) {
    const found = slots.find((s) => s.label === slotLabel);
    if (found && (!isToday || currentHour < found.cutoffHour)) return found.label;
  }
  return firstAvailableSlot(slots, isToday, currentHour)?.label ?? null;
}

export type DeliveryDay = {
  iso: string;
  label: string;
  day: string;
  date: string;
  full: string;
};

export function dayLabels(todayLabel: string, tomLabel: string): DeliveryDay[] {
  const out: DeliveryDay[] = [];
  const now = new Date();
  for (let i = 0; i < 10; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    out.push({
      iso: d.toISOString().slice(0, 10),
      label:
        i === 0
          ? todayLabel
          : i === 1
            ? tomLabel
            : d.toLocaleDateString(undefined, { weekday: "short" }),
      day: d.toLocaleDateString(undefined, { weekday: "short" }),
      date: String(d.getDate()),
      full: d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    });
  }
  return out;
}

/**
 * Format the selected delivery row for display in the cart.
 *
 * - Express  →  `expressLabel`
 * - Date+slot →  e.g. "Today · 2:00 PM – 6:00 PM" or "Wed 13 · 6:00 PM – 9:00 PM"
 * - No selection → null (caller should show a fallback affordance)
 */
export function formatDeliveryRow(args: {
  mode: "express" | "today_slot" | "schedule" | null | undefined;
  date: string | null | undefined;
  slotLabel: string | null | undefined;
  days: DeliveryDay[];
  expressLabel: string;
}): string | null {
  const { mode, date, slotLabel, days, expressLabel } = args;
  if (mode === "express") return expressLabel;
  if (!date || !slotLabel) return null;
  const day = days.find((d) => d.iso === date);
  const dayPrefix = day
    ? day.label === days[0]?.label
      ? day.label
      : `${day.day} ${day.date}`
    : date;
  return `${dayPrefix} · ${slotLabel}`;
}
