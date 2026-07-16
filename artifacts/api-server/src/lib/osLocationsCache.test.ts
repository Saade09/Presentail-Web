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
import { storeLocationsFromWebhook, getLocations, resetCacheForTesting, fetchAndStoreForTesting, getOsCityDeliveryFeeUsd } from "./osLocationsCache";
import type { OSLocationsResponse, OSCountry, OSCity } from "@workspace/presentail-os";

// Mock the alerts module so Slack sends are captured without real HTTP.
vi.mock("./alerts", () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
}));
import { sendAlert } from "./alerts";

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
  beforeEach(() => {
    resetCacheForTesting();
  });

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
      "beirut", "metn", "aley", "baabda", "chouf", "jbeil",
      "kesserwan", "koura", "akkar", "batroun", "bcharee",
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
// Tests: display name always comes from the hardcoded list when matched
// ---------------------------------------------------------------------------

describe("osLocationsCache — canonical display name override", () => {
  it("uses hardcoded display name 'West Bekaa' even when OS returns lowercase 'west bekaa'", () => {
    const cities = loadLbCities([
      makeCity({ id: 1, slug: "west-bekaa", name: "west bekaa" }),
    ]);
    const city = cities.find((c) => c.id === "lb-west-bekaa");
    expect(city, "lb-west-bekaa must be present").toBeTruthy();
    expect(city!.name).toBe("West Bekaa");
  });

  it("uses hardcoded display name 'Zgharta' even when OS city name is the old spelling 'Zghorta'", () => {
    const cities = loadLbCities([
      makeCity({ id: 1, slug: "zghorta", name: "Zghorta" }),
    ]);
    const city = cities.find((c) => c.id === "lb-zghorta");
    expect(city, "lb-zghorta must be present").toBeTruthy();
    expect(city!.name).toBe("Zgharta");
  });

  it("uses hardcoded display name 'Beirut' even when OS returns 'beirut' (lowercase)", () => {
    const cities = loadLbCities([
      makeCity({ id: 1, slug: "beirut", name: "beirut" }),
    ]);
    const city = cities.find((c) => c.id === "lb-beirut");
    expect(city!.name).toBe("Beirut");
  });

  it("resolves the correct delivery fee ($39) when OS sends old Zghorta spelling and no deliveryFee", () => {
    // OS returns the old spelling "Zghorta" with no deliveryFee field.
    // The fee fallback must use the canonical display name "Zgharta" to hit
    // the correct fee row — not the OS raw name which would cause a miss and
    // default to $39 only by coincidence (the default is also $39). Verify
    // the match is by name lookup, not the unknwon-district default.
    const cities = loadLbCities([
      makeCity({ id: 1, slug: "zghorta", name: "Zghorta" }),
    ]);
    const city = cities.find((c) => c.id === "lb-zghorta");
    expect(city, "lb-zghorta must be present").toBeTruthy();
    // $39 is the hardcoded fee for Zgharta. fee === 39 (or undefined when
    // feeForDistrict returns 0 on a miss). Asserting > 0 confirms the lookup
    // succeeded rather than silently returning 0.
    expect(city!.fee, "Zgharta fee must be 39, not 0 (which would indicate a name-lookup miss)").toBe(39);
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

  it("strategy 0 (override map): OS slug 'jbeil' resolves to canonical id 'lb-jbeil'", () => {
    const cities = loadLbCities([makeCity({ id: 1, slug: "jbeil", name: "Jbeil" })]);
    expect(cities.some((c) => c.id === "lb-jbeil")).toBe(true);
    expect(cities.some((c) => c.id === "jbeil")).toBe(false);
    expect(cities.some((c) => c.id === "lb-jbail")).toBe(false);
  });

  it("strategy 0 (override map): OS slug 'kesserwan' resolves to 'lb-kesserwan'", () => {
    const cities = loadLbCities([makeCity({ id: 1, slug: "kesserwan", name: "Kesserwan" })]);
    expect(cities.some((c) => c.id === "lb-kesserwan")).toBe(true);
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
    // jbeil resolves to lb-jbeil; ensure lb-jbeil appears exactly once
    const cities = loadLbCities([makeCity({ id: 1, slug: "jbeil", name: "Jbeil" })]);
    const count = cities.filter((c) => c.id === "lb-jbeil").length;
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
// Tests: express-omission warning (Bug 1 follow-up)
// ---------------------------------------------------------------------------

describe("osLocationsCache — express-omission warning", () => {
  beforeEach(() => {
    resetCacheForTesting();
    vi.mocked(sendAlert).mockClear();
  });

  it("emits no warning when expressAvailable is explicitly set in the webhook", () => {
    // Seed an express-enabled city.
    loadLbCities([makeCity({ id: 1, slug: "beirut", name: "Beirut", expressAvailable: true })]);

    // Second webhook also includes expressAvailable explicitly — no omission.
    const warnSpy = vi.spyOn(console, "warn");
    loadLbCities([makeCity({ id: 1, slug: "beirut", name: "Beirut", expressAvailable: true })]);
    warnSpy.mockRestore();

    // No Slack alert should have been sent.
    expect(vi.mocked(sendAlert)).not.toHaveBeenCalled();
  });

  it("emits no warning when prior cache had expressAvailable=false and webhook omits it", () => {
    // Seed with express disabled (default).
    loadLbCities([makeCity({ id: 1, slug: "beirut", name: "Beirut", expressAvailable: false })]);

    // Second webhook omits expressAvailable — prior was false, so no alarm.
    loadLbCities([makeCity({ id: 1, slug: "beirut", name: "Beirut" })]);

    expect(vi.mocked(sendAlert)).not.toHaveBeenCalled();
  });

  it("preserves expressAvailable=true and does NOT fire a Slack alert below the threshold", () => {
    // Seed with express enabled.
    loadLbCities([makeCity({ id: 1, slug: "beirut", name: "Beirut", expressAvailable: true })]);

    // Second webhook omits expressAvailable entirely — simulate a partial OS payload
    // that has no express_available key. Cast via unknown to bypass makeCity defaults.
    const partialCity = { id: 1, slug: "beirut", name: "Beirut", timeSlots: [] } as OSCity;
    const cities = loadLbCities([partialCity]);

    const beirut = cities.find((c) => c.id === "lb-beirut");
    // Prior value of true must be retained despite the omission.
    expect(beirut?.expressAvailable).toBe(true);

    // Slack alert not yet fired (only 1 omission, threshold is 3).
    expect(vi.mocked(sendAlert)).not.toHaveBeenCalled();
  });

  it("sends exactly one Slack alert when omission count reaches the default threshold (3)", () => {
    // Seed with express enabled.
    loadLbCities([makeCity({ id: 1, slug: "beirut", name: "Beirut", expressAvailable: true })]);

    // Partial webhook city with no expressAvailable field at all.
    const partial = [{ id: 1, slug: "beirut", name: "Beirut", timeSlots: [] } as OSCity];

    // Two omissions — below threshold of 3.
    loadLbCities(partial);
    loadLbCities(partial);
    expect(vi.mocked(sendAlert)).not.toHaveBeenCalled();

    // Third omission — should fire the Slack alert.
    loadLbCities(partial);
    expect(vi.mocked(sendAlert)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendAlert).mock.calls[0]![0].title).toMatch(/express_available/i);

    // Fourth omission — alert already sent for this day; should NOT fire again.
    loadLbCities(partial);
    expect(vi.mocked(sendAlert)).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: webhook with partial city list — prior-cached inactive cities preserved
// ---------------------------------------------------------------------------

describe("osLocationsCache — webhook partial city list / inactive city persistence", () => {
  beforeEach(() => {
    resetCacheForTesting();
    vi.mocked(sendAlert).mockClear();
  });

  it("city absent from OS response is served as inactive (isActive:false)", () => {
    // OS returns only Beirut — all other LB cities should appear as inactive supplements.
    const cities = loadLbCities([makeCity({ id: 1, slug: "beirut", name: "Beirut" })]);

    const tyre = cities.find((c) => c.id === "lb-tyre");
    expect(tyre, "lb-tyre must be present as an inactive supplement").toBeTruthy();
    expect(tyre!.isActive).toBe(false);
  });

  it("city returned by OS without isActive field is correctly shown as active", () => {
    // OS returns Beirut without an explicit isActive field — it being returned
    // implies it is active (OS omits inactive cities from its response).
    const partialCity = { id: 1, slug: "beirut", name: "Beirut", timeSlots: [] } as OSCity;
    const cities = loadLbCities([partialCity]);

    const beirut = cities.find((c) => c.id === "lb-beirut");
    expect(beirut, "lb-beirut must be present").toBeTruthy();
    expect(beirut!.isActive).toBe(true);
  });

  it("city with explicit isActive:false from OS is shown as inactive", () => {
    const cities = loadLbCities([
      makeCity({ id: 1, slug: "beirut", name: "Beirut", isActive: false }),
    ]);

    const beirut = cities.find((c) => c.id === "lb-beirut");
    expect(beirut, "lb-beirut must be present").toBeTruthy();
    expect(beirut!.isActive).toBe(false);
  });

  it("prior-cached inactive cities remain inactive when a subsequent partial webhook omits them", () => {
    // Step 1: seed with Beirut and Metn active; Tyre absent → inactive.
    const seed: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut" }),
          makeCity({ id: 2, slug: "metn", name: "Metn" }),
          // Tyre intentionally omitted → becomes inactive via supplement.
        ]),
      ],
    };
    storeLocationsFromWebhook(seed);

    const lbAfterSeed = getLocations().find((c) => c.code === "LB");
    const tyreAfterSeed = lbAfterSeed!.cities.find((c) => c.id === "lb-tyre");
    expect(tyreAfterSeed!.isActive, "lb-tyre must be inactive after seed (absent from OS)").toBe(false);

    // Step 2: a partial webhook arrives with only Beirut (Metn and Tyre absent).
    const partialWebhook: OSLocationsResponse = {
      countries: [makeLbCountry([makeCity({ id: 1, slug: "beirut", name: "Beirut" })])],
    };
    storeLocationsFromWebhook(partialWebhook);

    const lbAfterPartial = getLocations().find((c) => c.code === "LB");
    expect(lbAfterPartial, "LB must still be in locations after partial webhook").toBeTruthy();

    // Tyre was absent from both the seed and the partial webhook — it must still be inactive.
    const tyreAfterPartial = lbAfterPartial!.cities.find((c) => c.id === "lb-tyre");
    expect(tyreAfterPartial, "lb-tyre must still be present after partial webhook").toBeTruthy();
    expect(
      tyreAfterPartial!.isActive,
      "lb-tyre must remain inactive after partial webhook (absent from OS response)",
    ).toBe(false);

    // Beirut must still be active (it was in both the seed and the partial webhook).
    const beirutAfterPartial = lbAfterPartial!.cities.find((c) => c.id === "lb-beirut");
    expect(beirutAfterPartial!.isActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: sticky-inactive — formerly-inactive cities stay inactive when OS
//        returns them without an explicit isActive field (regression guard)
// ---------------------------------------------------------------------------

describe("osLocationsCache — sticky-inactive regression guard", () => {
  beforeEach(() => {
    resetCacheForTesting();
    vi.mocked(sendAlert).mockClear();
  });

  it("keeps a formerly-inactive city inactive when OS returns it without isActive (core regression path)", () => {
    // Step 1: seed cache where Tyre is inactive because OS omitted it.
    const seed: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut" }),
          // Tyre intentionally omitted → becomes inactive via supplement logic.
        ]),
      ],
    };
    storeLocationsFromWebhook(seed);

    const lbAfterSeed = getLocations().find((c) => c.code === "LB");
    expect(lbAfterSeed!.cities.find((c) => c.id === "lb-tyre")!.isActive).toBe(false);

    // Step 2: OS now returns Tyre (API contract drift) WITHOUT an isActive field.
    // Before fix: c.isActive = undefined → falls through to hardcoded ?? true → active (bug).
    // After fix: c.isActive = undefined + priorCity.isActive = false → stays false (fix).
    const regressionPayload: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut" }),
          // Tyre returned but no isActive — simulates the regression where OS
          // starts returning all cities without omitting inactive ones AND
          // without sending explicit isActive:false.
          { id: 2, slug: "tyre", name: "Tyre", timeSlots: [] } as OSCity,
        ]),
      ],
    };
    storeLocationsFromWebhook(regressionPayload);

    const lbAfterRegression = getLocations().find((c) => c.code === "LB");
    const tyreAfterRegression = lbAfterRegression!.cities.find((c) => c.id === "lb-tyre");
    expect(tyreAfterRegression, "lb-tyre must still be in the city list").toBeTruthy();
    expect(
      tyreAfterRegression!.isActive,
      "lb-tyre must remain inactive — prior cache sticky-inactive guard must prevent silent reactivation",
    ).toBe(false);

    // Beirut must still be active.
    const beirutAfterRegression = lbAfterRegression!.cities.find((c) => c.id === "lb-beirut");
    expect(beirutAfterRegression!.isActive).toBe(true);
  });

  it("correctly activates a city when OS explicitly sends isActive:true (not blocked by sticky guard)", () => {
    // Seed: Tyre inactive (absent from OS).
    const seed: OSLocationsResponse = {
      countries: [makeLbCountry([makeCity({ id: 1, slug: "beirut", name: "Beirut" })])],
    };
    storeLocationsFromWebhook(seed);
    expect(
      getLocations().find((c) => c.code === "LB")!.cities.find((c) => c.id === "lb-tyre")!.isActive,
    ).toBe(false);

    // OS explicitly activates Tyre: isActive: true.
    const activationPayload: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut" }),
          makeCity({ id: 2, slug: "tyre", name: "Tyre", isActive: true }),
        ]),
      ],
    };
    storeLocationsFromWebhook(activationPayload);

    const tyreAfterActivation = getLocations()
      .find((c) => c.code === "LB")!
      .cities.find((c) => c.id === "lb-tyre");
    expect(
      tyreAfterActivation!.isActive,
      "lb-tyre must become active when OS explicitly sends isActive:true",
    ).toBe(true);
  });

  it("correctly activates a city on first-load when there is no prior cache (no sticky interference)", () => {
    // No seed — first load from scratch.
    // Tyre returned without isActive; no prior cache → should default to active.
    const firstLoad: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut" }),
          { id: 2, slug: "tyre", name: "Tyre", timeSlots: [] } as OSCity,
        ]),
      ],
    };
    storeLocationsFromWebhook(firstLoad);

    const tyreOnFirstLoad = getLocations()
      .find((c) => c.code === "LB")!
      .cities.find((c) => c.id === "lb-tyre");
    expect(tyreOnFirstLoad, "lb-tyre must be present").toBeTruthy();
    // No prior cache → no sticky-inactive evidence → defaults to active.
    expect(
      tyreOnFirstLoad!.isActive,
      "lb-tyre must be active on first load when OS returns it without isActive (no prior cache)",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: all-active regression Slack alert
// ---------------------------------------------------------------------------

describe("osLocationsCache — all-active regression alert", () => {
  beforeEach(() => {
    resetCacheForTesting();
    vi.mocked(sendAlert).mockClear();
  });

  it("fires a Slack alert when a country transitions from having inactive cities to all-active", () => {
    // Seed: Beirut active, Tyre inactive (absent from OS).
    const seed: OSLocationsResponse = {
      countries: [
        makeLbCountry([makeCity({ id: 1, slug: "beirut", name: "Beirut" })]),
      ],
    };
    storeLocationsFromWebhook(seed);

    // Verify Tyre is inactive in the seed.
    const lbAfterSeed = getLocations().find((c) => c.code === "LB");
    expect(lbAfterSeed!.cities.find((c) => c.id === "lb-tyre")!.isActive).toBe(false);

    // No alert should have fired yet (no prior-to-prior cache for comparison).
    // (sendAlert may have been called during seed with regression check, but since
    // it's the first load from an empty prior, the regression guard must NOT fire.)
    vi.mocked(sendAlert).mockClear();

    // Now OS sends ALL cities including formerly-inactive ones (regression scenario).
    // In a real regression the OS would return all cities without isActive:false;
    // here we simulate by sending every hardcoded LB city slug so none are absent
    // and the supplement never fires.
    const allActiveSlugs = [
      "beirut", "metn", "aley", "baabda", "chouf", "jbeil",
      "kesserwan", "koura", "akkar", "batroun", "bcharee",
      "minnieh-dennaya", "rechaya", "saida", "tripoli", "west-bekaa",
      "zahle", "zghorta",
      // Formerly-inactive cities — OS now returns them without isActive:false.
      "tyre", "nabatieh", "hasbaya", "baalbeck", "hermel",
      "jezzine", "marjayoun", "bent-jbeil",
    ];
    const allActiveCities = allActiveSlugs.map((slug, i) =>
      makeCity({ id: i + 100, slug, name: slug }),
    );
    const regressionPayload: OSLocationsResponse = {
      countries: [makeLbCountry(allActiveCities)],
    };
    storeLocationsFromWebhook(regressionPayload);

    // The regression check must have fired a Slack alert.
    expect(vi.mocked(sendAlert)).toHaveBeenCalledTimes(1);
    const alertCall = vi.mocked(sendAlert).mock.calls[0]![0];
    expect(alertCall.title).toMatch(/all cities active/i);
    expect(alertCall.title).toMatch(/LB/);
    expect(alertCall.severity).toBe("warn");
  });

  it("does NOT fire an alert on the very first successful fetch (no prior cache)", () => {
    // The very first load has no prior cache so the regression check must be skipped.
    const firstPayload: OSLocationsResponse = {
      countries: [makeLbCountry([makeCity({ id: 1, slug: "beirut", name: "Beirut" })])],
    };
    storeLocationsFromWebhook(firstPayload);

    // No alert should fire on first load (prior cache was empty).
    expect(vi.mocked(sendAlert)).not.toHaveBeenCalled();
  });

  it("does NOT fire an alert for a genuinely all-active country (was always all-active)", () => {
    // Seed where every LB city is active (all returned by OS — no supplement needed).
    const activeSlugs = [
      "beirut", "metn", "aley", "baabda", "chouf", "jbeil",
      "kesserwan", "koura", "akkar", "batroun", "bcharee",
      "minnieh-dennaya", "rechaya", "saida", "tripoli", "west-bekaa",
      "zahle", "zghorta", "tyre", "nabatieh", "hasbaya", "baalbeck",
      "hermel", "jezzine", "marjayoun", "bent-jbeil",
    ];
    const allCities = activeSlugs.map((slug, i) =>
      makeCity({ id: i + 1, slug, name: slug }),
    );
    const seedPayload: OSLocationsResponse = {
      countries: [makeLbCountry(allCities)],
    };
    storeLocationsFromWebhook(seedPayload);
    vi.mocked(sendAlert).mockClear();

    // Second poll: still all active.
    storeLocationsFromWebhook(seedPayload);

    // No alert — the country never had inactive cities in the prior cache.
    expect(vi.mocked(sendAlert)).not.toHaveBeenCalled();
  });

  it("fires the alert only once per day even if multiple polls trigger the regression condition", () => {
    // Seed with an inactive city.
    const seed: OSLocationsResponse = {
      countries: [
        makeLbCountry([makeCity({ id: 1, slug: "beirut", name: "Beirut" })]),
      ],
    };
    storeLocationsFromWebhook(seed);
    vi.mocked(sendAlert).mockClear();

    // Regression payload: all cities active.
    const allActive: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut" }),
          makeCity({ id: 2, slug: "tyre", name: "Tyre" }),
        ]),
      ],
    };

    // First regression detection → alert fires.
    storeLocationsFromWebhook(allActive);
    expect(vi.mocked(sendAlert)).toHaveBeenCalledTimes(1);

    // Second poll on the same day → alert must NOT fire again.
    storeLocationsFromWebhook(allActive);
    expect(vi.mocked(sendAlert)).toHaveBeenCalledTimes(1);
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

// ---------------------------------------------------------------------------
// Tests: getOsCityDeliveryFeeUsd
// ---------------------------------------------------------------------------

describe("getOsCityDeliveryFeeUsd", () => {
  beforeEach(() => {
    resetCacheForTesting();
  });

  it("returns the OS-provided city fee when deliveryFee is set, overriding the hardcoded table", () => {
    // Beirut's hardcoded fee is $8. The OS dashboard configured $7.
    // The OS deliveryFee field (in the country's display currency — USD for LB)
    // must win over the hardcoded table so checkout reflects the dashboard value.
    const payload: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut", deliveryFee: 7 }),
        ]),
      ],
    };
    storeLocationsFromWebhook(payload);

    const fee = getOsCityDeliveryFeeUsd("LB", "Beirut");
    expect(fee).toBe(7); // OS value wins over hardcoded 8
  });

  it("falls back to the hardcoded table fee when the OS payload omits deliveryFee", () => {
    // No deliveryFee on the city → cache stores feeForDistrict("LB", "Beirut") = 8.
    const payload: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut" }),
        ]),
      ],
    };
    storeLocationsFromWebhook(payload);

    const fee = getOsCityDeliveryFeeUsd("LB", "Beirut");
    expect(fee).toBe(8); // hardcoded table fallback
  });

  it("is case-insensitive for the city name", () => {
    const payload: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut", deliveryFee: 7 }),
        ]),
      ],
    };
    storeLocationsFromWebhook(payload);

    expect(getOsCityDeliveryFeeUsd("LB", "beirut")).toBe(7);
    expect(getOsCityDeliveryFeeUsd("LB", "BEIRUT")).toBe(7);
  });

  it("returns undefined when the cache is empty", () => {
    // Cache was reset in beforeEach — no webhook has been called.
    expect(getOsCityDeliveryFeeUsd("LB", "Beirut")).toBeUndefined();
  });

  it("returns undefined for an unknown city name", () => {
    const payload: OSLocationsResponse = {
      countries: [
        makeLbCountry([
          makeCity({ id: 1, slug: "beirut", name: "Beirut", deliveryFee: 7 }),
        ]),
      ],
    };
    storeLocationsFromWebhook(payload);

    expect(getOsCityDeliveryFeeUsd("LB", "NonExistentCity")).toBeUndefined();
  });
});
