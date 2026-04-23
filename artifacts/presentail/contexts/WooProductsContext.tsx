import React, { createContext, useContext, useEffect, useState } from "react";
import { CATALOG } from "@/data/catalog";
import { fetchWooProducts, type WooProduct } from "@/lib/woo";

type AnyProduct = (typeof CATALOG)[number] & { wcId?: number };

type WooCtx = {
  products: AnyProduct[];
  loading: boolean;
  lastSync: Date | null;
};

const WooProductsContext = createContext<WooCtx>({
  products: CATALOG as AnyProduct[],
  loading: true,
  lastSync: null,
});

export function WooProductsProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<AnyProduct[]>(CATALOG as AnyProduct[]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function sync() {
      const woo = await fetchWooProducts();
      if (cancelled || !woo.length) {
        setLoading(false);
        return;
      }
      const merged = mergeProducts(CATALOG as AnyProduct[], woo);
      setProducts(merged);
      setLastSync(new Date());
      setLoading(false);
    }
    sync();
    return () => { cancelled = true; };
  }, []);

  return (
    <WooProductsContext.Provider value={{ products, loading, lastSync }}>
      {children}
    </WooProductsContext.Provider>
  );
}

export function useWooProducts() {
  return useContext(WooProductsContext);
}

function mergeProducts(staticCatalog: AnyProduct[], woo: WooProduct[]): AnyProduct[] {
  const wooById = new Map<string, WooProduct>();
  for (const p of woo) wooById.set(p.id, p);

  const staticIds = new Set(staticCatalog.map((p) => p.id));
  const result: AnyProduct[] = [];

  for (const sp of staticCatalog) {
    const wp = wooById.get(sp.id);
    if (wp) {
      result.push({
        ...sp,
        name: wp.name || sp.name,
        price: wp.priceValue ? `$${wp.priceValue.toLocaleString()}` : sp.price,
        priceValue: wp.priceValue || sp.priceValue,
        image: wp.image ?? sp.image,
        wcId: wp.wcId,
      });
    } else {
      result.push(sp);
    }
  }

  for (const wp of woo) {
    if (!staticIds.has(wp.id) && wp.inStock && wp.image) {
      result.push({
        id: wp.id,
        wcId: wp.wcId,
        name: wp.name,
        price: wp.price,
        priceValue: wp.priceValue,
        image: wp.image,
        category: wp.category,
        description: wp.description,
        tag: wp.tag,
        occasions: [],
      });
    }
  }

  return result;
}
