// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import {
  EXPRESS_SLA_MINUTES,
  expressDeadlineFrom,
  formatCountryTime,
  formatPromiseDateLabel,
  type TimeSlot,
} from "@workspace/delivery";
import { buildExpressPromise, buildStandardPromise } from "./deliveryPromise";

// Identity translator matching the keys used by the builders.
const en: Record<string, string> = {
  "delivery.promise.standardTitle": "Standard delivery",
  "delivery.promise.expressTitle": "Express delivery",
  "delivery.promise.arrives": "Arrives {when}",
  "delivery.promise.arrivesBy": "Arrives by {time}",
  "delivery.promise.scheduledCaption": "Scheduled delivery window",
  "delivery.promise.within90": "Within 90 minutes",
  "delivery.promise.within90Short": "Within 90 min",
  "delivery.promise.today": "today",
  "delivery.promise.tomorrow": "tomorrow",
};
const t = (k: string) => en[k] ?? k;

const SLOTS: TimeSlot[] = [
  { label: "2:00 PM – 5:00 PM", cutoffHour: 14, startHour: 14, endHour: 17 },
  { label: "6:00 PM – 9:00 PM", cutoffHour: 18 }, // legacy label-only slot
];

describe("formatPromiseDateLabel", () => {
  it("returns today/tomorrow labels for those dates", () => {
    expect(formatPromiseDateLabel("2026-08-13", "2026-08-13", "today", "tomorrow", "en")).toBe("today");
    expect(formatPromiseDateLabel("2026-08-14", "2026-08-13", "today", "tomorrow", "en")).toBe("tomorrow");
  });

  it("crosses month boundaries correctly for tomorrow", () => {
    expect(formatPromiseDateLabel("2026-09-01", "2026-08-31", "today", "tomorrow", "en")).toBe("tomorrow");
  });

  it("formats future dates as a short localized weekday/day/month", () => {
    // 2026-08-15 is a Saturday.
    expect(formatPromiseDateLabel("2026-08-15", "2026-08-13", "today", "tomorrow", "en")).toMatch(/Sat/);
    expect(formatPromiseDateLabel("2026-08-15", "2026-08-13", "today", "tomorrow", "en")).toMatch(/15/);
    expect(formatPromiseDateLabel("2026-08-15", "2026-08-13", "today", "tomorrow", "en")).toMatch(/Aug/);
  });

  it("localizes future dates (Arabic)", () => {
    const label = formatPromiseDateLabel("2026-08-15", "2026-08-13", "اليوم", "غداً", "ar");
    expect(label).not.toMatch(/Aug/);
    expect(label.length).toBeGreaterThan(0);
  });
});

describe("express deadline computation", () => {
  it("adds exactly 90 minutes to the quote time", () => {
    const quoted = new Date("2026-08-13T06:37:00Z");
    expect(expressDeadlineFrom(quoted).getTime() - quoted.getTime()).toBe(EXPRESS_SLA_MINUTES * 60_000);
  });

  it("formats the deadline in the market timezone, not the runtime timezone", () => {
    // 06:37 UTC quote → deadline 08:07 UTC → 11:07 AM in Beirut (UTC+3, DST in Aug).
    const quoted = new Date("2026-08-13T06:37:00Z");
    const deadline = expressDeadlineFrom(quoted);
    expect(formatCountryTime(deadline, "LB", "en")).toBe("11:07 AM");
    // Same instant in Dubai (UTC+4) → 12:07 PM.
    expect(formatCountryTime(deadline, "AE", "en")).toBe("12:07 PM");
  });

  it("is anchored: the same quote always yields the same deadline text", () => {
    const quoted = new Date("2026-08-13T06:37:00Z");
    const a = formatCountryTime(expressDeadlineFrom(quoted), "LB", "en");
    const b = formatCountryTime(expressDeadlineFrom(quoted), "LB", "en");
    expect(a).toBe(b);
  });
});

describe("buildStandardPromise", () => {
  it("builds today promise with concise slot window", () => {
    const p = buildStandardPromise({
      dateIso: "2026-08-13",
      slotLabel: "2:00 PM – 5:00 PM",
      slots: SLOTS,
      todayIso: "2026-08-13",
      locale: "en",
      t,
    });
    expect(p.type).toBe("standard");
    expect(p.title).toBe("Standard delivery");
    expect(p.arrival).toBe("Arrives today, 2 PM–5 PM");
    expect(p.caption).toBe("Scheduled delivery window");
    expect(p.summary).toBe("Standard delivery · today, 2 PM–5 PM");
  });

  it("builds tomorrow and future-date promises", () => {
    const tomorrow = buildStandardPromise({
      dateIso: "2026-08-14",
      slotLabel: "6:00 PM – 9:00 PM",
      slots: SLOTS,
      todayIso: "2026-08-13",
      locale: "en",
      t,
    });
    expect(tomorrow.arrival).toBe("Arrives tomorrow, 6 PM–9 PM");

    const future = buildStandardPromise({
      dateIso: "2026-08-15",
      slotLabel: "2:00 PM – 5:00 PM",
      slots: SLOTS,
      todayIso: "2026-08-13",
      locale: "en",
      t,
    });
    expect(future.arrival).toMatch(/^Arrives Sat, (Aug 15|15 Aug), 2 PM–5 PM$/);
  });

  it("falls back to the raw slot label when the slot is unknown", () => {
    const p = buildStandardPromise({
      dateIso: "2026-08-13",
      slotLabel: "Unknown Slot",
      slots: SLOTS,
      todayIso: "2026-08-13",
      locale: "en",
      t,
    });
    expect(p.arrival).toBe("Arrives today, Unknown Slot");
  });

  it("omits the window when no slot label exists", () => {
    const p = buildStandardPromise({
      dateIso: "2026-08-13",
      slotLabel: null,
      slots: SLOTS,
      todayIso: "2026-08-13",
      locale: "en",
      t,
    });
    expect(p.arrival).toBe("Arrives today");
  });
});

describe("buildExpressPromise", () => {
  it("builds the express promise with a market-timezone deadline", () => {
    const p = buildExpressPromise({
      quotedAt: new Date("2026-08-13T06:37:00Z"),
      countryCode: "LB",
      locale: "en",
      t,
    });
    expect(p.type).toBe("express");
    expect(p.title).toBe("Express delivery");
    expect(p.arrival).toBe("Arrives by 11:07 AM");
    expect(p.caption).toBe("Within 90 minutes");
    expect(p.summary).toBe("Express delivery · Within 90 min");
  });
});
