import { describe, it, expect } from "vitest";
import { buildCardFrom } from "./cardFrom";

// ---------------------------------------------------------------------------
// Unit tests for buildCardFrom — the helper used by buildWooPayload in
// app/checkout.tsx to derive the card "From" label sent to the OS order.
//
// The field is derived solely from what the shopper typed. A blank typed
// value returns undefined so the OS order record contains no empty string.
// ---------------------------------------------------------------------------

describe("mobile checkout — buildCardFrom (typed value only)", () => {
  describe("user typed a From value", () => {
    it("uses the typed value (trimmed)", () => {
      expect(buildCardFrom("  Alice  ")).toBe("Alice");
    });

    it("uses the typed value", () => {
      expect(buildCardFrom("Bob")).toBe("Bob");
    });

    it("typed value longer than 300 chars: truncated to 300", () => {
      const long = "X".repeat(400);
      const result = buildCardFrom(long);
      expect(result?.length).toBe(300);
      expect(result).toBe("X".repeat(300));
    });

    it("typed value exactly 300 chars: not truncated", () => {
      const name = "Y".repeat(300);
      const result = buildCardFrom(name);
      expect(result?.length).toBe(300);
    });
  });

  describe("user left From blank", () => {
    it("returns undefined for empty string", () => {
      expect(buildCardFrom("")).toBeUndefined();
    });

    it("returns undefined for whitespace-only string", () => {
      expect(buildCardFrom("   ")).toBeUndefined();
    });
  });
});
