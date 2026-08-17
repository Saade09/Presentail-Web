import { describe, it, expect } from "vitest";
import { joinRecipientName } from "./recipientName";

describe("joinRecipientName", () => {
  it("joins legacy split first/last saved-recipient fields", () => {
    expect(joinRecipientName("Jane", "Doe")).toBe("Jane Doe");
  });

  it("returns a single name unchanged (no surname requirement)", () => {
    expect(joinRecipientName("Maya", "")).toBe("Maya");
    expect(joinRecipientName("Maya", null)).toBe("Maya");
    expect(joinRecipientName("Maya", undefined)).toBe("Maya");
  });

  it("trims whitespace on each part", () => {
    expect(joinRecipientName("  Jean-Pierre ", "  D'Arcy  ")).toBe(
      "Jean-Pierre D'Arcy",
    );
    expect(joinRecipientName("  ", "  ")).toBe("");
  });

  it("preserves Unicode names (Arabic, accents)", () => {
    expect(joinRecipientName("محمد", "الخوري")).toBe("محمد الخوري");
    expect(joinRecipientName("Zoë", "Müller")).toBe("Zoë Müller");
    expect(joinRecipientName("ليلى", "")).toBe("ليلى");
  });
});
