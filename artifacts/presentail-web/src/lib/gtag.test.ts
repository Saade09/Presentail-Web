// @vitest-environment jsdom
//
// Unit tests for the fireAdsPurchaseConversion helper in gtag.ts.
//
// Verifies:
//   - window.gtag is called with the correct event name ("conversion"),
//     send_to label, transaction_id, value, and currency.
//   - The function is a no-op when window.gtag is undefined.
//   - The function is a no-op when window.gtag is not a function.

import { describe, it, expect, vi, afterEach } from "vitest";
import { fireAdsPurchaseConversion } from "@/lib/gtag";

const EXPECTED_SEND_TO = "AW-18281774261/XYi_CNabpMccELX5to1E";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fireAdsPurchaseConversion", () => {
  it("calls window.gtag with event='conversion' and the correct send_to label", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({
      transactionId: "order-001",
      value: 75,
      currency: "USD",
    });

    expect(gtag).toHaveBeenCalledOnce();
    expect(gtag).toHaveBeenCalledWith("event", "conversion", expect.objectContaining({
      send_to: EXPECTED_SEND_TO,
    }));
  });

  it("passes transaction_id correctly", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({
      transactionId: "tx-abc-123",
      value: 0,
      currency: "USD",
    });

    expect(gtag).toHaveBeenCalledWith("event", "conversion", expect.objectContaining({
      transaction_id: "tx-abc-123",
    }));
  });

  it("passes value correctly", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({
      transactionId: "tx-val",
      value: 149.99,
      currency: "USD",
    });

    expect(gtag).toHaveBeenCalledWith("event", "conversion", expect.objectContaining({
      value: 149.99,
    }));
  });

  it("passes currency correctly", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({
      transactionId: "tx-cur",
      value: 50,
      currency: "EUR",
    });

    expect(gtag).toHaveBeenCalledWith("event", "conversion", expect.objectContaining({
      currency: "EUR",
    }));
  });

  it("passes all params together in a single gtag call", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({
      transactionId: "order-full-999",
      value: 200,
      currency: "GBP",
    });

    expect(gtag).toHaveBeenCalledOnce();
    expect(gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: EXPECTED_SEND_TO,
      transaction_id: "order-full-999",
      value: 200,
      currency: "GBP",
    });
  });

  it("is a no-op when window.gtag is undefined", () => {
    const win = { ...window } as unknown as typeof window & { gtag?: unknown };
    delete win.gtag;
    vi.stubGlobal("window", win);

    expect(() =>
      fireAdsPurchaseConversion({ transactionId: "tx-noop", value: 10, currency: "USD" })
    ).not.toThrow();
  });

  it("is a no-op when window.gtag is not a function", () => {
    vi.stubGlobal("window", { ...window, gtag: "not-a-function" });

    expect(() =>
      fireAdsPurchaseConversion({ transactionId: "tx-bad", value: 10, currency: "USD" })
    ).not.toThrow();
  });
});
