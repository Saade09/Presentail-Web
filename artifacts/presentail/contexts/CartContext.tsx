import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { getProduct, type Product } from "@/data/catalog";
import { useWooProducts } from "./WooProductsContext";

export type CartItem = { productId: string; qty: number };

export type CartCardMessage = { to: string; from: string; body: string };

const CART_STORAGE_KEY = "@presentail/cart-v1";
const CART_MESSAGE_STORAGE_KEY = "@presentail/cart-message-v1";

type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  add: (productId: string, qty?: number) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  /**
   * Subscribe to cart-clear events. Used by sibling contexts (e.g.
   * DeliverySelectionContext) so that anything tied to the cart
   * — like the persisted delivery date/slot — is reset whenever the
   * cart itself is cleared, no matter which screen calls clear().
   * Returns an unsubscribe function.
   */
  onClear: (cb: () => void) => () => void;
  detailed: { product: Product; qty: number; lineTotal: number }[];
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  /** Path to navigate to after the cart modal fully closes. Consumed by CartNavigationHandler inside the Stack. */
  pendingNavigation: string | null;
  /** Close the cart and schedule navigation to `path` once the modal is gone. */
  requestNavigation: (path: string) => void;
  clearPendingNavigation: () => void;
  cartMessage: CartCardMessage | null;
  setCartMessage: (msg: CartCardMessage | null) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

type PendingMutation =
  | { type: "add"; productId: string; qty: number }
  | { type: "remove"; productId: string }
  | { type: "setQty"; productId: string; qty: number }
  | { type: "clear" };

function applyMutation(items: CartItem[], m: PendingMutation): CartItem[] {
  if (m.type === "clear") return [];
  if (m.type === "remove") return items.filter((i) => i.productId !== m.productId);
  if (m.type === "setQty") {
    if (m.qty <= 0) return items.filter((i) => i.productId !== m.productId);
    return items.map((i) => (i.productId === m.productId ? { ...i, qty: m.qty } : i));
  }
  // add
  const existing = items.find((i) => i.productId === m.productId);
  if (existing) {
    return items.map((i) =>
      i.productId === m.productId ? { ...i, qty: i.qty + m.qty } : i,
    );
  }
  return [...items, { productId: m.productId, qty: m.qty }];
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [cartMessage, setCartMessageState] = useState<CartCardMessage | null>(null);
  const hydrated = useRef(false);
  const pending = useRef<PendingMutation[]>([]);
  const clearListeners = useRef<Set<() => void>>(new Set());
  const { products: wooProducts } = useWooProducts();

  const onClear = useCallback((cb: () => void) => {
    clearListeners.current.add(cb);
    return () => {
      clearListeners.current.delete(cb);
    };
  }, []);

  const fireClearListeners = useCallback(() => {
    for (const cb of Array.from(clearListeners.current)) {
      try {
        cb();
      } catch {
        // listeners must not block cart clear
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CART_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        let stored: CartItem[] = [];
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) stored = parsed as CartItem[];
          } catch {}
        }
        // Replay any mutations that came in during hydration on top of
        // the stored cart, so we don't lose items the user added pre-hydration
        // and also don't accidentally double-count by merging.
        let next = stored;
        for (const m of pending.current) next = applyMutation(next, m);
        pending.current = [];
        hydrated.current = true;
        setItems(next);
      })
      .catch(() => {
        if (cancelled) return;
        // Storage failed — keep whatever in-memory state we have plus replays.
        let next: CartItem[] = [];
        for (const m of pending.current) next = applyMutation(next, m);
        pending.current = [];
        hydrated.current = true;
        setItems(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load persisted cart message on mount
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CART_MESSAGE_STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && "to" in parsed && "from" in parsed && "body" in parsed) {
            setCartMessageState(parsed as CartCardMessage);
          }
        } catch {}
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items]);

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);
  const requestNavigation = useCallback((path: string) => {
    setPendingNavigation(path);
    setIsCartOpen(false);
  }, []);
  const clearPendingNavigation = useCallback(() => setPendingNavigation(null), []);

  const add = useCallback((productId: string, qty = 1) => {
    if (!hydrated.current) {
      pending.current.push({ type: "add", productId, qty });
    } else {
      setItems((prev) => applyMutation(prev, { type: "add", productId, qty }));
    }
    setIsCartOpen(true);
  }, []);

  const remove = useCallback((productId: string) => {
    if (!hydrated.current) {
      pending.current.push({ type: "remove", productId });
      return;
    }
    setItems((prev) => applyMutation(prev, { type: "remove", productId }));
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    if (!hydrated.current) {
      pending.current.push({ type: "setQty", productId, qty });
      return;
    }
    setItems((prev) => applyMutation(prev, { type: "setQty", productId, qty }));
  }, []);

  const clear = useCallback(() => {
    if (!hydrated.current) {
      pending.current.push({ type: "clear" });
    } else {
      setItems([]);
    }
    setCartMessageState(null);
    AsyncStorage.removeItem(CART_MESSAGE_STORAGE_KEY).catch(() => {});
    fireClearListeners();
  }, [fireClearListeners]);

  const setCartMessage = useCallback((msg: CartCardMessage | null) => {
    setCartMessageState(msg);
    if (msg) {
      AsyncStorage.setItem(CART_MESSAGE_STORAGE_KEY, JSON.stringify(msg)).catch(() => {});
    } else {
      AsyncStorage.removeItem(CART_MESSAGE_STORAGE_KEY).catch(() => {});
    }
  }, []);

  const detailed = useMemo(
    () =>
      items
        .map((i) => {
          // Prefer the live WooCommerce product (has current price); fall back to static catalog
          const wooProduct = wooProducts.find((p) => p.id === i.productId) as Product | undefined;
          const product: Product | undefined = wooProduct ?? getProduct(i.productId);
          if (!product) return null;
          return { product, qty: i.qty, lineTotal: product.priceValue * i.qty };
        })
        .filter(Boolean) as { product: Product; qty: number; lineTotal: number }[],
    [items, wooProducts],
  );

  const count = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);
  const total = useMemo(
    () => detailed.reduce((s, d) => s + d.lineTotal, 0),
    [detailed],
  );

  const value = useMemo(
    () => ({ items, count, total, add, remove, setQty, clear, onClear, detailed, isCartOpen, openCart, closeCart, pendingNavigation, requestNavigation, clearPendingNavigation, cartMessage, setCartMessage }),
    [items, count, total, add, remove, setQty, clear, onClear, detailed, isCartOpen, openCart, closeCart, pendingNavigation, requestNavigation, clearPendingNavigation, cartMessage, setCartMessage],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
