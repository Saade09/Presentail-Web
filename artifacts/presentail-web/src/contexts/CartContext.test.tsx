// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { DEFAULT_AUTH } from "@/test-utils";
import { AuthOverrideContext } from "@/contexts/AuthContext";

// ---------------------------------------------------------------------------
// Hoist mock factories so vi.mock() factories can reference them.
// ---------------------------------------------------------------------------
const { mockGetStartupItem } = vi.hoisted(() => ({
  mockGetStartupItem: vi.fn(() => null as string | null),
}));

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any import that pulls in CartContext
// or its transitive dependencies.
// ---------------------------------------------------------------------------
vi.mock("@/lib/startupState", () => ({
  getStartupItem: mockGetStartupItem,
}));

vi.mock("@/lib/fbPixel", () => ({ trackFbEvent: vi.fn() }));
vi.mock("@/lib/analytics", async (importOriginal) => {
  const { mockAnalyticsModule } = await import("@/test/analytics-mock");
  return mockAnalyticsModule(importOriginal, { trackWebEvent: vi.fn() });
});

vi.mock("@/lib/useDisplayCurrency", () => ({
  useDisplayCurrency: vi.fn(() => ({ currencyCode: "USD" })),
}));

// LocationContext is only used for analytics; its default value (null) is fine
// because the CartProvider accesses it with optional chaining.

// ---------------------------------------------------------------------------
// Imports AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------
import { CartProvider, useCart, effectivePrice } from "@/contexts/CartContext";
import type { Product } from "@/lib/queries";

// ---------------------------------------------------------------------------
// Minimal product factory — only the fields CartContext actually reads.
// ---------------------------------------------------------------------------
function makeProduct(overrides: Partial<Product> & { id: string; priceValue: number }): Product {
  return {
    wcId: 1,
    name: "Test Product",
    price: String(overrides.priceValue),
    image: null,
    category: null,
    categories: [],
    inStock: true,
    occasions: [],
    slug: overrides.id,
    discountPriceValue: null,
    discountPriceAed: null,
    ...overrides,
  } as unknown as Product;
}

// ---------------------------------------------------------------------------
// Test consumer — exposes CartContext values through data-testid attributes.
// ---------------------------------------------------------------------------
function CartSummary() {
  const { subtotal, itemCount, isHydrated } = useCart();
  return (
    <>
      <span data-testid="subtotal">{subtotal}</span>
      <span data-testid="item-count">{itemCount}</span>
      {isHydrated && <span data-testid="hydrated">yes</span>}
    </>
  );
}

/** Wraps CartProvider with the minimum required context providers. */
function renderCart() {
  return render(
    <AuthOverrideContext.Provider value={DEFAULT_AUTH}>
      <CartProvider>
        <CartSummary />
      </CartProvider>
    </AuthOverrideContext.Provider>,
  );
}

// ---------------------------------------------------------------------------
// effectivePrice — pure-function tests (no React required)
// ---------------------------------------------------------------------------

describe("effectivePrice — picks discount price when active", () => {
  it("returns discountPriceValue when it is a positive number", () => {
    const product = makeProduct({ id: "p1", priceValue: 65, discountPriceValue: 40 });
    expect(effectivePrice(product)).toBe(40);
  });

  it("returns priceValue when discountPriceValue is null", () => {
    const product = makeProduct({ id: "p2", priceValue: 65, discountPriceValue: null });
    expect(effectivePrice(product)).toBe(65);
  });

  it("returns priceValue when discountPriceValue is undefined", () => {
    const product = makeProduct({ id: "p3", priceValue: 65 });
    // discountPriceValue is absent/undefined — falls back to priceValue
    expect(effectivePrice(product)).toBe(65);
  });

  it("returns priceValue when discountPriceValue is zero (sale ended / no discount)", () => {
    // Zero must NOT be treated as an active discount — it's the sentinel value
    // used by the OS API when a product's sale has ended.
    const product = makeProduct({ id: "p4", priceValue: 65, discountPriceValue: 0 });
    expect(effectivePrice(product)).toBe(65);
  });

  it("returns discountPriceValue when it is a small positive value (e.g. $1)", () => {
    const product = makeProduct({ id: "p5", priceValue: 50, discountPriceValue: 1 });
    expect(effectivePrice(product)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CartProvider — subtotal = sum of effectivePrice(product) × quantity
// ---------------------------------------------------------------------------

describe("CartProvider — subtotal is sum of effective prices × quantities", () => {
  beforeEach(() => {
    mockGetStartupItem.mockReturnValue(null);
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("subtotal is 0 when the cart is empty", async () => {
    renderCart();
    await waitFor(() => screen.getByTestId("hydrated"));
    expect(screen.getByTestId("subtotal").textContent).toBe("0");
    expect(screen.getByTestId("item-count").textContent).toBe("0");
  });

  it("subtotal uses discountPriceValue when it is active (>0)", async () => {
    // Product with discountPriceValue=30, priceValue=50; quantity=2
    // effectivePrice = 30  →  subtotal = 30 × 2 = 60
    const items = [
      { product: makeProduct({ id: "p1", priceValue: 50, discountPriceValue: 30 }), quantity: 2 },
    ];
    mockGetStartupItem.mockReturnValue(JSON.stringify(items));

    renderCart();
    await waitFor(() => screen.getByTestId("hydrated"));

    expect(screen.getByTestId("subtotal").textContent).toBe("60");
    expect(screen.getByTestId("item-count").textContent).toBe("2");
  });

  it("subtotal uses priceValue when discountPriceValue is null (no active sale)", async () => {
    // Product with discountPriceValue=null, priceValue=80; quantity=1
    // effectivePrice = 80  →  subtotal = 80 × 1 = 80
    const items = [
      { product: makeProduct({ id: "p2", priceValue: 80, discountPriceValue: null }), quantity: 1 },
    ];
    mockGetStartupItem.mockReturnValue(JSON.stringify(items));

    renderCart();
    await waitFor(() => screen.getByTestId("hydrated"));

    expect(screen.getByTestId("subtotal").textContent).toBe("80");
  });

  it("subtotal uses priceValue when discountPriceValue is zero (sale ended)", async () => {
    // discountPriceValue=0 must NOT reduce the price — the sale is over.
    // priceValue=65; quantity=3  →  subtotal = 65 × 3 = 195
    const items = [
      { product: makeProduct({ id: "p3", priceValue: 65, discountPriceValue: 0 }), quantity: 3 },
    ];
    mockGetStartupItem.mockReturnValue(JSON.stringify(items));

    renderCart();
    await waitFor(() => screen.getByTestId("hydrated"));

    expect(screen.getByTestId("subtotal").textContent).toBe("195");
  });

  it("subtotal sums effective prices across multiple items with mixed discount states", async () => {
    // Item A: discountPriceValue=30, priceValue=50, qty=2  →  30 × 2 = 60
    // Item B: discountPriceValue=null, priceValue=80, qty=1 →  80 × 1 = 80
    // Item C: discountPriceValue=0, priceValue=65, qty=1   →  65 × 1 = 65  (sale ended)
    // Expected subtotal = 60 + 80 + 65 = 205
    const items = [
      { product: makeProduct({ id: "p1", priceValue: 50, discountPriceValue: 30 }), quantity: 2 },
      { product: makeProduct({ id: "p2", priceValue: 80, discountPriceValue: null }), quantity: 1 },
      { product: makeProduct({ id: "p3", priceValue: 65, discountPriceValue: 0 }), quantity: 1 },
    ];
    mockGetStartupItem.mockReturnValue(JSON.stringify(items));

    renderCart();
    await waitFor(() => screen.getByTestId("hydrated"));

    expect(screen.getByTestId("subtotal").textContent).toBe("205");
    expect(screen.getByTestId("item-count").textContent).toBe("4");
  });

  it("subtotal reflects quantity correctly (multiple units of the same discounted item)", async () => {
    // discountPriceValue=25, qty=4  →  25 × 4 = 100
    const items = [
      { product: makeProduct({ id: "p1", priceValue: 40, discountPriceValue: 25 }), quantity: 4 },
    ];
    mockGetStartupItem.mockReturnValue(JSON.stringify(items));

    renderCart();
    await waitFor(() => screen.getByTestId("hydrated"));

    expect(screen.getByTestId("subtotal").textContent).toBe("100");
  });
});
