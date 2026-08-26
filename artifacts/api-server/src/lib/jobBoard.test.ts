import { describe, it, expect } from "vitest";
import { estimateJobBoardHeight } from "./jobBoard";

describe("estimateJobBoardHeight", () => {
  it("returns the floor height for zero open roles", () => {
    expect(estimateJobBoardHeight(0)).toBe(500);
  });

  it("grows with the number of live rows so a full list is never clipped", () => {
    const small = estimateJobBoardHeight(5);
    const large = estimateJobBoardHeight(49);
    expect(large).toBeGreaterThan(small);
    // Matches the live board's current size (49 rows) — height comfortably
    // covers chrome + all rows without hitting the cap.
    expect(large).toBe(160 + 49 * 34);
  });

  it("never exceeds the max height even for very large listings", () => {
    expect(estimateJobBoardHeight(10_000)).toBe(3600);
  });

  it("never returns a negative/undersized height for bad input", () => {
    expect(estimateJobBoardHeight(-5)).toBe(500);
  });
});
