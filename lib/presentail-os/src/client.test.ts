import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchOsLocations, fetchOsOccasions } from "./client";

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
