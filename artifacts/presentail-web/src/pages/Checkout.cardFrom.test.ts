import { describe, it, expect } from "vitest";
import { buildCardFrom } from "@/lib/cardFrom";

// ---------------------------------------------------------------------------
// Unit tests for buildCardFrom — the helper used by buildOrderPayload in
// Checkout.tsx to derive the card "From" label sent to the OS order.
//
// Web checkout derives cardFrom solely from the sender billing fields — there
// is no separate "From" text input.  The same code path applies for both
// signed-in and guest shoppers because sender.firstName/lastName always come
// from the billing form regardless of auth state.
// ---------------------------------------------------------------------------

describe("web checkout — buildCardFrom (sender name → OS order cardFrom)", () => {
  it("signed-in user: produces firstName + lastName", () => {
    expect(buildCardFrom("Alice", "Smith")).toBe("Alice Smith");
  });

  it("guest shopper: produces firstName + lastName (same code path)", () => {
    expect(buildCardFrom("Bob", "Jones")).toBe("Bob Jones");
  });

  it("first name only: uses just the first name", () => {
    expect(buildCardFrom("Alice", "")).toBe("Alice");
  });

  it("last name only: uses just the last name", () => {
    expect(buildCardFrom("", "Smith")).toBe("Smith");
  });

  it("empty sender name: returns undefined", () => {
    expect(buildCardFrom("", "")).toBeUndefined();
  });

  it("whitespace-only names: trims and returns undefined", () => {
    expect(buildCardFrom("   ", "   ")).toBeUndefined();
  });

  it("name exactly 300 chars: not truncated", () => {
    const name = "A".repeat(300);
    expect(buildCardFrom(name, "")).toBe("A".repeat(300));
    expect(buildCardFrom(name, "")?.length).toBe(300);
  });

  it("name longer than 300 chars: truncated to 300", () => {
    const long = "B".repeat(400);
    const result = buildCardFrom(long, "");
    expect(result?.length).toBe(300);
    expect(result).toBe("B".repeat(300));
  });

  it("combined first+last longer than 300 chars: truncated to 300", () => {
    const first = "A".repeat(200);
    const last = "B".repeat(200);
    const result = buildCardFrom(first, last);
    expect(result?.length).toBe(300);
  });

  it("trims outer whitespace but preserves inner spaces from padded parts", () => {
    // filter(Boolean).join(" ").trim() only strips the outer edges.
    // "  Alice  " + " " + "  Smith  " → after outer trim: "Alice     Smith"
    // (2 trailing spaces + 1 join space + 2 leading spaces = 5 inner spaces).
    expect(buildCardFrom("  Alice  ", "  Smith  ")).toBe("Alice     Smith");
  });
});
