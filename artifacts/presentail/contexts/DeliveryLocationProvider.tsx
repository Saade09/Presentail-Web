import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DEFAULT_FALLBACK_COUNTRY_CODE,
  type DeliveryCity,
  type DeliveryCountry,
} from "@/constants/deliveryLocations";
import { fetchDeliveryLocations } from "@/services/deliveryLocationService";
import {
  detectGeoFromDeviceLocation,
  detectGeoFromLocation,
} from "@/services/locationCurrencyService";
import { updateCachedStoreLocation } from "@/lib/storeHeaders";

const STORAGE_KEY = "@presentail/delivery-location-v1";

type PersistedShape = {
  selectedDeliveryCountryId?: string;
  selectedDeliveryCountryCode?: string;
  selectedDeliveryCountryName?: string;
  selectedDeliveryCityId?: string;
  selectedDeliveryCityName?: string;
  manuallySelected?: boolean;
};

export type DeliveryLocationContextValue = {
  selectedCountry: DeliveryCountry | null;
  selectedCity: DeliveryCity | null;
  deliveryLocations: DeliveryCountry[];
  isLoading: boolean;
  error: Error | null;
  selectCountry: (country: DeliveryCountry) => void;
  selectCity: (city: DeliveryCity) => void;
  refreshDeliveryLocations: () => Promise<void>;
};

const DeliveryLocationContext = createContext<DeliveryLocationContextValue | null>(null);

function findCountryByCode(
  list: DeliveryCountry[],
  code: string | null | undefined,
): DeliveryCountry | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  return list.find((c) => c.code.toUpperCase() === upper && c.isActive) ?? null;
}

function findCountryById(list: DeliveryCountry[], id: string | null | undefined) {
  if (!id) return null;
  return list.find((c) => c.id === id) ?? null;
}

function pickFallbackCountry(list: DeliveryCountry[]): DeliveryCountry | null {
  const lebanon = findCountryByCode(list, DEFAULT_FALLBACK_COUNTRY_CODE);
  if (lebanon) return lebanon;
  return list.find((c) => c.isActive) ?? list[0] ?? null;
}

function firstActiveCity(country: DeliveryCountry | null): DeliveryCity | null {
  if (!country) return null;
  return country.cities.find((c) => c.isActive) ?? country.cities[0] ?? null;
}

export function DeliveryLocationProvider({ children }: { children: React.ReactNode }) {
  const [deliveryLocations, setDeliveryLocations] = useState<DeliveryCountry[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<DeliveryCountry | null>(null);
  const [selectedCity, setSelectedCity] = useState<DeliveryCity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [persisted, setPersisted] = useState<PersistedShape | null>(null);
  const [persistedHydrated, setPersistedHydrated] = useState(false);
  const [autoDetectedCountryCode, setAutoDetectedCountryCode] = useState<string | null>(null);
  const [autoDetectionDone, setAutoDetectionDone] = useState(false);

  // Hydrate persisted selection eagerly so the header doesn't flash on cold launch.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as PersistedShape;
            if (parsed && typeof parsed === "object") {
              setPersisted(parsed);
            }
          } catch {
            // ignore parse errors
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPersistedHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: PersistedShape) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // best-effort persistence
    }
  }, []);

  const loadLocations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await fetchDeliveryLocations();
    setDeliveryLocations(result.countries);
    if (result.source === "fallback" && result.error) {
      // Fallback succeeded; don't surface error to UI when we have data.
      setError(null);
    }
    setIsLoading(false);
    return result;
  }, []);

  // Initial load
  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  // Kick off country detection in parallel with the locations fetch so the
  // first paint can pick the right delivery store (and therefore the right
  // currency / payment methods) without the user opening the country sheet.
  // Precedence mirrors CurrencyContext: device GPS → IP → none. Both helpers
  // are cached after the first call by the geo service, so this duplicates
  // no network work.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const device = await detectGeoFromDeviceLocation();
        if (cancelled) return;
        if (device?.countryCode) {
          setAutoDetectedCountryCode(device.countryCode);
          return;
        }
        const geo = await detectGeoFromLocation();
        if (cancelled) return;
        setAutoDetectedCountryCode(geo.countryCode);
      } catch {
        // ignore — IP-based / fallback path will still run on next mount
      } finally {
        if (!cancelled) setAutoDetectionDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve initial selection once persisted state, locations and (when no
  // persisted country exists) IP detection have all settled.
  useEffect(() => {
    if (!persistedHydrated) return;
    if (deliveryLocations.length === 0) return;
    if (selectedCountry && selectedCity) return;

    const hasPersistedCountry =
      !!(persisted?.selectedDeliveryCountryId || persisted?.selectedDeliveryCountryCode);
    // Only wait on geo detection when we actually need it (no persisted pick).
    if (!hasPersistedCountry && !autoDetectionDone) return;

    let nextCountry: DeliveryCountry | null = null;
    let nextCity: DeliveryCity | null = null;
    let autoDetected = false;

    // 1. Persisted selection wins.
    if (persisted) {
      nextCountry =
        findCountryById(deliveryLocations, persisted.selectedDeliveryCountryId) ??
        findCountryByCode(deliveryLocations, persisted.selectedDeliveryCountryCode);
      if (nextCountry && persisted.selectedDeliveryCityId) {
        nextCity =
          nextCountry.cities.find((c) => c.id === persisted.selectedDeliveryCityId) ??
          null;
      }
    }

    // 2. IP-based country detection (LB / AE / CY today). When the caller's
    //    IP maps to one of our active delivery countries, pick it so the
    //    header, prices, currency and payment methods match their region on
    //    first launch without forcing them to open the country sheet.
    if (!nextCountry) {
      const detected = findCountryByCode(deliveryLocations, autoDetectedCountryCode);
      if (detected) {
        nextCountry = detected;
        autoDetected = true;
      }
    }

    // 3. Fallback to Lebanon (default), then first active country.
    if (!nextCountry) {
      nextCountry = pickFallbackCountry(deliveryLocations);
    }

    if (!nextCity) {
      nextCity = firstActiveCity(nextCountry);
    }

    if (nextCountry) setSelectedCountry(nextCountry);
    if (nextCity) setSelectedCity(nextCity);
    updateCachedStoreLocation(nextCountry?.code ?? null, nextCity?.id ?? null);
    // Persist the auto-detected pick so subsequent launches skip the geo
    // round-trip but keep `manuallySelected: false` — the country sheet UI
    // can still treat the selection as a soft default and the user override
    // path remains unchanged. Note: display currency is NOT touched here —
    // it's owned entirely by CurrencyContext, which derives it from the
    // user's phone location each launch.
    if (autoDetected && nextCountry) {
      persist({
        selectedDeliveryCountryId: nextCountry.id,
        selectedDeliveryCountryCode: nextCountry.code,
        selectedDeliveryCountryName: nextCountry.name,
        selectedDeliveryCityId: nextCity?.id,
        selectedDeliveryCityName: nextCity?.name,
        manuallySelected: false,
      });
    }
  }, [
    deliveryLocations,
    persisted,
    persistedHydrated,
    autoDetectedCountryCode,
    autoDetectionDone,
    selectedCountry,
    selectedCity,
    persist,
  ]);

  const selectCountry = useCallback(
    (country: DeliveryCountry) => {
      setSelectedCountry(country);
      const nextCity = firstActiveCity(country);
      setSelectedCity(nextCity);
      updateCachedStoreLocation(country.code, nextCity?.id ?? null);
      persist({
        selectedDeliveryCountryId: country.id,
        selectedDeliveryCountryCode: country.code,
        selectedDeliveryCountryName: country.name,
        selectedDeliveryCityId: nextCity?.id,
        selectedDeliveryCityName: nextCity?.name,
        manuallySelected: true,
      });
    },
    [persist],
  );

  const selectCity = useCallback(
    (city: DeliveryCity) => {
      setSelectedCity(city);
      updateCachedStoreLocation(selectedCountry?.code ?? null, city.id);
      const country = selectedCountry;
      persist({
        selectedDeliveryCountryId: country?.id,
        selectedDeliveryCountryCode: country?.code,
        selectedDeliveryCountryName: country?.name,
        selectedDeliveryCityId: city.id,
        selectedDeliveryCityName: city.name,
        manuallySelected: true,
      });
    },
    [persist, selectedCountry],
  );

  const refreshDeliveryLocations = useCallback(async () => {
    const result = await loadLocations();
    if (result.source === "remote") {
      // Re-resolve current selection against remote data so stale ids don't linger.
      setSelectedCountry((prev) => {
        if (!prev) return prev;
        const fresh =
          findCountryById(result.countries, prev.id) ??
          findCountryByCode(result.countries, prev.code);
        return fresh ?? prev;
      });
    }
  }, [loadLocations]);

  const value = useMemo<DeliveryLocationContextValue>(
    () => ({
      selectedCountry,
      selectedCity,
      deliveryLocations,
      isLoading,
      error,
      selectCountry,
      selectCity,
      refreshDeliveryLocations,
    }),
    [
      selectedCountry,
      selectedCity,
      deliveryLocations,
      isLoading,
      error,
      selectCountry,
      selectCity,
      refreshDeliveryLocations,
    ],
  );

  return (
    <DeliveryLocationContext.Provider value={value}>
      {children}
    </DeliveryLocationContext.Provider>
  );
}

export function useDeliveryLocationContext() {
  const ctx = useContext(DeliveryLocationContext);
  if (!ctx) {
    throw new Error(
      "useDeliveryLocationContext must be used within a DeliveryLocationProvider",
    );
  }
  return ctx;
}
