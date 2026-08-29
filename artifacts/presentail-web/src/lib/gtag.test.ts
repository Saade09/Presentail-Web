// @vitest-environment jsdom
//
// Unit tests for the fireAdsPurchaseConversion helper in gtag.ts.
//
// Verifies:
//   - window.gtag is called with the account and label matching the countryCode.
//   - Lebanon, Cyprus, and UAE each route to their correct send_to value.
//   - The call is a no-op when countryCode is missing or has no matching config.
//   - The call is a no-op when window.gtag is undefined or not a function.
//   - transaction_id is always included on the conversion event.

import { describe, it, expect, vi, afterEach } from "vitest";
import { fireAdsPurchaseConversion } from "@/lib/gtag";

const LB_SEND_TO = "AW-18281774261/XYi_CNabpMccELX5to1E";
const CY_SEND_TO = "AW-18281774261/y0M9CJjcleocELX5to1E";
const AE_SEND_TO = "AW-18416346533/jZRuCIGEleocEKXLzM1E";

const MARKET_CONFIG = JSON.stringify({
  LB: { accountId: "AW-18281774261", label: "XYi_CNabpMccELX5to1E" },
  CY: { accountId: "AW-18281774261", label: "y0M9CJjcleocELX5to1E" },
  AE: { accountId: "AW-18416346533", label: "jZRuCIGEleocEKXLzM1E" },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fireAdsPurchaseConversion — market routing", () => {
  it("routes Lebanon orders to the LB account and label", () => {
    vi.stubEnv("VITE_GTAG_ADS_MARKET_CONFIG", MARKET_CONFIG);
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({ transactionId: "LB-001", value: 50, currency: "USD", countryCode: "LB" });

    expect(gtag).toHaveBeenCalledWith("event", "conversion", expect.objectContaining({
      send_to: LB_SEND_TO,
    }));
  });

  it("routes Cyprus orders to the CY account and label", () => {
    vi.stubEnv("VITE_GTAG_ADS_MARKET_CONFIG", MARKET_CONFIG);
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({ transactionId: "CY-001", value: 80, currency: "EUR", countryCode: "CY" });

    expect(gtag).toHaveBeenCalledWith("event", "conversion", expect.objectContaining({
      send_to: CY_SEND_TO,
    }));
  });

  it("routes UAE orders to the AE account and label", () => {
    vi.stubEnv("VITE_GTAG_ADS_MARKET_CONFIG", MARKET_CONFIG);
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({ transactionId: "AE-001", value: 200, currency: "AED", countryCode: "AE" });

    expect(gtag).toHaveBeenCalledWith("event", "conversion", expect.objectContaining({
      send_to: AE_SEND_TO,
    }));
  });

  it("is case-insensitive on countryCode", () => {
    vi.stubEnv("VITE_GTAG_ADS_MARKET_CONFIG", MARKET_CONFIG);
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({ transactionId: "ae-lower", value: 100, currency: "AED", countryCode: "ae" });

    expect(gtag).toHaveBeenCalledWith("event", "conversion", expect.objectContaining({
      send_to: AE_SEND_TO,
    }));
  });

  it("fires exactly one conversion event per call", () => {
    vi.stubEnv("VITE_GTAG_ADS_MARKET_CONFIG", MARKET_CONFIG);
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({ transactionId: "LB-once", value: 50, currency: "USD", countryCode: "LB" });

    expect(gtag).toHaveBeenCalledTimes(1);
  });
});

describe("fireAdsPurchaseConversion — no-op cases", () => {
  it("is a no-op when countryCode is omitted", () => {
    vi.stubEnv("VITE_GTAG_ADS_MARKET_CONFIG", MARKET_CONFIG);
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({ transactionId: "no-country", value: 50, currency: "USD" });

    expect(gtag).not.toHaveBeenCalled();
  });

  it("is a no-op when countryCode has no matching config entry", () => {
    vi.stubEnv("VITE_GTAG_ADS_MARKET_CONFIG", MARKET_CONFIG);
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({ transactionId: "unknown-market", value: 50, currency: "USD", countryCode: "XX" });

    expect(gtag).not.toHaveBeenCalled();
  });

  it("is a no-op when VITE_GTAG_ADS_MARKET_CONFIG is not set", () => {
    vi.stubEnv("VITE_GTAG_ADS_MARKET_CONFIG", "");
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({ transactionId: "no-config", value: 50, currency: "USD", countryCode: "LB" });

    expect(gtag).not.toHaveBeenCalled();
  });

  it("is a no-op when window.gtag is undefined", () => {
    vi.stubEnv("VITE_GTAG_ADS_MARKET_CONFIG", MARKET_CONFIG);
    const win = { ...window } as unknown as typeof window & { gtag?: unknown };
    delete win.gtag;
    vi.stubGlobal("window", win);

    expect(() =>
      fireAdsPurchaseConversion({ transactionId: "no-gtag", value: 10, currency: "USD", countryCode: "LB" })
    ).not.toThrow();
  });

  it("is a no-op when window.gtag is not a function", () => {
    vi.stubEnv("VITE_GTAG_ADS_MARKET_CONFIG", MARKET_CONFIG);
    vi.stubGlobal("window", { ...window, gtag: "not-a-function" });

    expect(() =>
      fireAdsPurchaseConversion({ transactionId: "bad-gtag", value: 10, currency: "USD", countryCode: "LB" })
    ).not.toThrow();
  });
});

describe("fireAdsPurchaseConversion — transaction_id", () => {
  it("always includes transaction_id on the conversion event", () => {
    vi.stubEnv("VITE_GTAG_ADS_MARKET_CONFIG", MARKET_CONFIG);
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({ transactionId: "tx-dedup-123", value: 75, currency: "USD", countryCode: "LB" });

    expect(gtag).toHaveBeenCalledWith("event", "conversion", expect.objectContaining({
      transaction_id: "tx-dedup-123",
    }));
  });

  it("passes value and currency correctly", () => {
    vi.stubEnv("VITE_GTAG_ADS_MARKET_CONFIG", MARKET_CONFIG);
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({ transactionId: "tx-vals", value: 149.99, currency: "EUR", countryCode: "CY" });

    expect(gtag).toHaveBeenCalledWith("event", "conversion", expect.objectContaining({
      value: 149.99,
      currency: "EUR",
    }));
  });
});
