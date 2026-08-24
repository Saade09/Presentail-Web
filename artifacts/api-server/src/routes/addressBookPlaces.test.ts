// Route-level tests for GET /address-book/places/search
// (artifacts/api-server/src/routes/addressBookPlaces.ts)
//
// Verifies the "never break checkout" contract:
//  - Valid query → 200 with the cache's results (capped at 6).
//  - Too-short / missing / invalid query → 200 with an empty list (never 4xx).
//  - Invalid country format → 200 empty.
//  - Cache layer throwing → 200 empty.
//  - Rate-limited requests → 200 empty via the limiter's custom handler.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));

vi.mock("../lib/osPlacesCache", () => ({
  searchAddressBookPlaces: searchMock,
}));

// Pass-through rate limiter by default; the rate-limit test asserts the
// handler shape separately.
const { rateLimitFactory } = vi.hoisted(() => ({
  rateLimitFactory: vi.fn(
    (_opts: unknown) =>
      (_req: unknown, _res: unknown, next: () => void) =>
        next(),
  ),
}));
vi.mock("express-rate-limit", () => ({ rateLimit: rateLimitFactory }));

import addressBookPlacesRouter from "./addressBookPlaces";

function makeApp() {
  const app = express();
  app.use(addressBookPlacesRouter);
  return app;
}

const SAMPLE_PLACE = {
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
  followUpPlaceholder: "Building, department, floor",
};

beforeEach(() => {
  searchMock.mockReset();
  searchMock.mockReturnValue([SAMPLE_PLACE]);
});

describe("GET /address-book/places/search", () => {
  it("returns places for a valid query, scoped to the country, capped at 6", async () => {
    const res = await request(makeApp()).get(
      "/address-book/places/search?q=AUB&country=LB",
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, places: [SAMPLE_PLACE] });
    expect(searchMock).toHaveBeenCalledWith("AUB", "LB", 6);
  });

  it("works without a country param", async () => {
    const res = await request(makeApp()).get("/address-book/places/search?q=AUB");
    expect(res.status).toBe(200);
    expect(searchMock).toHaveBeenCalledWith("AUB", undefined, 6);
  });

  it("returns 200 empty for a too-short query (never an error)", async () => {
    const res = await request(makeApp()).get("/address-book/places/search?q=a");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, places: [] });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("returns 200 empty for a missing query", async () => {
    const res = await request(makeApp()).get("/address-book/places/search");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, places: [] });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("returns 200 empty for a malformed country", async () => {
    const res = await request(makeApp()).get(
      "/address-book/places/search?q=AUB&country=LBX",
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, places: [] });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("returns 200 empty when the cache layer throws", async () => {
    searchMock.mockImplementation(() => {
      throw new Error("boom");
    });
    const res = await request(makeApp()).get("/address-book/places/search?q=AUB");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, places: [] });
  });

  it("configures the rate limiter to respond 200 with an empty list", () => {
    const opts = rateLimitFactory.mock.calls[0]?.[0] as
      | { handler?: (req: unknown, res: unknown) => void }
      | undefined;
    expect(opts?.handler).toBeTypeOf("function");
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    opts!.handler!({}, { status });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ ok: true, places: [] });
  });
});
