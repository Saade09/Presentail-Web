import { describe, expect, it } from "vitest";

import {
  EXPRESS_CLOSE_HOUR,
  EXPRESS_OPEN_HOUR,
  getCountryHour,
  isExpressDeliveryAvailable,
} from "../index.js";

/**
 * Express Delivery is offered between 8:00 (inclusive) and 22:00 (exclusive)
 * in the recipient country's local time. Country → time zone mapping:
 *   - LB → Asia/Beirut (UTC+2 winter, UTC+3 DST)
 *   - AE → Asia/Dubai  (UTC+4, no DST)
 *   - CY → Asia/Beirut (close enough — routed to the Beirut helper)
 *
 * Each case below freezes a UTC instant whose local hour in the target
 * country lines up exactly with the boundary we want to pin (07:59, 08:00,
 * 21:59, 22:00), so a future time-zone tweak that drifts even by a minute
 * causes the test to fail loudly.
 */

function utc(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour, minute, 0));
}

describe("EXPRESS window constants", () => {
  it("opens at 08:00 and closes at 22:00", () => {
    expect(EXPRESS_OPEN_HOUR).toBe(8);
    expect(EXPRESS_CLOSE_HOUR).toBe(22);
  });
});

describe("getCountryHour", () => {
  it("returns Beirut local hour for LB (winter, UTC+2)", () => {
    // 06:00 UTC on a January day = 08:00 in Beirut.
    expect(getCountryHour("LB", utc(2026, 0, 15, 6, 0))).toBe(8);
    expect(getCountryHour("LB", utc(2026, 0, 15, 5, 59))).toBe(7);
    expect(getCountryHour("LB", utc(2026, 0, 15, 19, 59))).toBe(21);
    expect(getCountryHour("LB", utc(2026, 0, 15, 20, 0))).toBe(22);
  });

  it("returns Beirut local hour for LB (summer DST, UTC+3)", () => {
    // 05:00 UTC in July = 08:00 in Beirut (DST).
    expect(getCountryHour("LB", utc(2026, 6, 15, 5, 0))).toBe(8);
    expect(getCountryHour("LB", utc(2026, 6, 15, 4, 59))).toBe(7);
    expect(getCountryHour("LB", utc(2026, 6, 15, 18, 59))).toBe(21);
    expect(getCountryHour("LB", utc(2026, 6, 15, 19, 0))).toBe(22);
  });

  it("returns Dubai local hour for AE (UTC+4, no DST)", () => {
    expect(getCountryHour("AE", utc(2026, 0, 15, 4, 0))).toBe(8);
    expect(getCountryHour("AE", utc(2026, 0, 15, 3, 59))).toBe(7);
    expect(getCountryHour("AE", utc(2026, 0, 15, 17, 59))).toBe(21);
    expect(getCountryHour("AE", utc(2026, 0, 15, 18, 0))).toBe(22);
    // Mid-summer too — Dubai has no DST so the offset is identical.
    expect(getCountryHour("AE", utc(2026, 6, 15, 4, 0))).toBe(8);
    expect(getCountryHour("AE", utc(2026, 6, 15, 18, 0))).toBe(22);
  });

  it("routes CY through the Beirut helper", () => {
    expect(getCountryHour("CY", utc(2026, 0, 15, 6, 0))).toBe(
      getCountryHour("LB", utc(2026, 0, 15, 6, 0)),
    );
    expect(getCountryHour("CY", utc(2026, 6, 15, 5, 0))).toBe(
      getCountryHour("LB", utc(2026, 6, 15, 5, 0)),
    );
  });

  it("defaults unknown / null / undefined country to Beirut", () => {
    const at = utc(2026, 0, 15, 6, 0);
    expect(getCountryHour(undefined, at)).toBe(8);
    expect(getCountryHour(null, at)).toBe(8);
    expect(getCountryHour("ZZ", at)).toBe(8);
  });
});

describe("isExpressDeliveryAvailable — LB (winter)", () => {
  it("is closed at 07:59 local", () => {
    expect(isExpressDeliveryAvailable("LB", utc(2026, 0, 15, 5, 59))).toBe(false);
  });
  it("opens at 08:00 sharp local", () => {
    expect(isExpressDeliveryAvailable("LB", utc(2026, 0, 15, 6, 0))).toBe(true);
  });
  it("is still open at 21:59 local", () => {
    expect(isExpressDeliveryAvailable("LB", utc(2026, 0, 15, 19, 59))).toBe(true);
  });
  it("closes at 22:00 sharp local", () => {
    expect(isExpressDeliveryAvailable("LB", utc(2026, 0, 15, 20, 0))).toBe(false);
  });
});

describe("isExpressDeliveryAvailable — LB (summer DST)", () => {
  it("is closed at 07:59 local", () => {
    expect(isExpressDeliveryAvailable("LB", utc(2026, 6, 15, 4, 59))).toBe(false);
  });
  it("opens at 08:00 sharp local", () => {
    expect(isExpressDeliveryAvailable("LB", utc(2026, 6, 15, 5, 0))).toBe(true);
  });
  it("is still open at 21:59 local", () => {
    expect(isExpressDeliveryAvailable("LB", utc(2026, 6, 15, 18, 59))).toBe(true);
  });
  it("closes at 22:00 sharp local", () => {
    expect(isExpressDeliveryAvailable("LB", utc(2026, 6, 15, 19, 0))).toBe(false);
  });
});

describe("isExpressDeliveryAvailable — AE", () => {
  it("is closed at 07:59 local", () => {
    expect(isExpressDeliveryAvailable("AE", utc(2026, 0, 15, 3, 59))).toBe(false);
  });
  it("opens at 08:00 sharp local", () => {
    expect(isExpressDeliveryAvailable("AE", utc(2026, 0, 15, 4, 0))).toBe(true);
  });
  it("is still open at 21:59 local", () => {
    expect(isExpressDeliveryAvailable("AE", utc(2026, 0, 15, 17, 59))).toBe(true);
  });
  it("closes at 22:00 sharp local", () => {
    expect(isExpressDeliveryAvailable("AE", utc(2026, 0, 15, 18, 0))).toBe(false);
  });
});

describe("isExpressDeliveryAvailable — CY (Beirut tz)", () => {
  it("is closed at 07:59 local (winter)", () => {
    expect(isExpressDeliveryAvailable("CY", utc(2026, 0, 15, 5, 59))).toBe(false);
  });
  it("opens at 08:00 sharp local (winter)", () => {
    expect(isExpressDeliveryAvailable("CY", utc(2026, 0, 15, 6, 0))).toBe(true);
  });
  it("is still open at 21:59 local (winter)", () => {
    expect(isExpressDeliveryAvailable("CY", utc(2026, 0, 15, 19, 59))).toBe(true);
  });
  it("closes at 22:00 sharp local (winter)", () => {
    expect(isExpressDeliveryAvailable("CY", utc(2026, 0, 15, 20, 0))).toBe(false);
  });
  it("respects DST in summer (08:00 open, 22:00 close)", () => {
    expect(isExpressDeliveryAvailable("CY", utc(2026, 6, 15, 4, 59))).toBe(false);
    expect(isExpressDeliveryAvailable("CY", utc(2026, 6, 15, 5, 0))).toBe(true);
    expect(isExpressDeliveryAvailable("CY", utc(2026, 6, 15, 18, 59))).toBe(true);
    expect(isExpressDeliveryAvailable("CY", utc(2026, 6, 15, 19, 0))).toBe(false);
  });
});
