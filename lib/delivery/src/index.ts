/**
 * Shared delivery rules used by both the Presentail Expo mobile app and the
 * Vite web storefront. The single source of truth for:
 *
 * - per-country express surcharge amounts
 * - per-country scheduled-delivery time slots and their cutoffs
 * - the country-aware "current local hour" helper (Asia/Beirut for LB & CY,
 *   Asia/Dubai for AE), DST-aware for Beirut
 * - the express-availability window (8 AM – 1 AM in the recipient country)
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
  /** Stable OS-assigned identifier for this slot. Absent for hardcoded fallback slots. */
  slotId?: string;
  cutoffHour: number;
  /** Additional surcharge for booking this slot (USD).
   * A value of exactly 0 means the slot is explicitly free (override) — distinct from undefined (no override). */
  extraFee?: number;
  /** Hour of day (0–23) the slot window opens. Provided by OS; absent for hardcoded fallback slots. */
  startHour?: number;
  /** Hour of day (0–23) the slot window closes. Provided by OS; absent for hardcoded fallback slots. */
  endHour?: number;
  /** When true, this slot is available for same-day orders. Absent means no same-day/next-day restriction. */
  sameDayEnabled?: boolean;
  /** When true, this slot is available for next-day orders. Absent means no same-day/next-day restriction. */
  nextDayEnabled?: boolean;
  /** Whether this OS slot is enabled. Absent is treated as enabled for backwards compatibility. */
  enabled?: boolean;
  /** Explicit OS service marker. Midnight is never inferred from customer-facing copy. */
  serviceType?: "midnight" | string;
};

/** Premium Midnight delivery is deliberately restricted to these canonical zones. */
export const MIDNIGHT_ELIGIBLE_CITY_IDS = [
  "lb-beirut",
  "lb-metn",
  "ae-dubai",
  "ae-abu-dhabi",
] as const;
export const MIDNIGHT_FEE_USD = 20;
export const MIDNIGHT_START_HOUR = 23;
export const MIDNIGHT_END_HOUR = 1;

const LB_TIME_SLOTS: TimeSlot[] = [
  { label: "9:00 AM – 2:00 PM", cutoffHour: 9 },
  { label: "2:00 PM – 6:00 PM", cutoffHour: 14 },
  { label: "6:00 PM – 10:00 PM", cutoffHour: 18 },
  { label: "9:00 PM – 11:00 PM", cutoffHour: 21 },
];
const LB_BEIRUT_TIME_SLOTS: TimeSlot[] = [
  { label: "9:00 AM – 2:00 PM", slotId: "lb-beirut-morning", startHour: 9, endHour: 14, cutoffHour: 9 },
  { label: "2:00 PM – 6:00 PM", slotId: "lb-beirut-afternoon", startHour: 14, endHour: 18, cutoffHour: 14 },
  { label: "6:00 PM – 10:00 PM", slotId: "lb-beirut-evening", startHour: 18, endHour: 22, cutoffHour: 18 },
  { label: "9:00 PM – 11:00 PM", slotId: "lb-beirut-late-night", startHour: 21, endHour: 23, cutoffHour: 21 },
  {
    label: "11:00 PM – 1:00 AM",
    slotId: "lb-beirut-midnight",
    startHour: 23,
    endHour: 1,
    cutoffHour: 23,
    extraFee: MIDNIGHT_FEE_USD,
    serviceType: "midnight",
  },
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
 * Returns a city-specific schedule when the storefront has an approved
 * canonical schedule for that city. Beirut is intentionally kept independent
 * of the OS slot rows because the current OS rows are operationally granular
 * (10–12, 12–2, 2–4, 4–6) rather than the shopper-facing windows.
 */
export function timeSlotsForCity(
  cityId?: string | null,
  countryCode?: string | null,
): TimeSlot[] | undefined {
  if ((countryCode ?? "").toUpperCase() === "LB" && cityId === "lb-beirut") {
    return LB_BEIRUT_TIME_SLOTS;
  }
  return undefined;
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

/** Returns local minutes since midnight for the given store country. */
export function getCountryMinutes(
  countryCode?: string | null,
  at: Date = new Date(),
): number {
  const tz = countryCode === "AE" ? "Asia/Dubai" : "Asia/Beirut";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (
      Number.isInteger(hour) &&
      hour >= 0 &&
      hour <= 23 &&
      Number.isInteger(minute) &&
      minute >= 0 &&
      minute <= 59
    ) {
      return hour * 60 + minute;
    }
  } catch {
    // Fall through to the existing DST-aware hour helper and UTC minutes.
  }
  return getCountryHour(countryCode, at) * 60 + at.getUTCMinutes();
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
 * Express Delivery (1–3 hrs) is available from 8 AM until 10 PM
 * in the recipient country's local time. Both web and mobile use this
 * rule to gate the express option.
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

// ---------------------------------------------------------------------------
// Delivery promise (cart Delivery Summary)
// ---------------------------------------------------------------------------

/** Express SLA in minutes — orders arrive within this window of the quote time. */
export const EXPRESS_SLA_MINUTES = 90;

/** Timezone identifier for a country code. LB/CY → Beirut, AE → Dubai. */
export function countryTimeZone(countryCode?: string | null): string {
  return countryCode === "AE" ? "Asia/Dubai" : "Asia/Beirut";
}

/** Deadline instant for an express order quoted at `quotedAt` (quote + 90 min). */
export function expressDeadlineFrom(quotedAt: Date): Date {
  return new Date(quotedAt.getTime() + EXPRESS_SLA_MINUTES * 60_000);
}

/**
 * Format an instant as a locale-aware wall-clock time in the recipient
 * country's timezone (e.g. "11:07 AM" / "١١:٠٧ ص" / "11:07"). Falls back to a
 * manual UTC-offset 12-hour rendering when `Intl` is unavailable.
 */
export function formatCountryTime(
  at: Date,
  countryCode?: string | null,
  locale?: string,
): string {
  try {
    return new Intl.DateTimeFormat(locale ?? undefined, {
      timeZone: countryTimeZone(countryCode),
      hour: "numeric",
      minute: "2-digit",
    }).format(at);
  } catch {
    // Manual fallback: shift by the country's fixed offset, format as 12h.
    const offset = countryCode === "AE" ? 4 : getBeirutOffsetHours(at);
    const shifted = new Date(at.getTime() + offset * 3_600_000);
    let h = shifted.getUTCHours();
    const m = String(shifted.getUTCMinutes()).padStart(2, "0");
    const period = h >= 12 ? "PM" : "AM";
    h = h % 12 === 0 ? 12 : h % 12;
    return `${h}:${m} ${period}`;
  }
}

/**
 * Locale-aware date label for the standard-delivery promise:
 * today → `todayLabel`, tomorrow → `tomorrowLabel`, otherwise a short
 * localized "Sat, 15 Aug"-style label. `todayIso` must be the recipient
 * country's local date (from `getLocalIso`).
 */
export function formatPromiseDateLabel(
  dateIso: string,
  todayIso: string,
  todayLabel: string,
  tomorrowLabel: string,
  locale?: string,
): string {
  if (dateIso === todayIso) return todayLabel;
  // Compute tomorrow from local parts (never UTC-shifted).
  const [ty, tm, td] = todayIso.split("-").map(Number) as [number, number, number];
  const tom = new Date(ty, tm - 1, td + 1, 12, 0, 0);
  const tomorrowIso = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, "0")}-${String(tom.getDate()).padStart(2, "0")}`;
  if (dateIso === tomorrowIso) return tomorrowLabel;
  const [y, m, d] = dateIso.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d, 12, 0, 0);
  try {
    return new Intl.DateTimeFormat(locale ?? undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(date);
  } catch {
    return dateIso;
  }
}

/** Same-day standard delivery windows beginning at or after this hour are "tonight". */
export const STANDARD_TONIGHT_START_HOUR = 18;

export type StandardDeliveryDay = "today" | "tonight" | "tomorrow" | "date";

/** Minimal slot shape needed to classify a standard delivery promise. */
export type DeliverySlotStartLike = {
  startHour?: number;
  label?: string;
  serviceType?: string;
};

/** Parse the start hour from a slot label like "9:00 AM – 2:00 PM". */
function parseSlotStartHour(label: string): number | null {
  const firstPart = label.split(/[–-]/)[0]?.trim();
  if (!firstPart) return null;
  const match = /^(\d+)(?::\d+)?\s*(AM|PM)$/i.exec(firstPart);
  if (!match) return null;
  let hour = parseInt(match[1]!, 10);
  const period = match[2]!.toUpperCase();
  if (period === "AM") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return hour;
}

/**
 * Return the local starting hour for a delivery slot. OS-configured slots
 * carry startHour; legacy fallback slots retain a human-readable label.
 */
export function slotStartHour(slot: DeliverySlotStartLike | null | undefined): number | null {
  if (!slot) return null;
  if (typeof slot.startHour === "number" && Number.isFinite(slot.startHour)) {
    return slot.startHour;
  }
  return slot.label ? parseSlotStartHour(slot.label) : null;
}

/**
 * Classify a non-Midnight standard selection using the delivery market's
 * calendar. A same-day slot beginning at 6 PM or later is "tonight"; the
 * device timezone is never consulted. Callers rendering Midnight or Express
 * must continue to use their dedicated promise builders.
 */
export function classifyStandardDeliveryDay(opts: {
  dateIso: string;
  slot?: DeliverySlotStartLike | null;
  countryCode?: string | null;
  /** Override the market-local today date when the caller already derived it. */
  todayIso?: string;
  now?: Date;
}): StandardDeliveryDay {
  const todayIso = opts.todayIso ?? getLocalIso(opts.countryCode, opts.now ?? new Date());
  if (opts.dateIso === todayIso) {
    const startHour = slotStartHour(opts.slot);
    return startHour !== null && startHour >= STANDARD_TONIGHT_START_HOUR
      ? "tonight"
      : "today";
  }
  if (opts.dateIso === addIsoDays(todayIso, 1)) return "tomorrow";
  return "date";
}

// ---------------------------------------------------------------------------
// Slot bookability at submission time (stale-selection guard)
// ---------------------------------------------------------------------------

/**
 * Minimal slot shape needed for the bookability check. Compatible with both
 * the shared `TimeSlot` and the API server's OS slot shape.
 */
export type BookableSlotLike = {
  label?: string;
  /** Hour of day (0–23) the delivery window closes. */
  endHour?: number;
  cutoffHour?: number;
  cutoffMinute?: number;
  startHour?: number;
  serviceType?: string;
};

export type SlotBookability =
  | { bookable: true }
  | {
      bookable: false;
      reason:
        | "past_date"
        | "same_day_cutoff_passed"
        | "slot_window_ended"
        | "slot_unavailable";
    };

/** Parse the end hour out of a "9:00 AM – 2:00 PM" style label. Null on failure. */
export function parseSlotLabelEndHour(label: string | undefined): number | null {
  if (!label) return null;
  // Accept both en-dash and hyphen separators.
  const parts = label.split(/[–-]/);
  if (parts.length < 2) return null;
  const m = /^(\d+)(?::\d+)?\s*(AM|PM)$/i.exec(parts[parts.length - 1]!.trim());
  if (!m) return null;
  let h = parseInt(m[1]!, 10);
  const period = m[2]!.toUpperCase();
  if (period === "AM") {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }
  return h;
}

/** Best-effort delivery-window end hour for a slot: explicit endHour, else parsed from the label. */
export function slotEndHour(slot: BookableSlotLike | null | undefined): number | null {
  if (!slot) return null;
  if (typeof slot.endHour === "number") return slot.endHour;
  return parseSlotLabelEndHour(slot.label);
}

/**
 * Whether a previously selected delivery date + slot is still bookable at
 * `now`, in the store country's local timezone (Asia/Beirut for LB/CY,
 * Asia/Dubai for AE).
 *
 * Used as the submission-time re-validation shared by the API server (order
 * creation / payment-intent creation) and both clients (pre-submit re-check),
 * so a stale tab or app session can never place an order for a same-day slot
 * whose window has already ended (e.g. order LB-2152: 9AM–2PM slot submitted
 * at 4PM Beirut time).
 *
 * Ordinary persisted selections expire at their delivery-date/window end.
 * Booking, city, and Express cutoffs only control which NEW selections are
 * offered. Verified special services may explicitly opt into a hard cutoff.
 */
export function isSlotStillBookable(opts: {
  /** Selected delivery date (YYYY-MM-DD). Empty/undefined counts as today. */
  deliveryDate: string | null | undefined;
  slot?: BookableSlotLike | null;
  countryCode?: string | null;
  /** @deprecated City/Express cutoffs do not expire persisted scheduled slots. */
  sameDayCutoffHour?: number;
  /** @deprecated See sameDayCutoffHour. */
  sameDayCutoffMinute?: number;
  /**
   * Enforce the selected slot's own booking cutoff. Reserved for promises
   * whose exact OS slot is carried through the funnel (such as late-night).
   */
  enforceSlotCutoff?: boolean;
  /** Optional additional absolute local-time cutoff, in minutes since midnight. */
  hardCutoffMinutes?: number;
  now?: Date;
  cityId?: string | null;
}): SlotBookability {
  const now = opts.now ?? new Date();
  const todayIso = getLocalIso(opts.countryCode, now);
  const dateIso = opts.deliveryDate || todayIso;

  if (isMidnightSlot(opts.slot, opts.cityId)) {
    const window = midnightWindowForOccasionDate(dateIso, opts.countryCode);
    if (now.getTime() >= new Date(window.end).getTime()) {
      return { bookable: false, reason: "slot_window_ended" };
    }
    if (dateIso < todayIso) {
      // The chosen date is the 23:00 start date. It may therefore be yesterday
      // only while its 23:00→01:00 window is still active after local midnight.
      // The absolute end check above is authoritative across DST/month/year
      // boundaries; older dates retain the normal past-date rejection.
      if (todayIso !== addIsoDays(dateIso, 1)) {
        return { bookable: false, reason: "past_date" };
      }
    }
    return { bookable: true };
  }

  const endHour = slotEndHour(opts.slot);
  const startHour =
    typeof opts.slot?.startHour === "number" ? opts.slot.startHour : null;
  const wrapsPastMidnight =
    startHour !== null &&
    endHour !== null &&
    (endHour >= 24 || endHour <= startHour);
  const localMinutes = getCountryMinutes(opts.countryCode, now);

  if (dateIso < todayIso) {
    if (
      wrapsPastMidnight &&
      dateIso === addIsoDays(todayIso, -1) &&
      endHour !== null
    ) {
      if (
        opts.enforceSlotCutoff ||
        typeof opts.hardCutoffMinutes === "number"
      ) {
        return { bookable: false, reason: "same_day_cutoff_passed" };
      }
      const nextDayEndMinutes =
        endHour >= 24 ? (endHour - 24) * 60 : endHour * 60;
      return localMinutes >= nextDayEndMinutes
        ? { bookable: false, reason: "slot_window_ended" }
        : { bookable: true };
    }
    return { bookable: false, reason: "past_date" };
  }
  if (dateIso > todayIso) return { bookable: true };

  let effectiveCutoffMinutes: number | null = null;
  if (
    typeof opts.hardCutoffMinutes === "number" &&
    Number.isFinite(opts.hardCutoffMinutes)
  ) {
    effectiveCutoffMinutes = opts.hardCutoffMinutes;
  }
  if (opts.enforceSlotCutoff && typeof opts.slot?.cutoffHour === "number") {
    const slotCutoffMinutes =
      opts.slot.cutoffHour * 60 + (opts.slot.cutoffMinute ?? 0);
    effectiveCutoffMinutes =
      effectiveCutoffMinutes === null
        ? slotCutoffMinutes
        : Math.min(effectiveCutoffMinutes, slotCutoffMinutes);
  }
  if (
    effectiveCutoffMinutes !== null &&
    localMinutes >= effectiveCutoffMinutes
  ) {
    return { bookable: false, reason: "same_day_cutoff_passed" };
  }

  if (
    endHour !== null &&
    !wrapsPastMidnight &&
    localMinutes >= endHour * 60
  ) {
    return { bookable: false, reason: "slot_window_ended" };
  }
  return { bookable: true };
}

export type MidnightWindow = {
  /** Selected delivery date: the market-local calendar date on which 23:00 starts. */
  occasionDate: string;
  timeZone: string;
  /** UTC ISO instant for 23:00 on the selected delivery date. */
  start: string;
  /** UTC ISO instant for 01:00 on the following calendar day. */
  end: string;
};

/** Detect the configured OS service independently of geographic eligibility. */
export function isMidnightServiceSlot(
  slot: Pick<TimeSlot, "serviceType" | "startHour" | "endHour"> | null | undefined,
): boolean {
  if (!slot) return false;
  return (
    slot.serviceType === "midnight" ||
    (slot.startHour === MIDNIGHT_START_HOUR && slot.endHour === MIDNIGHT_END_HOUR)
  );
}

export function isMidnightEligibleCity(cityId?: string | null): boolean {
  return MIDNIGHT_ELIGIBLE_CITY_IDS.includes(
    cityId as (typeof MIDNIGHT_ELIGIBLE_CITY_IDS)[number],
  );
}

function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Invalid ISO date");
  const d = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Convert a local wall-clock time in an IANA timezone to a UTC instant.
 * The two-pass correction is DST-safe for the non-ambiguous 01:00/23:00 times
 * used by the Midnight service.
 */
function localWallClockToUtc(
  dateIso: string,
  hour: number,
  timeZone: string,
): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Invalid ISO date");
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, 0, 0);
  let guess = targetAsUtc;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    const representedAsUtc = Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second"),
    );
    guess += targetAsUtc - representedAsUtc;
  }
  return new Date(guess);
}

/**
 * Convert the selected Midnight delivery date to its fulfillment window.
 *
 * The historical function/property name is retained for API compatibility,
 * but the selected date is now the window's START date: selecting Thursday
 * means Thursday 23:00 through Friday 01:00 Beirut time.
 */
export function midnightWindowForOccasionDate(
  occasionDate: string,
  countryCode?: string | null,
): MidnightWindow {
  const timeZone = countryTimeZone(countryCode);
  const followingDate = addIsoDays(occasionDate, 1);
  return {
    occasionDate,
    timeZone,
    start: localWallClockToUtc(occasionDate, MIDNIGHT_START_HOUR, timeZone).toISOString(),
    end: localWallClockToUtc(followingDate, MIDNIGHT_END_HOUR, timeZone).toISOString(),
  };
}

/**
 * Identify the configured OS Midnight service without relying on its translated
 * display label. The explicit service marker is preferred; the 23:00→01:00
 * window is retained as a compatibility signature for the existing OS rows.
 */
export function isMidnightSlot(
  slot: Pick<TimeSlot, "serviceType" | "startHour" | "endHour"> | null | undefined,
  cityId?: string | null,
): boolean {
  return isMidnightEligibleCity(cityId) && isMidnightServiceSlot(slot);
}

// ---------------------------------------------------------------------------
// Cart sticky bar delivery promise
// ---------------------------------------------------------------------------

/**
 * Minimal translation keys consumed by computeStickyDeliveryPromise.
 * These are a subset of the full translations object and can be satisfied
 * by any object that contains these keys (both the mobile app and tests).
 */
export type StickyDeliveryPromiseTranslations = {
  /** "Select delivery time" */
  cartStickySelectTime: string;
  /** "Arrives by {time}" */
  cartStickyArrivesBy: string;
  /** "Delivery today" */
  cartStickyDeliveryToday: string;
  /** "Delivery tonight" */
  cartStickyDeliveryTonight: string;
  /** "Delivery tomorrow" */
  cartStickyDeliveryTomorrow: string;
  /** "Delivery {date}" */
  cartStickyDeliveryDate: string;
};

/**
 * Returns a concise localised delivery promise string for the cart sticky bar.
 *
 * - No mode, or non-express with no date → `t.cartStickySelectTime`
 * - Express → `t.cartStickyExpressArrivesBy` with estimated arrival (now + 90 min),
 *   formatted in the recipient country's local timezone.
 * - date = country-local today, slot starts at hour ≥ 18 → `t.cartStickyDeliveryTonight`
 * - date = country-local today, other slot → `t.cartStickyDeliveryToday`
 * - date = country-local tomorrow → `t.cartStickyDeliveryTomorrow`
 * - later date → `t.cartStickyDeliveryDate` with short formatted date
 *
 * Timezone logic uses `getLocalIso` and `formatCountryTime` (both from this
 * module) so the result is correct for LB/CY (Beirut) and AE (Dubai).
 */
export function computeStickyDeliveryPromise(opts: {
  mode: "express" | "today_slot" | "schedule" | null | undefined;
  date: string | null | undefined;
  /** The resolved slot object for the current selection (used to determine tonight). */
  slot?: DeliverySlotStartLike | null;
  countryCode?: string | null;
  t: StickyDeliveryPromiseTranslations;
  /** Defaults to `new Date()`. Pass explicitly in tests. */
  now?: Date;
}): string {
  const { mode, date, slot, countryCode, t } = opts;
  const now = opts.now ?? new Date();

  if (!mode || (mode !== "express" && !date)) return t.cartStickySelectTime;

  if (mode === "express") {
    const arrival = expressDeadlineFrom(now);
    const timeStr = formatCountryTime(arrival, countryCode);
    return t.cartStickyArrivesBy.replace("{time}", timeStr);
  }

  // Scheduled or today_slot — classify against the market-local calendar.
  const day = classifyStandardDeliveryDay({ dateIso: date!, slot, countryCode, now });
  if (day === "tonight") return t.cartStickyDeliveryTonight;
  if (day === "today") return t.cartStickyDeliveryToday;
  if (day === "tomorrow") return t.cartStickyDeliveryTomorrow;

  // Future date: short localised label e.g. "Fri, 22 Aug".
  const [y, m, d] = date!.split("-").map(Number) as [number, number, number];
  const dateObj = new Date(y, m - 1, d, 12, 0, 0);
  let shortDate: string;
  try {
    shortDate = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(dateObj);
  } catch {
    shortDate = date!;
  }
  return t.cartStickyDeliveryDate.replace("{date}", shortDate);
}
