import { describe, it, expect } from "vitest";
import { PINNED_LB_CITY_IDS, sortLbActiveCities } from "./lbCityOrder";

const identity = (_id: string, name: string) => name;

const city = (id: string, name: string) => ({ id, name });

describe("sortLbActiveCities", () => {
  it("puts pinned cities first in curated order, then the rest alphabetically", () => {
    const input = [
      city("lb-akkar", "Akkar"),
      city("lb-aley", "Aley"),
      city("lb-baabda", "Baabda"),
      city("lb-beirut", "Beirut"),
      city("lb-zahle", "Zahle"),
      city("lb-chouf", "Chouf"),
      city("lb-jbeil", "Jbeil"),
      city("lb-kesserwan", "Kesserwan"),
      city("lb-metn", "Metn"),
      city("lb-batroun", "Batroun"),
      city("lb-tripoli", "Tripoli"),
    ];
    const result = sortLbActiveCities(input, identity);
    expect(result.map((c) => c.id)).toEqual([
      "lb-beirut",
      "lb-metn",
      "lb-kesserwan",
      "lb-baabda",
      "lb-aley",
      "lb-tripoli",
      "lb-jbeil",
      "lb-chouf",
      "lb-akkar",
      "lb-batroun",
      "lb-zahle",
    ]);
  });

  it("sorts unpinned cities by the localized name, not the raw name", () => {
    const input = [
      city("lb-akkar", "Akkar"),
      city("lb-zahle", "Zahle"),
    ];
    // Localizer flips the alphabetical order of the two cities.
    const localize = (id: string, name: string) =>
      id === "lb-akkar" ? "Ω-Akkar" : name;
    const result = sortLbActiveCities(input, localize);
    expect(result.map((c) => c.id)).toEqual(["lb-zahle", "lb-akkar"]);
  });

  it("does not mutate the input array", () => {
    const input = [city("lb-zahle", "Zahle"), city("lb-beirut", "Beirut")];
    const copy = [...input];
    sortLbActiveCities(input, identity);
    expect(input).toEqual(copy);
  });

  it("handles a list with only pinned cities", () => {
    const input = [city("lb-metn", "Metn"), city("lb-beirut", "Beirut")];
    expect(sortLbActiveCities(input, identity).map((c) => c.id)).toEqual([
      "lb-beirut",
      "lb-metn",
    ]);
  });

  it("handles an empty list", () => {
    expect(sortLbActiveCities([], identity)).toEqual([]);
  });

  it("pins exactly the 8 curated cities", () => {
    expect(PINNED_LB_CITY_IDS).toHaveLength(8);
  });
});
