// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Mock useFxRates — FormattedPrice reads this directly (outside the currency
// override context) to convert USD → AED for the AED-native and AED-fallback
// display paths. useCurrenciesData is also called inside useDisplayCurrency
// but is safe to stub with a no-op return because the currency override
// context already supplies currencyCode / formatPrice.
//
// vi.hoisted() is required here: vi.mock() factories are hoisted to the top
// of the file by Vitest, so any variables they reference must be initialised
// before that hoisting runs. vi.hoisted() guarantees exactly that.
// ---------------------------------------------------------------------------

const { mockUseFxRates, mockUseCurrenciesData } = vi.hoisted(() => ({
  mockUseFxRates: vi.fn(),
  mockUseCurrenciesData: vi.fn(() => ({ data: null })),
}));

vi.mock("@/lib/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries")>();
  return {
    ...actual,
    useFxRates: mockUseFxRates,
    useCurrenciesData: mockUseCurrenciesData,
  };
});

// Import component + helpers AFTER the vi.mock declarations so Vitest's
// hoisting picks up the mocks before the module graph is evaluated.
import { SalePrice, isDiscountActive } from "./SalePrice";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Renders SalePrice with a USD display-currency context and stubbed FX. */
function renderUsd(
  priceValue: number,
  discountPriceValue?: number | null,
  discountPriceAed?: number | null,
) {
  mockUseFxRates.mockReturnValue({ data: { rates: { AED: 3.67, EUR: 0.92 } } });
  return renderWithProviders(
    <SalePrice
      priceValue={priceValue}
      discountPriceValue={discountPriceValue}
      discountPriceAed={discountPriceAed}
    />,
    { currency: { currencyCode: "USD", formatPrice: (v: number) => `$${v}` } },
  );
}

/** Renders SalePrice with an AED display-currency context and stubbed FX. */
function renderAed(
  priceValue: number,
  discountPriceValue?: number | null,
  discountPriceAed?: number | null,
  aedRate = 3.67,
) {
  mockUseFxRates.mockReturnValue({ data: { rates: { AED: aedRate } } });
  return renderWithProviders(
    <SalePrice
      priceValue={priceValue}
      discountPriceValue={discountPriceValue}
      discountPriceAed={discountPriceAed}
    />,
    {
      currency: {
        currencyCode: "AED",
        formatPrice: (v: number) => `$${v}`,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// isDiscountActive — pure-function tests (no React required)
// ---------------------------------------------------------------------------

describe("isDiscountActive — USD currency", () => {
  it("returns false when both discount fields are absent", () => {
    expect(isDiscountActive("USD")).toBe(false);
  });

  it("returns false when discountPriceValue is null", () => {
    expect(isDiscountActive("USD", null)).toBe(false);
  });

  it("returns false when discountPriceValue is zero", () => {
    expect(isDiscountActive("USD", 0)).toBe(false);
  });

  it("returns true when discountPriceValue is a positive number", () => {
    expect(isDiscountActive("USD", 40)).toBe(true);
  });

  it("ignores discountPriceAed for non-AED currencies", () => {
    expect(isDiscountActive("USD", null, 150)).toBe(false);
    expect(isDiscountActive("EUR", null, 150)).toBe(false);
  });
});

describe("isDiscountActive — AED currency", () => {
  it("returns false when both discount fields are absent", () => {
    expect(isDiscountActive("AED")).toBe(false);
  });

  it("returns true when discountPriceAed is positive (native AED path)", () => {
    expect(isDiscountActive("AED", null, 150)).toBe(true);
  });

  it("returns true when discountPriceValue is positive (USD-converted fallback path)", () => {
    expect(isDiscountActive("AED", 40, null)).toBe(true);
  });

  it("returns true when both discount fields are positive", () => {
    expect(isDiscountActive("AED", 40, 150)).toBe(true);
  });

  it("returns false when discountPriceAed is zero and discountPriceValue is absent", () => {
    expect(isDiscountActive("AED", null, 0)).toBe(false);
  });

  it("returns false when discountPriceValue is zero and discountPriceAed is absent (sale ended, no USD fallback)", () => {
    // Zero is the OS API sentinel for 'no active discount'; must not be treated as $0 sale price.
    expect(isDiscountActive("AED", 0, null)).toBe(false);
  });

  it("returns false when both discountPriceAed and discountPriceValue are zero (sale fully ended)", () => {
    expect(isDiscountActive("AED", 0, 0)).toBe(false);
  });

  it("returns true when discountPriceAed is zero but discountPriceValue is positive (USD fallback active)", () => {
    // Native AED discount ended (0) but the USD discount is still live → discount is active.
    expect(isDiscountActive("AED", 40, 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SalePrice component — no-discount case
// ---------------------------------------------------------------------------

describe("SalePrice — no discount", () => {
  it("renders a plain price with no strikethrough when discount is absent", () => {
    renderUsd(65);
    expect(screen.getByText("$65")).toBeTruthy();
    expect(document.querySelector(".line-through")).toBeNull();
  });

  it("renders a plain price when discountPriceValue is zero (treated as no discount)", () => {
    renderUsd(65, 0);
    expect(screen.getByText("$65")).toBeTruthy();
    expect(document.querySelector(".line-through")).toBeNull();
  });

  it("renders a plain price when discountPriceValue is null", () => {
    renderUsd(50, null);
    expect(screen.getByText("$50")).toBeTruthy();
    expect(document.querySelector(".line-through")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SalePrice component — USD discount
// ---------------------------------------------------------------------------

describe("SalePrice — USD discount", () => {
  it("shows the discounted sale price prominently", () => {
    renderUsd(65, 40);
    expect(screen.getByText("$40")).toBeTruthy();
  });

  it("renders the regular price with a strikethrough", () => {
    renderUsd(65, 40);
    const strikethrough = document.querySelector(".line-through");
    expect(strikethrough).toBeTruthy();
    expect(strikethrough!.textContent).toContain("$65");
  });

  it("sale price and regular price are both present simultaneously", () => {
    renderUsd(65, 40);
    expect(screen.getByText("$40")).toBeTruthy();
    expect(document.querySelector(".line-through")!.textContent).toContain("$65");
  });
});

// ---------------------------------------------------------------------------
// SalePrice component — AED discount with a native AED value
// ---------------------------------------------------------------------------

describe("SalePrice — AED with native AED discount price", () => {
  it("displays the native AED amount (no FX conversion)", () => {
    // discountPriceAed=140 → rendered directly as "140" via aedFormatNum,
    // not converted from USD via the FX rate.
    renderAed(65, null, 140, 3.67);
    expect(screen.getByText(/140/)).toBeTruthy();
  });

  it("renders the regular price with a strikethrough (converted via FX)", () => {
    // priceValue=65 USD × 3.67 AED/USD = 238.55 → roundToNearestFive → 240 AED
    renderAed(65, null, 140, 3.67);
    const strikethrough = document.querySelector(".line-through");
    expect(strikethrough).toBeTruthy();
    expect(strikethrough!.textContent).toContain("240");
  });

  it("does not show a dollar sign (all amounts are AED)", () => {
    renderAed(65, null, 140, 3.67);
    expect(document.body.textContent).not.toContain("$");
  });

  it("works with large AED amounts — comma-formatted", () => {
    // 1500 AED → "1,500"
    renderAed(500, null, 1500, 3.67);
    expect(screen.getByText(/1,500/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SalePrice component — AED fallback when FX rate is zero
//
// When the live FX rate hasn't loaded yet (rate=0), SalePrice should still
// render a valid price rather than showing 0 AED or crashing. The expected
// behaviour: FormattedPrice falls through its AED branch (rate guard fails)
// and calls formatPrice(usdValue), which returns the USD amount as a fallback.
// ---------------------------------------------------------------------------

describe("SalePrice — AED fallback when FX rate is zero", () => {
  it("renders a price for the discount even when the AED rate is zero", () => {
    // discountPriceValue=40, discountPriceAed=null, rate=0 →
    // FormattedPrice skips the AED branch (rate > 0 guard) and falls through
    // to formatPrice(40) = "$40" (USD-denominated fallback from context).
    renderAed(65, 40, null, 0);
    const text = document.body.textContent ?? "";
    // Something must be displayed — the component must not be empty.
    expect(text.length).toBeGreaterThan(0);
    // The discount amount (40) must appear in some form.
    expect(text).toMatch(/40/);
  });

  it("renders a strikethrough for the regular price even when the AED rate is zero", () => {
    renderAed(65, 40, null, 0);
    const strikethrough = document.querySelector(".line-through");
    expect(strikethrough).toBeTruthy();
    // Regular price (65) must appear inside the strikethrough.
    expect(strikethrough!.textContent).toMatch(/65/);
  });

  it("does not show '0' as the converted price when rate is zero", () => {
    // If conversion were naively applied (65 * 0 = 0), we'd see "0 AED".
    // The fallback path must avoid displaying a zero amount.
    renderAed(65, 40, null, 0);
    // The discount element should not show just "0" next to a currency symbol.
    // We check that "0" by itself is not the sole text content of the container.
    const firstPricePart = document.querySelector("span > span");
    if (firstPricePart) {
      expect(firstPricePart.textContent?.trim()).not.toBe("0");
    }
  });
});
