import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  resolveGeoCurrency,
  resolveGeoCurrencyByCoords,
  currencyForCountry,
  __resetGeoCurrencyCacheForTests,
} from "./geoCurrency";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ipapiOkResponse(countryCode: string): Response {
  return new Response(countryCode, { status: 200 });
}

function ipapiNon200Response(): Response {
  return new Response("Service Unavailable", { status: 503 });
}

function ipapiRateLimitedResponse(): Response {
  return new Response(JSON.stringify({ error: true, reason: "RateLimited" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function ipwhoisOkResponse(countryCode: string): Response {
  return new Response(
    JSON.stringify({ success: true, country_code: countryCode }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function ipwhoisFailResponse(): Response {
  return new Response(
    JSON.stringify({ success: false, message: "no data" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ---------------------------------------------------------------------------
// currencyForCountry — pure mapping, no network
// ---------------------------------------------------------------------------

describe("currencyForCountry", () => {
  it("returns AED for AE", () => {
    expect(currencyForCountry("AE")).toBe("AED");
  });

  it("returns USD for LB (unmapped country)", () => {
    expect(currencyForCountry("LB")).toBe("USD");
  });

  it("returns GBP for GB", () => {
    expect(currencyForCountry("GB")).toBe("GBP");
  });

  it("returns EUR for FR", () => {
    expect(currencyForCountry("FR")).toBe("EUR");
  });

  it("returns USD for null", () => {
    expect(currencyForCountry(null)).toBe("USD");
  });

  it("handles lowercase input", () => {
    expect(currencyForCountry("ae")).toBe("AED");
  });
});

// ---------------------------------------------------------------------------
// resolveGeoCurrency — with mocked fetch
// ---------------------------------------------------------------------------

describe("resolveGeoCurrency", () => {
  beforeEach(() => {
    __resetGeoCurrencyCacheForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns AED for an AE IP via ipapi.co", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ipapiOkResponse("AE"));

    const result = await resolveGeoCurrency("1.2.3.4");
    expect(result.countryCode).toBe("AE");
    expect(result.currencyCode).toBe("AED");
    expect(result.source).toBe("lookup");
    expect(result.lookup?.provider).toBe("ipapi.co");
    expect(result.lookup?.reason).toBe("ok");
  });

  it("returns GBP for a GB IP via ipapi.co", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ipapiOkResponse("GB"));

    const result = await resolveGeoCurrency("5.6.7.8");
    expect(result.countryCode).toBe("GB");
    expect(result.currencyCode).toBe("GBP");
  });

  it("returns EUR for a FR IP via ipapi.co", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ipapiOkResponse("FR"));

    const result = await resolveGeoCurrency("9.10.11.12");
    expect(result.countryCode).toBe("FR");
    expect(result.currencyCode).toBe("EUR");
  });

  it("returns USD for an LB IP (unmapped country) via ipapi.co", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ipapiOkResponse("LB"));

    const result = await resolveGeoCurrency("78.40.0.1");
    expect(result.countryCode).toBe("LB");
    expect(result.currencyCode).toBe("USD");
    expect(result.source).toBe("lookup");
  });

  it("falls through to ipwho.is when ipapi.co returns non-200", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(ipapiNon200Response())
      .mockResolvedValueOnce(ipwhoisOkResponse("AE"));

    const result = await resolveGeoCurrency("1.2.3.4");
    expect(result.countryCode).toBe("AE");
    expect(result.currencyCode).toBe("AED");
    expect(result.lookup?.provider).toBe("ipwho.is");
    expect(result.lookup?.reason).toBe("ok");
  });

  it("falls through to ipwho.is when ipapi.co is rate-limited", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(ipapiRateLimitedResponse())
      .mockResolvedValueOnce(ipwhoisOkResponse("GB"));

    const result = await resolveGeoCurrency("1.2.3.4");
    expect(result.countryCode).toBe("GB");
    expect(result.currencyCode).toBe("GBP");
    expect(result.lookup?.provider).toBe("ipwho.is");
  });

  it("returns USD fallback when both providers fail", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(ipapiNon200Response())
      .mockResolvedValueOnce(ipwhoisFailResponse());

    const result = await resolveGeoCurrency("1.2.3.4");
    expect(result.countryCode).toBeNull();
    expect(result.currencyCode).toBe("USD");
    expect(result.lookup?.reason).toBe("all-failed");
  });

  it("returns private-ip source for a loopback address without calling fetch", async () => {
    const result = await resolveGeoCurrency("127.0.0.1");
    expect(result.source).toBe("private-ip");
    expect(result.currencyCode).toBe("USD");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves the second call from cache without a second fetch", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ipapiOkResponse("AE"));

    const first = await resolveGeoCurrency("1.2.3.4");
    expect(first.source).toBe("lookup");

    const second = await resolveGeoCurrency("1.2.3.4");
    expect(second.source).toBe("cache");
    expect(second.countryCode).toBe("AE");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// resolveGeoCurrencyByCoords — Nominatim primary, ipwho.is fallback
// ---------------------------------------------------------------------------

function nominatimOkResponse(countryCode: string): Response {
  return new Response(
    JSON.stringify({ address: { country_code: countryCode } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function nominatimNon200Response(): Response {
  return new Response("Service Unavailable", { status: 503 });
}

function ipwhoisCoordsOkResponse(countryCode: string): Response {
  return new Response(
    JSON.stringify({ country_code: countryCode }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function ipwhoisCoordsFailResponse(): Response {
  return new Response(
    JSON.stringify({ country_code: null }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("resolveGeoCurrencyByCoords", () => {
  beforeEach(() => {
    __resetGeoCurrencyCacheForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns GBP for London coords via nominatim (GB)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(nominatimOkResponse("gb"));

    const result = await resolveGeoCurrencyByCoords(51.5, -0.1);
    expect(result.countryCode).toBe("GB");
    expect(result.currencyCode).toBe("GBP");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(
      /nominatim\.openstreetmap\.org/,
    );
  });

  it("returns QAR for Doha coords via nominatim (QA)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(nominatimOkResponse("qa"));

    const result = await resolveGeoCurrencyByCoords(25.3, 51.5);
    expect(result.countryCode).toBe("QA");
    expect(result.currencyCode).toBe("QAR");
  });

  it("returns EUR for Paris coords via nominatim (FR)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(nominatimOkResponse("fr"));

    const result = await resolveGeoCurrencyByCoords(48.8, 2.3);
    expect(result.countryCode).toBe("FR");
    expect(result.currencyCode).toBe("EUR");
  });

  it("falls back to ipwho.is when nominatim returns non-2xx", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(nominatimNon200Response())
      .mockResolvedValueOnce(ipwhoisCoordsOkResponse("GB"));

    const result = await resolveGeoCurrencyByCoords(51.5, -0.1);
    expect(result.countryCode).toBe("GB");
    expect(result.currencyCode).toBe("GBP");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[1][0]).toMatch(
      /ipwho\.is/,
    );
  });

  it("returns USD fallback when both nominatim and ipwho.is fail", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(nominatimNon200Response())
      .mockResolvedValueOnce(ipwhoisCoordsFailResponse());

    const result = await resolveGeoCurrencyByCoords(51.5, -0.1);
    expect(result.countryCode).toBeNull();
    expect(result.currencyCode).toBe("USD");
  });

  it("returns USD fallback for out-of-range coordinates without calling fetch", async () => {
    const result = await resolveGeoCurrencyByCoords(999, 999);
    expect(result.countryCode).toBeNull();
    expect(result.currencyCode).toBe("USD");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves a second call from cache without a second fetch", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(nominatimOkResponse("ae"));

    const first = await resolveGeoCurrencyByCoords(25.2, 55.3);
    expect(first.countryCode).toBe("AE");

    const second = await resolveGeoCurrencyByCoords(25.2, 55.3);
    expect(second.countryCode).toBe("AE");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
