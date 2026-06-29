/**
 * Tests for sale price helpers: isDiscountActive, computeProductCardSaleDisplay,
 * and computeCartRowSaleDisplay.
 *
 * These helpers centralise the branching logic used by FullCartView (CartItemRow),
 * checkout (CollapsibleOrderSummary), and ProductCard. The tests verify three
 * key guarantees required by the currency-switch scenario:
 *
 *   1. AED shoppers see the AED-native discount price (saleNative=true,
 *      saleUnitPrice = discountPriceAed — no FX conversion required).
 *   2. Non-AED shoppers see the USD-based discount price (saleNative=false,
 *      saleUnitPrice = discountPriceValue — FX-converted by <Price>).
 *   3. When no discount is active the regular price is shown alone (onSale=false,
 *      no strikethrough).
 *
 * A currency-switch regression block tests the same product data under AED, USD,
 * and EUR in sequence, confirming the helpers re-evaluate cleanly.
 */

import { describe, expect, it } from "vitest";
import {
  isDiscountActive,
  computeProductCardSaleDisplay,
  computeCartRowSaleDisplay,
} from "./salePriceHelpers";

// ===========================================================================
// isDiscountActive — boolean gate
// ===========================================================================

describe("isDiscountActive — AED currency", () => {
  it("returns true when discountPriceAed is positive and discountPriceValue is absent", () => {
    expect(isDiscountActive("AED", undefined, 367)).toBe(true);
  });

  it("returns true when discountPriceAed is positive and discountPriceValue is null", () => {
    expect(isDiscountActive("AED", null, 367)).toBe(true);
  });

  it("returns true when only discountPriceValue (USD) is present — AED branch honours USD discount", () => {
    expect(isDiscountActive("AED", 80, undefined)).toBe(true);
  });

  it("returns true when only discountPriceValue (USD) is present and discountPriceAed is null", () => {
    expect(isDiscountActive("AED", 80, null)).toBe(true);
  });

  it("returns true when both discountPriceAed and discountPriceValue are positive", () => {
    expect(isDiscountActive("AED", 80, 294)).toBe(true);
  });

  it("returns false when both prices are absent (undefined)", () => {
    expect(isDiscountActive("AED", undefined, undefined)).toBe(false);
  });

  it("returns false when both prices are null", () => {
    expect(isDiscountActive("AED", null, null)).toBe(false);
  });

  it("returns false when both prices are zero", () => {
    expect(isDiscountActive("AED", 0, 0)).toBe(false);
  });

  it("returns true when discountPriceAed is positive but discountPriceValue is zero", () => {
    expect(isDiscountActive("AED", 0, 367)).toBe(true);
  });

  it("returns true when discountPriceValue is positive but discountPriceAed is zero", () => {
    expect(isDiscountActive("AED", 80, 0)).toBe(true);
  });

  it("returns false when discountPriceAed is negative (treated as no discount)", () => {
    expect(isDiscountActive("AED", null, -10)).toBe(false);
  });

  it("returns false when discountPriceValue is negative and discountPriceAed is absent", () => {
    expect(isDiscountActive("AED", -5, null)).toBe(false);
  });
});

describe("isDiscountActive — USD currency (Lebanon)", () => {
  it("returns true when discountPriceValue is positive", () => {
    expect(isDiscountActive("USD", 80, undefined)).toBe(true);
  });

  it("returns false when only discountPriceAed is positive (AED field ignored for USD)", () => {
    expect(isDiscountActive("USD", null, 367)).toBe(false);
  });

  it("returns false when only discountPriceAed is positive and discountPriceValue is zero", () => {
    expect(isDiscountActive("USD", 0, 367)).toBe(false);
  });

  it("returns true when both prices are positive (USD field controls)", () => {
    expect(isDiscountActive("USD", 80, 294)).toBe(true);
  });

  it("returns false when both prices are absent", () => {
    expect(isDiscountActive("USD", undefined, undefined)).toBe(false);
  });

  it("returns false when discountPriceValue is zero", () => {
    expect(isDiscountActive("USD", 0, null)).toBe(false);
  });

  it("returns false when discountPriceValue is negative", () => {
    expect(isDiscountActive("USD", -10, null)).toBe(false);
  });
});

describe("isDiscountActive — EUR currency (Cyprus)", () => {
  it("returns true when discountPriceValue is positive", () => {
    expect(isDiscountActive("EUR", 80, undefined)).toBe(true);
  });

  it("returns false when only discountPriceAed is positive", () => {
    expect(isDiscountActive("EUR", null, 294)).toBe(false);
  });

  it("returns false when no discounts are present", () => {
    expect(isDiscountActive("EUR", null, null)).toBe(false);
  });
});

// ===========================================================================
// computeProductCardSaleDisplay — ProductCard view-model
// Tests verify the displayed numeric source under each currency:
//   AED → saleNative=true, saleUnitPrice=discountPriceAed (no FX conversion)
//   non-AED → saleNative=false, saleUnitPrice=discountPriceValue (FX-converted by <Price>)
//   no discount → onSale=false, no strikethrough
// ===========================================================================

describe("computeProductCardSaleDisplay — AED currency (native price path)", () => {
  it("uses discountPriceAed as saleUnitPrice with saleNative=true", () => {
    const result = computeProductCardSaleDisplay("AED", 100, 80, 294);
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.saleNative).toBe(true);
      expect(result.saleUnitPrice).toBe(294);
      expect(result.regularUnitPrice).toBe(100);
    }
  });

  it("falls back to USD price (saleNative=false) when discountPriceAed is absent but discountPriceValue is set", () => {
    const result = computeProductCardSaleDisplay("AED", 100, 80, null);
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.saleNative).toBe(false);
      expect(result.saleUnitPrice).toBe(80);
      expect(result.regularUnitPrice).toBe(100);
    }
  });

  it("falls back to USD price when discountPriceAed is 0 (treated as absent)", () => {
    const result = computeProductCardSaleDisplay("AED", 100, 80, 0);
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.saleNative).toBe(false);
      expect(result.saleUnitPrice).toBe(80);
    }
  });

  it("returns onSale=false when both discount fields are absent", () => {
    const result = computeProductCardSaleDisplay("AED", 100, null, null);
    expect(result.onSale).toBe(false);
    expect(result.regularUnitPrice).toBe(100);
  });
});

describe("computeProductCardSaleDisplay — USD currency (FX-converted path)", () => {
  it("uses discountPriceValue as saleUnitPrice with saleNative=false", () => {
    const result = computeProductCardSaleDisplay("USD", 100, 80, 294);
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.saleNative).toBe(false);
      expect(result.saleUnitPrice).toBe(80);
      expect(result.regularUnitPrice).toBe(100);
    }
  });

  it("returns onSale=false when only discountPriceAed is set (AED field ignored for USD)", () => {
    const result = computeProductCardSaleDisplay("USD", 100, null, 294);
    expect(result.onSale).toBe(false);
    expect(result.regularUnitPrice).toBe(100);
  });

  it("returns onSale=false when neither discount field is set", () => {
    const result = computeProductCardSaleDisplay("USD", 100, null, null);
    expect(result.onSale).toBe(false);
  });
});

describe("computeProductCardSaleDisplay — EUR currency (FX-converted path)", () => {
  it("uses discountPriceValue with saleNative=false for EUR", () => {
    const result = computeProductCardSaleDisplay("EUR", 100, 80, 294);
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.saleNative).toBe(false);
      expect(result.saleUnitPrice).toBe(80);
    }
  });

  it("returns onSale=false when only discountPriceAed is set", () => {
    const result = computeProductCardSaleDisplay("EUR", 100, null, 294);
    expect(result.onSale).toBe(false);
  });
});

// ===========================================================================
// computeCartRowSaleDisplay — CartItemRow / CollapsibleOrderSummary view-model
// Both components receive lineTotal (USD, FX-converted by <Price>) from
// CartContext and display a strikethrough regularLineTotal when on sale.
// ===========================================================================

describe("computeCartRowSaleDisplay — AED currency", () => {
  it("returns onSale=true with the discounted lineTotal and regularLineTotal for strikethrough", () => {
    const result = computeCartRowSaleDisplay("AED", 100, 2, 160, 80, 294);
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.lineTotal).toBe(160);
      expect(result.regularLineTotal).toBe(200);
    }
  });

  it("AED-only discount (no USD price) still marks item on sale", () => {
    const result = computeCartRowSaleDisplay("AED", 100, 1, 100, null, 294);
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.regularLineTotal).toBe(100);
    }
  });

  it("returns onSale=false when no discount fields are set", () => {
    const result = computeCartRowSaleDisplay("AED", 100, 2, 200, null, null);
    expect(result.onSale).toBe(false);
    expect(result.lineTotal).toBe(200);
  });
});

describe("computeCartRowSaleDisplay — USD currency", () => {
  it("returns onSale=true when discountPriceValue is set", () => {
    const result = computeCartRowSaleDisplay("USD", 100, 3, 240, 80, null);
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.lineTotal).toBe(240);
      expect(result.regularLineTotal).toBe(300);
    }
  });

  it("returns onSale=false when only discountPriceAed is set (AED field ignored for USD)", () => {
    const result = computeCartRowSaleDisplay("USD", 100, 2, 200, null, 294);
    expect(result.onSale).toBe(false);
    expect(result.lineTotal).toBe(200);
  });
});

describe("computeCartRowSaleDisplay — EUR currency", () => {
  it("returns onSale=true when discountPriceValue is set", () => {
    const result = computeCartRowSaleDisplay("EUR", 100, 1, 80, 80, null);
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.regularLineTotal).toBe(100);
    }
  });
});

// ===========================================================================
// Currency-switch regression suite
// Same product data, evaluated under AED → USD → EUR in sequence.
// This is the scenario that breaks when the branch is evaluated once at mount.
// ===========================================================================

describe("currency-switch regression — ProductCard view-model", () => {
  const product = {
    priceValue: 100,
    discountPriceValue: 80,
    discountPriceAed: 294,
  };

  it("AED: uses AED-native price (saleNative=true, saleUnitPrice=294)", () => {
    const result = computeProductCardSaleDisplay(
      "AED", product.priceValue, product.discountPriceValue, product.discountPriceAed,
    );
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.saleNative).toBe(true);
      expect(result.saleUnitPrice).toBe(294);
    }
  });

  it("USD: uses USD discount price (saleNative=false, saleUnitPrice=80)", () => {
    const result = computeProductCardSaleDisplay(
      "USD", product.priceValue, product.discountPriceValue, product.discountPriceAed,
    );
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.saleNative).toBe(false);
      expect(result.saleUnitPrice).toBe(80);
    }
  });

  it("EUR: uses USD discount price (saleNative=false, saleUnitPrice=80)", () => {
    const result = computeProductCardSaleDisplay(
      "EUR", product.priceValue, product.discountPriceValue, product.discountPriceAed,
    );
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.saleNative).toBe(false);
      expect(result.saleUnitPrice).toBe(80);
    }
  });

  it("regularUnitPrice is always the non-discounted priceValue regardless of currency", () => {
    for (const code of ["AED", "USD", "EUR"]) {
      const result = computeProductCardSaleDisplay(
        code, product.priceValue, product.discountPriceValue, product.discountPriceAed,
      );
      expect(result.regularUnitPrice).toBe(product.priceValue);
    }
  });
});

describe("currency-switch regression — AED-only product (no USD discount)", () => {
  const product = {
    priceValue: 100,
    discountPriceValue: null,
    discountPriceAed: 294,
  };

  it("AED: shows sale (AED-native price, saleNative=true)", () => {
    const result = computeProductCardSaleDisplay(
      "AED", product.priceValue, product.discountPriceValue, product.discountPriceAed,
    );
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.saleNative).toBe(true);
      expect(result.saleUnitPrice).toBe(294);
    }
  });

  it("USD: no sale shown (USD discount field is null — AED price not honoured for USD)", () => {
    const result = computeProductCardSaleDisplay(
      "USD", product.priceValue, product.discountPriceValue, product.discountPriceAed,
    );
    expect(result.onSale).toBe(false);
  });

  it("EUR: no sale shown", () => {
    const result = computeProductCardSaleDisplay(
      "EUR", product.priceValue, product.discountPriceValue, product.discountPriceAed,
    );
    expect(result.onSale).toBe(false);
  });
});

describe("currency-switch regression — no discount product", () => {
  const product = {
    priceValue: 100,
    discountPriceValue: null,
    discountPriceAed: null,
  };

  it("returns onSale=false for all currencies — no strikethrough shown", () => {
    for (const code of ["AED", "USD", "EUR", "GBP"]) {
      const result = computeProductCardSaleDisplay(
        code, product.priceValue, product.discountPriceValue, product.discountPriceAed,
      );
      expect(result.onSale).toBe(false);
      expect(result.regularUnitPrice).toBe(product.priceValue);
    }
  });
});

describe("currency-switch regression — CartItemRow/CollapsibleOrderSummary", () => {
  const product = {
    priceValue: 100,
    discountPriceValue: 80,
    discountPriceAed: 294,
  };
  const qty = 2;
  const lineTotalUsd = product.discountPriceValue * qty;

  it("AED: onSale=true, lineTotal and regularLineTotal provided for strikethrough", () => {
    const result = computeCartRowSaleDisplay(
      "AED", product.priceValue, qty, lineTotalUsd,
      product.discountPriceValue, product.discountPriceAed,
    );
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.lineTotal).toBe(lineTotalUsd);
      expect(result.regularLineTotal).toBe(product.priceValue * qty);
    }
  });

  it("USD: onSale=true, lineTotal and regularLineTotal provided for strikethrough", () => {
    const result = computeCartRowSaleDisplay(
      "USD", product.priceValue, qty, lineTotalUsd,
      product.discountPriceValue, product.discountPriceAed,
    );
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.lineTotal).toBe(lineTotalUsd);
      expect(result.regularLineTotal).toBe(product.priceValue * qty);
    }
  });

  it("EUR: onSale=true, same values as USD (EUR FX done by <Price> at render time)", () => {
    const result = computeCartRowSaleDisplay(
      "EUR", product.priceValue, qty, lineTotalUsd,
      product.discountPriceValue, product.discountPriceAed,
    );
    expect(result.onSale).toBe(true);
    if (result.onSale) {
      expect(result.lineTotal).toBe(lineTotalUsd);
      expect(result.regularLineTotal).toBe(product.priceValue * qty);
    }
  });

  it("switching from AED to USD: same onSale result when both discount fields are set", () => {
    const aed = computeCartRowSaleDisplay("AED", product.priceValue, qty, lineTotalUsd,
      product.discountPriceValue, product.discountPriceAed);
    const usd = computeCartRowSaleDisplay("USD", product.priceValue, qty, lineTotalUsd,
      product.discountPriceValue, product.discountPriceAed);
    expect(aed.onSale).toBe(usd.onSale);
  });
});
