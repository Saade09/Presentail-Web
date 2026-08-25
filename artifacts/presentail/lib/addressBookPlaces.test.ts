import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stripe", () => ({ API_BASE: "https://api.example.test" }));

import {
  flattenPlaceAddress,
  placeSecondaryLine,
  searchCheckoutPlaces,
  type CheckoutPlace,
} from "@/lib/addressBookPlaces";

const aubmc: CheckoutPlace = {
  id: "aubmc",
  name: "AUBMC",
  officialName: "American University of Beirut Medical Center",
  aliases: ["AUB Hospital"],
  area: "Hamra",
  districtName: "Beirut",
  districtCityId: "beirut",
  districtCityName: "Beirut",
  countryCode: "LB",
  lat: 33.9005,
  lng: 35.4827,
  verified: true,
  followUpQuestion: "Where inside AUBMC?",
  followUpPlaceholder: "Building or department",
};

describe("Address Book checkout places", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("searches with a trimmed query and normalized country", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, places: [aubmc] }), { status: 200 }),
    );

    await expect(searchCheckoutPlaces("  AUB  ", "lb")).resolves.toEqual([aubmc]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/address-book/places/search?q=AUB&country=LB",
    );
  });

  it("fails open to free-text entry when the landmark API is unavailable", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("Unavailable", { status: 503 }));
    await expect(searchCheckoutPlaces("AUB", "LB")).resolves.toEqual([]);
  });

  it("creates a readable legacy delivery address without repeating a matching district", () => {
    expect(flattenPlaceAddress(aubmc, "Cardiology, floor 2")).toBe(
      "AUBMC (American University of Beirut Medical Center) — Cardiology, floor 2 — Hamra, Beirut",
    );
    expect(placeSecondaryLine(aubmc)).toBe("American University of Beirut Medical Center");
  });

  it("uses aliases as the secondary line when no official name is available", () => {
    expect(placeSecondaryLine({ ...aubmc, officialName: null })).toBe("AUB Hospital");
  });
});