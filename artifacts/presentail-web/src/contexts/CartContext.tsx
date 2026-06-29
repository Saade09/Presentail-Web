import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Product } from "@/lib/queries";
import { trackFbEvent } from "@/lib/fbPixel";
import { AuthOverrideContext } from "@/contexts/AuthContext";
import { getStartupItem } from "@/lib/startupState";

export type CartItem = {
  product: Product;
  quantity: number;
  customNote?: string;
};

export type CartContextType = {
  items: CartItem[];
  addItem: (product: Product, quantity?: number, customNote?: string) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateCustomNote: (productId: string, note: string) => void;
  clearCart: () => void;
  subtotal: number;
  itemCount: number;
  isHydrated: boolean;
};

export const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useContext(AuthOverrideContext);
  const [items, setItems] = useState<CartItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = getStartupItem("presentail_cart_v1");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Validate shape: only keep items whose priceValue is a finite number
        // so stale/schema-mismatched entries never produce NaN subtotals.
        if (Array.isArray(parsed)) {
          setItems(
            parsed.filter(
              (i: any) =>
                i &&
                typeof i === "object" &&
                i.product &&
                Number.isFinite(i.product.priceValue) &&
                typeof i.quantity === "number",
            ),
          );
        }
      } catch {
        localStorage.removeItem("presentail_cart_v1");
      }
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage when items change
  useEffect(() => {
    try {
      localStorage.setItem("presentail_cart_v1", JSON.stringify(items));
    } catch {
      // Ignore write failures (e.g. Safari private mode QuotaExceededError).
    }
  }, [items]);

  const addItem = (product: Product, quantity = 1, customNote?: string) => {
    setItems(current => {
      const existing = current.find(i => i.product.id === product.id);
      if (existing) {
        return current.map(i =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      }
      return [...current, { product, quantity, customNote: customNote?.trim() || undefined }];
    });
    trackFbEvent("AddToCart", {
      content_ids: [product.id],
      content_type: "product",
      value: product.priceValue,
      currency: "USD",
      ...(user?.email ? { userData: { em: user.email } } : {}),
    });
  };

  const removeItem = (productId: string) => {
    setItems(current => current.filter(i => i.product.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    setItems(current =>
      current.map(i => i.product.id === productId ? { ...i, quantity } : i)
    );
  };

  const updateCustomNote = (productId: string, note: string) => {
    setItems(current =>
      current.map(i =>
        i.product.id === productId
          ? { ...i, customNote: note.trim() || undefined }
          : i,
      ),
    );
  };

  const clearCart = () => setItems([]);

  const subtotal = items.reduce((acc, item) => acc + (item.product.priceValue * item.quantity), 0);
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, updateCustomNote, clearCart, subtotal, itemCount, isHydrated }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
