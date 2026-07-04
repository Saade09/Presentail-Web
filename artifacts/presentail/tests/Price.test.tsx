/**
 * Component tests for <Price />.
 *
 * These are the first component-level tests in the mobile app; they validate
 * that `renderWithProviders` wires up `CurrencyContext` correctly and that
 * the Price component formats amounts as shoppers will see them.
 *
 * Covered scenarios
 * -----------------
 * - USD: left symbol, no space, 2 decimal places
 * - EUR: left symbol, no space, 0 decimal places (rounded)
 * - AED: DirhamSymbol SVG (mocked), numeric text only — no "AED" text prefix
 * - `native` prop: skips FX conversion; value is already in the active currency
 * - Zero and near-zero amounts
 * - NaN defensive guard: `Number(NaN) || 0` in the component yields $0.00
 */

import React from "react";
import { describe, expect, it } from "vitest";

import { Price } from "@/components/Price";
import type { Currency, CurrencyCode } from "@/data/currencies";

import { renderWithProviders } from "./test-utils";

const AED_CURRENCY: Currency = {
  code: "AED",
  name: "UAE Dirham",
  flag: "🇦🇪",
  symbol: "AED",
  symbolPosition: "left",
  spaceBetween: true,
  rate: 3.673,
  decimals: 0,
};

const EUR_CURRENCY: Currency = {
  code: "EUR",
  name: "Euro",
  flag: "🇪🇺",
  symbol: "€",
  symbolPosition: "left",
  spaceBetween: false,
  rate: 0.855,
  decimals: 0,
};

describe("Price — USD (default)", () => {
  it("renders the dollar sign with 2 decimal places", () => {
    const { getByText } = renderWithProviders(<Price value={10} />);
    expect(getByText("$10.00")).toBeTruthy();
  });

  it("renders zero as '$0.00'", () => {
    const { getByText } = renderWithProviders(<Price value={0} />);
    expect(getByText("$0.00")).toBeTruthy();
  });

  it("renders a fractional amount with exactly 2 decimal places", () => {
    const { getByText } = renderWithProviders(<Price value={49.99} />);
    expect(getByText("$49.99")).toBeTruthy();
  });

  it("symbol is on the left with no space", () => {
    const { getByText, queryByText } = renderWithProviders(<Price value={100} />);
    // "$100.00" is found → symbol is on the left, no space between "$" and digits
    expect(getByText("$100.00")).toBeTruthy();
    // "$ 100.00" (with space) must not be found
    expect(queryByText("$ 100.00")).toBeNull();
  });
});

describe("Price — USD — native flag", () => {
  it("native=true: value is not converted, displayed as-is", () => {
    const { getByText } = renderWithProviders(<Price value={25} native />);
    expect(getByText("$25.00")).toBeTruthy();
  });

  it("native=false (default): value passes through convert()", () => {
    const { getByText } = renderWithProviders(
      <Price value={50} />,
      { currency: { convert: (usd) => usd * 2 } },
    );
    expect(getByText("$100.00")).toBeTruthy();
  });

  it("native=true ignores the convert override — value stays the same", () => {
    const { getByText } = renderWithProviders(
      <Price value={50} native />,
      { currency: { convert: (usd) => usd * 2 } },
    );
    expect(getByText("$50.00")).toBeTruthy();
  });
});

describe("Price — EUR (Cyprus)", () => {
  const eurCurrency: Parameters<typeof renderWithProviders>[1] = {
    currency: {
      currency: EUR_CURRENCY,
      currencyCode: "EUR" as CurrencyCode,
      convert: (usd) => Math.round(usd * EUR_CURRENCY.rate),
    },
  };

  it("renders the Euro symbol to the left with no space, no decimals", () => {
    const { getByText } = renderWithProviders(<Price value={100} />, eurCurrency);
    expect(getByText("€86")).toBeTruthy();
  });

  it("renders zero as '€0'", () => {
    const { getByText } = renderWithProviders(<Price value={0} />, eurCurrency);
    expect(getByText("€0")).toBeTruthy();
  });

  it("native=true: skips conversion — raw value formatted with EUR rules", () => {
    const { getByText } = renderWithProviders(<Price value={50} native />, eurCurrency);
    expect(getByText("€50")).toBeTruthy();
  });

  it("rounds converted EUR amounts (no decimal places)", () => {
    const { getByText } = renderWithProviders(<Price value={50} />, eurCurrency);
    const node = getByText("€43");
    expect(node).toBeTruthy();
  });
});

describe("Price — AED (UAE, Dirham SVG symbol)", () => {
  const aedCurrency: Parameters<typeof renderWithProviders>[1] = {
    currency: {
      currency: AED_CURRENCY,
      currencyCode: "AED" as CurrencyCode,
      convert: (usd) => Math.round(usd * AED_CURRENCY.rate),
    },
  };

  it("renders the numeric amount as a Text node", () => {
    const { getByText } = renderWithProviders(<Price value={100} />, aedCurrency);
    expect(getByText("367")).toBeTruthy();
  });

  it("renders zero as '0'", () => {
    const { getByText } = renderWithProviders(<Price value={0} />, aedCurrency);
    expect(getByText("0")).toBeTruthy();
  });

  it("does not render 'AED' as a text string (the symbol is an SVG DirhamSymbol)", () => {
    const { queryByText } = renderWithProviders(<Price value={100} />, aedCurrency);
    expect(queryByText("AED 367")).toBeNull();
    expect(queryByText(/^AED/)).toBeNull();
  });

  it("native=true: skips conversion, numeric text equals the raw value", () => {
    const { getByText } = renderWithProviders(<Price value={200} native />, aedCurrency);
    expect(getByText("200")).toBeTruthy();
  });
});

describe("Price — defensive: NaN / non-finite values", () => {
  it("native NaN resolves to $0.00 via Number(NaN) || 0 guard", () => {
    const { getByText } = renderWithProviders(<Price value={NaN} native />);
    expect(getByText("$0.00")).toBeTruthy();
  });

  it("native 0 does not crash or render NaN", () => {
    const { getByText } = renderWithProviders(<Price value={0} native />);
    expect(getByText("$0.00")).toBeTruthy();
  });
});
