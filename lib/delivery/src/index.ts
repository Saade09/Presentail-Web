/**
 * Shared delivery rules used by both the Presentail Expo mobile app and the
 * Vite web storefront. The single source of truth for:
 *
 * - per-country express surcharge amounts
 * - per-country scheduled-delivery time slots and their cutoffs
 * - the country-aware "current local hour" helper (Asia/Beirut for LB & CY,
 *   Asia/Dubai for AE), DST-aware for Beirut
 * - the express-availability window (8 AM – 10 PM in the recipient country)
 * - the cart day-list builder and the "format the selected delivery row"
 *   helper used by mini-cart / full-cart
 *
 * Keep this file dependency-free so it works in both the React Native
 * (Hermes) and the Vite (browser) runtimes.
 */

// ---------------------------------------------------------------------------
// Free delivery threshold (native currency)
// ---------------------------------------------------------------------------

/**
 * Hardcoded fallback free-delivery threshold in the store's native currency.
 * AE → AED 330, CY → EUR 120, LB (default) → USD 90.
 *
 * Used for display on the product detail screen and product cards so the
 * shopper sees the threshold in the currency they're already looking at.
 * The live OS value overrides this in components that fetch delivery-config.
 */
export function freeDeliveryThresholdNative(countryCode?: string | null): number {
  if (countryCode === "AE") return 330;
  if (countryCode === "CY") return 120;
  return 90;
}

/**
 * Hardcoded fallback free-delivery threshold in USD (the cart's internal currency).
 * AE → 89.84, CY → 120, LB (default) → 90.
 *
 * Used as a safe fallback while the OS delivery-config fetch is in-flight.
 * The live value from /api/delivery-config (or /api/delivery-locations) always
 * takes precedence once loaded — prefer passing the OS threshold explicitly
 * rather than relying on this function for runtime fee decisions.
 */
export function freeDeliveryThresholdUsd(countryCode?: string | null): number {
  if (countryCode === "AE") return 89.84;
  if (countryCode === "CY") return 120;
  return 90;
}

// ---------------------------------------------------------------------------
// Express surcharge
// ---------------------------------------------------------------------------

export const LB_EXPRESS_SURCHARGE = 15;
export const AE_EXPRESS_SURCHARGE = 4.9;

export function expressSurchargeForCountry(code?: string | null): number {
  if (code === "AE") return AE_EXPRESS_SURCHARGE;
  return LB_EXPRESS_SURCHARGE;
}

// ---------------------------------------------------------------------------
// Time slots
// ---------------------------------------------------------------------------

export type TimeSlot = {
  label: string;
  cutoffHour: number;
  extraFee?: number;
  /** Hour of day (0–23) the slot window opens. Provided by OS; absent for hardcoded fallback slots. */
  startHour?: number;
  /** Hour of day (0–23) the slot window closes. Provided by OS; absent for hardcoded fallback slots. */
  endHour?: number;
};

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
 * Pick the slot whose window start (cutoffHour) is closest to `currentHour`.
 *
 * For today: delegates to `firstAvailableSlot` so past-cutoff slots are
 * still excluded and the nearest *future* slot is returned (null when the
 * day is already over).
 *
 * For future dates: scans all slots and returns the one with the smallest
 * absolute difference between its `cutoffHour` and `currentHour`. When the
 * current hour is past every window start the last slot is returned
 * (nearest-from-behind), giving a sensible same-time-of-day default.
 *
 * Returns `null` only when `slots` is empty.
 */
export function nearestSlotForHour(
  slots: TimeSlot[],
  isToday: boolean,
  currentHour: number,
): TimeSlot | null {
  if (slots.length === 0) return null;
  if (isToday) return firstAvailableSlot(slots, true, currentHour);
  let best = slots[0]!;
  let bestDiff = Math.abs(best.cutoffHour - currentHour);
  for (let i = 1; i < slots.length; i++) {
    const diff = Math.abs(slots[i]!.cutoffHour - currentHour);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = slots[i]!;
    }
  }
  return best;
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

// ---------------------------------------------------------------------------
// Day list & cart row formatting
// ---------------------------------------------------------------------------

export type DeliveryDay = {
  iso: string;
  label: string;
  day: string;
  date: string;
  full: string;
};

export function dayLabels(
  todayLabel: string,
  tomLabel: string,
  now: Date = new Date(),
  countryCode?: string | null,
): DeliveryDay[] {
  const out: DeliveryDay[] = [];
  // Derive the starting local date from the country timezone so that calls
  // between midnight UTC and ~3 AM UTC correctly open on the local "today"
  // rather than yesterday's UTC date.
  const startIso = getLocalIso(countryCode, now);
  const [y0, m0, d0] = startIso.split("-").map(Number) as [number, number, number];
  for (let i = 0; i < 10; i++) {
    // Construct a Date at noon local time for day i.  Using noon avoids
    // DST-ambiguity at midnight while keeping toLocaleDateString correct.
    const d = new Date(y0, m0 - 1, d0 + i, 12, 0, 0);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({
      iso,
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
 * Format an hour (0–23) as a 12-hour clock string, e.g. 9 → "9:00 AM",
 * 14 → "2:00 PM", 0 → "12:00 AM", 12 → "12:00 PM".
 */
export function fmt12h(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}

/**
 * Format an hour (0–23) as a concise 12-hour label, e.g. 9 → "9 AM",
 * 14 → "2 PM", 0 → "12 AM", 12 → "12 PM". Drops the ":00" for brevity.
 */
export function fmt12hShort(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

/**
 * Returns "H:00 AM–H:00 PM" (12hr) for a slot that has `startHour` and
 * `endHour` defined (OS-configured slots), or `undefined` for legacy slots
 * that only carry a label.
 */
export function formatSlotTimeRange(slot: TimeSlot): string | undefined {
  if (slot.startHour === undefined || slot.endHour === undefined) return undefined;
  return `${fmt12h(slot.startHour)}–${fmt12h(slot.endHour)}`;
}

/**
 * Looks up `slotLabel` in `slots` and returns the formatted time range (e.g.
 * "12:00–16:00") when the matching slot has `startHour`/`endHour` defined.
 * Returns `undefined` when the slot is not found or has no hour bounds (legacy
 * label-only slots).
 */
export function slotTimeRangeForLabel(
  slotLabel: string | null | undefined,
  slots: TimeSlot[],
): string | undefined {
  if (!slotLabel) return undefined;
  const slot = slots.find((s) => s.label === slotLabel);
  if (!slot) return undefined;
  return formatSlotTimeRange(slot);
}

/** Parse "9:00 AM" or "2:00 PM" style strings → hour (0–23). Returns null on failure. */
function parseLabel12h(s: string): number | null {
  const m = /^(\d+)(?::\d+)?\s*(AM|PM)$/i.exec(s.trim());
  if (!m) return null;
  let h = parseInt(m[1]!, 10);
  const period = m[2]!.toUpperCase();
  if (period === "AM") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  return h;
}

/**
 * Returns a concise "9 AM–2 PM" range for a slot. Uses `startHour`/`endHour`
 * when present (OS-configured slots); for legacy label-only slots, parses the
 * existing "9:00 AM – 2:00 PM" label and reformats it. Falls back to the raw
 * label when parsing fails.
 */
export function formatSlotTimeRangeShort(slot: TimeSlot): string {
  if (slot.startHour !== undefined && slot.endHour !== undefined) {
    return `${fmt12hShort(slot.startHour)}–${fmt12hShort(slot.endHour)}`;
  }
  const parts = slot.label.split("–").map((p) => p.trim());
  if (parts.length === 2) {
    const from = parseLabel12h(parts[0] ?? "");
    const to = parseLabel12h(parts[1] ?? "");
    if (from !== null && to !== null) return `${fmt12hShort(from)}–${fmt12hShort(to)}`;
  }
  return slot.label;
}

/**
 * Looks up `slotLabel` in `slots` and returns the concise time range (e.g.
 * "9 AM–2 PM") using `formatSlotTimeRangeShort`.
 * Returns `undefined` when the slot is not found.
 */
export function slotTimeRangeShortForLabel(
  slotLabel: string | null | undefined,
  slots: TimeSlot[],
): string | undefined {
  if (!slotLabel) return undefined;
  const slot = slots.find((s) => s.label === slotLabel);
  if (!slot) return undefined;
  return formatSlotTimeRangeShort(slot);
}

/**
 * Format the selected delivery row for display in the cart.
 *
 * - Express  →  `expressLabel`
 * - Date+slot →  e.g. "Today · 12:00–16:00" (when `slotTimeRange` is provided)
 *               or "Wed 13 · 6:00 PM – 9:00 PM" (legacy label fallback)
 * - No selection → null (caller should show a fallback affordance)
 *
 * Pass `slotTimeRange` (from `slotTimeRangeForLabel`) so shoppers always see
 * the numeric hour range rather than the internal slot name.
 */
export function formatDeliveryRow(args: {
  mode: "express" | "today_slot" | "schedule" | null | undefined;
  date: string | null | undefined;
  slotLabel: string | null | undefined;
  /** Formatted time range to display instead of slotLabel (e.g. "12:00–16:00"). */
  slotTimeRange?: string;
  days: DeliveryDay[];
  expressLabel: string;
}): string | null {
  const { mode, date, slotLabel, slotTimeRange, days, expressLabel } = args;
  if (mode === "express") return expressLabel;
  if (!date || !slotLabel) return null;
  const day = days.find((d) => d.iso === date);
  const dayPrefix = day
    ? day.label === days[0]?.label
      ? day.label
      : `${day.day} ${day.date}`
    : date;
  const displaySlot = slotTimeRange ?? slotLabel;
  return `${dayPrefix} · ${displaySlot}`;
}

// ---------------------------------------------------------------------------
// Country-aware local date (YYYY-MM-DD)
// ---------------------------------------------------------------------------

/**
 * Returns the current local date as "YYYY-MM-DD" in the recipient country's
 * timezone.  LB/CY → Asia/Beirut (UTC+2 in winter, UTC+3 during DST);
 * AE → Asia/Dubai (UTC+4, no DST); default → Beirut.
 *
 * Prefers `Intl.DateTimeFormat` when available; falls back to manual UTC-offset
 * arithmetic using `getBeirutOffsetHours` so it works correctly even in
 * environments with limited `Intl` support (e.g. older Hermes on React Native).
 */
export function getLocalIso(countryCode?: string | null, at: Date = new Date()): string {
  const tz = countryCode === "AE" ? "Asia/Dubai" : "Asia/Beirut";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);
    const year = parts.find((p) => p.type === "year")?.value ?? "";
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall through to manual computation.
  }
  // Manual fallback: shift the UTC timestamp by the country's fixed offset,
  // then read the date parts from the resulting "fake UTC" date.
  const offset = countryCode === "AE" ? 4 : getBeirutOffsetHours(at);
  const localMs = at.getTime() + offset * 3_600_000;
  const shifted = new Date(localMs);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Country-aware current hour (Asia/Beirut & Asia/Dubai)
// ---------------------------------------------------------------------------

/** Returns the last Sunday of (year, monthIndex) in UTC, at hour 00. */
function lastSundayUtc(year: number, monthIndex: number): Date {
  // Day 0 of the next month is the last day of `monthIndex`.
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  const offset = lastDay.getUTCDay(); // 0 = Sunday
  lastDay.setUTCDate(lastDay.getUTCDate() - offset);
  lastDay.setUTCHours(0, 0, 0, 0);
  return lastDay;
}

/**
 * Returns the Beirut UTC offset (in hours) for the given instant.
 * +2 in winter, +3 during DST.
 *
 * DST window (Beirut): from 00:00 local on the last Sunday of March
 * through 00:00 local on the last Sunday of October. We compute the
 * boundaries in UTC by subtracting the offset that's in effect at
 * the boundary itself (winter offset just before DST starts, summer
 * offset just before DST ends).
 */
export function getBeirutOffsetHours(at: Date = new Date()): number {
  const year = at.getUTCFullYear();
  // DST starts at 00:00 local (UTC+2) on last Sunday of March.
  const dstStartLocal = lastSundayUtc(year, 2); // March
  const dstStartUtc = new Date(dstStartLocal.getTime() - 2 * 60 * 60 * 1000);
  // DST ends at 00:00 local (UTC+3) on last Sunday of October.
  const dstEndLocal = lastSundayUtc(year, 9); // October
  const dstEndUtc = new Date(dstEndLocal.getTime() - 3 * 60 * 60 * 1000);
  return at >= dstStartUtc && at < dstEndUtc ? 3 : 2;
}

/**
 * Returns the current hour (0..23) in Asia/Beirut, DST-aware.
 * Prefers `Intl` when available; falls back to a pure computation.
 */
export function getBeirutHour(at: Date = new Date()): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Beirut",
      hour: "numeric",
      hour12: false,
    }).format(at);
    const n = parseInt(h, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 23) return n;
  } catch {
    // Fall through to manual computation.
  }
  const offset = getBeirutOffsetHours(at);
  // Use UTC ms so DST transitions don't cause a double-shift via
  // local-machine timezone arithmetic.
  const beirutMs = at.getTime() + offset * 60 * 60 * 1000;
  const hours = Math.floor(beirutMs / (60 * 60 * 1000)) % 24;
  return (hours + 24) % 24;
}

/**
 * Returns the current hour (0..23) in Asia/Dubai (UTC+4, no DST).
 */
export function getDubaiHour(at: Date = new Date()): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dubai",
      hour: "numeric",
      hour12: false,
    }).format(at);
    const n = parseInt(h, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 23) return n;
  } catch {
    // Fall through to manual computation.
  }
  const dubaiMs = at.getTime() + 4 * 60 * 60 * 1000;
  const hours = Math.floor(dubaiMs / (60 * 60 * 1000)) % 24;
  return (hours + 24) % 24;
}

/**
 * Returns the current hour for the given country code.
 * LB → Beirut, AE → Dubai, CY → Beirut (close enough), default → Beirut.
 */
export function getCountryHour(
  countryCode?: string | null,
  at: Date = new Date(),
): number {
  if (countryCode === "AE") return getDubaiHour(at);
  return getBeirutHour(at);
}

// ---------------------------------------------------------------------------
// First available day
// ---------------------------------------------------------------------------

export type FirstAvailableDayResult = {
  /** ISO date string (YYYY-MM-DD) of the first day with at least one open slot. */
  iso: string;
  /** The earliest available slot on that day. */
  slot: TimeSlot;
};

/**
 * Starting from `startIso`, walks forward day by day (up to `maxDays`) and
 * returns the first date that has at least one non-past slot together with
 * that date's earliest available slot.
 *
 * `todayIso` identifies "today" — slots on this date are filtered by
 * `currentHour`; slots on all later dates are always available.
 *
 * Returns `null` only when every day in the look-ahead window is fully
 * booked/past, which is an extremely rare edge case.
 */
export function firstAvailableDay(
  startIso: string,
  slots: TimeSlot[],
  currentHour: number,
  todayIso: string,
  maxDays = 10,
): FirstAvailableDayResult | null {
  if (slots.length === 0) return null;
  const [sy, sm, sd] = startIso.split("-").map(Number) as [number, number, number];
  for (let i = 0; i < maxDays; i++) {
    // Build the date from local parts so the ISO string is never shifted by a
    // UTC-offset mismatch.  Using noon avoids DST-ambiguity at midnight.
    const d = new Date(sy, sm - 1, sd + i, 12, 0, 0);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const isToday = iso === todayIso;
    const slot = firstAvailableSlot(slots, isToday, currentHour);
    if (slot) return { iso, slot };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Express availability window
// ---------------------------------------------------------------------------

/**
 * Express Delivery (1–3 hrs) is offered only between 8 AM and 10 PM in
 * the recipient country's local time. Both web and mobile use this rule
 * to gate the express option.
 */
export const EXPRESS_OPEN_HOUR = 8;
export const EXPRESS_CLOSE_HOUR = 22;

export function isExpressDeliveryAvailable(
  countryCode?: string | null,
  at: Date = new Date(),
): boolean {
  const h = getCountryHour(countryCode, at);
  return h >= EXPRESS_OPEN_HOUR && h < EXPRESS_CLOSE_HOUR;
}
