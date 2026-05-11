import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetGeoCurrencyCacheForTests,
  lookupCountryFromIp,
  pickClientIp,
  resolveGeoCurrency,
  resolveGeoCurrencyByCoords,
} from "../src/lib/geoCurrency";

// ─── pickClientIp ────────────────────────────────────────────────────────────

describe("pickClientIp", () => {
  it("falls back to req.ip when the header is missing", () => {
    expect(pickClientIp(undefined, "203.0.113.5")).toBe("203.0.113.5");
  });

  it("falls back to req.ip when the only entry is private", () => {
    expect(pickClientIp("10.0.0.1", "203.0.113.5")).toBe("203.0.113.5");
  });

  it("falls back to req.ip when every entry is private (CGNAT + RFC1918)", () => {
    expect(pickClientIp("10.0.0.1, 192.168.1.1, 100.64.0.5", "203.0.113.5")).toBe(
      "203.0.113.5",
    );
  });

  it("returns the leftmost public IP after one or more private hops", () => {
    expect(pickClientIp("203.0.113.7, 10.0.0.1, 100.64.0.5", "1.1.1.1")).toBe(
      "203.0.113.7",
    );
    expect(pickClientIp("100.64.0.5, 10.0.0.1, 203.0.113.7", "1.1.1.1")).toBe(
      "203.0.113.7",
    );
  });

  it("strips the IPv6-mapped IPv4 prefix on the chosen entry", () => {
    expect(pickClientIp("::ffff:203.0.113.9, 10.0.0.1", "1.1.1.1")).toBe(
      "203.0.113.9",
    );
  });

  it("treats IPv6-mapped private IPv4 addresses as private", () => {
    expect(pickClientIp("::ffff:10.0.0.1, ::ffff:203.0.113.9", "1.1.1.1")).toBe(
      "203.0.113.9",
    );
  });

  it("accepts a string[] header (Node sometimes provides an array)", () => {
    expect(pickClientIp(["10.0.0.1", "203.0.113.7"], "1.1.1.1")).toBe(
      "203.0.113.7",
    );
  });
});

// ─── lookupCountryFromIp ─────────────────────────────────────────────────────

type FetchResponder = (url: string) => Promise<Response> | Response;

function mockFetch(responder: FetchResponder) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      return responder(url);
    });
}

describe("lookupCountryFromIp", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("returns ipapi.co's country on a normal 2-letter response", async () => {
    fetchSpy = mockFetch((url) => {
      expect(url).toContain("ipapi.co");
      return new Response("AE\n", { status: 200 });
    });
    const out = await lookupCountryFromIp("203.0.113.5");
    expect(out).toEqual({ country: "AE", provider: "ipapi.co", reason: "ok" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to ipwho.is when ipapi.co returns a JSON rate-limit body", async () => {
    fetchSpy = mockFetch((url) => {
      if (url.includes("ipapi.co")) {
        return new Response(
          JSON.stringify({ error: true, reason: "RateLimited" }),
          { status: 200 },
        );
      }
      expect(url).toContain("ipwho.is");
      return new Response(
        JSON.stringify({ success: true, country_code: "FR" }),
        { status: 200 },
      );
    });
    const out = await lookupCountryFromIp("203.0.113.5");
    expect(out).toEqual({ country: "FR", provider: "ipwho.is", reason: "ok" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns all-failed when both providers fail", async () => {
    fetchSpy = mockFetch((url) => {
      if (url.includes("ipapi.co")) {
        return new Response(
          JSON.stringify({ error: true, reason: "RateLimited" }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ success: false, message: "boom" }),
        { status: 200 },
      );
    });
    const out = await lookupCountryFromIp("203.0.113.5");
    expect(out).toEqual({
      country: null,
      provider: "ipwho.is",
      reason: "all-failed",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("recovers via ipwho.is when ipapi.co times out", async () => {
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url;
        if (url.includes("ipapi.co")) {
          // Simulate AbortController firing — match the runtime AbortError shape.
          await new Promise<void>((_resolve, reject) => {
            const signal = (init as RequestInit | undefined)?.signal;
            if (signal?.aborted) {
              const err = new Error("aborted");
              (err as Error & { name: string }).name = "AbortError";
              reject(err);
              return;
            }
            signal?.addEventListener("abort", () => {
              const err = new Error("aborted");
              (err as Error & { name: string }).name = "AbortError";
              reject(err);
            });
          });
          throw new Error("unreachable");
        }
        return new Response(
          JSON.stringify({ success: true, country_code: "GB" }),
          { status: 200 },
        );
      });
    vi.useFakeTimers();
    const promise = lookupCountryFromIp("203.0.113.5");
    await vi.advanceTimersByTimeAsync(2000);
    const out = await promise;
    vi.useRealTimers();
    expect(out).toEqual({ country: "GB", provider: "ipwho.is", reason: "ok" });
  });
});

// ─── resolveGeoCurrency cache ────────────────────────────────────────────────

describe("resolveGeoCurrency cache", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetGeoCurrencyCacheForTests();
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    vi.useRealTimers();
  });

  it("short-circuits on private IPs without any network call", async () => {
    fetchSpy = mockFetch(() => {
      throw new Error("must not call fetch for private IPs");
    });
    const out = await resolveGeoCurrency("10.0.0.5");
    expect(out).toEqual({
      countryCode: null,
      currencyCode: "USD",
      source: "private-ip",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("caches positive results for ~1h (single network call across two reads)", async () => {
    fetchSpy = mockFetch(() => new Response("AE", { status: 200 }));
    const first = await resolveGeoCurrency("203.0.113.10");
    expect(first).toMatchObject({
      countryCode: "AE",
      currencyCode: "AED",
      source: "lookup",
    });
    const second = await resolveGeoCurrency("203.0.113.10");
    expect(second).toMatchObject({
      countryCode: "AE",
      currencyCode: "AED",
      source: "cache",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("caches positive results for ~1h and re-fetches after expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    fetchSpy = mockFetch(() => new Response("AE", { status: 200 }));

    await resolveGeoCurrency("203.0.113.11");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 30 minutes later — still cached.
    vi.setSystemTime(new Date("2026-01-01T00:30:00Z"));
    const mid = await resolveGeoCurrency("203.0.113.11");
    expect(mid.source).toBe("cache");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 1h 1min later — expired.
    vi.setSystemTime(new Date("2026-01-01T01:01:00Z"));
    const expired = await resolveGeoCurrency("203.0.113.11");
    expect(expired.source).toBe("lookup");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("caches negative results only briefly (~60s, not 1h)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    // Both providers fail so the result is negative (USD fallback).
    fetchSpy = mockFetch((url) => {
      if (url.includes("ipapi.co")) {
        return new Response(
          JSON.stringify({ error: true, reason: "RateLimited" }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: false }), { status: 200 });
    });

    const first = await resolveGeoCurrency("203.0.113.20");
    expect(first.countryCode).toBeNull();
    expect(first.currencyCode).toBe("USD");
    expect(fetchSpy).toHaveBeenCalledTimes(2); // both providers consulted

    // 30s later — still in the negative cache, no extra fetches.
    vi.setSystemTime(new Date("2026-01-01T00:00:30Z"));
    const mid = await resolveGeoCurrency("203.0.113.20");
    expect(mid.source).toBe("cache");
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // 90s later — negative cache should already be expired (~60s TTL),
    // so we re-consult both providers instead of pinning USD for an hour.
    vi.setSystemTime(new Date("2026-01-01T00:01:30Z"));
    const expired = await resolveGeoCurrency("203.0.113.20");
    expect(expired.source).toBe("lookup");
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });
});

// ─── Route: GET /api/geo/currency with cf-ipcountry ──────────────────────────

describe("GET /api/geo/currency — cf-ipcountry shortcut", () => {
  let app: Express;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetGeoCurrencyCacheForTests();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("must not call fetch when cf-ipcountry is present");
    });
    const mod = await import("../src/routes/geo");
    app = express();
    // Minimal req.log shim — the route logs an info line per request.
    app.use((req, _res, next) => {
      (req as unknown as { log: { info: () => void } }).log = {
        info: () => {},
      };
      next();
    });
    app.use("/api", mod.default);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.resetModules();
  });

  it("returns AED for cf-ipcountry: AE without any outbound HTTP call", async () => {
    const res = await request(app)
      .get("/api/geo/currency")
      .set("cf-ipcountry", "AE")
      .set("x-forwarded-for", "203.0.113.50");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ countryCode: "AE", currencyCode: "AED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ─── resolveGeoCurrencyByCoords ──────────────────────────────────────────────

describe("resolveGeoCurrencyByCoords", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetGeoCurrencyCacheForTests();
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    vi.useRealTimers();
  });

  it("short-circuits to USD without fetching when coords are NaN", async () => {
    fetchSpy = mockFetch(() => {
      throw new Error("must not call fetch for invalid coords");
    });
    const out = await resolveGeoCurrencyByCoords(Number.NaN, 0);
    expect(out).toEqual({ countryCode: null, currencyCode: "USD" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("short-circuits to USD without fetching when coords are out of range", async () => {
    fetchSpy = mockFetch(() => {
      throw new Error("must not call fetch for out-of-range coords");
    });
    const cases: Array<[number, number]> = [
      [91, 0],
      [-91, 0],
      [0, 181],
      [0, -181],
    ];
    for (const [lat, lng] of cases) {
      const out = await resolveGeoCurrencyByCoords(lat, lng);
      expect(out).toEqual({ countryCode: null, currencyCode: "USD" });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("caches positive results keyed by 0.1° rounding (nearby coords share one fetch)", async () => {
    fetchSpy = mockFetch((url) => {
      expect(url).toContain("bigdatacloud.net");
      return new Response(
        JSON.stringify({ countryCode: "AE" }),
        { status: 200 },
      );
    });

    // 25.20 and 25.23 both round to 25.2 at 0.1° precision, so the second
    // call must hit the cache rather than issue a new fetch.
    const first = await resolveGeoCurrencyByCoords(25.2, 55.27);
    expect(first).toEqual({ countryCode: "AE", currencyCode: "AED" });

    const second = await resolveGeoCurrencyByCoords(25.23, 55.29);
    expect(second).toEqual({ countryCode: "AE", currencyCode: "AED" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // A coord that rounds differently must trigger a new fetch.
    const third = await resolveGeoCurrencyByCoords(48.85, 2.35);
    expect(third).toEqual({ countryCode: "AE", currencyCode: "AED" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("caches positive results for ~1h and re-fetches after expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    fetchSpy = mockFetch(
      () => new Response(JSON.stringify({ countryCode: "FR" }), { status: 200 }),
    );

    await resolveGeoCurrencyByCoords(48.85, 2.35);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-01-01T00:30:00Z"));
    await resolveGeoCurrencyByCoords(48.85, 2.35);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-01-01T01:01:00Z"));
    await resolveGeoCurrencyByCoords(48.85, 2.35);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("caches negative results only briefly (~60s, not 1h)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    fetchSpy = mockFetch(
      () => new Response(JSON.stringify({ countryCode: null }), { status: 200 }),
    );

    const first = await resolveGeoCurrencyByCoords(0, 0);
    expect(first).toEqual({ countryCode: null, currencyCode: "USD" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-01-01T00:00:30Z"));
    await resolveGeoCurrencyByCoords(0, 0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 90s in — negative TTL elapsed, must re-fetch rather than pinning USD.
    vi.setSystemTime(new Date("2026-01-01T00:01:30Z"));
    await resolveGeoCurrencyByCoords(0, 0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("falls back to USD on a non-2xx response from BigDataCloud", async () => {
    fetchSpy = mockFetch(
      () => new Response("Service Unavailable", { status: 503 }),
    );
    const out = await resolveGeoCurrencyByCoords(48.85, 2.35);
    expect(out).toEqual({ countryCode: null, currencyCode: "USD" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to USD on a malformed JSON body", async () => {
    fetchSpy = mockFetch(() => new Response("<html>nope</html>", { status: 200 }));
    const out = await resolveGeoCurrencyByCoords(48.85, 2.35);
    expect(out).toEqual({ countryCode: null, currencyCode: "USD" });
  });

  it("falls back to USD when countryCode is missing or not a 2-letter code", async () => {
    fetchSpy = mockFetch(
      () =>
        new Response(JSON.stringify({ countryCode: "XYZ" }), { status: 200 }),
    );
    const out = await resolveGeoCurrencyByCoords(48.85, 2.35);
    expect(out).toEqual({ countryCode: null, currencyCode: "USD" });
  });
});

// ─── Route: GET /api/geo/currency-by-coords ──────────────────────────────────

describe("GET /api/geo/currency-by-coords", () => {
  let app: Express;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetGeoCurrencyCacheForTests();
    fetchSpy = vi.spyOn(globalThis, "fetch");
    const mod = await import("../src/routes/geo");
    app = express();
    app.use((req, _res, next) => {
      (req as unknown as { log: { info: () => void } }).log = {
        info: () => {},
      };
      next();
    });
    app.use("/api", mod.default);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.resetModules();
  });

  it("returns the same {countryCode, currencyCode} shape as /geo/currency for valid coords", async () => {
    fetchSpy.mockImplementation(
      async () =>
        new Response(JSON.stringify({ countryCode: "AE" }), { status: 200 }),
    );
    const res = await request(app)
      .get("/api/geo/currency-by-coords")
      .query({ lat: "25.2048", lng: "55.2708" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ countryCode: "AE", currencyCode: "AED" });
    expect(Object.keys(res.body).sort()).toEqual(["countryCode", "currencyCode"]);
  });

  it("returns the safe USD shape (no 4xx) when coords are missing or invalid", async () => {
    fetchSpy.mockImplementation(async () => {
      throw new Error("must not call fetch for invalid coords");
    });
    const missing = await request(app).get("/api/geo/currency-by-coords");
    expect(missing.status).toBe(200);
    expect(missing.body).toEqual({ countryCode: null, currencyCode: "USD" });

    const nan = await request(app)
      .get("/api/geo/currency-by-coords")
      .query({ lat: "not-a-number", lng: "0" });
    expect(nan.status).toBe(200);
    expect(nan.body).toEqual({ countryCode: null, currencyCode: "USD" });

    const oob = await request(app)
      .get("/api/geo/currency-by-coords")
      .query({ lat: "200", lng: "0" });
    expect(oob.status).toBe(200);
    expect(oob.body).toEqual({ countryCode: null, currencyCode: "USD" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
