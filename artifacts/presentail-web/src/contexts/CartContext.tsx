import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Product } from "@/lib/queries";
import { trackFbEvent } from "@/lib/fbPixel";
import { trackWebEvent, umamiTrack } from "@/lib/analytics";
import { fireGtagEvent } from "@/lib/gtag";
import { AuthOverrideContext } from "@/contexts/AuthContext";
import { LocationContext } from "@/contexts/LocationContext";
import { getStartupItem } from "@/lib/startupState";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";

export type CartItem = {
  product: Product;
  quantity: number;
  customNote?: string;
};

export type CartContextType = {
  items: CartItem[];
  addItem: (product: Product, quantity?: number, customNote?: string, deliveryOptions?: { deliveryMethod?: "standard" | "express"; deliveryFeeUsd?: number; upsellToken?: string }) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateCustomNote: (productId: string, note: string) => void;
  clearCart: () => void;
  subtotal: number;
  itemCount: number;
  isHydrated: boolean;
};

export const CartContext = createContext<CartContextType | null>(null);

export function effectivePrice(product: Product): number {
  return product.discountPriceValue != null && product.discountPriceValue > 0
    ? product.discountPriceValue
    : product.priceValue;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useContext(AuthOverrideContext);
  const locationCtx = useContext(LocationContext);
  const { currencyCode } = useDisplayCurrency();
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

  const addItem = (product: Product, quantity = 1, customNote?: string, deliveryOptions?: { deliveryMethod?: "standard" | "express"; deliveryFeeUsd?: number; upsellToken?: string }) => {
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
      value: effectivePrice(product),
      currency: "USD",
      ...(user?.email ? { userData: { em: user.email } } : {}),
    });
    // Compute post-add items from current closure snapshot (items is always
    // fresh because addItem is re-created on every render without useCallback).
    const existing = items.find(i => i.product.id === product.id);
    const newItems = existing
      ? items.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i)
      : [...items, { product, quantity }];
    const newSubtotal = newItems.reduce((acc, item) => acc + effectivePrice(item.product) * item.quantity, 0);
    const cityName = locationCtx?.city?.name ?? locationCtx?.city?.id ?? undefined;
    const brandName = product.brandNames?.[0] ?? undefined;
    // GA4 mirror — lets GA4/Google Ads attribute add_to_cart to the ad click
    // (gclid/UTM) captured on the session's landing page.
    fireGtagEvent("add_to_cart", {
      currency: currencyCode,
      value: newSubtotal,
      items: newItems.map(i => ({
        item_id: i.product.id,
        item_name: i.product.name,
        price: effectivePrice(i.product),
        quantity: i.quantity,
      })),
    });
    trackWebEvent({
      type: "add_to_cart",
      items: newItems.map(i => ({
        productId: i.product.id,
        name: i.product.name,
        price: effectivePrice(i.product),
        quantity: i.quantity,
      })),
      value: newSubtotal,
      currency: currencyCode,
      ...(brandName ? { brand: brandName } : {}),
      ...(cityName ? { city: cityName } : {}),
      ...(deliveryOptions?.deliveryMethod ? { deliveryMethod: deliveryOptions.deliveryMethod } : {}),
      ...(deliveryOptions?.deliveryFeeUsd != null ? { deliveryFeeUsd: deliveryOptions.deliveryFeeUsd } : {}),
      // Recommendation tracking token — lets the upsell funnel attribute
      // purchases back to the exact Complete-Your-Gift recommendation.
      ...(deliveryOptions?.upsellToken ? { properties: { upsellToken: deliveryOptions.upsellToken } } : {}),
    });
    umamiTrack("add_to_cart", {
      product_name: product.name,
      price: effectivePrice(product),
      quantity,
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
          ? { ...i, customNote: note || undefined }
          : i,
      ),
    );
  };

  const clearCart = () => setItems([]);

  const subtotal = items.reduce((acc, item) => acc + (effectivePrice(item.product) * item.quantity), 0);
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
