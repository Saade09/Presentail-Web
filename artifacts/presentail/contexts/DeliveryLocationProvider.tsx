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
import { useCurrency } from "@/contexts/CurrencyContext";
import { fetchDeliveryLocations } from "@/services/deliveryLocationService";

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
  const { currencyCode, source: currencySource, setCurrencyCode } = useCurrency();
  const [deliveryLocations, setDeliveryLocations] = useState<DeliveryCountry[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<DeliveryCountry | null>(null);
  const [selectedCity, setSelectedCity] = useState<DeliveryCity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [persisted, setPersisted] = useState<PersistedShape | null>(null);
  const [persistedHydrated, setPersistedHydrated] = useState(false);

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

  // Resolve initial selection once both persisted state and locations are loaded.
  useEffect(() => {
    if (!persistedHydrated) return;
    if (deliveryLocations.length === 0) return;
    if (selectedCountry && selectedCity) return;

    let nextCountry: DeliveryCountry | null = null;
    let nextCity: DeliveryCity | null = null;

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

    // 2. Fallback to Lebanon (default), then first active country.
    //    Real IP-based country detection is not available in the app today, so
    //    we deliberately do not derive country from currency (which is just a
    //    display setting and would map e.g. USD to a wrong country). Once true
    //    country detection ships, slot it in here before the fallback.
    if (!nextCountry) {
      nextCountry = pickFallbackCountry(deliveryLocations);
    }

    if (!nextCity) {
      nextCity = firstActiveCity(nextCountry);
    }

    if (nextCountry) setSelectedCountry(nextCountry);
    if (nextCity) setSelectedCity(nextCity);
  }, [deliveryLocations, persisted, persistedHydrated, selectedCountry, selectedCity]);

  const selectCountry = useCallback(
    (country: DeliveryCountry) => {
      setSelectedCountry(country);
      // When the country changes, default the city to the first active one.
      const nextCity = firstActiveCity(country);
      setSelectedCity(nextCity);
      // If the user has not manually picked a currency, follow the country's default.
      if (currencySource !== "manual" && country.currency !== currencyCode) {
        setCurrencyCode(country.currency);
      }
      persist({
        selectedDeliveryCountryId: country.id,
        selectedDeliveryCountryCode: country.code,
        selectedDeliveryCountryName: country.name,
        selectedDeliveryCityId: nextCity?.id,
        selectedDeliveryCityName: nextCity?.name,
        manuallySelected: true,
      });
    },
    [currencyCode, currencySource, persist, setCurrencyCode],
  );

  const selectCity = useCallback(
    (city: DeliveryCity) => {
      setSelectedCity(city);
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
