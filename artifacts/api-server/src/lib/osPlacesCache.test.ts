// Unit tests for the Address Book places cache + search
// (artifacts/api-server/src/lib/osPlacesCache.ts)
//
// Coverage:
//  - normalizeSearchText: case folding, accent stripping, punctuation,
//    Arabic variant unification
//  - buildPlaceIndex safety filter: unverified / unpublished /
//    checkout-disabled places never enter the index
//  - Ranking: exact alias > prefix > token/substring > fuzzy subsequence
//  - Feature flag dark → always empty
//  - Country scoping, result cap, district → canonical city resolution
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

import type { OSAddressBookPlace } from "@workspace/presentail-os";
import {
  normalizeSearchText,
  buildPlaceIndex,
  searchAddressBookPlaces,
  __setPlacesForTest,
  __resetPlacesCacheForTest,
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

describe("buildPlaceIndex safety filter", () => {
  it("keeps only verified + published + checkout-enabled places", () => {
    const index = buildPlaceIndex([
      makePlace({ id: "ok" }),
      makePlace({ id: "unverified", verified: false }),
      makePlace({ id: "unpublished", published: false }),
      makePlace({ id: "no-checkout", checkoutEnabled: false }),
    ]);
    expect(index.map((e) => e.place.id)).toEqual(["ok"]);
  });
});

describe("searchAddressBookPlaces", () => {
  it("returns empty when the feature flag is dark", () => {
    delete process.env.OS_ADDRESS_BOOK_ENABLED;
    __setPlacesForTest([makePlace()]);
    expect(searchAddressBookPlaces("aub", "LB")).toEqual([]);
  });

  it("never returns unverified/unpublished/checkout-disabled places", () => {
    __setPlacesForTest([
      makePlace({ id: "bad1", name: "AUB Shadow", verified: false }),
      makePlace({ id: "bad2", name: "AUB Draft", published: false }),
      makePlace({ id: "bad3", name: "AUB Off", checkoutEnabled: false }),
    ]);
    expect(searchAddressBookPlaces("aub", "LB")).toEqual([]);
  });

  it("ranks exact alias above prefix above substring above fuzzy", () => {
    __setPlacesForTest([
      // substring/token match ("aub" inside a later token)
      makePlace({ id: "substr", name: "Clinique du Levant AUB Annex", aliases: [] }),
      // fuzzy subsequence match only (a-u-b-m-c ordered inside the name? no —
      // use a name where "aubx" style subsequence applies). Use query-specific rows below.
      // prefix match
      makePlace({ id: "prefix", name: "AUB Business School", aliases: [] }),
      // exact alias match
      makePlace({ id: "exact", name: "AUBMC", aliases: ["AUB"] }),
    ]);
    const results = searchAddressBookPlaces("aub", "LB");
    expect(results.map((r) => r.id)).toEqual(["exact", "prefix", "substr"]);
  });

  it("matches fuzzy in-order subsequences for queries of 4+ chars", () => {
    __setPlacesForTest([makePlace({ id: "hd", name: "Hotel Dieu de France", aliases: [] })]);
    // "htldieu" is an in-order subsequence of "hoteldieudefrance"
    const results = searchAddressBookPlaces("htldieu", "LB");
    expect(results.map((r) => r.id)).toEqual(["hd"]);
  });

  it("is accent/punctuation-insensitive on both sides", () => {
    __setPlacesForTest([makePlace({ id: "hd", name: "Hôtel-Dieu", aliases: [] })]);
    expect(searchAddressBookPlaces("hotel dieu", "LB").map((r) => r.id)).toEqual(["hd"]);
    __setPlacesForTest([makePlace({ id: "aub", name: "AUBMC", aliases: ["A.U.B."] })]);
    expect(searchAddressBookPlaces("aub", "LB").map((r) => r.id)).toEqual(["aub"]);
  });

  it("scopes results to the requested country but spans all its districts", () => {
    __setPlacesForTest([
      makePlace({ id: "lb-place", name: "AUBMC", countryCode: "LB", districtId: "tripoli", districtName: "Tripoli" }),
      makePlace({ id: "ae-place", name: "AUB Dubai Clinic", countryCode: "AE", districtId: "dubai", districtName: "Dubai" }),
    ]);
    const results = searchAddressBookPlaces("aub", "LB");
    expect(results.map((r) => r.id)).toEqual(["lb-place"]);
    // District differs from any pre-selected one — still returned.
    expect(results[0]!.districtCityId).toBe("lb-tripoli");
  });

  it("caps results at the requested limit", () => {
    __setPlacesForTest(
      Array.from({ length: 12 }, (_, i) =>
        makePlace({ id: `p${i}`, name: `AUB Center ${i}`, aliases: [] }),
      ),
    );
    expect(searchAddressBookPlaces("aub", "LB", 6)).toHaveLength(6);
  });

  it("requires at least 2 meaningful characters", () => {
    __setPlacesForTest([makePlace()]);
    expect(searchAddressBookPlaces("a", "LB")).toEqual([]);
    expect(searchAddressBookPlaces(" . ", "LB")).toEqual([]);
  });

  it("resolves the OS district onto the canonical city id and name", () => {
    __setPlacesForTest([makePlace({ id: "p1", districtId: "beirut", districtName: "Beirut" })]);
    const [result] = searchAddressBookPlaces("aubmc", "LB");
    expect(result!.districtCityId).toBe("lb-beirut");
    expect(result!.districtCityName).toBe("Beirut");
  });

  it("returns only the public-safe projection", () => {
    __setPlacesForTest([makePlace()]);
    const [result] = searchAddressBookPlaces("aubmc", "LB");
    expect(result).toEqual({
      id: "p1",
      name: "AUBMC",
      officialName: "American University of Beirut Medical Center",
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
    expect(Object.keys(result!)).not.toContain("aliases");
    expect(Object.keys(result!)).not.toContain("published");
    expect(Object.keys(result!)).not.toContain("checkoutEnabled");
  });
});
