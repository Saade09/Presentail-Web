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
 * The free-delivery threshold in the store's native currency.
 * AE → AED 330, CY → EUR 120, LB (default) → USD 130.
 *
 * Used for display on the product detail screen and product cards so the
 * shopper sees the threshold in the currency they're already looking at.
 */
export function freeDeliveryThresholdNative(countryCode?: string | null): number {
  if (countryCode === "AE") return 330;
  if (countryCode === "CY") return 120;
  return 130;
}

/**
 * The free-delivery threshold in USD (the cart's internal currency).
 * AE → 89.84, CY → 120, LB (default) → 130.
 *
 * Used for fee calculation at checkout where all prices are stored in USD.
 * Single source of truth — both web and mobile checkout use this helper.
 */
export function freeDeliveryThresholdUsd(countryCode?: string | null): number {
  if (countryCode === "AE") return 89.84;
  if (countryCode === "CY") return 120;
  return 130;
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

export type TimeSlot = { label: string; cutoffHour: number; extraFee?: number };

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
