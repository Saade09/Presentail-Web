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

import { describe, it, expect, beforeEach, vi } from "vitest";
import { storeLocationsFromWebhook, getLocations, resetCacheForTesting, fetchAndStoreForTesting } from "./osLocationsCache";
import type { OSLocationsResponse, OSCountry, OSCity } from "@workspace/presentail-os";

// Mock the OS locations fetcher so fetch-error tests don't make real HTTP calls.
vi.mock("@workspace/presentail-os", async (importOriginal) => {
  const original = await importOriginal<typeof import("@workspace/presentail-os")>();
  return { ...original, fetchOsLocations: vi.fn() };
});
// Import the mocked version so individual tests can configure the resolved value.
import { fetchOsLocations } from "@workspace/presentail-os";

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
  beforeEach(() => {
    resetCacheForTesting();
  });

  it("(b) serves hardcoded cities when OS returns Lebanon with 0 cities on first fetch", () => {
    // No prior cache exists — must fall back to hardcoded data.
    const payload: OSLocationsResponse = { countries: [makeLbCountry([])] };
    storeLocationsFromWebhook(payload);
    const lb = getLocations().find((c) => c.code === "LB");
    expect(lb).toBeTruthy();
    // At least the well-known active cities should be present from hardcoded fallback
    expect(lb!.cities.some((c) => c.id === "lb-beirut")).toBe(true);
  });

  it("(a) preserves prior cached city states when OS returns 0 cities after a good cache", () => {
    // Step 1: load a good OS response where Hasbaya is inactive (absent from OS).
    const goodPayload: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut" }),
          makeCity({ id: 2, slug: "metn", name: "Metn" }),
          // Hasbaya intentionally omitted → isActive:false from supplement logic
        ]),
      ],
    };
    storeLocationsFromWebhook(goodPayload);

    const lbAfterGood = getLocations().find((c) => c.code === "LB");
    const hasbayaAfterGood = lbAfterGood!.cities.find((c) => c.id === "lb-hasbaya");
    expect(hasbayaAfterGood!.isActive).toBe(false); // inactive because OS omitted it

    // Step 2: OS sends a transient 0-city response (e.g. polling gap or cold cache).
    const zeroCityPayload: OSLocationsResponse = { countries: [makeLbCountry([])] };
    storeLocationsFromWebhook(zeroCityPayload);

    const lbAfterZero = getLocations().find((c) => c.code === "LB");
    expect(lbAfterZero).toBeTruthy();

    // Hasbaya must still be inactive — prior cache preserved, not reset to hardcoded all-true.
    const hasbayaAfterZero = lbAfterZero!.cities.find((c) => c.id === "lb-hasbaya");
    expect(hasbayaAfterZero, "lb-hasbaya must still be present").toBeTruthy();
    expect(
      hasbayaAfterZero!.isActive,
      "lb-hasbaya must remain inactive (prior cache state) after 0-city OS response",
    ).toBe(false);

    // Beirut and Metn were active in the prior cache — they must remain active.
    const beirutAfterZero = lbAfterZero!.cities.find((c) => c.id === "lb-beirut");
    expect(beirutAfterZero!.isActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: expressAvailable preservation (Bug 1 — partial webhook, Bug 2 — 0-city)
// ---------------------------------------------------------------------------

describe("osLocationsCache — expressAvailable preservation", () => {
  beforeEach(() => {
    resetCacheForTesting();
  });

  it("preserves expressAvailable=true after a partial webhook that omits express fields", () => {
    // Step 1: seed the cache with Beirut having express delivery enabled.
    const goodPayload: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut", expressAvailable: true }),
        ]),
      ],
    };
    storeLocationsFromWebhook(goodPayload);
    const lbAfterGood = getLocations().find((c) => c.code === "LB");
    const beirutAfterGood = lbAfterGood!.cities.find((c) => c.id === "lb-beirut");
    expect(beirutAfterGood!.expressAvailable).toBe(true);

    // Step 2: OS pushes a partial delivery.config.updated webhook that omits
    // express_available and express_delivery_fee (e.g. a free-delivery-threshold
    // or slot-only update). In the parsed payload expressAvailable is undefined.
    // Bug 1: before the fix, the cache would set expressAvailable=false here.
    const partialPayload: OSLocationsResponse = {
      countries: [
        {
          code: "lb",
          name: "Lebanon",
          flag: "🇱🇧",
          currency: "USD",
          cities: [
            {
              id: 1,
              slug: "beirut",
              name: "Beirut",
              // expressAvailable intentionally omitted — simulates a partial webhook
              expressDeliveryLabel: "",
              sameDayCutoffHour: 22,
              timeSlots: [],
            },
          ],
        },
      ],
    };
    storeLocationsFromWebhook(partialPayload);

    const lbAfterPartial = getLocations().find((c) => c.code === "LB");
    const beirutAfterPartial = lbAfterPartial!.cities.find((c) => c.id === "lb-beirut");
    expect(
      beirutAfterPartial!.expressAvailable,
      "Beirut expressAvailable must remain true after a partial webhook that omits express fields",
    ).toBe(true);
  });

  it("sets expressAvailable=false for a city that had no prior cache (clean cold-start)", () => {
    // No prior cache — a partial webhook with no express fields should default to false.
    const partialPayload: OSLocationsResponse = {
      countries: [
        {
          code: "lb",
          name: "Lebanon",
          flag: "🇱🇧",
          currency: "USD",
          cities: [
            {
              id: 1,
              slug: "beirut",
              name: "Beirut",
              // expressAvailable omitted — no prior cache to fall back to
              expressDeliveryLabel: "",
              sameDayCutoffHour: 22,
              timeSlots: [],
            },
          ],
        },
      ],
    };
    storeLocationsFromWebhook(partialPayload);
    const lbAfterPartial = getLocations().find((c) => c.code === "LB");
    const beirutAfterPartial = lbAfterPartial!.cities.find((c) => c.id === "lb-beirut");
    expect(beirutAfterPartial!.expressAvailable).toBe(false);
  });

  it("preserves expressAvailable=true when OS returns 0 cities after a good cache (Bug 2)", () => {
    // Step 1: seed a good cache where Beirut has express enabled.
    const goodPayload: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut", expressAvailable: true }),
        ]),
      ],
    };
    storeLocationsFromWebhook(goodPayload);
    const lbAfterGood = getLocations().find((c) => c.code === "LB");
    expect(lbAfterGood!.cities.find((c) => c.id === "lb-beirut")!.expressAvailable).toBe(true);

    // Step 2: OS returns 0 cities (transient error or polling gap).
    // Bug 2: before the fix, the hardcoded fallback set expressAvailable=false.
    // After the fix, the prior cache is used and expressAvailable stays true.
    const zeroCityPayload: OSLocationsResponse = { countries: [makeLbCountry([])] };
    storeLocationsFromWebhook(zeroCityPayload);

    const lbAfterZero = getLocations().find((c) => c.code === "LB");
    // When the prior cache has cities, they are returned verbatim (the prior-cache
    // path at lines 264–270 fires before the hardcoded fallback).
    const beirutAfterZero = lbAfterZero!.cities.find((c) => c.id === "lb-beirut");
    expect(
      beirutAfterZero!.expressAvailable,
      "Beirut expressAvailable must remain true after a 0-city OS response when prior cache has express=true",
    ).toBe(true);
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

// ---------------------------------------------------------------------------
// Tests: fetch failure paths (c) and (d)
// ---------------------------------------------------------------------------

describe("osLocationsCache — fetch failure paths", () => {
  beforeEach(() => {
    resetCacheForTesting();
    vi.mocked(fetchOsLocations).mockReset();
  });

  it("(c) serves hardcoded fallback when the very first OS fetch fails", async () => {
    vi.mocked(fetchOsLocations).mockRejectedValueOnce(new Error("network error"));

    await fetchAndStoreForTesting();

    const locations = getLocations();
    expect(locations.length).toBeGreaterThan(0);
    const lb = locations.find((c) => c.code === "LB");
    expect(lb).toBeTruthy();
    expect(lb!.cities.some((c) => c.id === "lb-beirut")).toBe(true);
  });

  it("(d) retains prior cache when a subsequent OS fetch fails", async () => {
    // Step 1: seed a good cache via webhook (no real HTTP call needed).
    const goodPayload: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut" }),
          // Hasbaya absent → isActive:false in cache
        ]),
      ],
    };
    storeLocationsFromWebhook(goodPayload);

    const lbAfterGood = getLocations().find((c) => c.code === "LB");
    const hasbayaAfterGood = lbAfterGood!.cities.find((c) => c.id === "lb-hasbaya");
    expect(hasbayaAfterGood!.isActive).toBe(false);

    // Step 2: next scheduled fetch fails.
    vi.mocked(fetchOsLocations).mockRejectedValueOnce(new Error("timeout"));
    await fetchAndStoreForTesting();

    // Prior cache must be retained — not replaced by hardcoded all-true data.
    const lbAfterFail = getLocations().find((c) => c.code === "LB");
    expect(lbAfterFail).toBeTruthy();
    const hasbayaAfterFail = lbAfterFail!.cities.find((c) => c.id === "lb-hasbaya");
    expect(hasbayaAfterFail, "lb-hasbaya must still be in the retained cache").toBeTruthy();
    expect(
      hasbayaAfterFail!.isActive,
      "lb-hasbaya must remain inactive — prior good cache was retained after fetch failure",
    ).toBe(false);
  });
});
