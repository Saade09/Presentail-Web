import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchOsLocations } from "./client";

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
