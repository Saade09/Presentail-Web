import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { fetchWooProducts, type WooProduct } from "@/lib/woo";

type AnyProduct = WooProduct;

const SYNC_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours

const INITIAL_CATALOG: AnyProduct[] = [];

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
  // Start loading: INITIAL_CATALOG is empty so the UI has no products to show
  // until the first sync completes. Background re-syncs (interval / foreground)
  // run while products are already visible, so they keep loading=false.
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const isSyncing = useRef(false);
  const syncSeq = useRef(0);
  const unmounted = useRef(false);
  const { selectedCountry, selectedCity } = useDeliveryLocation();
  const { needsOnboarding, hydrated: onboardingHydrated } = useOnboarding();
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
      // Sync succeeded with a non-empty result — trust the WC payload as
      // the source of truth for which products are currently visible. Any
      // static seed item missing from WC is either undeliverable for the
      // selected store, out of stock, or hidden by category, so it must
      // not leak through the static fallback.
      const merged = mergeProducts([], woo, true);
      setProducts(merged);
      setLastSync(new Date());
    } finally {
      isSyncing.current = false;
      if (!unmounted.current && seq === syncSeq.current) {
        setLoading(false);
      }
    }
  }, [countryCode, cityId]);

  // Initial fetch + unmount tracking. Defer until the first-run country
  // picker (Task #286) is dismissed so a UAE / Cyprus shopper never briefly
  // sees catalogue data fetched against the default Lebanon store.
  useEffect(() => {
    unmounted.current = false;
    if (onboardingHydrated && !needsOnboarding) {
      sync(true);
    }
    return () => {
      unmounted.current = true;
    };
  }, [sync, onboardingHydrated, needsOnboarding]);

  // Refresh every 5 hours
  useEffect(() => {
    if (!onboardingHydrated || needsOnboarding) return;
    const timer = setInterval(() => sync(true), SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [sync, onboardingHydrated, needsOnboarding]);

  // Re-sync whenever the app comes back to the foreground
  useEffect(() => {
    if (!onboardingHydrated || needsOnboarding) return;
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
  }, [sync, lastSync, onboardingHydrated, needsOnboarding]);

  // Expose loading as true only when we have no products to show yet (initial
  // load). Once products are in state — even stale from a previous
  // country/city — consumers receive loading:false so existing cards stay
  // visible while the background re-fetch runs (stale-while-revalidate).
  const isInitialLoading = loading && products.length === 0;

  return (
    <WooProductsContext.Provider value={{ products, loading: isInitialLoading, lastSync, refresh: () => sync(true) }}>
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
    // When we trust the WC payload (sync succeeded), drop any static
    // seed item that isn't in the filtered WC result — that covers
    // out-of-stock products, hidden categories, and undeliverable items
    // for the selected store. They must not leak through the fallback.
    if (restrictToWoo && !wp) continue;
    // Even without restrictToWoo, an explicit `inStock === false` on the
    // matched WC payload must hide the static item.
    if (wp && wp.inStock === false) continue;
    if (wp) {
      const nextPriceValue = wp.priceValue ?? sp.priceValue;
      result.push({
        ...sp,
        name: wp.name || sp.name,
        price: wp.price ?? sp.price,
        priceValue: nextPriceValue,
        image: wp.image ?? sp.image,
        images: wp.images ?? sp.images,
        description: sp.description ?? wp.description,
        tag: sp.tag ?? wp.tag,
        wcId: wp.wcId,
        popularity: wp.popularity ?? 0,
        inStock: wp.inStock,
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
      images: wp.images,
      category: wp.category,
      description: wp.description,
      tag: wp.tag,
      occasions: [],
      popularity: wp.popularity ?? 0,
      inStock: wp.inStock,
    });
  }

  return result;
}
