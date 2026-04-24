import React, { createContext, useContext, useEffect, useState } from "react";
import { products as CATALOG } from "@/data/catalog";
import { fetchWooProducts, type WooProduct } from "@/lib/woo";

type AnyProduct = (typeof CATALOG)[number] & { wcId?: number };

function dedupeById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

const INITIAL_CATALOG = dedupeById(CATALOG as AnyProduct[]);

type WooCtx = {
  products: AnyProduct[];
  loading: boolean;
  lastSync: Date | null;
};

const WooProductsContext = createContext<WooCtx>({
  products: INITIAL_CATALOG,
  loading: true,
  lastSync: null,
});

export function WooProductsProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<AnyProduct[]>(INITIAL_CATALOG);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function sync() {
      const woo = await fetchWooProducts();
      if (cancelled) return;
      if (!woo.length) {
        setLoading(false);
        return;
      }
      const merged = mergeProducts(CATALOG as AnyProduct[], woo);
      if (cancelled) return;
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
  for (const p of woo) {
    if (!wooById.has(p.id)) wooById.set(p.id, p);
  }

  const staticIds = new Set(staticCatalog.map((p) => p.id));
  const seen = new Set<string>();
  const result: AnyProduct[] = [];

  for (const sp of staticCatalog) {
    if (seen.has(sp.id)) continue;
    seen.add(sp.id);
    const wp = wooById.get(sp.id);
    if (wp) {
      const nextPriceValue = wp.priceValue ?? sp.priceValue;
      result.push({
        ...sp,
        name: wp.name || sp.name,
        price: wp.priceValue != null ? `$${wp.priceValue.toLocaleString()}` : sp.price,
        priceValue: nextPriceValue,
        image: wp.image ?? sp.image,
        description: sp.description ?? wp.description,
        tag: sp.tag ?? wp.tag,
        wcId: wp.wcId,
      });
    } else {
      result.push(sp);
    }
  }

  for (const wp of wooById.values()) {
    if (staticIds.has(wp.id) || seen.has(wp.id)) continue;
    if (!wp.inStock || !wp.image) continue;
    seen.add(wp.id);
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

  return result;
}
