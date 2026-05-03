import { describe, expect, it } from "vitest";

import { getBeirutHour, getBeirutOffsetHours } from "./beirutTime";

describe("getBeirutOffsetHours (DST edges)", () => {
  it("returns +2 in winter (mid-January)", () => {
    expect(getBeirutOffsetHours(new Date("2026-01-15T10:00:00Z"))).toBe(2);
  });

  it("returns +3 in summer (mid-July)", () => {
    expect(getBeirutOffsetHours(new Date("2026-07-15T10:00:00Z"))).toBe(3);
  });

  it("is +2 just before DST start (last Sunday of March 00:00 local = 22:00 UTC the prior day)", () => {
    // 2026 last Sunday of March = March 29; DST starts at 00:00 local (UTC+2) → 2026-03-28T22:00Z.
    expect(
      getBeirutOffsetHours(new Date("2026-03-28T21:59:59Z")),
    ).toBe(2);
  });

  it("is +3 at the moment DST starts (last Sunday of March)", () => {
    expect(getBeirutOffsetHours(new Date("2026-03-28T22:00:00Z"))).toBe(3);
  });

  it("is +3 just before DST ends (last Sunday of October 00:00 local = 21:00 UTC the prior day)", () => {
    // 2026 last Sunday of October = October 25; DST ends at 00:00 local (UTC+3) → 2026-10-24T21:00Z.
    expect(
      getBeirutOffsetHours(new Date("2026-10-24T20:59:59Z")),
    ).toBe(3);
  });

  it("is +2 at the moment DST ends (last Sunday of October)", () => {
    expect(getBeirutOffsetHours(new Date("2026-10-24T21:00:00Z"))).toBe(2);
  });

  it("handles the 2025 DST edges (different last-Sunday dates)", () => {
    // 2025 last Sunday of March = March 30 → DST starts 2025-03-29T22:00Z.
    expect(getBeirutOffsetHours(new Date("2025-03-29T21:59:59Z"))).toBe(2);
    expect(getBeirutOffsetHours(new Date("2025-03-29T22:00:00Z"))).toBe(3);
    // 2025 last Sunday of October = October 26 → DST ends 2025-10-25T21:00Z.
    expect(getBeirutOffsetHours(new Date("2025-10-25T20:59:59Z"))).toBe(3);
    expect(getBeirutOffsetHours(new Date("2025-10-25T21:00:00Z"))).toBe(2);
  });
});

describe("getBeirutHour", () => {
  it("returns the correct wall-clock hour in winter (UTC+2)", () => {
    expect(getBeirutHour(new Date("2026-01-15T10:00:00Z"))).toBe(12);
  });

  it("returns the correct wall-clock hour in summer (UTC+3)", () => {
    expect(getBeirutHour(new Date("2026-07-15T10:00:00Z"))).toBe(13);
  });

  it("rolls cleanly across midnight", () => {
    // 22:30 UTC in winter = 00:30 Beirut.
    expect(getBeirutHour(new Date("2026-01-15T22:30:00Z"))).toBe(0);
  });

  it("springs forward at the DST start boundary (00:00 local jumps to 01:00)", () => {
    // 2026-03-28T22:00Z = 00:00 local just-before, then immediately +3 → 01:00 local.
    expect(getBeirutHour(new Date("2026-03-28T22:00:00Z"))).toBe(1);
    // A few hours into DST: 02:00 UTC → 05:00 local.
    expect(getBeirutHour(new Date("2026-03-29T02:00:00Z"))).toBe(5);
  });

  it("falls back at the DST end boundary (00:00 local DST falls to 23:00 local std)", () => {
    // 2026-10-24T21:00Z = 00:00 local DST ends → clock falls to 23:00 local std.
    expect(getBeirutHour(new Date("2026-10-24T21:00:00Z"))).toBe(23);
    // Well past the transition: same date a few hours later, +2 offset.
    expect(getBeirutHour(new Date("2026-10-25T08:00:00Z"))).toBe(10);
  });
});
