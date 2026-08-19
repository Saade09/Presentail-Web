import {
  isMidnightEligibleCity,
  isMidnightServiceSlot,
  isMidnightSlot,
  MIDNIGHT_FEE_USD,
  type TimeSlot,
} from "@workspace/delivery";

/**
 * Date-filtered, deduplicated view of an OS/city slot list — the single
 * source of truth for which slots a shopper may pick for a given date.
 * Shared by ScheduleInlinePanel (product page) and DeliveryPickerModal
 * (cart & checkout) so availability semantics never diverge.
 *
 * Step 1 — date filter:
 *   - Today              → sameDayEnabled !== false (undefined counts as eligible)
 *   - Tomorrow and later  → nextDayEnabled !== false
 *   (Matches the server-side resolver semantics — resolveSlotForDate — so a
 *   slot the web shows for a future date is always one the server prices.)
 *   When no slot carries the relevant field at all (legacy OS data without
 *   same-day/next-day flags) the filter is skipped and all slots proceed to
 *   step 2 — deduplication still runs regardless.
 *
 * Step 2 — label deduplication (always):
 *   When multiple slots share the same label (e.g. two "9 PM–11 PM" entries),
 *   keep the one best suited for the current date:
 *   - Today:        prefer sameDayEnabled=true, then higher extraFee
 *   - Other dates:  prefer nextDayEnabled=true, then lower/absent extraFee
 *
 * Step 3 — same-day night surcharge (today only) and Midnight override:
 *   When the OS hasn't configured a fee for a late slot (delivery window
 *   starting at 21:00 or later), apply the hardcoded $5 same-day night rate.
 *   The delivery start hour is resolved from slot.startHour, then a label
 *   parse ("9:00 PM – …"), then cutoffHour.
 *   If the slot is identified as Midnight Delivery, forces the fee to $20 USD.
 */
export function displayedSlotsForDate(
  timeSlots: TimeSlot[],
  date: string,
  todayIso: string,
  tomorrowIso: string,
  cityId?: string | null,
): TimeSlot[] {
  const isToday = date === todayIso;
  void tomorrowIso; // tomorrow and later share the next-day rule

  // Step 1: date-based filter
  let filtered: TimeSlot[];
  if (isToday) {
    const hasSameDayField = timeSlots.some((s) => s.sameDayEnabled !== undefined);
    filtered = hasSameDayField ? timeSlots.filter((s) => s.sameDayEnabled !== false) : timeSlots;
  } else {
    const hasNextDayField = timeSlots.some((s) => s.nextDayEnabled !== undefined);
    filtered = hasNextDayField ? timeSlots.filter((s) => s.nextDayEnabled !== false) : timeSlots;
  }

  // Step 2: deduplicate by label — always, even when step 1 returned all slots
  const seen = new Map<string, TimeSlot>();
  for (const slot of filtered) {
    const existing = seen.get(slot.label);
    if (!existing) {
      seen.set(slot.label, slot);
    } else {
      // Choose which duplicate to keep based on date context
      let preferNew: boolean;
      if (isToday) {
        // Today: prefer sameDayEnabled=true, then higher extraFee (the surcharge variant)
        preferNew =
          (slot.sameDayEnabled === true && existing.sameDayEnabled !== true) ||
          (slot.sameDayEnabled === existing.sameDayEnabled &&
            (slot.extraFee ?? 0) > (existing.extraFee ?? 0));
      } else {
        // Other dates: prefer nextDayEnabled=true, then lower/no extraFee (the free variant)
        preferNew =
          (slot.nextDayEnabled === true && existing.nextDayEnabled !== true) ||
          (slot.nextDayEnabled === existing.nextDayEnabled &&
            (slot.extraFee ?? 0) < (existing.extraFee ?? 0));
      }
      if (preferNew) seen.set(slot.label, slot);
    }
  }

  const deduped = Array.from(seen.values());

  // Step 3: same-day night surcharge fallback ($5, today only) and Midnight override.
  return deduped.map((slot) => {
    // Filter out explicitly disabled slots
    if (slot.enabled === false) return null;
    // Never expose a configured Midnight service outside its two canonical
    // eligible cities, even if it leaks into a country/fallback slot list.
    if (isMidnightServiceSlot(slot) && !isMidnightEligibleCity(cityId)) {
      return null;
    }

    if (isMidnightSlot(slot, cityId)) {
      return { ...slot, extraFee: MIDNIGHT_FEE_USD };
    }

    if (isToday) {
      // Parse "9:00 PM – ..." or "21:00 – ..." style label → delivery start hour
      const parsedLabelHour = (() => {
        const m = slot.label.match(/^(\d+)(?::\d+)?\s*(AM|PM)?/i);
        if (!m) return undefined;
        let h = parseInt(m[1]!, 10);
        const meridiem = m[2]?.toUpperCase();
        if (meridiem === "PM" && h !== 12) h += 12;
        else if (meridiem === "AM" && h === 12) h = 0;
        return h;
      })();
      const deliveryStartHour = slot.startHour ?? parsedLabelHour ?? slot.cutoffHour;
      const isNightSlot = deliveryStartHour >= 21;
      // Apply $5 when: slot is a night window AND the OS has not configured a
      // real surcharge (extraFee is absent or zero). `extraFee: 0` means the OS
      // explicitly set it to zero OR no override was stored — either way the
      // hardcoded same-day night rate should take over.
      if (isNightSlot && !slot.extraFee) {
        return { ...slot, extraFee: 5 };
      }
    }
    return slot;
  }).filter((s): s is TimeSlot => s !== null);
}
