// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import {
  EXPRESS_SLA_MINUTES,
  expressDeadlineFrom,
  formatCountryTime,
  formatPromiseDateLabel,
  type TimeSlot,
} from "@workspace/delivery";
import { buildExpressPromise, buildMidnightPromise, buildStandardPromise } from "./deliveryPromise";

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
  "delivery.promise.tonight": "tonight",
  "delivery.promise.midnightTitle": "Midnight delivery",
  "delivery.promise.midnightCaption": "Special midnight delivery window",
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

  it("says tonight for a same-day standard window beginning at 6 PM", () => {
    const p = buildStandardPromise({
      dateIso: "2026-08-13",
      slotLabel: "6:00 PM – 9:00 PM",
      slots: SLOTS,
      todayIso: "2026-08-13",
      locale: "en",
      t,
    });
    expect(p.standardDay).toBe("tonight");
    expect(p.arrival).toBe("Arrives tonight, 6 PM–9 PM");
    expect(p.summary).toBe("Standard delivery · tonight, 6 PM–9 PM");
  });

  it("keeps a same-day 5:59 PM standard window as today", () => {
    const p = buildStandardPromise({
      dateIso: "2026-08-13",
      slotLabel: "5:59 PM – 8:00 PM",
      slots: [{ label: "5:59 PM – 8:00 PM", cutoffHour: 17 }],
      todayIso: "2026-08-13",
      locale: "en",
      t,
    });
    expect(p.standardDay).toBe("today");
    expect(p.arrival).toBe("Arrives today, 5 PM–8 PM");
  });

  it("localizes the standard tonight label in Arabic and French", () => {
    const localeStrings = {
      ar: {
        ...en,
        "delivery.promise.arrives": "يصل {when}",
        "delivery.promise.tonight": "الليلة",
      },
      fr: {
        ...en,
        "delivery.promise.arrives": "Arrive {when}",
        "delivery.promise.tonight": "ce soir",
      },
    };
    for (const [locale, strings] of Object.entries(localeStrings)) {
      const p = buildStandardPromise({
        dateIso: "2026-08-13",
        slotLabel: "6:00 PM – 9:00 PM",
        slots: SLOTS,
        todayIso: "2026-08-13",
        locale,
        t: (key) => strings[key as keyof typeof strings] ?? key,
      });
      expect(p.arrival).toContain(strings["delivery.promise.tonight"]);
      expect(p.standardDay).toBe("tonight");
    }
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

describe("buildMidnightPromise", () => {
  const MIDNIGHT_SLOTS: TimeSlot[] = [
    ...SLOTS,
    {
      label: "11:00 PM – 1:00 AM",
      cutoffHour: 21,
      startHour: 23,
      endHour: 1,
      serviceType: "midnight",
      slotId: "mid-1",
      extraFee: 20,
    } as TimeSlot,
  ];

  it("says 'tonight' when the selected date is the market-local today", () => {
    const p = buildMidnightPromise({
      dateIso: "2026-08-13",
      slotLabel: "11:00 PM – 1:00 AM",
      slots: MIDNIGHT_SLOTS,
      todayIso: "2026-08-13",
      locale: "en",
      t,
    });
    expect(p.type).toBe("midnight");
    expect(p.title).toBe("Midnight delivery");
    expect(p.arrival).toBe("Arrives tonight, 11 PM–1 AM");
    expect(p.caption).toBe("Special midnight delivery window");
    expect(p.summary).toBe("Midnight delivery · tonight, 11 PM–1 AM");
  });

  it("uses tomorrow/explicit date labels for future selections (never 'tonight')", () => {
    const tomorrow = buildMidnightPromise({
      dateIso: "2026-08-14",
      slotLabel: "11:00 PM – 1:00 AM",
      slots: MIDNIGHT_SLOTS,
      todayIso: "2026-08-13",
      locale: "en",
      t,
    });
    expect(tomorrow.arrival).toBe("Arrives tomorrow, 11 PM–1 AM");

    const future = buildMidnightPromise({
      dateIso: "2026-08-15",
      slotLabel: "11:00 PM – 1:00 AM",
      slots: MIDNIGHT_SLOTS,
      todayIso: "2026-08-13",
      locale: "en",
      t,
    });
    expect(future.arrival).toMatch(/^Arrives Sat, (Aug 15|15 Aug), 11 PM–1 AM$/);
  });

  it("falls back to the raw slot label when the slot is unknown", () => {
    const p = buildMidnightPromise({
      dateIso: "2026-08-13",
      slotLabel: "Midnight Window",
      slots: SLOTS,
      todayIso: "2026-08-13",
      locale: "en",
      t,
    });
    expect(p.arrival).toBe("Arrives tonight, Midnight Window");
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
