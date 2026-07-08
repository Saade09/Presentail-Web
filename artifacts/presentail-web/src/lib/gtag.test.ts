// @vitest-environment jsdom
//
// Unit tests for the fireAdsPurchaseConversion helper in gtag.ts.
//
// Verifies:
//   - window.gtag is called once per Google Ads account (two accounts total)
//     with the correct event name ("conversion"), send_to label,
//     transaction_id, value, and currency.
//   - The original account's conversion is unaffected by the addition of the
//     second account.
//   - The function is a no-op when window.gtag is undefined.
//   - The function is a no-op when window.gtag is not a function.

import { describe, it, expect, vi, afterEach } from "vitest";
import { fireAdsPurchaseConversion } from "@/lib/gtag";

const EXPECTED_SEND_TO = "AW-18281774261/XYi_CNabpMccELX5to1E";
const EXPECTED_SEND_TO_2 = "AW-18306046187/XAOLCKLftMwcEOuxgJlE";

/** Return the gtag call whose send_to matches the given account/label. */
function callFor(gtag: ReturnType<typeof vi.fn>, sendTo: string) {
  return gtag.mock.calls.find(
    ([, , params]: unknown[]) => (params as Record<string, unknown>)?.send_to === sendTo,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fireAdsPurchaseConversion", () => {
  it("calls window.gtag with event='conversion' and the correct send_to label for the original account", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({
      transactionId: "order-001",
      value: 75,
      currency: "USD",
    });

    const call = callFor(gtag, EXPECTED_SEND_TO);
    expect(call).toBeDefined();
    expect(call?.[0]).toBe("event");
    expect(call?.[1]).toBe("conversion");
  });

  it("also fires a second conversion for the second Google Ads account", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({
      transactionId: "order-001",
      value: 75,
      currency: "USD",
    });

    const call = callFor(gtag, EXPECTED_SEND_TO_2);
    expect(call).toBeDefined();
    expect(call?.[0]).toBe("event");
    expect(call?.[1]).toBe("conversion");
  });

  it("fires exactly two conversion events (one per Ads account) per call", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({
      transactionId: "order-001",
      value: 75,
      currency: "USD",
    });

    expect(gtag).toHaveBeenCalledTimes(2);
  });

  it("passes transaction_id correctly to both accounts", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({
      transactionId: "tx-abc-123",
      value: 0,
      currency: "USD",
    });

    expect(callFor(gtag, EXPECTED_SEND_TO)?.[2]).toMatchObject({
      transaction_id: "tx-abc-123",
    });
    expect(callFor(gtag, EXPECTED_SEND_TO_2)?.[2]).toMatchObject({
      transaction_id: "tx-abc-123",
    });
  });

  it("passes value correctly to both accounts", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({
      transactionId: "tx-val",
      value: 149.99,
      currency: "USD",
    });

    expect(callFor(gtag, EXPECTED_SEND_TO)?.[2]).toMatchObject({ value: 149.99 });
    expect(callFor(gtag, EXPECTED_SEND_TO_2)?.[2]).toMatchObject({ value: 149.99 });
  });

  it("passes currency correctly to both accounts", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({
      transactionId: "tx-cur",
      value: 50,
      currency: "EUR",
    });

    expect(callFor(gtag, EXPECTED_SEND_TO)?.[2]).toMatchObject({ currency: "EUR" });
    expect(callFor(gtag, EXPECTED_SEND_TO_2)?.[2]).toMatchObject({ currency: "EUR" });
  });

  it("passes all params together for both accounts in a single fire", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { ...window, gtag });

    fireAdsPurchaseConversion({
      transactionId: "order-full-999",
      value: 200,
      currency: "GBP",
    });

    expect(gtag).toHaveBeenCalledTimes(2);
    expect(gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: EXPECTED_SEND_TO,
      transaction_id: "order-full-999",
      value: 200,
      currency: "GBP",
    });
    expect(gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: EXPECTED_SEND_TO_2,
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
