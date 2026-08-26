// Unit tests for the Address Book per-query search proxy
// (artifacts/api-server/src/lib/osPlacesCache.ts)
//
// Coverage:
//  - normalizeSearchText: case folding, accent stripping, punctuation,
//    Arabic variant unification
//  - Feature flag dark → always empty, zero OS calls
//  - Query forwarding: shopper's text goes to OS as `q` with the country
//  - Defensive eligibility filter: unverified / unpublished /
//    checkout-disabled places never leave the server (fail closed)
//  - Per-query caching: repeat queries within the TTL hit the cache
//  - Failure backoff: an OS failure arms a global backoff (no hammering)
//  - Result cap, district → canonical city resolution
//  - Safe projection: only public checkout fields are returned

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// osLocationsCache pulls in db/fx/alert dependencies — mock the only
// function osPlacesCache uses from it.
vi.mock("./osLocationsCache", () => ({
  getLocations: () => [
    {
      code: "LB",
      cities: [
        { id: "lb-beirut", name: "Beirut", isActive: true },
        { id: "lb-tripoli", name: "Tripoli", isActive: true },
        { id: "lb-batroun", name: "Batroun", isActive: false },
      ],
    },
    {
      code: "AE",
      cities: [{ id: "ae-dubai", name: "Dubai", isActive: true }],
    },
  ],
}));

const { searchOsMock } = vi.hoisted(() => ({ searchOsMock: vi.fn() }));
vi.mock("@workspace/presentail-os", () => ({
  searchOsAddressBookPlaces: searchOsMock,
}));

import type { OSAddressBookPlace } from "@workspace/presentail-os";
import {
  normalizeSearchText,
  searchAddressBookPlaces,
  __resetPlacesCacheForTest,
  __isBackoffArmedForTest,
} from "./osPlacesCache";

function makePlace(overrides: Partial<OSAddressBookPlace> = {}): OSAddressBookPlace {
  return {
    id: "p1",
    name: "AUBMC",
    officialName: "American University of Beirut Medical Center",
    aliases: ["AUB", "AUB Medical Center"],
    type: "hospital",
    countryCode: "LB",
    districtId: "beirut",
    districtName: "Beirut",
    area: "Hamra",
    lat: 33.9,
    lng: 35.48,
    verified: true,
    published: true,
    checkoutEnabled: true,
    followUpQuestion: "Where inside AUBMC?",
    followUpPlaceholder: "Building, department, floor, room number or entrance",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.OS_ADDRESS_BOOK_ENABLED = "1";
  __resetPlacesCacheForTest();
  searchOsMock.mockReset();
  searchOsMock.mockResolvedValue({ places: [makePlace()] });
});

afterEach(() => {
  delete process.env.OS_ADDRESS_BOOK_ENABLED;
  __resetPlacesCacheForTest();
});

describe("normalizeSearchText", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeSearchText("Hôtel-Dieu")).toBe("hotel dieu");
    expect(normalizeSearchText("Café de la Paix")).toBe("cafe de la paix");
  });

  it("replaces punctuation with spaces and collapses whitespace", () => {
    expect(normalizeSearchText("A.U.B.")).toBe("a u b");
    expect(normalizeSearchText("  Saint   George's ")).toBe("saint george s");
  });

  it("unifies Arabic letter variants and strips harakat", () => {
    // With harakat + ى vs bare + ي — both spellings normalise identically.
    expect(normalizeSearchText("مُستشفى")).toBe(normalizeSearchText("مستشفي"));
    expect(normalizeSearchText("أوتيل")).toBe("اوتيل");
  });
});

describe("searchAddressBookPlaces", () => {
  it("returns empty and never calls OS when the feature flag is dark", async () => {
    delete process.env.OS_ADDRESS_BOOK_ENABLED;
    expect(await searchAddressBookPlaces("aub", "LB")).toEqual([]);
    expect(searchOsMock).not.toHaveBeenCalled();
  });

  it("forwards only the shopper's text as q; country filtering stays server-side", async () => {
    await searchAddressBookPlaces(" AUB ", "lb");
    expect(searchOsMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: expect.any(String) }),
      { q: "AUB" },
    );
  });

  it("requires at least 2 meaningful characters (no OS call)", async () => {
    expect(await searchAddressBookPlaces("a", "LB")).toEqual([]);
    expect(await searchAddressBookPlaces(" . ", "LB")).toEqual([]);
    expect(searchOsMock).not.toHaveBeenCalled();
  });

  it("never returns unverified/unpublished/checkout-disabled places", async () => {
    searchOsMock.mockResolvedValue({
      places: [
        makePlace({ id: "bad1", name: "AUB Shadow", verified: false }),
        makePlace({ id: "bad2", name: "AUB Draft", published: false }),
        makePlace({ id: "bad3", name: "AUB Off", checkoutEnabled: false }),
        makePlace({ id: "ok" }),
      ],
    });
    const results = await searchAddressBookPlaces("aub", "LB");
    expect(results.map((r) => r.id)).toEqual(["ok"]);
  });

  it("preserves the OS relevance ordering (no local re-ranking)", async () => {
    searchOsMock.mockResolvedValue({
      places: [
        makePlace({ id: "first", name: "Zed Hospital" }),
        makePlace({ id: "second", name: "AUBMC" }),
      ],
    });
    const results = await searchAddressBookPlaces("hospital", "LB");
    expect(results.map((r) => r.id)).toEqual(["first", "second"]);
  });

  it("serves repeat queries from the per-query cache within the TTL", async () => {
    await searchAddressBookPlaces("aub", "LB");
    await searchAddressBookPlaces("aub", "LB");
    // Same normalised query+country → one OS round-trip.
    await searchAddressBookPlaces("A.U.B.", "LB");
    expect(searchOsMock).toHaveBeenCalledTimes(1);
  });

  it("treats different countries as different cache entries", async () => {
    await searchAddressBookPlaces("aub", "LB");
    await searchAddressBookPlaces("aub", "AE");
    expect(searchOsMock).toHaveBeenCalledTimes(2);
  });

  it("arms the failure backoff on OS errors and stops calling OS", async () => {
    searchOsMock.mockRejectedValue(new Error("HTTP 403"));
    expect(await searchAddressBookPlaces("aub", "LB")).toEqual([]);
    expect(__isBackoffArmedForTest()).toBe(true);
    // Next keystroke during the backoff window → no second OS call.
    expect(await searchAddressBookPlaces("aubm", "LB")).toEqual([]);
    expect(searchOsMock).toHaveBeenCalledTimes(1);
  });

  it("filters out places from other countries defensively", async () => {
    searchOsMock.mockResolvedValue({
      places: [
        makePlace({ id: "lb-place", countryCode: "LB" }),
        makePlace({ id: "ae-place", name: "AUB Dubai Clinic", countryCode: "AE" }),
      ],
    });
    const results = await searchAddressBookPlaces("aub", "LB");
    expect(results.map((r) => r.id)).toEqual(["lb-place"]);
  });

  it("caps results at the requested limit", async () => {
    searchOsMock.mockResolvedValue({
      places: Array.from({ length: 12 }, (_, i) =>
        makePlace({ id: `p${i}`, name: `AUB Center ${i}` }),
      ),
    });
    expect(await searchAddressBookPlaces("aub", "LB", 6)).toHaveLength(6);
  });

  it("resolves the OS district onto the canonical city id and name", async () => {
    searchOsMock.mockResolvedValue({
      places: [makePlace({ districtId: "tripoli", districtName: "Tripoli" })],
    });
    const [result] = await searchAddressBookPlaces("aubmc", "LB");
    expect(result!.districtCityId).toBe("lb-tripoli");
    expect(result!.districtCityName).toBe("Tripoli");
  });

  it("returns only the public-safe projection (with approved aliases)", async () => {
    const [result] = await searchAddressBookPlaces("aubmc", "LB");
    expect(result).toEqual({
      id: "p1",
      name: "AUBMC",
      officialName: "American University of Beirut Medical Center",
      aliases: ["AUB", "AUB Medical Center"],
      area: "Hamra",
      districtName: "Beirut",
      districtCityId: "lb-beirut",
      districtCityName: "Beirut",
      countryCode: "LB",
      lat: 33.9,
      lng: 35.48,
      verified: true,
      followUpQuestion: "Where inside AUBMC?",
      followUpPlaceholder: "Building, department, floor, room number or entrance",
    });
    // No internal fields ever leak.
    expect(Object.keys(result!)).not.toContain("published");
    expect(Object.keys(result!)).not.toContain("checkoutEnabled");
  });

  it("drops an alias identical to the display name", async () => {
    searchOsMock.mockResolvedValue({
      places: [makePlace({ aliases: ["AUBMC", "AUB"] })],
    });
    const [result] = await searchAddressBookPlaces("aubmc", "LB");
    expect(result!.aliases).toEqual(["AUB"]);
  });
});
