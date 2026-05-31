/**
 * Unit tests for the web currency formatting helpers in currency.ts.
 *
 * These helpers are the single source of truth for how prices are rendered
 * throughout the web storefront. Covers:
 *  - formatPriceInCurrency: symbol placement, decimals, spacing
 *  - currencyForStoreCountry: country → currency code mapping
 *  - formatStorePrice: country → formatted price (composed helper)
 *  - setCurrencySnapshot / getCurrencySnapshot: live snapshot updates
 *  - subscribeCurrencySnapshot: listener notification
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  formatPriceInCurrency,
  formatStorePrice,
  currencyForStoreCountry,
  setCurrencySnapshot,
  getCurrencySnapshot,
  subscribeCurrencySnapshot,
  type CurrencySnapshot,
} from "./currency";

// ---------------------------------------------------------------------------
// Minimal snapshot fixture that covers the three Presentail store currencies
// plus GBP (right-symbol, space) so we can test all layout variants.
// ---------------------------------------------------------------------------

const TEST_SNAPSHOT: CurrencySnapshot = {
  fallbackCode: "USD",
  countryToCurrency: {
    LB: "USD",
    AE: "AED",
    CY: "EUR",
  },
  currencies: [
    {
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      symbolPosition: "left",
      spaceBetween: false,
      decimals: 2,
    },
    {
      code: "AED",
      name: "UAE Dirham",
      symbol: "AED",
      symbolPosition: "right",
      spaceBetween: true,
      decimals: 2,
    },
    {
      code: "EUR",
      name: "Euro",
      symbol: "€",
      symbolPosition: "left",
      spaceBetween: false,
      decimals: 2,
    },
    {
      code: "GBP",
      name: "British Pound",
      symbol: "£",
      symbolPosition: "left",
      spaceBetween: false,
      decimals: 2,
    },
    {
      code: "KWD",
      name: "Kuwaiti Dinar",
      symbol: "KD",
      symbolPosition: "left",
      spaceBetween: false,
      decimals: 2,
    },
  ],
};

beforeEach(() => {
  setCurrencySnapshot(TEST_SNAPSHOT);
});

// ---------------------------------------------------------------------------
// formatPriceInCurrency — symbol placement and decimal formatting
// ---------------------------------------------------------------------------

describe("formatPriceInCurrency — symbol placement", () => {
  it("left-symbol, no space: $50.00", () => {
    expect(formatPriceInCurrency(50, "USD")).toBe("$50");
  });

  it("left-symbol, no space, fractional value: $49.99", () => {
    expect(formatPriceInCurrency(49.99, "USD")).toBe("$49.99");
  });

  it("right-symbol, with space: '100 AED'", () => {
    expect(formatPriceInCurrency(100, "AED")).toBe("100 AED");
  });

  it("right-symbol fractional: '49.50 AED'", () => {
    // toFixed(2) → "49.50"; /\.0+$/ only strips all-zero decimals, not "50"
    expect(formatPriceInCurrency(49.5, "AED")).toBe("49.50 AED");
  });

  it("left-symbol euro: '€75'", () => {
    expect(formatPriceInCurrency(75, "EUR")).toBe("€75");
  });

  it("left-symbol pound: '£99.99'", () => {
    expect(formatPriceInCurrency(99.99, "GBP")).toBe("£99.99");
  });
});

describe("formatPriceInCurrency — decimal stripping", () => {
  it("drops .00 suffix for whole numbers", () => {
    expect(formatPriceInCurrency(100, "USD")).toBe("$100");
    expect(formatPriceInCurrency(100, "EUR")).toBe("€100");
  });

  it("preserves non-zero decimals when present (toFixed(2) → '$10.50')", () => {
    // /\.0+$/ strips ".00" but not ".50" — both non-zero digits are kept
    expect(formatPriceInCurrency(10.5, "USD")).toBe("$10.50");
  });

  it("preserves two decimal places when non-zero", () => {
    expect(formatPriceInCurrency(10.99, "USD")).toBe("$10.99");
  });
});

describe("formatPriceInCurrency — edge-case amounts", () => {
  it("formats zero", () => {
    expect(formatPriceInCurrency(0, "USD")).toBe("$0");
  });

  it("coerces NaN to $0", () => {
    expect(formatPriceInCurrency(NaN, "USD")).toBe("$0");
  });

  it("falls back to USD for an unknown currency code", () => {
    const result = formatPriceInCurrency(50, "ZZZ");
    expect(result).toBe("$50");
  });

  it("falls back to USD for null/undefined currency code", () => {
    expect(formatPriceInCurrency(50, null)).toBe("$50");
    expect(formatPriceInCurrency(50, undefined)).toBe("$50");
  });
});

describe("formatPriceInCurrency — KWD decimal override", () => {
  it("KWD is forced to 3 decimals by WEB_DECIMAL_OVERRIDES; all-zero fraction is stripped", () => {
    // toFixed(3) → "10.000"; /\.0+$/ strips the ".000" → "KD10"
    expect(formatPriceInCurrency(10, "KWD")).toBe("KD10");
  });

  it("KWD non-zero fraction: toFixed(3) keeps all three places ('KD10.500')", () => {
    // /\.0+$/ only matches all-zero decimals; ".500" has a leading 5 so it stays
    expect(formatPriceInCurrency(10.5, "KWD")).toBe("KD10.500");
  });
});

// ---------------------------------------------------------------------------
// currencyForStoreCountry
// ---------------------------------------------------------------------------

describe("currencyForStoreCountry — country → currency code", () => {
  it("LB → USD", () => {
    expect(currencyForStoreCountry("LB")).toBe("USD");
  });

  it("AE → AED", () => {
    expect(currencyForStoreCountry("AE")).toBe("AED");
  });

  it("CY → EUR", () => {
    expect(currencyForStoreCountry("CY")).toBe("EUR");
  });

  it("unsupported country falls back to the snapshot fallbackCode (USD)", () => {
    expect(currencyForStoreCountry("XX")).toBe("USD");
    expect(currencyForStoreCountry(null)).toBe("USD");
    expect(currencyForStoreCountry(undefined)).toBe("USD");
    expect(currencyForStoreCountry("")).toBe("USD");
  });
});

// ---------------------------------------------------------------------------
// formatStorePrice — composed helper: country → formatted price
// ---------------------------------------------------------------------------

describe("formatStorePrice — formats amount using country's native currency", () => {
  it("LB order (USD): $75", () => {
    expect(formatStorePrice(75, "LB")).toBe("$75");
  });

  it("AE order (AED): '200 AED'", () => {
    expect(formatStorePrice(200, "AE")).toBe("200 AED");
  });

  it("CY order (EUR): €120", () => {
    expect(formatStorePrice(120, "CY")).toBe("€120");
  });

  it("unknown country falls back to USD formatting", () => {
    expect(formatStorePrice(50, null)).toBe("$50");
  });
});

// ---------------------------------------------------------------------------
// setCurrencySnapshot / getCurrencySnapshot — snapshot updates
// ---------------------------------------------------------------------------

describe("setCurrencySnapshot / getCurrencySnapshot", () => {
  it("getCurrencySnapshot returns the most-recently set snapshot", () => {
    const snap: CurrencySnapshot = {
      fallbackCode: "EUR",
      countryToCurrency: {},
      currencies: [
        {
          code: "EUR",
          name: "Euro",
          symbol: "€",
          symbolPosition: "left",
          spaceBetween: false,
          decimals: 2,
        },
      ],
    };
    setCurrencySnapshot(snap);
    expect(getCurrencySnapshot()).toBe(snap);
  });

  it("formatPriceInCurrency reflects the updated snapshot immediately", () => {
    const snapWithJPY: CurrencySnapshot = {
      fallbackCode: "USD",
      countryToCurrency: {},
      currencies: [
        {
          code: "USD",
          name: "US Dollar",
          symbol: "$",
          symbolPosition: "left",
          spaceBetween: false,
          decimals: 2,
        },
        {
          code: "JPY",
          name: "Japanese Yen",
          symbol: "¥",
          symbolPosition: "left",
          spaceBetween: false,
          decimals: 2,
        },
      ],
    };
    setCurrencySnapshot(snapWithJPY);
    expect(formatPriceInCurrency(1000, "JPY")).toBe("¥1000");
  });
});

// ---------------------------------------------------------------------------
// subscribeCurrencySnapshot — listener is called on snapshot change
// ---------------------------------------------------------------------------

describe("subscribeCurrencySnapshot — observer notifications", () => {
  it("calls the listener when the snapshot is updated", () => {
    let callCount = 0;
    const unsub = subscribeCurrencySnapshot(() => { callCount++; });

    setCurrencySnapshot(TEST_SNAPSHOT);
    expect(callCount).toBe(1);

    setCurrencySnapshot(TEST_SNAPSHOT);
    expect(callCount).toBe(2);

    unsub();
  });

  it("stops calling the listener after unsubscribing", () => {
    let callCount = 0;
    const unsub = subscribeCurrencySnapshot(() => { callCount++; });

    setCurrencySnapshot(TEST_SNAPSHOT);
    expect(callCount).toBe(1);

    unsub();

    setCurrencySnapshot(TEST_SNAPSHOT);
    expect(callCount).toBe(1);
  });

  it("multiple independent listeners each receive the notification", () => {
    const counts = [0, 0];
    const unsub0 = subscribeCurrencySnapshot(() => { counts[0]++; });
    const unsub1 = subscribeCurrencySnapshot(() => { counts[1]++; });

    setCurrencySnapshot(TEST_SNAPSHOT);

    expect(counts[0]).toBe(1);
    expect(counts[1]).toBe(1);

    unsub0();
    unsub1();
  });
});
