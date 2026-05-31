/**
 * Tests for CartContext — CartProvider logic.
 *
 * Covered scenarios
 * -----------------
 * - Empty cart: count=0, total=0, items=[]
 * - add(): adds a new item; stacks qty when the same product is added again
 * - add() with explicit qty: correct qty stored
 * - remove(): removes a specific item; leaves others untouched
 * - setQty(): updates qty of an existing item
 * - setQty(0): removes the item when qty drops to zero
 * - setQty(negative): removes the item (same branch as qty ≤ 0)
 * - clear(): empties all items
 * - onClear listener: fires when clear() is called, unsubscribes cleanly
 * - detailed / total: computed from wooProducts lookup
 * - openCart / closeCart / isCartOpen toggle
 * - requestNavigation / clearPendingNavigation
 * - cartMessage: set and clear
 *
 * Implementation note
 * -------------------
 * CartProvider hydrates from AsyncStorage on mount (async). We wrap each
 * render in `await act(async () => {...})` to flush the promise queue, which
 * sets hydrated=true so subsequent add/remove/setQty calls mutate state
 * directly rather than queuing in pending[].
 *
 * WooProductsContext is mocked to supply a predictable product list so we can
 * assert detailed and total without a real API round-trip.
 */

import React, { act } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as ReactTestRenderer from "react-test-renderer";

import { CartProvider, useCart, type CartContextValue } from "@/contexts/CartContext";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/contexts/WooProductsContext", () => ({
  useWooProducts: () => ({
    products: [
      {
        id: "rose-bouquet",
        name: "Rose Bouquet",
        slug: "rose-bouquet",
        priceValue: 50,
        image: null,
        category: "Flowers",
        tags: [],
        description: "",
        shortDescription: "",
        stockStatus: "instock",
      },
      {
        id: "gift-box",
        name: "Gift Box",
        slug: "gift-box",
        priceValue: 30,
        image: null,
        category: "Gifts",
        tags: [],
        description: "",
        shortDescription: "",
        stockStatus: "instock",
      },
    ],
    loading: false,
    lastSync: null,
    refresh: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helper: render CartProvider and capture a live reference to context value
// ---------------------------------------------------------------------------

async function renderCart(): Promise<{
  cart: () => CartContextValue;
  renderer: ReactTestRenderer.ReactTestRenderer;
}> {
  let cartRef!: CartContextValue;

  function Consumer() {
    cartRef = useCart();
    return null;
  }

  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await act(async () => {
    renderer = ReactTestRenderer.create(
      <CartProvider>
        <Consumer />
      </CartProvider>,
    );
  });

  return {
    cart: () => cartRef,
    renderer,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CartContext — initial state", () => {
  it("starts with an empty cart (count=0, total=0, items=[])", async () => {
    const { cart } = await renderCart();
    expect(cart().count).toBe(0);
    expect(cart().total).toBe(0);
    expect(cart().items).toEqual([]);
    expect(cart().detailed).toEqual([]);
  });

  it("isCartOpen defaults to false", async () => {
    const { cart } = await renderCart();
    expect(cart().isCartOpen).toBe(false);
  });

  it("pendingNavigation defaults to null", async () => {
    const { cart } = await renderCart();
    expect(cart().pendingNavigation).toBeNull();
  });

  it("cartMessage defaults to null", async () => {
    const { cart } = await renderCart();
    expect(cart().cartMessage).toBeNull();
  });
});

describe("CartContext — add()", () => {
  it("adds a new item with qty=1 by default", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet");
    });

    expect(cart().count).toBe(1);
    expect(cart().items).toEqual([{ productId: "rose-bouquet", qty: 1 }]);
  });

  it("adds a new item with an explicit qty", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet", 3);
    });

    expect(cart().count).toBe(3);
    expect(cart().items).toEqual([{ productId: "rose-bouquet", qty: 3 }]);
  });

  it("stacks qty when the same product is added twice", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet");
    });
    await act(async () => {
      cart().add("rose-bouquet");
    });

    expect(cart().count).toBe(2);
    expect(cart().items).toEqual([{ productId: "rose-bouquet", qty: 2 }]);
  });

  it("accumulates two distinct products independently", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet");
    });
    await act(async () => {
      cart().add("gift-box", 2);
    });

    expect(cart().count).toBe(3);
    expect(cart().items).toContainEqual({ productId: "rose-bouquet", qty: 1 });
    expect(cart().items).toContainEqual({ productId: "gift-box", qty: 2 });
  });

  it("opening the cart is a side-effect of add()", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet");
    });

    expect(cart().isCartOpen).toBe(true);
  });
});

describe("CartContext — remove()", () => {
  it("removes the specified item", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet");
      cart().add("gift-box");
    });
    await act(async () => {
      cart().remove("rose-bouquet");
    });

    expect(cart().items).toEqual([{ productId: "gift-box", qty: 1 }]);
    expect(cart().count).toBe(1);
  });

  it("is a no-op when the product is not in the cart", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet");
    });
    await act(async () => {
      cart().remove("gift-box");
    });

    expect(cart().items).toEqual([{ productId: "rose-bouquet", qty: 1 }]);
  });
});

describe("CartContext — setQty()", () => {
  it("updates the qty of an existing item", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet");
    });
    await act(async () => {
      cart().setQty("rose-bouquet", 5);
    });

    expect(cart().items).toEqual([{ productId: "rose-bouquet", qty: 5 }]);
    expect(cart().count).toBe(5);
  });

  it("removes the item when qty is set to 0", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet");
    });
    await act(async () => {
      cart().setQty("rose-bouquet", 0);
    });

    expect(cart().items).toEqual([]);
    expect(cart().count).toBe(0);
  });

  it("removes the item when qty is set to a negative number", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet");
    });
    await act(async () => {
      cart().setQty("rose-bouquet", -1);
    });

    expect(cart().items).toEqual([]);
  });

  it("does not affect other items when one item's qty changes", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet");
      cart().add("gift-box");
    });
    await act(async () => {
      cart().setQty("rose-bouquet", 10);
    });

    const giftBox = cart().items.find((i) => i.productId === "gift-box");
    expect(giftBox?.qty).toBe(1);
  });
});

describe("CartContext — clear()", () => {
  it("empties all items", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet");
      cart().add("gift-box", 3);
    });
    await act(async () => {
      cart().clear();
    });

    expect(cart().items).toEqual([]);
    expect(cart().count).toBe(0);
    expect(cart().total).toBe(0);
  });

  it("resets cartMessage to null", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().setCartMessage({ to: "Alice", from: "Bob", body: "Happy Birthday!" });
    });
    await act(async () => {
      cart().clear();
    });

    expect(cart().cartMessage).toBeNull();
  });
});

describe("CartContext — onClear listener", () => {
  it("fires the listener when clear() is called", async () => {
    const { cart } = await renderCart();
    const listener = vi.fn();

    await act(async () => {
      cart().onClear(listener);
      cart().add("rose-bouquet");
    });
    await act(async () => {
      cart().clear();
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not fire the listener after it has been unsubscribed", async () => {
    const { cart } = await renderCart();
    const listener = vi.fn();

    let unsubscribe!: () => void;
    await act(async () => {
      unsubscribe = cart().onClear(listener);
      cart().add("rose-bouquet");
    });

    unsubscribe();

    await act(async () => {
      cart().clear();
    });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("CartContext — detailed & total", () => {
  it("computes detailed entries for known products", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet", 2);
    });

    expect(cart().detailed).toHaveLength(1);
    expect(cart().detailed[0].qty).toBe(2);
    expect(cart().detailed[0].lineTotal).toBe(100); // 50 * 2
  });

  it("excludes items whose product is not in the catalog", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("unknown-product");
    });

    expect(cart().detailed).toHaveLength(0);
  });

  it("totals line totals across multiple products", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().add("rose-bouquet", 2); // 50 * 2 = 100
      cart().add("gift-box", 1);    // 30 * 1 = 30
    });

    expect(cart().total).toBe(130);
  });
});

describe("CartContext — cart open/close", () => {
  it("openCart sets isCartOpen to true", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().openCart();
    });

    expect(cart().isCartOpen).toBe(true);
  });

  it("closeCart sets isCartOpen to false", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().openCart();
    });
    await act(async () => {
      cart().closeCart();
    });

    expect(cart().isCartOpen).toBe(false);
  });
});

describe("CartContext — navigation", () => {
  it("requestNavigation sets pendingNavigation and closes the cart", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().openCart();
      cart().requestNavigation("/checkout");
    });

    expect(cart().pendingNavigation).toBe("/checkout");
    expect(cart().isCartOpen).toBe(false);
  });

  it("clearPendingNavigation resets pendingNavigation to null", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().requestNavigation("/checkout");
    });
    await act(async () => {
      cart().clearPendingNavigation();
    });

    expect(cart().pendingNavigation).toBeNull();
  });
});

describe("CartContext — cartMessage", () => {
  it("setCartMessage stores the message", async () => {
    const { cart } = await renderCart();

    const msg = { to: "Alice", from: "Bob", body: "Happy Birthday!" };
    await act(async () => {
      cart().setCartMessage(msg);
    });

    expect(cart().cartMessage).toEqual(msg);
  });

  it("setCartMessage(null) clears the message", async () => {
    const { cart } = await renderCart();

    await act(async () => {
      cart().setCartMessage({ to: "A", from: "B", body: "Hi" });
    });
    await act(async () => {
      cart().setCartMessage(null);
    });

    expect(cart().cartMessage).toBeNull();
  });
});
