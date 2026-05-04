import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { products as CATALOG } from "@/data/catalog";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { fetchWooProducts, type WooProduct } from "@/lib/woo";

type AnyProduct = (typeof CATALOG)[number] & { wcId?: number };

const SYNC_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours

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
  refresh: () => void;
};

const WooProductsContext = createContext<WooCtx>({
  products: INITIAL_CATALOG,
  loading: true,
  lastSync: null,
  refresh: () => {},
});

export function WooProductsProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<AnyProduct[]>(INITIAL_CATALOG);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const isSyncing = useRef(false);
  const syncSeq = useRef(0);
  const unmounted = useRef(false);
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const countryCode = selectedCountry?.code ?? null;
  const cityId = selectedCity?.id ?? null;

  const sync = useCallback(async (force = false) => {
    if (isSyncing.current && !force) return;
    isSyncing.current = true;
    const seq = ++syncSeq.current;
    try {
      // Forward the selected delivery country / city to the API server,
      // which filters the WooCommerce catalogue by per-product
      // deliverability meta before returning it.
      const result = await fetchWooProducts({ countryCode, cityId });
      // Drop the result if a newer sync started or the provider unmounted.
      if (unmounted.current || seq !== syncSeq.current) return;
      // Bail out on transport / API failure so a network blip doesn't wipe
      // the catalogue (the previously rendered products stay visible).
      if (!result.ok) return;
      const woo = result.products;
      const hasDeliveryFilter = !!(countryCode || cityId);
      // When a delivery filter is active we trust the server's filtered
      // result (even an empty list — that means nothing is deliverable to
      // the chosen location). With no filter, skip empty payloads so a
      // misconfigured backend doesn't blank the catalogue.
      if (!hasDeliveryFilter && !woo.length) return;
      const merged = mergeProducts(CATALOG as AnyProduct[], woo, hasDeliveryFilter);
      setProducts(merged);
      setLastSync(new Date());
    } finally {
      isSyncing.current = false;
      if (!unmounted.current && seq === syncSeq.current) {
        setLoading(false);
      }
    }
  }, [countryCode, cityId]);

  // Initial fetch + unmount tracking
  useEffect(() => {
    unmounted.current = false;
    sync(true);
    return () => {
      unmounted.current = true;
    };
  }, [sync]);

  // Refresh every 5 hours
  useEffect(() => {
    const timer = setInterval(() => sync(true), SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [sync]);

  // Re-sync whenever the app comes back to the foreground
  useEffect(() => {
    const handleAppState = (next: AppStateStatus) => {
      if (next === "active") {
        const sinceLast = lastSync ? Date.now() - lastSync.getTime() : Infinity;
        // Only re-sync if it's been at least 30 minutes since last sync
        if (sinceLast > 30 * 60 * 1000) {
          sync();
        }
      }
    };
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [sync, lastSync]);

  return (
    <WooProductsContext.Provider value={{ products, loading, lastSync, refresh: () => sync(true) }}>
      {children}
    </WooProductsContext.Provider>
  );
}

export function useWooProducts() {
  return useContext(WooProductsContext);
}

function mergeProducts(
  staticCatalog: AnyProduct[],
  woo: WooProduct[],
  restrictToWoo = false,
): AnyProduct[] {
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
    // When the server has applied a delivery filter, drop static seed
    // items that aren't in the filtered WC result so undeliverable
    // products don't leak through the static catalogue.
    if (restrictToWoo && !wp) continue;
    if (wp) {
      const nextPriceValue = wp.priceValue ?? sp.priceValue;
      result.push({
        ...sp,
        name: wp.name || sp.name,
        price: wp.price ?? sp.price,
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
