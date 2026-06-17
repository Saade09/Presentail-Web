/**
 * Integration tests for osLocationsCache.ts — inactive city supplementation.
 *
 * These tests feed controlled OS payloads through the real transformation
 * pipeline (storeLocationsFromWebhook → transformOsResponse) and assert
 * that getLocations() returns the correct isActive flags for every Lebanon
 * city regardless of what the OS API returns.
 *
 * No mocking of transformOsResponse, resolveOsCityId, or the hardcoded city
 * list — the goal is to prove the data that reaches LocationPicker is correct.
 */

import { describe, it, expect } from "vitest";
import { storeLocationsFromWebhook, getLocations } from "./osLocationsCache";
import type { OSLocationsResponse, OSCountry, OSCity } from "@workspace/presentail-os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCity(overrides: Partial<OSCity> & { id: number; slug: string; name: string }): OSCity {
  return {
    expressAvailable: false,
    expressDeliveryLabel: "",
    sameDayCutoffHour: 22,
    timeSlots: [],
    ...overrides,
  };
}

function makeLbCountry(cities: OSCity[]): OSCountry {
  return {
    code: "lb",
    name: "Lebanon",
    flag: "🇱🇧",
    currency: "USD",
    cities,
  };
}

/** Feed a Lebanon-only payload to the cache and return Lebanon's city list. */
function loadLbCities(osCities: OSCity[]): ReturnType<typeof getLocations>[number]["cities"] {
  const payload: OSLocationsResponse = { countries: [makeLbCountry(osCities)] };
  storeLocationsFromWebhook(payload);
  const lb = getLocations().find((c) => c.code === "LB");
  if (!lb) throw new Error("Lebanon not found in locations after storeLocationsFromWebhook");
  return lb.cities;
}

// ---------------------------------------------------------------------------
// Tests: inactive city supplementation
// ---------------------------------------------------------------------------

describe("osLocationsCache — inactive city supplementation", () => {
  it("marks a city as isActive:false when OS omits it from the response", () => {
    // OS returns Beirut and Metn only — all other LB cities are absent.
    const cities = loadLbCities([
      makeCity({ id: 1, slug: "beirut", name: "Beirut" }),
      makeCity({ id: 2, slug: "metn", name: "Metn" }),
    ]);

    const bentJbeil = cities.find((c) => c.id === "lb-bent-jbeil");
    expect(bentJbeil, "lb-bent-jbeil should be present as an inactive supplement").toBeTruthy();
    expect(bentJbeil!.isActive).toBe(false);
  });

  it("marks ALL 8 known inactive Lebanese cities as isActive:false when OS omits them", () => {
    // OS returns only the well-known active cities; all 8 historically inactive
    // ones are absent, which is how Presentail OS signals they are disabled.
    const activeSlugs = [
      "beirut", "metn", "aley", "baabda", "chouf", "jbail",
      "kasserwan", "koura", "akkar", "batroun", "bcharee",
      "minnieh-dennaya", "rechaya", "saida", "tripoli", "west-bekaa",
      "zahle", "zghorta",
    ];
    const osCities = activeSlugs.map((slug, i) =>
      makeCity({ id: i + 1, slug, name: slug }),
    );
    const cities = loadLbCities(osCities);

    const expectInactive = [
      "lb-baalbeck",
      "lb-bent-jbeil",
      "lb-hasbaya",
      "lb-hermel",
      "lb-jezzine",
      "lb-marjayoun",
      "lb-nabatieh",
      "lb-tyre",
    ];
    for (const id of expectInactive) {
      const city = cities.find((c) => c.id === id);
      expect(city, `${id} must be present as an inactive supplement`).toBeTruthy();
      expect(city!.isActive, `${id} must be isActive:false when absent from OS`).toBe(false);
    }
  });

  it("marks a city as isActive:true when OS returns it", () => {
    const cities = loadLbCities([
      makeCity({ id: 1, slug: "beirut", name: "Beirut" }),
    ]);

    const beirut = cities.find((c) => c.id === "lb-beirut");
    expect(beirut, "lb-beirut should be present").toBeTruthy();
    expect(beirut!.isActive).toBe(true);
  });

  it("honours an explicit isActive:false on an OS city", () => {
    const cities = loadLbCities([
      makeCity({ id: 1, slug: "beirut", name: "Beirut", isActive: false }),
    ]);

    const beirut = cities.find((c) => c.id === "lb-beirut");
    expect(beirut!.isActive).toBe(false);
  });

  it("preserves active cities alongside inactive supplements without mixing them up", () => {
    const cities = loadLbCities([
      makeCity({ id: 1, slug: "beirut", name: "Beirut" }),
      makeCity({ id: 2, slug: "metn", name: "Metn" }),
    ]);

    const activeCities = cities.filter((c) => c.isActive);
    const inactiveCities = cities.filter((c) => !c.isActive);

    // Beirut and Metn came from OS → active
    expect(activeCities.some((c) => c.id === "lb-beirut")).toBe(true);
    expect(activeCities.some((c) => c.id === "lb-metn")).toBe(true);

    // Supplement cities are all inactive and none are Beirut or Metn
    expect(inactiveCities.some((c) => c.id === "lb-beirut")).toBe(false);
    expect(inactiveCities.some((c) => c.id === "lb-metn")).toBe(false);
    expect(inactiveCities.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: slug resolution strategies (resolveOsCityId via integration)
// ---------------------------------------------------------------------------

describe("osLocationsCache — slug resolution", () => {
  it("strategy 2 (prefix): OS slug 'beirut' resolves to canonical id 'lb-beirut'", () => {
    const cities = loadLbCities([makeCity({ id: 1, slug: "beirut", name: "Beirut" })]);
    expect(cities.some((c) => c.id === "lb-beirut")).toBe(true);
    // The raw slug must not appear as a separate city entry
    expect(cities.some((c) => c.id === "beirut")).toBe(false);
  });

  it("strategy 0 (override map): OS slug 'jbeil' resolves to canonical id 'lb-jbail'", () => {
    const cities = loadLbCities([makeCity({ id: 1, slug: "jbeil", name: "Jbeil" })]);
    expect(cities.some((c) => c.id === "lb-jbail")).toBe(true);
    expect(cities.some((c) => c.id === "jbeil")).toBe(false);
    expect(cities.some((c) => c.id === "lb-jbeil")).toBe(false);
  });

  it("strategy 0 (override map): OS slug 'kesserwan' resolves to 'lb-kasserwan'", () => {
    const cities = loadLbCities([makeCity({ id: 1, slug: "kesserwan", name: "Kesserwan" })]);
    expect(cities.some((c) => c.id === "lb-kasserwan")).toBe(true);
  });

  it("strategy 0 (override map): OS slug 'minnieh-dennaye' resolves to 'lb-minnieh-dennaya'", () => {
    const cities = loadLbCities([
      makeCity({ id: 1, slug: "minnieh-dennaye", name: "Minnieh-Dennaye" }),
    ]);
    expect(cities.some((c) => c.id === "lb-minnieh-dennaya")).toBe(true);
  });

  it("strategy 0 (override map): OS slug 'rachaya' resolves to 'lb-rechaya'", () => {
    const cities = loadLbCities([makeCity({ id: 1, slug: "rachaya", name: "Rachaya" })]);
    expect(cities.some((c) => c.id === "lb-rechaya")).toBe(true);
  });

  it("resolved OS city is not double-counted with its hardcoded supplement entry", () => {
    // jbeil resolves to lb-jbail; ensure lb-jbail appears exactly once
    const cities = loadLbCities([makeCity({ id: 1, slug: "jbeil", name: "Jbeil" })]);
    const count = cities.filter((c) => c.id === "lb-jbail").length;
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: hardcoded fallback when OS returns a country with 0 cities
// ---------------------------------------------------------------------------

describe("osLocationsCache — zero-city country fallback", () => {
  it("serves hardcoded cities when OS returns Lebanon with 0 cities", () => {
    const payload: OSLocationsResponse = { countries: [makeLbCountry([])] };
    storeLocationsFromWebhook(payload);
    const lb = getLocations().find((c) => c.code === "LB");
    expect(lb).toBeTruthy();
    // At least the well-known active cities should be present from hardcoded fallback
    expect(lb!.cities.some((c) => c.id === "lb-beirut")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: country entirely absent from OS → hardcoded fallback appended
// ---------------------------------------------------------------------------

describe("osLocationsCache — country absent from OS", () => {
  it("appends a country absent from OS response using hardcoded data", () => {
    // Send only Lebanon; Cyprus is absent from OS
    const payload: OSLocationsResponse = {
      countries: [makeLbCountry([makeCity({ id: 1, slug: "beirut", name: "Beirut" })])],
    };
    storeLocationsFromWebhook(payload);
    const cyprus = getLocations().find((c) => c.code === "CY");
    expect(cyprus, "Cyprus should be appended from hardcoded data").toBeTruthy();
    expect(cyprus!.cities.length).toBeGreaterThan(0);
  });
});
