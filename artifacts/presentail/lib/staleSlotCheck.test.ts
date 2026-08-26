import { describe, expect, it } from "vitest";
import { checkNativeStaleSlotSelection } from "./staleSlotCheck";

const beirut = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 7, 18, hour - 3, minute));

describe("checkNativeStaleSlotSelection", () => {
  it("keeps a future same-day window valid after its booking cutoff", () => {
    expect(
      checkNativeStaleSlotSelection({
        deliveryMode: "today_slot",
        deliveryDate: "2026-08-18",
        slot: {
          label: "6:00 PM – 10:00 PM",
          cutoffHour: 11,
          startHour: 18,
          endHour: 22,
        },
        countryCode: "LB",
        cityId: "lb-beirut",
        now: beirut(11, 25),
      }),
    ).toEqual({ bookable: true });
  });

  it("expires exactly when the ordinary delivery window ends", () => {
    expect(
      checkNativeStaleSlotSelection({
        deliveryMode: "today_slot",
        deliveryDate: "2026-08-18",
        slot: {
          label: "6:00 PM – 10:00 PM",
          cutoffHour: 11,
          startHour: 18,
          endHour: 22,
        },
        countryCode: "LB",
        cityId: "lb-beirut",
        now: beirut(22),
      }),
    ).toEqual({ bookable: false, reason: "slot_window_ended" });
  });

  it("passes city identity through for Midnight's start-date rules", () => {
    expect(
      checkNativeStaleSlotSelection({
        deliveryMode: "schedule",
        deliveryDate: "2026-08-20",
        slot: {
          label: "11 PM–1 AM",
          serviceType: "midnight",
          cutoffHour: 22,
          startHour: 23,
          endHour: 1,
        },
        countryCode: "LB",
        cityId: "lb-beirut",
        now: new Date("2026-08-20T20:00:00.000Z"),
      }),
    ).toEqual({ bookable: true });
  });

  it("skips Express because it has a separate availability gate", () => {
    expect(
      checkNativeStaleSlotSelection({
        deliveryMode: "express",
        deliveryDate: "2026-08-18",
        countryCode: "LB",
        now: beirut(23),
      }),
    ).toEqual({ bookable: true });
  });
});