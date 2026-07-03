import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { Product } from "@/data/catalog";
import type { WooProduct } from "@/lib/woo";
import { useWooProducts } from "./WooProductsContext";

function effectiveUsdPrice(product: WooProduct | Product): number {
  const disc = (product as WooProduct).discountPriceValue;
  if (disc != null && disc > 0) return disc;
  return product.priceValue;
}

export type CartItem = { productId: string; qty: number; customNote?: string };

export type CartCardMessage = { to: string; from: string; body: string };

const CART_STORAGE_KEY = "@presentail/cart-v1";
const CART_MESSAGE_STORAGE_KEY = "@presentail/cart-message-v1";

export type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  add: (productId: string, qty?: number, customNote?: string, options?: { suppressNavigation?: boolean }) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  setCustomNote: (productId: string, note: string) => void;
  clear: () => void;
  /**
   * Subscribe to cart-clear events. Used by sibling contexts (e.g.
   * DeliverySelectionContext) so that anything tied to the cart
   * — like the persisted delivery date/slot — is reset whenever the
   * cart itself is cleared, no matter which screen calls clear().
   * Returns an unsubscribe function.
   */
  onClear: (cb: () => void) => () => void;
  /**
   * lineTotal uses the effective (discounted) unit price.
   * regularLineTotal is the non-discounted line total; null when there
   * is no active discount so consumers can skip the strikethrough safely.
   */
  detailed: { product: Product; qty: number; lineTotal: number; regularLineTotal: number | null }[];
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
  /**
   * Product IDs of cart items whose effective price increased after a catalog
   * re-sync (e.g. a sale ended while the item was in the cart). Non-empty
   * means the shopper should see a "prices updated" notice.
   */
  priceUpdatedProductIds: string[];
  /** Dismiss the price-updated notice. */
  dismissPriceUpdated: () => void;
};

export const CartContext = createContext<CartContextValue | null>(null);

type PendingMutation =
  | { type: "add"; productId: string; qty: number; customNote?: string }
  | { type: "remove"; productId: string }
  | { type: "setQty"; productId: string; qty: number }
  | { type: "setNote"; productId: string; customNote: string }
  | { type: "clear" };

function applyMutation(items: CartItem[], m: PendingMutation): CartItem[] {
  if (m.type === "clear") return [];
  if (m.type === "remove") return items.filter((i) => i.productId !== m.productId);
  if (m.type === "setQty") {
    if (m.qty <= 0) return items.filter((i) => i.productId !== m.productId);
    return items.map((i) => (i.productId === m.productId ? { ...i, qty: m.qty } : i));
  }
  if (m.type === "setNote") {
    return items.map((i) =>
      i.productId === m.productId
        ? { ...i, customNote: m.customNote.trim() || undefined }
        : i,
    );
  }
  // add
  const existing = items.find((i) => i.productId === m.productId);
  if (existing) {
    return items.map((i) =>
      i.productId === m.productId ? { ...i, qty: i.qty + m.qty } : i,
    );
  }
  return [...items, { productId: m.productId, qty: m.qty, customNote: m.customNote?.trim() || undefined }];
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [cartMessage, setCartMessageState] = useState<CartCardMessage | null>(null);
  const [priceUpdatedProductIds, setPriceUpdatedProductIds] = useState<string[]>([]);
  const hydrated = useRef(false);
  const pending = useRef<PendingMutation[]>([]);
  const clearListeners = useRef<Set<() => void>>(new Set());
  // Map of productId → effective USD price from the last catalog sync. null
  // means we haven't seen a sync yet (don't alert on the very first load).
  const prevEffectivePricesRef = useRef<Map<string, number> | null>(null);
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

  const dismissPriceUpdated = useCallback(() => {
    setPriceUpdatedProductIds([]);
  }, []);

  // Detect when the catalog re-sync removes a discount that was active for a
  // cart item so we can alert the shopper before they proceed to checkout.
  useEffect(() => {
    if (wooProducts.length === 0) return;
    const currentPrices = new Map<string, number>();
    for (const p of wooProducts) {
      currentPrices.set(p.id, effectiveUsdPrice(p));
    }
    const prev = prevEffectivePricesRef.current;
    if (prev === null) {
      // First sync — just record prices; no banner on initial load.
      prevEffectivePricesRef.current = currentPrices;
      return;
    }
    // Compare against cart items only: flag those whose effective price rose.
    const increased: string[] = [];
    for (const item of items) {
      const prevPrice = prev.get(item.productId);
      const nextPrice = currentPrices.get(item.productId);
      if (prevPrice !== undefined && nextPrice !== undefined && nextPrice > prevPrice) {
        increased.push(item.productId);
      }
    }
    prevEffectivePricesRef.current = currentPrices;
    if (increased.length > 0) {
      setPriceUpdatedProductIds((existing) => {
        const merged = new Set([...existing, ...increased]);
        return Array.from(merged);
      });
    }
  }, [wooProducts]); // items intentionally excluded: we only compare on catalog change, not cart mutations

  // Keep priceUpdatedProductIds in sync with the live cart — if the shopper
  // removes a flagged item the banner has nothing to say about it any more.
  useEffect(() => {
    setPriceUpdatedProductIds((prev) => {
      if (prev.length === 0) return prev;
      const cartIds = new Set(items.map((i) => i.productId));
      const next = prev.filter((id) => cartIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [items]);

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

  const add = useCallback((productId: string, qty = 1, customNote?: string, options?: { suppressNavigation?: boolean }) => {
    if (!hydrated.current) {
      pending.current.push({ type: "add", productId, qty, customNote });
    } else {
      setItems((prev) => applyMutation(prev, { type: "add", productId, qty, customNote }));
    }
    if (!options?.suppressNavigation) {
      // Use the same pendingNavigation mechanism as CartDrawer so navigation
      // is handled inside the Stack navigator (CartNavigationHandler), keeping
      // router out of this context entirely and preserving testability.
      setPendingNavigation("/cart-added");
    }
  }, []);

  const setCustomNote = useCallback((productId: string, note: string) => {
    if (!hydrated.current) {
      pending.current.push({ type: "setNote", productId, customNote: note });
      return;
    }
    setItems((prev) => applyMutation(prev, { type: "setNote", productId, customNote: note }));
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
    setPriceUpdatedProductIds([]);
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
          const wooProduct = wooProducts.find((p) => p.id === i.productId) as Product | undefined;
          const product: Product | undefined = wooProduct;
          if (!product) return null;
          const effectivePrice = effectiveUsdPrice(product);
          return {
            product,
            qty: i.qty,
            lineTotal: effectivePrice * i.qty,
            regularLineTotal: effectivePrice < product.priceValue ? product.priceValue * i.qty : null,
          };
        })
        .filter(Boolean) as { product: Product; qty: number; lineTotal: number; regularLineTotal: number | null }[],
    [items, wooProducts],
  );

  const count = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);
  const total = useMemo(
    () => detailed.reduce((s, d) => s + d.lineTotal, 0),
    [detailed],
  );

  const value = useMemo(
    () => ({ items, count, total, add, remove, setQty, setCustomNote, clear, onClear, detailed, isCartOpen, openCart, closeCart, pendingNavigation, requestNavigation, clearPendingNavigation, cartMessage, setCartMessage, priceUpdatedProductIds, dismissPriceUpdated }),
    [items, count, total, add, remove, setQty, setCustomNote, clear, onClear, detailed, isCartOpen, openCart, closeCart, pendingNavigation, requestNavigation, clearPendingNavigation, cartMessage, setCartMessage, priceUpdatedProductIds, dismissPriceUpdated],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
