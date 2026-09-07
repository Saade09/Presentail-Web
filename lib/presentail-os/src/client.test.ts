import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchOsCategories,
  fetchOsLocations,
  fetchOsOccasions,
  searchOsAddressBookPlaces,
} from "./client";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const config = { apiKey: "test-key" };

describe("fetchOsLocations — Cyprus/legacy merge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("merges a country present only in the legacy endpoint into the ext response", async () => {
    const extBody = {
      countries: [{ code: "LB", name: "Lebanon", isActive: true, cities: [] }],
    };
    const legacyBody = {
      countries: [
        {
          code: "CY",
          name: "Cyprus",
          isActive: true,
          cities: [
            {
              id: "nicosia",
              slug: "nicosia",
              name: "Nicosia",
              isActive: false,
              is_active: false,
              delivery_fee: 10,
            },
            {
              id: "ammachostos",
              slug: "ammachostos",
              name: "Ammachostos",
              isActive: false,
              is_active: false,
            },
          ],
        },
      ],
    };

    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/delivery-locations-ext")) {
        return Promise.resolve(jsonResponse(extBody));
      }
      if (url.includes("/api/delivery-locations")) {
        return Promise.resolve(jsonResponse(legacyBody));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOsLocations(config);

    const cy = result.countries.find((c) => c.code === "CY");
    expect(cy, "Cyprus should be merged in from the legacy endpoint").toBeTruthy();
    expect(cy!.cities).toHaveLength(2);

    const nicosia = cy!.cities.find((c) => c.slug === "nicosia");
    expect(nicosia?.isActive).toBe(false);

    const ammachostos = cy!.cities.find((c) => c.slug === "ammachostos");
    expect(
      ammachostos,
      "unmapped legacy cities like Ammachostos must still flow through",
    ).toBeTruthy();
    expect(ammachostos?.isActive).toBe(false);

    const lb = result.countries.find((c) => c.code === "LB");
    expect(lb, "the primary ext response must still be used as-is").toBeTruthy();
  });

  it("does not duplicate a country already present in the ext response", async () => {
    const extBody = {
      countries: [
        { code: "CY", name: "Cyprus", isActive: true, cities: [{ id: 1, slug: "nicosia", name: "Nicosia", isActive: true }] },
      ],
    };
    const legacyBody = {
      countries: [
        { code: "CY", name: "Cyprus", isActive: true, cities: [{ id: "nicosia", slug: "nicosia", name: "Nicosia", isActive: false }] },
      ],
    };

    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/delivery-locations-ext")) {
        return Promise.resolve(jsonResponse(extBody));
      }
      return Promise.resolve(jsonResponse(legacyBody));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOsLocations(config);
    const cyCountries = result.countries.filter((c) => c.code === "CY");
    expect(cyCountries).toHaveLength(1);
    // Ext data takes precedence — active, not the legacy inactive value.
    expect(cyCountries[0]!.cities[0]!.isActive).toBe(true);
  });

  it("enriches a matching ext city with minute-accurate per-day slot data", async () => {
    const extBody = {
      countries: [{
        code: "LB",
        name: "Lebanon",
        cities: [{
          id: 1,
          slug: "beirut",
          name: "Beirut",
          expressAvailable: true,
          sameDayCutoffHour: 23,
          timeSlots: [{
            label: "Night",
            slotId: "night",
            startHour: 23,
            endHour: 25,
            cutoffHour: 23,
          }],
        }],
      }],
    };
    const legacyBody = {
      countries: [{
        code: "LB",
        name: "Lebanon",
        cities: [{
          id: "beirut",
          slug: "beirut",
          name: "Beirut",
          express_delivery_enabled: true,
          express_delivery_cutoff_time: "23:30:00",
          delivery_slots: [{
            id: "night",
            day_of_week: 3,
            label: "Night",
            start_time: "23:00:00",
            end_time: "01:00:00",
            cutoff_time: "23:30:00",
            same_day: true,
            next_day: false,
            enabled: true,
          }],
        }],
      }],
    };
    vi.stubGlobal("fetch", vi.fn((url: string) =>
      Promise.resolve(jsonResponse(
        url.includes("-ext") ? extBody : legacyBody,
      )),
    ));

    const result = await fetchOsLocations(config);
    const beirut = result.countries[0]!.cities[0]!;
    expect(beirut.sameDayCutoffMinute).toBe(30);
    expect(beirut.timeSlots?.[0]).toEqual(
      expect.objectContaining({
        cutoffMinute: 30,
        sameDayEnabled: true,
        enabled: true,
      }),
    );
    expect(beirut.slotsByDay?.wednesday?.[0]?.slotId).toBe("night");
    expect(beirut.operationsConfigConsistent).toBe(true);
  });

  it("keeps newly added weekday slots that have not reached the ext feed yet", async () => {
    const extBody = {
      countries: [{
        code: "AE",
        name: "United Arab Emirates",
        cities: [{
          id: 1,
          slug: "dubai",
          name: "Dubai",
          timeSlots: [{
            label: "9:00 AM – 2:00 PM",
            slotId: "day",
            startHour: 9,
            endHour: 14,
            cutoffHour: 9,
          }],
        }],
      }],
    };
    const legacyBody = {
      countries: [{
        code: "AE",
        name: "United Arab Emirates",
        cities: [{
          id: "dubai",
          slug: "dubai",
          name: "Dubai",
          delivery_slots: [
            {
              id: "day",
              day_of_week: 1,
              label: "9:00 AM – 2:00 PM",
              start_time: "09:00:00",
              end_time: "14:00:00",
              cutoff_time: "09:00:00",
              enabled: true,
            },
            {
              id: "midnight",
              day_of_week: 1,
              label: "Midnight",
              start_time: "23:00:00",
              end_time: "01:00:00",
              cutoff_time: "22:00:00",
              extra_fee: 20,
              service_type: "midnight",
              enabled: true,
            },
          ],
        }],
      }],
    };
    vi.stubGlobal("fetch", vi.fn((url: string) =>
      Promise.resolve(jsonResponse(url.includes("-ext") ? extBody : legacyBody)),
    ));

    const result = await fetchOsLocations(config);
    const dubai = result.countries[0]!.cities[0]!;
    expect(dubai.slotsByDay?.monday).toHaveLength(2);
    expect(dubai.slotsByDay?.monday?.[1]).toEqual(
      expect.objectContaining({
        slotId: "midnight",
        startHour: 23,
        endHour: 1,
        serviceType: "midnight",
      }),
    );
    expect(dubai.timeSlots?.some((slot) => slot.slotId === "midnight")).toBe(true);
  });

  it("uses the most complete OS UAE schedule for every weekday", async () => {
    const extBody = {
      countries: [{
        code: "AE",
        name: "United Arab Emirates",
        cities: [{
          id: 1,
          slug: "dubai",
          name: "Dubai",
          timeSlots: [],
        }],
      }],
    };
    const legacyBody = {
      countries: [{
        code: "AE",
        name: "United Arab Emirates",
        cities: [{
          id: "dubai",
          slug: "dubai",
          name: "Dubai",
          delivery_slots: [
            ...["monday"].flatMap(() => [
              { id: "morning", day_of_week: 1, label: "Morning", start_time: "09:00", end_time: "14:00", cutoff_time: "09:00" },
              { id: "afternoon", day_of_week: 1, label: "Afternoon", start_time: "14:00", end_time: "18:00", cutoff_time: "14:00" },
              { id: "evening", day_of_week: 1, label: "Evening", start_time: "18:00", end_time: "22:00", cutoff_time: "18:00" },
              { id: "night", day_of_week: 1, label: "Night", start_time: "21:00", end_time: "23:00", cutoff_time: "21:00", fee_override: 5 },
              { id: "midnight", day_of_week: 1, label: "Midnight", start_time: "23:00", end_time: "01:00", cutoff_time: "23:00", fee_override: 20, service_type: "midnight" },
            ]),
            { id: "old-morning", day_of_week: 2, label: "Morning", start_time: "10:00", end_time: "12:00" },
            { id: "old-afternoon", day_of_week: 2, label: "Afternoon", start_time: "12:00", end_time: "14:00" },
          ],
        }],
      }],
    };
    vi.stubGlobal("fetch", vi.fn((url: string) =>
      Promise.resolve(jsonResponse(url.includes("-ext") ? extBody : legacyBody)),
    ));

    const result = await fetchOsLocations(config);
    const dubai = result.countries[0]!.cities[0]!;
    expect(dubai.slotsByDay?.monday).toHaveLength(5);
    expect(dubai.slotsByDay?.tuesday).toEqual(dubai.slotsByDay?.monday);
    expect(dubai.timeSlots).toEqual(dubai.slotsByDay?.monday);
  });

  it("marks contradictory matching operational feeds as inconsistent", async () => {
    const extBody = {
      countries: [{
        code: "LB",
        name: "Lebanon",
        cities: [{
          id: 1,
          slug: "beirut",
          name: "Beirut",
          expressAvailable: true,
          sameDayCutoffHour: 23,
          timeSlots: [{
            label: "Night",
            slotId: "night",
            cutoffHour: 23,
            enabled: true,
          }],
        }],
      }],
    };
    const legacyBody = {
      countries: [{
        code: "LB",
        name: "Lebanon",
        cities: [{
          id: "beirut",
          slug: "beirut",
          name: "Beirut",
          express_delivery_enabled: false,
          express_delivery_cutoff_time: "22:00:00",
          delivery_slots: [{
            id: "night",
            day_of_week: 3,
            label: "Night",
            cutoff_time: "22:00:00",
            enabled: false,
          }],
        }],
      }],
    };
    vi.stubGlobal("fetch", vi.fn((url: string) =>
      Promise.resolve(jsonResponse(
        url.includes("-ext") ? extBody : legacyBody,
      )),
    ));

    const result = await fetchOsLocations(config);
    expect(
      result.countries[0]!.cities[0]!.operationsConfigConsistent,
    ).toBe(false);
  });

  it("falls back to the legacy endpoint when the ext endpoint fails", async () => {
    const legacyBody = {
      countries: [
        {
          code: "CY",
          name: "Cyprus",
          isActive: true,
          cities: [{ id: "larnaca", slug: "larnaca", name: "Larnaca", isActive: false }],
        },
      ],
    };

    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/delivery-locations-ext")) {
        return Promise.resolve(jsonResponse({}, false, 500));
      }
      if (url.includes("/api/delivery-locations")) {
        return Promise.resolve(jsonResponse(legacyBody));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOsLocations(config);
    const cy = result.countries.find((c) => c.code === "CY");
    expect(cy).toBeTruthy();
    expect(cy!.cities[0]!.isActive).toBe(false);
  });

  it("does not throw when the legacy merge fetch itself fails", async () => {
    const extBody = {
      countries: [{ code: "LB", name: "Lebanon", isActive: true, cities: [] }],
    };
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/delivery-locations-ext")) {
        return Promise.resolve(jsonResponse(extBody));
      }
      return Promise.reject(new Error("network down"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOsLocations(config);
    expect(result.countries).toHaveLength(1);
    expect(result.countries[0]!.code).toBe("LB");
  });
});

describe("fetchOsCategories — feature flag normalisation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [true, true],
    [false, false],
    ["true", true],
    ["TRUE", true],
    ["1", true],
    [1, true],
    ["yes", true],
    ["false", false],
    ["0", false],
    [0, false],
    [null, false],
    [undefined, false],
  ])("normalises is_featured=%s to %s", async (rawFlag, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            categories: [
              {
                id: 42,
                slug: "balloon-arrangements",
                name: "Balloon Arrangements",
                is_featured: rawFlag,
              },
            ],
          }),
        ),
      ),
    );

    const result = await fetchOsCategories(config);

    expect(result.categories[0]?.is_featured).toBe(expected);
  });

  it.each([
    [true, true],
    [false, false],
    ["true", true],
    ["1", true],
    ["inactive", false],
    [null, true],
    [undefined, true],
  ])("normalises is_active=%s to %s", async (rawFlag, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            categories: [
              {
                id: 42,
                slug: "balloon-arrangements",
                name: "Balloon Arrangements",
                is_active: rawFlag,
              },
            ],
          }),
        ),
      ),
    );

    const result = await fetchOsCategories(config);

    expect(result.categories[0]?.is_active).toBe(expected);
  });

  it.each([
    [{ active: true }, true],
    [{ status: "active" }, true],
    [{ active: false }, false],
    [{ status: "inactive" }, false],
    [{ is_active: true, active: false }, false],
  ])("normalises active aliases with explicit inactive states winning: %j", async (flags, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            categories: [
              {
                id: 42,
                slug: "balloon-arrangements",
                name: "Balloon Arrangements",
                ...flags,
              },
            ],
          }),
        ),
      ),
    );

    const result = await fetchOsCategories(config);

    expect(result.categories[0]?.is_active).toBe(expected);
  });

  it("uses the public catalog taxonomy endpoint without leaking the API key into the URL", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({ categories: [] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchOsCategories(config);

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/api/public/catalog/categories");
    expect(requestedUrl.searchParams.get("workspace")).toBe("presentail");
    expect(requestedUrl.searchParams.has("apiKey")).toBe(false);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ "x-api-key": "test-key" }),
      }),
    );
  });

  it.each([
    [{ featured: true }, true],
    [{ isFeatured: "yes" }, true],
    [{ is_featured: false, featured: true }, false],
    [{ is_featured: "off", isFeatured: true }, false],
  ])("normalises visibility aliases with explicit disabled states winning: %j", async (flags, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            categories: [
              {
                id: 92,
                slug: "balloon-arrangements",
                name: "Balloon Arrangements",
                ...flags,
              },
            ],
          }),
        ),
      ),
    );

    const result = await fetchOsCategories(config);

    expect(result.categories[0]?.is_featured).toBe(expected);
  });

  it("preserves category names and ids while normalising feature flags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            categories: [
              {
                id: "cat-1",
                slug: "balloon-arrangements",
                name: "Balloon Arrangements",
                is_featured: "on",
              },
            ],
          }),
        ),
      ),
    );

    const result = await fetchOsCategories(config);

    expect(result.categories[0]).toEqual(
      expect.objectContaining({
        id: "cat-1",
        slug: "balloon-arrangements",
        name: "Balloon Arrangements",
        is_featured: true,
      }),
    );
  });
});

describe("fetchOsOccasions — URL construction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests /api/public/catalog/occasions with sort=best_selling", async () => {
    const occasionsBody = { items: [] };
    let capturedUrl = "";
    const fetchMock = vi.fn((url: string) => {
      capturedUrl = url;
      return Promise.resolve(jsonResponse(occasionsBody));
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchOsOccasions(config);

    const parsed = new URL(capturedUrl);
    expect(parsed.pathname).toBe("/api/public/catalog/occasions");
    expect(parsed.searchParams.get("sort")).toBe("best_selling");
    expect(parsed.searchParams.get("workspace")).toBe("presentail");
  });

  it("does not include apiKey in the query string", async () => {
    const occasionsBody = { items: [] };
    let capturedUrl = "";
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      capturedUrl = url;
      return Promise.resolve(jsonResponse(occasionsBody));
    }));

    await fetchOsOccasions(config);

    const parsed = new URL(capturedUrl);
    expect(parsed.searchParams.has("apiKey")).toBe(false);
  });

  it("appends city_slug when citySlug option is provided", async () => {
    const occasionsBody = { items: [] };
    let capturedUrl = "";
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      capturedUrl = url;
      return Promise.resolve(jsonResponse(occasionsBody));
    }));

    await fetchOsOccasions(config, { citySlug: "beirut" });

    const parsed = new URL(capturedUrl);
    expect(parsed.searchParams.get("city_slug")).toBe("beirut");
  });

  it("normalises the { items } paginated shape into the occasions array", async () => {
    const occasionsBody = {
      items: [
        { id: 5, slug: "birthday", name: "Birthday", is_active: true, is_featured: true },
        { id: 12, slug: "summer", name: "Summer", is_active: true, is_featured: false },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(occasionsBody))));

    const result = await fetchOsOccasions(config);

    expect(result.occasions).toHaveLength(2);
    expect(result.occasions[0]!.slug).toBe("birthday");
    expect(result.occasions[1]!.slug).toBe("summer");
  });

  it("preserves the legacy { occasions } shape unchanged", async () => {
    const occasionsBody = {
      occasions: [
        { id: "birthday", slug: "birthday", name: "Birthday", isActive: true, featured: true },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(occasionsBody))));

    const result = await fetchOsOccasions(config);

    expect(result.occasions).toHaveLength(1);
    expect(result.occasions[0]!.slug).toBe("birthday");
  });
});

describe("searchOsAddressBookPlaces — confirmed OS contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const contractPlace = {
    id: "place-uuid",
    displayName: "ABC Hotel",
    approvedAliases: ["ABC Hotel Beirut"],
    type: "hotel",
    country: "LB",
    deliveryDistrict: "Beirut",
    area: "Hamra",
    city: "Beirut",
    latitude: 33.895,
    longitude: 35.478,
    verificationState: "delivery_verified",
    followUpCopy: "Please add floor, apartment, and delivery instructions.",
  };

  it("calls the confirmed endpoint with only q and the server-side API-key header", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({ places: [contractPlace] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await searchOsAddressBookPlaces(config, { q: "AUB" });

    const calledUrl = new URL(fetchMock.mock.calls[0]![0]);
    expect(calledUrl.pathname).toBe("/api/address-book/places");
    expect(calledUrl.searchParams.get("q")).toBe("AUB");
    expect(calledUrl.searchParams.get("workspace")).toBeNull();
    expect(calledUrl.searchParams.get("country")).toBeNull();
    expect(calledUrl.searchParams.get("city_slug")).toBeNull();
    expect(calledUrl.searchParams.get("apiKey")).toBeNull();
    expect(fetchMock.mock.calls[0]![1]).toEqual({
      headers: {
        Accept: "application/json",
        "User-Agent": "PresentailApp/1.0",
        "x-api-key": "test-key",
        Authorization: "Bearer test-key",
      },
      signal: expect.anything(),
    });
  });

  it("normalises the contract payload into the internal place shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ places: [contractPlace] }))),
    );

    const { places } = await searchOsAddressBookPlaces(config, { q: "abc" });
    expect(places).toHaveLength(1);
    const place = places[0]!;
    expect(place.id).toBe("place-uuid");
    expect(place.name).toBe("ABC Hotel");
    expect(place.aliases).toEqual(["ABC Hotel Beirut"]);
    expect(place.type).toBe("hotel");
    expect(place.countryCode).toBe("LB");
    expect(place.districtName).toBe("Beirut");
    expect(place.area).toBe("Hamra");
    expect(place.lat).toBe(33.895);
    expect(place.lng).toBe(35.478);
    // verificationState "delivery_verified" supplies absent eligibility flags.
    expect(place.verified).toBe(true);
    expect(place.published).toBe(true);
    expect(place.checkoutEnabled).toBe(true);
    expect(place.followUpQuestion).toBe(
      "Please add floor, apartment, and delivery instructions.",
    );
  });

  it("fails closed for any verificationState other than delivery_verified", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            places: [
              { ...contractPlace, verificationState: "pending" },
              { ...contractPlace, id: "p2", verificationState: null },
            ],
          }),
        ),
      ),
    );
    const { places } = await searchOsAddressBookPlaces(config, { q: "abc" });
    expect(
      places.every((p) => !p.verified || !p.published || !p.checkoutEnabled),
    ).toBe(true);
  });

  it("keeps explicit unpublished and checkout-inactive flags ineligible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            places: [
              {
                ...contractPlace,
                published: false,
                checkoutEnabled: false,
              },
            ],
          }),
        ),
      ),
    );

    const { places } = await searchOsAddressBookPlaces(config, { q: "abc" });
    expect(places[0]?.verified).toBe(true);
    expect(places[0]?.published).toBe(false);
    expect(places[0]?.checkoutEnabled).toBe(false);
  });

  it("also accepts snake_case field names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            places: [
              {
                id: "p1",
                display_name: "AUBMC",
                approved_aliases: ["AUB"],
                delivery_district: "Beirut",
                verification_state: "delivery_verified",
                follow_up_copy: "Which building?",
                country: "LB",
                latitude: "33.9",
                longitude: "35.48",
              },
            ],
          }),
        ),
      ),
    );
    const { places } = await searchOsAddressBookPlaces(config, { q: "aub" });
    const place = places[0]!;
    expect(place.name).toBe("AUBMC");
    expect(place.aliases).toEqual(["AUB"]);
    expect(place.districtName).toBe("Beirut");
    expect(place.verified).toBe(true);
    expect(place.followUpQuestion).toBe("Which building?");
    expect(place.lat).toBe(33.9);
  });

  it("throws on a non-OK response (caller handles graceful fallback)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ error: "no_access" }, false, 403))),
    );
    await expect(searchOsAddressBookPlaces(config, { q: "aub" })).rejects.toThrow(
      /403/,
    );
  });
});
