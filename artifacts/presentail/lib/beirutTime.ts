/**
 * Asia/Beirut timezone helpers.
 *
 * Beirut runs on EET (UTC+2) in winter and EEST (UTC+3) during DST.
 * DST currently starts on the last Sunday of March at 00:00 local time
 * and ends on the last Sunday of October at 00:00 local time.
 *
 * We try `Intl` first (the platform's authoritative tzdata). If that
 * throws or the runtime ships without timezone data (older Hermes/JSC,
 * some web bundlers), we compute the offset ourselves so the express
 * delivery cutoff in checkout still lines up with wall-clock time.
 */

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
export function getCountryHour(countryCode?: string, at: Date = new Date()): number {
  if (countryCode === "AE") return getDubaiHour(at);
  return getBeirutHour(at);
}

/**
 * Quick self-checks (run at module import in __DEV__ only) so
 * regressions in the DST boundaries surface during development.
 *
 * Examples:
 *   - 2026-01-15 10:00 UTC → 12:00 Beirut (winter, +2)
 *   - 2026-07-15 10:00 UTC → 13:00 Beirut (summer, +3)
 *   - 2026-03-29 00:00 UTC (after DST start) → +3
 *   - 2026-10-25 00:00 UTC (after DST end) → +2
 */
declare const __DEV__: boolean | undefined;
if (typeof __DEV__ !== "undefined" && __DEV__) {
  const cases: { at: string; expectOffset: number; expectHour: number }[] = [
    { at: "2026-01-15T10:00:00Z", expectOffset: 2, expectHour: 12 },
    { at: "2026-07-15T10:00:00Z", expectOffset: 3, expectHour: 13 },
    { at: "2026-03-29T00:00:00Z", expectOffset: 3, expectHour: 3 },
    { at: "2026-10-25T00:00:00Z", expectOffset: 2, expectHour: 2 },
  ];
  for (const c of cases) {
    const d = new Date(c.at);
    const off = getBeirutOffsetHours(d);
    if (off !== c.expectOffset) {
      console.warn(
        `[beirutTime] expected offset ${c.expectOffset} at ${c.at}, got ${off}`,
      );
    }
  }
}
