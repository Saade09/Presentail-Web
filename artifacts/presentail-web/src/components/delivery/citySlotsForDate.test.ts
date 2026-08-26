import { describe, expect, it } from "vitest";
import { citySlotsForDate } from "./citySlotsForDate";

const flat = [
  { label: "Merged fallback", slotId: "flat", startHour: 9, endHour: 13, cutoffHour: 9 },
];
const thursday = [
  { label: "OS Thursday", slotId: "thu", startHour: 14, endHour: 18, cutoffHour: 14 },
];

describe("citySlotsForDate", () => {
  it("uses the selected weekday's OS slots instead of the flat list", () => {
    expect(
      citySlotsForDate(flat, { thursday }, "2026-08-27"),
    ).toEqual(thursday);
  });

  it("does not invent slots when OS has no entry for the selected weekday", () => {
    expect(
      citySlotsForDate(flat, { thursday }, "2026-08-28"),
    ).toEqual([]);
  });

  it("uses the flat OS list only for payloads without weekday schedules", () => {
    expect(citySlotsForDate(flat, undefined, "2026-08-27")).toEqual(flat);
  });
});