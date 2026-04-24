import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { getProduct, type Product } from "@/data/catalog";

export type CartItem = { productId: string; qty: number };

const CART_STORAGE_KEY = "@presentail/cart-v1";

type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  add: (productId: string, qty?: number) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  detailed: { product: Product; qty: number; lineTotal: number }[];
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CART_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          hydrated.current = true;
          return;
        }
        try {
          const parsed = JSON.parse(raw) as CartItem[];
          if (Array.isArray(parsed)) {
            setItems((current) => {
              if (current.length === 0) return parsed;
              const map = new Map<string, CartItem>();
              for (const it of parsed) map.set(it.productId, { ...it });
              for (const it of current) {
                const existing = map.get(it.productId);
                if (existing) existing.qty = Math.max(existing.qty, it.qty);
                else map.set(it.productId, { ...it });
              }
              return Array.from(map.values());
            });
          }
        } catch {}
        hydrated.current = true;
      })
      .catch(() => {
        if (!cancelled) hydrated.current = true;
      });
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

  const add = useCallback((productId: string, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === productId ? { ...i, qty: i.qty + qty } : i,
        );
      }
      return [...prev, { productId, qty }];
    });
    setIsCartOpen(true);
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.productId !== productId)
        : prev.map((i) => (i.productId === productId ? { ...i, qty } : i)),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const detailed = useMemo(
    () =>
      items
        .map((i) => {
          const product = getProduct(i.productId);
          if (!product) return null;
          return { product, qty: i.qty, lineTotal: product.priceValue * i.qty };
        })
        .filter(Boolean) as { product: Product; qty: number; lineTotal: number }[],
    [items],
  );

  const count = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);
  const total = useMemo(
    () => detailed.reduce((s, d) => s + d.lineTotal, 0),
    [detailed],
  );

  const value = useMemo(
    () => ({ items, count, total, add, remove, setQty, clear, detailed, isCartOpen, openCart, closeCart }),
    [items, count, total, add, remove, setQty, clear, detailed, isCartOpen, openCart, closeCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
