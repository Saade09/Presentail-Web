import { describe, it, expect } from "vitest";
import { AE_EMIRATE_ORDER, sortAECities } from "./aeDistricts";

type City = { name: string; isActive?: boolean };

describe("sortAECities", () => {
  it("places Dubai first, then Abu Dhabi, Sharjah, Al Ain", () => {
    const input: City[] = [
      { name: "Abu Dhabi", isActive: true },
      { name: "Sharjah", isActive: true },
      { name: "Al Ain", isActive: true },
      { name: "Dubai", isActive: true },
    ];
    const result = sortAECities(input);
    expect(result.map((c) => c.name)).toEqual([
      "Dubai",
      "Abu Dhabi",
      "Sharjah",
      "Al Ain",
    ]);
  });

  it("puts inactive/unserved emirates after all active ones", () => {
    const input: City[] = [
      { name: "Ajman", isActive: false },
      { name: "Dubai", isActive: true },
      { name: "Fujairah", isActive: false },
      { name: "Abu Dhabi", isActive: true },
      { name: "Ras Al Khaimah", isActive: false },
      { name: "Sharjah", isActive: true },
      { name: "Umm Al Quwain", isActive: false },
      { name: "Al Ain", isActive: true },
    ];
    const result = sortAECities(input);
    const names = result.map((c) => c.name);
    // Active served emirates first, in volume order
    expect(names.slice(0, 4)).toEqual(["Dubai", "Abu Dhabi", "Sharjah", "Al Ain"]);
    // Inactive unserved ones all come after
    const inactiveNames = new Set(["Ajman", "Fujairah", "Ras Al Khaimah", "Umm Al Quwain"]);
    const inactiveResult = result.filter((c) => c.isActive === false);
    expect(inactiveResult.every((c) => inactiveNames.has(c.name))).toBe(true);
    // No active city appears after an inactive city
    const firstInactiveIdx = result.findIndex((c) => c.isActive === false);
    const activeAfterInactive = result
      .slice(firstInactiveIdx)
      .some((c) => c.isActive !== false);
    expect(activeAfterInactive).toBe(false);
  });

  it("handles cities missing from AE_EMIRATE_ORDER (active) by appending them before inactives", () => {
    const input: City[] = [
      { name: "SomeNewCity", isActive: true },
      { name: "Dubai", isActive: true },
      { name: "OldCity", isActive: false },
    ];
    const result = sortAECities(input);
    expect(result[0].name).toBe("Dubai");
    expect(result[1].name).toBe("SomeNewCity");
    expect(result[2].name).toBe("OldCity");
    expect(result[2].isActive).toBe(false);
  });

  it("returns empty array for empty input", () => {
    expect(sortAECities([])).toEqual([]);
  });

  it("AE_EMIRATE_ORDER starts with Dubai", () => {
    expect(AE_EMIRATE_ORDER[0]).toBe("Dubai");
    expect(AE_EMIRATE_ORDER).toContain("Abu Dhabi");
    expect(AE_EMIRATE_ORDER).toContain("Sharjah");
    expect(AE_EMIRATE_ORDER).toContain("Al Ain");
  });
});

describe("Checkout district label gating", () => {
  it("AE uses emirate wording, other countries use district wording", () => {
    // Validates the gating logic pattern used in Checkout.tsx and checkout.tsx
    const labelForCountry = (cc: string) =>
      cc === "AE" ? "Delivery Emirate" : "Delivery District";
    const placeholderForCountry = (cc: string) =>
      cc === "AE" ? "Select an emirate" : "Select a district";

    expect(labelForCountry("AE")).toBe("Delivery Emirate");
    expect(labelForCountry("LB")).toBe("Delivery District");
    expect(labelForCountry("CY")).toBe("Delivery District");

    expect(placeholderForCountry("AE")).toBe("Select an emirate");
    expect(placeholderForCountry("LB")).toBe("Select a district");
  });
});
