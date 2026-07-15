/**
 * Unit tests for useDeliveryPricing() in hooks/useDeliveryPricing.ts.
 *
 * Scenarios covered:
 *   - Below-threshold with known area: returns standardFee, no isFreeStandard.
 *   - At-threshold (boundary): projected total equals threshold → isFreeStandard.
 *   - Above-threshold: projected total exceeds threshold → isFreeStandard.
 *   - Unknown area (no city selected): pricingState === "unknown_area", standardFee null.
 *   - From-min state (city without fee configured): pricingState === "from_min".
 *   - Error state (no country selected): pricingState === "error".
 *   - Currency conversion: all monetary outputs are in display currency.
 *
 * Implementation note
 * -------------------
 * Uses react-test-renderer + React.act() — same pattern as the rest of this
 * test suite — rather than @testing-library/react-native.
 */

import React, { act } from "react";
import * as ReactTestRenderer from "react-test-renderer";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useDeliveryPricing, type DeliveryPricingResult } from "@/hooks/useDeliveryPricing";

// ---------------------------------------------------------------------------
// Shared mock state — tests mutate these before rendering
// ---------------------------------------------------------------------------

const mockCart = { total: 0 };
const mockCurrency = {
  convert: (usd: number) => usd * 2,  // 2x multiplier for easy verification
  formatNative: (amount: number) => `$${amount}`,
};
const mockDeliveryLocation = {
  selectedCountry: { code: "LB" },
  selectedCity: null as { fee?: number; expressAvailable?: boolean } | null,
};
const mockDeliveryConfig = {
  freeDeliveryEnabled: true,
  freeDeliveryThresholdUsd: 90,
  freeDeliveryThresholdNative: 180, // 90 * 2 (matching the 2x convert mock)
};

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/contexts/CartContext", () => ({
  useCart: () => ({ total: mockCart.total }),
}));

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    convert: mockCurrency.convert,
    formatNative: mockCurrency.formatNative,
  }),
}));

vi.mock("@/hooks/useDeliveryLocation", () => ({
  useDeliveryLocation: () => ({
    selectedCountry: mockDeliveryLocation.selectedCountry,
    selectedCity: mockDeliveryLocation.selectedCity,
  }),
}));

vi.mock("@/hooks/useDeliveryConfig", () => ({
  useDeliveryConfig: () => ({
    freeDeliveryEnabled: mockDeliveryConfig.freeDeliveryEnabled,
    freeDeliveryThresholdUsd: mockDeliveryConfig.freeDeliveryThresholdUsd,
    freeDeliveryThresholdNative: mockDeliveryConfig.freeDeliveryThresholdNative,
  }),
}));

// expressSurchargeForCountry("LB") = 15 USD → 30 in display currency (2x)
// expressSurchargeForCountry("AE") = 4.9 USD → 9.8 in display currency

// ---------------------------------------------------------------------------
// Minimal harness: renders the hook and captures its return value
// ---------------------------------------------------------------------------

function HookCapture({
  productPriceUsd,
  quantity,
  onResult,
}: {
  productPriceUsd: number;
  quantity?: number;
  onResult: (result: DeliveryPricingResult) => void;
}): null {
  const result = useDeliveryPricing(productPriceUsd, quantity);
  onResult(result);
  return null;
}

function renderHook(productPriceUsd: number, quantity = 1): DeliveryPricingResult {
  let captured!: DeliveryPricingResult;
  act(() => {
    ReactTestRenderer.create(
      React.createElement(HookCapture, {
        productPriceUsd,
        quantity,
        onResult: (r) => { captured = r; },
      }),
    );
  });
  return captured;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useDeliveryPricing — below threshold with known area", () => {
  beforeEach(() => {
    mockCart.total = 0;
    mockDeliveryLocation.selectedCountry = { code: "LB" };
    mockDeliveryLocation.selectedCity = { fee: 9, expressAvailable: true };
    mockDeliveryConfig.freeDeliveryEnabled = true;
    mockDeliveryConfig.freeDeliveryThresholdNative = 180;
  });

  it("returns standardFee equal to city fee", () => {
    // product $10 USD → projected total = (0 + 10) * 2 = 20 (below 180 threshold)
    const result = renderHook(10, 1);
    expect(result.pricingState).toBe("known");
    expect(result.standardFee).toBe(9);
    expect(result.isFreeStandard).toBe(false);
  });

  it("computes expressTotal as standardFee + expressSurcharge", () => {
    // expressSurcharge = 15 USD * 2 = 30; standardFee = 9; total = 39
    const result = renderHook(10, 1);
    expect(result.expressSurcharge).toBe(30);
    expect(result.expressTotal).toBe(39); // 9 + 30
  });

  it("converts all monetary values via the currency converter", () => {
    // standardFee comes from selectedCity.fee (already native), not converted
    // expressSurcharge = convert(15) = 30
    const result = renderHook(10, 1);
    expect(result.expressSurcharge).toBe(30);
  });

  it("computes projectedCartTotal as convert(cartTotal + productPrice * qty)", () => {
    mockCart.total = 20; // USD
    // projected = convert(20 + 10 * 2) = convert(40) = 80
    const result = renderHook(10, 2);
    expect(result.projectedCartTotal).toBe(80);
  });
});

describe("useDeliveryPricing — at-threshold (boundary)", () => {
  beforeEach(() => {
    mockCart.total = 0;
    mockDeliveryLocation.selectedCountry = { code: "LB" };
    mockDeliveryLocation.selectedCity = { fee: 9, expressAvailable: true };
    mockDeliveryConfig.freeDeliveryEnabled = true;
    mockDeliveryConfig.freeDeliveryThresholdNative = 180;
  });

  it("qualifies for free delivery when projected total exactly meets threshold", () => {
    // product = 90 USD → projected = convert(90) = 180 = threshold
    const result = renderHook(90, 1);
    expect(result.isFreeStandard).toBe(true);
    expect(result.pricingState).toBe("known");
  });

  it("sets expressTotal to just the express surcharge when standard is free", () => {
    const result = renderHook(90, 1);
    // isFreeStandard → expressTotal = expressSurcharge only (standard is free)
    expect(result.expressTotal).toBe(result.expressSurcharge);
  });
});

describe("useDeliveryPricing — above threshold (FREE)", () => {
  beforeEach(() => {
    mockCart.total = 50; // USD already in cart
    mockDeliveryLocation.selectedCountry = { code: "LB" };
    mockDeliveryLocation.selectedCity = { fee: 9, expressAvailable: true };
    mockDeliveryConfig.freeDeliveryEnabled = true;
    mockDeliveryConfig.freeDeliveryThresholdNative = 180;
  });

  it("isFreeStandard is true when projected total is above threshold", () => {
    // projected = convert(50 + 60 * 1) = convert(110) = 220 > 180
    const result = renderHook(60, 1);
    expect(result.isFreeStandard).toBe(true);
  });

  it("expressTotal is still only the surcharge when order qualifies", () => {
    const result = renderHook(60, 1);
    expect(result.expressTotal).toBe(result.expressSurcharge);
  });
});

describe("useDeliveryPricing — unknown area (no city)", () => {
  beforeEach(() => {
    mockCart.total = 0;
    mockDeliveryLocation.selectedCountry = { code: "LB" };
    mockDeliveryLocation.selectedCity = null;
    mockDeliveryConfig.freeDeliveryEnabled = true;
    mockDeliveryConfig.freeDeliveryThresholdNative = 180;
  });

  it("returns unknown_area pricingState when no city is selected", () => {
    const result = renderHook(10, 1);
    expect(result.pricingState).toBe("unknown_area");
    expect(result.standardFee).toBeNull();
  });

  it("expressTotal is null when standard fee is unknown", () => {
    const result = renderHook(10, 1);
    expect(result.expressTotal).toBeNull();
  });

  it("expressSurcharge is still computed (country-wide)", () => {
    const result = renderHook(10, 1);
    expect(result.expressSurcharge).toBeGreaterThan(0);
  });

  it("isFreeStandard reflects threshold check even when area is unknown", () => {
    // The hook reports the raw cart qualification; the component guards display
    // with pricingState before reading isFreeStandard, so the schedule card
    // correctly shows "Calculated after selecting area" even when the cart
    // total already qualifies. product $200 USD → projected = 400 > 180.
    const result = renderHook(200, 1);
    expect(result.isFreeStandard).toBe(true);
  });
});

describe("useDeliveryPricing — from_min state (city without fee)", () => {
  beforeEach(() => {
    mockCart.total = 0;
    mockDeliveryLocation.selectedCountry = { code: "LB" };
    // City present but fee is undefined (not yet configured in OS)
    mockDeliveryLocation.selectedCity = { expressAvailable: true } as any;
    mockDeliveryConfig.freeDeliveryEnabled = true;
    mockDeliveryConfig.freeDeliveryThresholdNative = 180;
  });

  it("returns from_min pricingState when city has no fee configured", () => {
    const result = renderHook(10, 1);
    expect(result.pricingState).toBe("from_min");
    expect(result.standardFee).toBeNull();
  });
});

describe("useDeliveryPricing — error state (no country)", () => {
  beforeEach(() => {
    mockCart.total = 0;
    mockDeliveryLocation.selectedCountry = { code: "" };
    mockDeliveryLocation.selectedCity = null;
    mockDeliveryConfig.freeDeliveryEnabled = true;
    mockDeliveryConfig.freeDeliveryThresholdNative = 180;
  });

  it("returns error pricingState when no country is selected", () => {
    const result = renderHook(10, 1);
    expect(result.pricingState).toBe("error");
    expect(result.standardFee).toBeNull();
    expect(result.expressSurcharge).toBe(0);
    expect(result.isFreeStandard).toBe(false);
  });
});

describe("useDeliveryPricing — free delivery disabled", () => {
  beforeEach(() => {
    mockCart.total = 0;
    mockDeliveryLocation.selectedCountry = { code: "LB" };
    mockDeliveryLocation.selectedCity = { fee: 9, expressAvailable: true };
    mockDeliveryConfig.freeDeliveryEnabled = false;
    mockDeliveryConfig.freeDeliveryThresholdNative = 0;
  });

  it("never qualifies for free delivery when disabled", () => {
    // Even if the cart is huge, free delivery should not trigger
    mockCart.total = 1000;
    const result = renderHook(1000, 10);
    expect(result.isFreeStandard).toBe(false);
  });
});
