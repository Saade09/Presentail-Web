import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getRates,
  getRate,
  roundForCurrency,
  toStripeMinorUnits,
  getFxStatus,
  FALLBACK_RATES,
  __resetFxForTest,
} from "./fx";

// ---------------------------------------------------------------------------
// Helpers to build realistic mock fetch responses
// ---------------------------------------------------------------------------

function makeErApiResponse(rates: Record<string, number>): Response {
  return new Response(
    JSON.stringify({ result: "success", rates }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function makeOsRatesResponse(rates: Record<string, number>): Response {
  return new Response(
    JSON.stringify({ rates }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function makeFailResponse(status = 500): Response {
  return new Response("Internal Server Error", { status });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  __resetFxForTest();
  // Ensure PRESENTAIL_OS_API_URL is set so fetchOsRates() doesn't throw early.
  process.env["PRESENTAIL_OS_API_URL"] = "https://os.example.com";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env["PRESENTAIL_OS_API_URL"];
});

// ---------------------------------------------------------------------------
// 3% markup on ER_API currencies (CAD, AUD, CHF)
// ---------------------------------------------------------------------------

describe("FX pipeline — ER_API 3% markup (CAD, AUD, CHF)", () => {
  it("applies 1.03× to CAD, AUD, and CHF from open.er-api.com", async () => {
    const erRaw = { CAD: 1.37, AUD: 1.50, CHF: 0.88 };
    const osRates = { AED: 3.673, EUR: 0.92, GBP: 0.78, QAR: 3.64, SAR: 3.75 };

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("er-api.com")) return Promise.resolve(makeErApiResponse(erRaw));
        return Promise.resolve(makeOsRatesResponse(osRates));
      }),
    );

    const result = await getRates();

    expect(result.source).toBe("live");
    expect(result.rates.CAD).toBeCloseTo(erRaw.CAD * 1.03, 8);
    expect(result.rates.AUD).toBeCloseTo(erRaw.AUD * 1.03, 8);
    expect(result.rates.CHF).toBeCloseTo(erRaw.CHF * 1.03, 8);
  });

  it("CAD rate stored at raw × 1.03 — exact value check", async () => {
    const rawCad = 1.40;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("er-api.com")) {
          return Promise.resolve(makeErApiResponse({ CAD: rawCad, AUD: 1.50, CHF: 0.88 }));
        }
        return Promise.resolve(makeOsRatesResponse({ AED: 3.673, EUR: 0.92, GBP: 0.78, QAR: 3.64, SAR: 3.75 }));
      }),
    );

    const result = await getRates();
    expect(result.rates.CAD).toBeCloseTo(rawCad * 1.03, 8);
  });

  it("AUD rate stored at raw × 1.03 — exact value check", async () => {
    const rawAud = 1.55;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("er-api.com")) {
          return Promise.resolve(makeErApiResponse({ CAD: 1.37, AUD: rawAud, CHF: 0.88 }));
        }
        return Promise.resolve(makeOsRatesResponse({ AED: 3.673, EUR: 0.92, GBP: 0.78, QAR: 3.64, SAR: 3.75 }));
      }),
    );

    const result = await getRates();
    expect(result.rates.AUD).toBeCloseTo(rawAud * 1.03, 8);
  });

  it("CHF rate stored at raw × 1.03 — exact value check", async () => {
    const rawChf = 0.90;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("er-api.com")) {
          return Promise.resolve(makeErApiResponse({ CAD: 1.37, AUD: 1.50, CHF: rawChf }));
        }
        return Promise.resolve(makeOsRatesResponse({ AED: 3.673, EUR: 0.92, GBP: 0.78, QAR: 3.64, SAR: 3.75 }));
      }),
    );

    const result = await getRates();
    expect(result.rates.CHF).toBeCloseTo(rawChf * 1.03, 8);
  });
});

// ---------------------------------------------------------------------------
// OS-sourced currencies carry the uniform 3% markup
// ---------------------------------------------------------------------------

describe("FX pipeline — OS-sourced currencies (AED, EUR, GBP, QAR, SAR) get 3% markup", () => {
  const osInputRates = { AED: 3.700, EUR: 0.930, GBP: 0.800, QAR: 3.650, SAR: 3.760 };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("er-api.com")) {
          return Promise.resolve(makeErApiResponse({ CAD: 1.37, AUD: 1.50, CHF: 0.88 }));
        }
        return Promise.resolve(makeOsRatesResponse(osInputRates));
      }),
    );
  });

  it("AED is stored at OS rate × 1.03", async () => {
    const result = await getRates();
    expect(result.rates.AED).toBeCloseTo(osInputRates.AED * 1.03, 8);
  });

  it("EUR is stored at OS rate × 1.03", async () => {
    const result = await getRates();
    expect(result.rates.EUR).toBeCloseTo(osInputRates.EUR * 1.03, 8);
  });

  it("GBP is stored at OS rate × 1.03", async () => {
    const result = await getRates();
    expect(result.rates.GBP).toBeCloseTo(osInputRates.GBP * 1.03, 8);
  });

  it("QAR is stored at OS rate × 1.03", async () => {
    const result = await getRates();
    expect(result.rates.QAR).toBeCloseTo(osInputRates.QAR * 1.03, 8);
  });

  it("SAR is stored at OS rate × 1.03", async () => {
    const result = await getRates();
    expect(result.rates.SAR).toBeCloseTo(osInputRates.SAR * 1.03, 8);
  });
});

// ---------------------------------------------------------------------------
// OS fails — ER_API covers OS currencies, markup still applied uniformly
// ---------------------------------------------------------------------------

describe("FX pipeline — OS failure: ER_API covers OS currencies with 3% markup", () => {
  it("applies 1.03× to AED/EUR/GBP/QAR/SAR when OS is down and ER_API covers them", async () => {
    const erRatesIncludingOs = {
      AED: 3.700, EUR: 0.930, GBP: 0.800, QAR: 3.650, SAR: 3.760,
      CAD: 1.37, AUD: 1.50, CHF: 0.88,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("er-api.com")) {
          return Promise.resolve(makeErApiResponse(erRatesIncludingOs));
        }
        // OS endpoint returns an error
        return Promise.resolve(makeFailResponse(503));
      }),
    );

    const result = await getRates();
    expect(result.source).toBe("live");

    // OS currencies sourced from ER_API get the uniform 1.03 markup
    expect(result.rates.AED).toBeCloseTo(erRatesIncludingOs.AED * 1.03, 8);
    expect(result.rates.EUR).toBeCloseTo(erRatesIncludingOs.EUR * 1.03, 8);
    expect(result.rates.GBP).toBeCloseTo(erRatesIncludingOs.GBP * 1.03, 8);
    expect(result.rates.QAR).toBeCloseTo(erRatesIncludingOs.QAR * 1.03, 8);
    expect(result.rates.SAR).toBeCloseTo(erRatesIncludingOs.SAR * 1.03, 8);

    // ER_API currencies also get the 1.03 markup
    expect(result.rates.CAD).toBeCloseTo(erRatesIncludingOs.CAD * 1.03, 8);
    expect(result.rates.AUD).toBeCloseTo(erRatesIncludingOs.AUD * 1.03, 8);
    expect(result.rates.CHF).toBeCloseTo(erRatesIncludingOs.CHF * 1.03, 8);
  });
});

// ---------------------------------------------------------------------------
// Both upstreams fail → static fallback
// ---------------------------------------------------------------------------

describe("FX pipeline — fallback when both upstreams fail", () => {
  it("returns source=fallback and the embedded static rates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makeFailResponse(503))),
    );

    const result = await getRates();
    expect(result.source).toBe("fallback");
    expect(result.rates.USD).toBe(1);
    expect(result.rates.LBP).toBe(89_500);
  });

  it("increments consecutiveFailures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makeFailResponse(503))),
    );

    await getRates();
    expect(getFxStatus().consecutiveFailures).toBe(1);
  });

  it("all non-USD non-LBP fallback rates are pre-multiplied by 1.03", () => {
    // Verify the embedded constants are consistent with the uniform markup rule.
    // These are the "raw" market rates used as the pre-markup base.
    expect(FALLBACK_RATES.AED).toBeCloseTo(3.673 * 1.03, 2);
    expect(FALLBACK_RATES.EUR).toBeCloseTo(0.92  * 1.03, 2);
    expect(FALLBACK_RATES.GBP).toBeCloseTo(0.78  * 1.03, 2);
    expect(FALLBACK_RATES.CAD).toBeCloseTo(1.37  * 1.03, 2);
    expect(FALLBACK_RATES.AUD).toBeCloseTo(1.50  * 1.03, 2);
    expect(FALLBACK_RATES.QAR).toBeCloseTo(3.64  * 1.03, 2);
    expect(FALLBACK_RATES.SAR).toBeCloseTo(3.75  * 1.03, 2);
    expect(FALLBACK_RATES.CHF).toBeCloseTo(0.88  * 1.03, 2);
  });

  it("USD stays at 1.0 and LBP stays at 89500 (no markup)", () => {
    expect(FALLBACK_RATES.USD).toBe(1);
    expect(FALLBACK_RATES.LBP).toBe(89_500);
  });
});

// ---------------------------------------------------------------------------
// roundForCurrency — delegates to roundToNearestFive (single source of truth)
// ---------------------------------------------------------------------------

describe("roundForCurrency", () => {
  it("AED → nearest 5", () => {
    expect(roundForCurrency(367, "AED")).toBe(365);
    expect(roundForCurrency(368, "AED")).toBe(370);
    expect(roundForCurrency(370, "AED")).toBe(370);
  });

  it("EUR → nearest 5", () => {
    expect(roundForCurrency(362, "EUR")).toBe(360);
    expect(roundForCurrency(363, "EUR")).toBe(365);
  });

  it("GBP → nearest 5", () => {
    expect(roundForCurrency(78, "GBP")).toBe(80);
    expect(roundForCurrency(76, "GBP")).toBe(75);
  });

  it("LBP → nearest 500", () => {
    expect(roundForCurrency(895123, "LBP")).toBe(895000);
    expect(roundForCurrency(895300, "LBP")).toBe(895500);
  });

  it("USD → nearest 1 (2-decimal precision)", () => {
    expect(roundForCurrency(49.99, "USD")).toBeCloseTo(49.99, 5);
    expect(roundForCurrency(49.995, "USD")).toBeCloseTo(50.00, 2);
  });

  it("CAD → nearest 5", () => {
    expect(roundForCurrency(142, "CAD")).toBe(140);
    expect(roundForCurrency(143, "CAD")).toBe(145);
  });
});

// ---------------------------------------------------------------------------
// Full pipeline: ER_API rate → markup → roundForCurrency → toStripeMinorUnits
// ---------------------------------------------------------------------------

describe("Full pipeline: ER_API fetch → markup → round → Stripe minor units", () => {
  it("CAD: 49.99 USD at raw rate 1.37 → rounds to nearest 5 → correct minor units", async () => {
    const rawCad = 1.37;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("er-api.com")) {
          return Promise.resolve(makeErApiResponse({ CAD: rawCad, AUD: 1.50, CHF: 0.88 }));
        }
        return Promise.resolve(makeOsRatesResponse({ AED: 3.673, EUR: 0.92, GBP: 0.78, QAR: 3.64, SAR: 3.75 }));
      }),
    );

    const cadRate = await getRate("CAD");
    expect(cadRate).toBeCloseTo(rawCad * 1.03, 8);

    const converted = 49.99 * cadRate;
    const rounded = roundForCurrency(converted, "CAD");
    const minor = toStripeMinorUnits(rounded, "CAD");

    // Rounded result should be a multiple of 5
    expect(rounded % 5).toBe(0);
    // Minor units should equal rounded × 100 (CAD is 2-decimal)
    expect(minor).toBe(Math.round(rounded * 100));
  });

  it("AED: 100 USD at OS rate 3.673 → marked up by 3% → rounds to nearest 5", async () => {
    const aeRaw = 3.673;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("er-api.com")) {
          return Promise.resolve(makeErApiResponse({ CAD: 1.37, AUD: 1.50, CHF: 0.88 }));
        }
        return Promise.resolve(makeOsRatesResponse({ AED: aeRaw, EUR: 0.92, GBP: 0.78, QAR: 3.64, SAR: 3.75 }));
      }),
    );

    const aedRate = await getRate("AED");
    expect(aedRate).toBeCloseTo(aeRaw * 1.03, 8); // 3% markup applied

    const converted = 100 * aedRate; // ~378.32
    const rounded = roundForCurrency(converted, "AED"); // 380
    const minor = toStripeMinorUnits(rounded, "AED"); // 38000

    expect(rounded).toBe(380);
    expect(minor).toBe(38000);
  });

  it("LBP: 10 USD at static peg 89500 → rounds to nearest 500, 0-decimal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("er-api.com")) {
          return Promise.resolve(makeErApiResponse({ CAD: 1.37, AUD: 1.50, CHF: 0.88 }));
        }
        return Promise.resolve(makeOsRatesResponse({ AED: 3.673, EUR: 0.92, GBP: 0.78, QAR: 3.64, SAR: 3.75 }));
      }),
    );

    const lbpRate = await getRate("LBP"); // always 89500 (static peg)
    expect(lbpRate).toBe(89_500);

    const converted = 10 * lbpRate; // 895000
    const rounded = roundForCurrency(converted, "LBP"); // 895000 (already multiple of 500)
    const minor = toStripeMinorUnits(rounded, "LBP"); // 895000 (0-decimal)

    expect(rounded).toBe(895000);
    expect(minor).toBe(895000);
  });
});
