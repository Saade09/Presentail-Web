// @vitest-environment jsdom

/**
 * Tests for the redesigned "Added to your cart" popup.
 *
 * Covers the spec's key scenarios: added-product confirmation header (line
 * price, not cart total), full-cart summary with pre-existing items,
 * default Recommended category, category switching, upsell add success +
 * duplicate-click protection, out-of-stock exclusion, footer actions
 * ("Continue to cart", never checkout), card-message helper pluralization,
 * compact unlocked free-delivery banner, and once-per-interaction analytics.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { renderWithProviders, DEFAULT_CART } from "@/test-utils";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const setLocationMock = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/", setLocationMock],
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const trackWebEventMock = vi.fn();
const trackEventMock = vi.fn();
vi.mock("@/lib/analytics", () => ({
  trackWebEvent: (...args: unknown[]) => trackWebEventMock(...args),
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

vi.mock("@workspace/delivery", () => ({
  freeDeliveryThresholdUsd: () => 0,
}));

vi.mock("@/contexts/LocationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/LocationContext")>();
  return {
    ...actual,
    useLocationSelection: () => ({
      countryCode: "LB",
      cityId: "beirut",
      city: { freeDeliveryThresholdUsd: 100 },
      country: null,
    }),
  };
});

vi.mock("@/components/product/useDeliveryConfig", () => ({
  useDeliveryConfig: () => ({
    freeDeliveryEnabled: true,
    freeDeliveryThresholdUsd: 100,
    freeDeliveryThreshold: "$100",
    expressDeliveryTimeLabel: "Arrives in 90 minutes",
  }),
}));

vi.mock("@/components/delivery/deliveryPromise", () => ({
  useDeliveryPromise: () => ({
    type: "standard",
    title: "Standard delivery",
    arrival: "Arrives today, 2–5 PM",
    caption: "Scheduled delivery window",
    summary: "Standard delivery · Today, 2–5 PM",
  }),
}));

vi.mock("@/components/delivery/DeliveryDateRow", () => ({
  DeliveryDateRow: () => (
    <button type="button" data-testid="delivery-date-row">
      Change
    </button>
  ),
}));

vi.mock("@/components/FormattedPrice", () => ({
  FormattedPrice: ({ usdValue }: { usdValue: number }) => (
    <span data-testid="formatted-price">${usdValue}</span>
  ),
}));

vi.mock("@/lib/useDisplayCurrency", () => ({
  useDisplayCurrency: () => ({
    currencyCode: "USD",
    formatPrice: (v: number) => `$${v}`,
  }),
}));

const useProductsMock = vi.fn();
vi.mock("@/lib/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries")>();
  return {
    ...actual,
    useProducts: (...args: unknown[]) => useProductsMock(...args),
  };
});

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { AddToCartUpsellModal } from "./AddToCartUpsellModal";
import type { Product } from "@/lib/queries";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProduct(over: Partial<Product> & { id: string; name: string }): Product {
  return {
    priceValue: 10,
    inStock: true,
    image: { uri: `https://img/${over.id}.jpg` },
    ...over,
  } as unknown as Product;
}

const balloon = makeProduct({ id: "p-balloon", name: "Red Heart Balloon", priceValue: 8 });
const chocoBox = makeProduct({ id: "p-choco", name: "Classic Chocolate Box", priceValue: 25, inStock: false });
const bear = makeProduct({ id: "p-bear", name: "Birthday Bear", priceValue: 20 });
const candle = makeProduct({ id: "p-candle", name: "Red Happy Birthday Candle", priceValue: 12 });
const hbBalloon = makeProduct({ id: "p-hb", name: "Happy Birthday! Balloon", priceValue: 9 });
const snakePlant = makeProduct({ id: "p-plant", name: "Snake Plant", priceValue: 30 });

const CATALOG = [balloon, chocoBox, bear, candle, hbBalloon, snakePlant];

const mainGift = makeProduct({
  id: "p-main",
  name: "Crimson Rose Vase",
  priceValue: 40,
  hasLetterField: true,
} as Partial<Product> & { id: string; name: string });

const otherGift = makeProduct({
  id: "p-other",
  name: "Luxury Gift Box",
  priceValue: 35,
  hasLetterField: true,
} as Partial<Product> & { id: string; name: string });

function cartWith(items: { product: Product; quantity: number }[], addItem = vi.fn()) {
  const subtotal = items.reduce((a, i) => a + (i.product.priceValue ?? 0) * i.quantity, 0);
  const itemCount = items.reduce((a, i) => a + i.quantity, 0);
  return { ...DEFAULT_CART, items, subtotal, itemCount, addItem };
}

function renderModal(opts: {
  cart?: ReturnType<typeof cartWith>;
  open?: boolean;
  onClose?: () => void;
} = {}) {
  return renderWithProviders(
    <AddToCartUpsellModal
      open={opts.open ?? true}
      onClose={opts.onClose ?? vi.fn()}
      addedProduct={mainGift}
      addedQuantity={1}
    />,
    { cart: opts.cart ?? cartWith([{ product: mainGift, quantity: 1 }]) },
  );
}

const webEventsOf = (type: string) =>
  trackWebEventMock.mock.calls.filter((c) => (c[0] as { type: string }).type === type);

beforeEach(() => {
  vi.clearAllMocks();
  useProductsMock.mockReturnValue({ data: { products: CATALOG }, isLoading: false });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AddToCartUpsellModal (redesign)", () => {
  it("shows the added product name, quantity and line price — not the cart total", () => {
    const cart = cartWith([
      { product: otherGift, quantity: 1 },
      { product: mainGift, quantity: 1 },
    ]);
    renderModal({ cart });

    const line = screen.getByTestId("upsell-modal-added-line");
    expect(line.textContent).toContain("Crimson Rose Vase");
    expect(line.textContent).toContain("cart.upsells.modal.qty");

    // Header price is the line price ($40), not the $75 cart total.
    const headerPrice = within(screen.getByTestId("upsell-modal-added-price"));
    expect(headerPrice.getByTestId("formatted-price").textContent).toBe("$40");

    // The separate summary row carries the full cart total and item count.
    const summary = screen.getByTestId("upsell-modal-cart-summary");
    expect(summary.textContent).toContain("cart.upsells.modal.summaryOther");
    expect(within(summary).getByTestId("formatted-price").textContent).toBe("$75");
  });

  it("uses singular summary copy for a single-item cart", () => {
    renderModal({ cart: cartWith([{ product: mainGift, quantity: 1 }]) });
    expect(screen.getByTestId("upsell-modal-cart-summary").textContent).toContain(
      "cart.upsells.modal.summaryOne",
    );
  });

  it("shows the compact unlocked banner (no progress bar) when the threshold is met", () => {
    const cart = cartWith([{ product: mainGift, quantity: 3 }]); // $120 >= $100
    renderModal({ cart });
    expect(screen.getByTestId("free-delivery-banner-compact-unlocked")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("keeps the progress banner when below the threshold", () => {
    renderModal({ cart: cartWith([{ product: mainGift, quantity: 1 }]) }); // $40 < $100
    expect(screen.queryByTestId("free-delivery-banner-compact-unlocked")).toBeNull();
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("defaults to Recommended, shows 3 cards, and excludes out-of-stock products", () => {
    renderModal();
    const recTab = screen.getByTestId("upsell-modal-tab-recommended");
    expect(recTab.getAttribute("aria-selected")).toBe("true");

    // Chocolate box is out of stock → skipped; next in curated order fills in.
    expect(screen.getByTestId("upsell-modal-card-p-balloon")).toBeTruthy();
    expect(screen.queryByTestId("upsell-modal-card-p-choco")).toBeNull();
    expect(screen.getByTestId("upsell-modal-card-p-bear")).toBeTruthy();
    expect(screen.getByTestId("upsell-modal-card-p-candle")).toBeTruthy();
    // Only three cards render.
    expect(document.querySelectorAll('[data-testid^="upsell-modal-card-"]').length).toBe(3);
  });

  it("switches category, updates cards, and fires upsell_category_selected once", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("upsell-modal-tab-plants"));
    expect(screen.getByTestId("upsell-modal-card-p-plant")).toBeTruthy();
    expect(webEventsOf("upsell_category_selected").length).toBe(1);
    // Re-clicking the active chip does not re-fire.
    fireEvent.click(screen.getByTestId("upsell-modal-tab-plants"));
    expect(webEventsOf("upsell_category_selected").length).toBe(1);
  });

  it("adds an upsell: calls addItem once, fires clicked+succeeded, keeps legacy event", () => {
    const addItem = vi.fn();
    renderModal({ cart: cartWith([{ product: mainGift, quantity: 1 }], addItem) });

    fireEvent.click(screen.getByTestId("upsell-modal-add-p-balloon"));
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ id: "p-balloon" }), 1);
    expect(webEventsOf("upsell_add_clicked").length).toBe(1);
    expect(webEventsOf("upsell_add_succeeded").length).toBe(1);
    const succeeded = webEventsOf("upsell_add_succeeded")[0][0] as {
      properties: Record<string, unknown>;
    };
    expect(succeeded.properties.cartTotalBeforeUsd).toBe(40);
    expect(succeeded.properties.cartTotalAfterUsd).toBe(48);
    expect(trackEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "upsell_item_added", productId: "p-balloon" }),
    );
  });

  it("shows ✓ Added and blocks duplicate clicks once the product is in the cart", () => {
    const addItem = vi.fn();
    const cart = cartWith(
      [
        { product: mainGift, quantity: 1 },
        { product: balloon, quantity: 1 },
      ],
      addItem,
    );
    renderModal({ cart });
    const btn = screen.getByTestId("upsell-modal-add-p-balloon");
    expect(btn.textContent).toContain("cart.upsells.added");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    expect(addItem).not.toHaveBeenCalled();
    expect(webEventsOf("upsell_add_clicked").length).toBe(0);
  });

  it("shows a recoverable error and fires upsell_add_failed when addItem throws", () => {
    const addItem = vi.fn(() => {
      throw new Error("boom");
    });
    renderModal({ cart: cartWith([{ product: mainGift, quantity: 1 }], addItem) });

    fireEvent.click(screen.getByTestId("upsell-modal-add-p-balloon"));
    expect(webEventsOf("upsell_add_failed").length).toBe(1);
    expect(screen.getByRole("alert").textContent).toContain("cart.upsells.addFailed");
    // Modal is still open and the button is clickable again.
    const btn = screen.getByTestId("upsell-modal-add-p-balloon") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toContain("cart.upsells.add");
  });

  it("Continue to cart navigates to /cart with no total inside the CTA", () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    const cta = screen.getByTestId("upsell-modal-continue-to-cart");
    expect(within(cta).queryByTestId("formatted-price")).toBeNull();
    expect(cta.textContent).toContain("cart.upsells.modal.continueToCart");
    fireEvent.click(cta);
    expect(setLocationMock).toHaveBeenCalledWith("/cart");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(webEventsOf("popup_continue_to_cart_clicked").length).toBe(1);
  });

  it("Continue shopping closes the popup and fires its event", () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByTestId("upsell-modal-continue-shopping"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setLocationMock).not.toHaveBeenCalled();
    expect(webEventsOf("popup_continue_shopping_clicked").length).toBe(1);
    // Closed event fires exactly once even though close was triggered.
    expect(webEventsOf("add_to_cart_popup_closed").length).toBe(1);
  });

  it("pluralizes the card-message helper from the cart's message requirements", () => {
    renderModal({ cart: cartWith([{ product: mainGift, quantity: 1 }]) });
    expect(screen.getByTestId("upsell-modal-next-hint").textContent).toContain(
      "cart.upsells.modal.nextMessageOne",
    );
  });

  it("uses the plural helper when multiple gifts need card messages", () => {
    const cart = cartWith([
      { product: mainGift, quantity: 1 },
      { product: otherGift, quantity: 1 },
    ]);
    renderModal({ cart });
    expect(screen.getByTestId("upsell-modal-next-hint").textContent).toContain(
      "cart.upsells.modal.nextMessageOther",
    );
  });

  it("hides the helper when no cart item requires a card message", () => {
    const cart = cartWith([{ product: balloon, quantity: 1 }]);
    renderModal({ cart });
    expect(screen.queryByTestId("upsell-modal-next-hint")).toBeNull();
  });

  it("fires add_to_cart_popup_viewed once per open with the spec'd properties", () => {
    renderModal();
    const viewed = webEventsOf("add_to_cart_popup_viewed");
    expect(viewed.length).toBe(1);
    const props = (viewed[0][0] as { properties: Record<string, unknown> }).properties;
    expect(props.market).toBe("LB");
    expect(props.locale).toBe("en");
    expect(props.currency).toBe("USD");
    expect(props.mainProductId).toBe("p-main");
    expect(props.cartItemCount).toBe(1);
    expect(props.freeDeliveryUnlocked).toBe(false);
    expect(props.deliveryWindow).toBe("Standard delivery · Today, 2–5 PM");
    expect(props.recommendationSource).toBe("curated");
  });

  it("fires popup_delivery_change_clicked when the delivery row is used", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("delivery-date-row"));
    expect(webEventsOf("popup_delivery_change_clicked").length).toBe(1);
  });
});
