import { describe, it, expect } from "vitest";
import { buildCardFrom } from "@/lib/cardFrom";

// ---------------------------------------------------------------------------
// Unit tests for buildCardFrom — the helper used by buildOrderPayload in
// Checkout.tsx to derive the card "From" label sent to the OS order.
//
// Web checkout reads what the shopper typed in the Cart "From" field
// (stored in localStorage under CARD_FROM_KEY) and passes it directly to
// buildCardFrom — the billing sender name is not used.
// ---------------------------------------------------------------------------

describe("web checkout — buildCardFrom (typed input → OS order cardFrom)", () => {
  it("typed value: returned as-is (trimmed)", () => {
    expect(buildCardFrom("Alice")).toBe("Alice");
  });

  it("typed value with surrounding whitespace: trimmed", () => {
    expect(buildCardFrom("  Alice  ")).toBe("Alice");
  });

  it("empty string: returns undefined", () => {
    expect(buildCardFrom("")).toBeUndefined();
  });

  it("whitespace-only: returns undefined", () => {
    expect(buildCardFrom("   ")).toBeUndefined();
  });

  it("exactly 300 chars: returned without truncation", () => {
    const name = "A".repeat(300);
    expect(buildCardFrom(name)).toBe(name);
    expect(buildCardFrom(name)?.length).toBe(300);
  });

  it("longer than 300 chars: truncated to 300", () => {
    const long = "B".repeat(400);
    const result = buildCardFrom(long);
    expect(result?.length).toBe(300);
    expect(result).toBe("B".repeat(300));
  });

  it("multi-word typed value: preserved as typed", () => {
    expect(buildCardFrom("John and Mary")).toBe("John and Mary");
  });

  it("inner spaces preserved, only outer whitespace trimmed", () => {
    expect(buildCardFrom("  Alice   Smith  ")).toBe("Alice   Smith");
  });
});
