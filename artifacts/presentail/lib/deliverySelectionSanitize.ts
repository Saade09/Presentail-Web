import {
  firstAvailableDay,
  getBeirutHour,
  getLocalIso,
  timeSlotsForCountry,
} from "@workspace/delivery";

import type { DeliveryMode, DeliverySelection } from "@/contexts/DeliverySelectionContext";

/**
 * Returns today's date as "YYYY-MM-DD" in the Beirut local timezone.
 *
 * Using Beirut (LB) as the conservative default at hydration time: the
 * mobile app's delivery context is always anchored to LB, AE, or CY, and
 * the checkout re-validates with the actual country's slots once the
 * delivery location is known.  Using UTC here caused orders placed between
 * midnight UTC and ~3 AM Beirut time to see yesterday's date as "today".
 */
export function todayIso(): string {
  return getLocalIso("LB");
}

/**
 * Strip stored selection of values that are no longer valid:
 *  - past dates → drop date and slot
 *  - bogus mode → drop everything
 *  - slot label not present in any known timeSlots list → drop slot
 *  - today with no remaining slots → advance to next available day
 *
 * The validation is intentionally lenient (rather than throwing) so a stale
 * persisted value can never crash the cart or checkout screens. See the
 * "product detail screen must stay defensive" gotcha in replit.md.
 *
 * Uses LB slots + Beirut hour as a conservative default when the country is
 * unknown at hydration time. The checkout useEffect re-validates with the
 * actual country slots once the country is known.
 */
export function sanitize(raw: unknown): DeliverySelection {
  const empty: DeliverySelection = { mode: null, date: null, slotLabel: null };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;
  const mode =
    obj.mode === "express" || obj.mode === "today_slot" || obj.mode === "schedule"
      ? (obj.mode as DeliveryMode)
      : null;
  let date = typeof obj.date === "string" && obj.date.length === 10 ? obj.date : null;
  if (date && date < todayIso()) date = null;
  let slotLabel =
    typeof obj.slotLabel === "string" && obj.slotLabel.length > 0
      ? obj.slotLabel
      : null;
  if (slotLabel) {
    const known = new Set(
      [...timeSlotsForCountry("LB"), ...timeSlotsForCountry("AE")].map((s) => s.label),
    );
    if (!known.has(slotLabel)) slotLabel = null;
  }
  if (!mode) return empty;
  if (mode === "express") {
    return { mode, date: todayIso(), slotLabel: null };
  }
  const today = todayIso();
  if (!date || date === today) {
    const lbSlots = timeSlotsForCountry("LB");
    const h = getBeirutHour();
    const todayHasSlots = lbSlots.some((s) => s.cutoffHour > h);
    if (!todayHasSlots) {
      const result = firstAvailableDay(today, lbSlots, h, today);
      return {
        mode: result && result.iso !== today ? "schedule" : mode,
        date: result?.iso ?? today,
        slotLabel: result?.slot.label ?? null,
      };
    }
    if (!date) date = today;
  }
  // Mode is set: only fix the trivially-invalid pieces (past date already
  // dropped above; missing date defaulted above). The persisted slot
  // label is intentionally preserved as-is — country-aware re-validation
  // (including "today" cutoff) happens at display time in the cart and on
  // mount in checkout, where the active country is known. Forcing an
  // LB-list fallback here would silently rewrite a valid AE slot label
  // into an LB one on hydrate.
  return { mode, date, slotLabel };
}
