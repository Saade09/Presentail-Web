import { describe, it, expect } from "vitest";
import { buildCardFrom } from "./cardFrom";

// ---------------------------------------------------------------------------
// Unit tests for buildCardFrom — the helper used by buildWooPayload in
// app/checkout.tsx to derive the card "From" label sent to the OS order.
//
// Priority:
//   1. Whatever the shopper typed in the "From" field (trimmed, capped at 300).
//   2. If blank → fall back to authUser first+last (also capped at 300).
//   3. If both are empty → undefined (field omitted from the OS order).
// ---------------------------------------------------------------------------

describe("mobile checkout — buildCardFrom (cardFrom fallback to authUser name)", () => {
  describe("user typed a From value", () => {
    it("uses the typed value (trimmed)", () => {
      expect(buildCardFrom("  Alice  ", { firstName: "Other", lastName: "Name" })).toBe("Alice");
    });

    it("uses the typed value when no auth user", () => {
      expect(buildCardFrom("Bob", null)).toBe("Bob");
    });

    it("typed value longer than 300 chars: truncated to 300", () => {
      const long = "X".repeat(400);
      const result = buildCardFrom(long, { firstName: "A", lastName: "B" });
      expect(result?.length).toBe(300);
      expect(result).toBe("X".repeat(300));
    });

    it("typed value exactly 300 chars: not truncated", () => {
      const name = "Y".repeat(300);
      const result = buildCardFrom(name, null);
      expect(result?.length).toBe(300);
    });
  });

  describe("user left From blank — signed-in shopper", () => {
    it("falls back to authUser first + last name", () => {
      expect(buildCardFrom("", { firstName: "Alice", lastName: "Smith" })).toBe("Alice Smith");
    });

    it("falls back to first name only when last name is absent", () => {
      expect(buildCardFrom("", { firstName: "Alice", lastName: undefined })).toBe("Alice");
    });

    it("falls back to last name only when first name is absent", () => {
      expect(buildCardFrom("", { firstName: undefined, lastName: "Smith" })).toBe("Smith");
    });

    it("authUser fallback longer than 300 chars: truncated to 300", () => {
      const first = "A".repeat(200);
      const last = "B".repeat(200);
      const result = buildCardFrom("", { firstName: first, lastName: last });
      expect(result?.length).toBe(300);
    });
  });

  describe("user left From blank — guest / no name", () => {
    it("returns undefined when authUser is null", () => {
      expect(buildCardFrom("", null)).toBeUndefined();
    });

    it("returns undefined when authUser is undefined", () => {
      expect(buildCardFrom("", undefined)).toBeUndefined();
    });

    it("returns undefined when authUser has no first or last name", () => {
      expect(buildCardFrom("", { firstName: undefined, lastName: undefined })).toBeUndefined();
    });

    it("returns undefined when authUser has empty-string names", () => {
      expect(buildCardFrom("", { firstName: "", lastName: "" })).toBeUndefined();
    });

    it("whitespace-only typed value with no authUser: returns undefined", () => {
      expect(buildCardFrom("   ", null)).toBeUndefined();
    });

    it("whitespace-only typed value falls back to authUser name", () => {
      expect(buildCardFrom("   ", { firstName: "Alice", lastName: "Smith" })).toBe("Alice Smith");
    });
  });
});
