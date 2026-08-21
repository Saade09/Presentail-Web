import { describe, expect, it, vi } from "vitest";
import {
  buildMidnightDeliveryMessage,
  formatMidnightDeliveryDate,
} from "./midnightCopy";

describe("Midnight delivery helper copy", () => {
  it("formats dates as weekday, day month across a month boundary", () => {
    expect(formatMidnightDeliveryDate("2026-08-22")).toBe("Sat, 22 Aug");
    expect(formatMidnightDeliveryDate("2026-09-01")).toBe("Tue, 1 Sep");
  });

  it("uses the next calendar date across a year boundary", () => {
    const t = vi.fn(() => "Arrives between 11 PM {start} and 1 AM on {end}");

    expect(buildMidnightDeliveryMessage(t, "2026-12-31", "2026-12-30")).toBe(
      "Arrives between 11 PM on Thu, 31 Dec and 1 AM on Fri, 1 Jan",
    );
  });

  it("keeps the legacy date placeholder for non-English translations", () => {
    const t = vi.fn(() => "Commence entre 23 h la veille et 1 h le {date}");

    expect(buildMidnightDeliveryMessage(t, "2026-08-22", "2026-08-22")).toBe(
      "Commence entre 23 h la veille et 1 h le Sun, 23 Aug",
    );
  });
});