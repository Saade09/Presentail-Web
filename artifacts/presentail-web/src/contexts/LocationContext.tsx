import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useDeliveryLocations, type DeliveryLocationsResponse } from "@/lib/queries";

const STORAGE_KEY = "presentail_delivery_location_v1";

export const PICKER_COUNTRY_CODES = ["LB", "AE", "CY"] as const;
export type PickerCountryCode = (typeof PICKER_COUNTRY_CODES)[number];

export function isPickerCountryCode(code: string): code is PickerCountryCode {
  return (PICKER_COUNTRY_CODES as readonly string[]).includes(code);
}

export function countrySlugToCode(slug: string): PickerCountryCode | null {
  const upper = slug.toUpperCase();
  return isPickerCountryCode(upper) ? upper : null;
}

export function countryCodeToSlug(code: string): string {
  return code.toLowerCase();
}

export type DeliveryCountry = DeliveryLocationsResponse["countries"][number];
export type DeliveryCity = DeliveryCountry["cities"][number];

type StoredLocation = { countryCode: string; cityId: string };

type LocationContextType = {
  countryCode: string | null;
  cityId: string | null;
  country: DeliveryCountry | null;
  city: DeliveryCity | null;
  countries: DeliveryCountry[];
  isLoadingCountries: boolean;
  setLocation: (countryCode: string, cityId: string) => void;
  clearLocation: () => void;
  isPickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
};

const LocationContext = createContext<LocationContextType | null>(null);

function readStored(): StoredLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLocation;
    if (!parsed?.countryCode || !parsed?.cityId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredLocation | null>(() => readStored());
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { data, isLoading } = useDeliveryLocations();

  const countries = useMemo<DeliveryCountry[]>(() => {
    const all = data?.countries ?? [];
    const order = new Map<PickerCountryCode, number>(
      PICKER_COUNTRY_CODES.map((c, i) => [c, i] as const),
    );
    const orderOf = (code: string): number =>
      isPickerCountryCode(code) ? (order.get(code) ?? 99) : 99;
    return all
      .filter((c) => isPickerCountryCode(c.code))
      .sort((a, b) => orderOf(a.code) - orderOf(b.code));
  }, [data]);

  const country = useMemo(() => {
    if (!stored) return null;
    return countries.find((c) => c.code === stored.countryCode) ?? null;
  }, [stored, countries]);

  const city = useMemo(() => {
    if (!stored || !country) return null;
    return country.cities.find((ct) => ct.id === stored.cityId) ?? null;
  }, [stored, country]);

  const setLocation = useCallback((countryCode: string, cityId: string) => {
    const next = { countryCode, cityId };
    setStored(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota / privacy mode errors
    }
  }, []);

  const clearLocation = useCallback(() => {
    setStored(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const openPicker = useCallback(() => setIsPickerOpen(true), []);
  const closePicker = useCallback(() => setIsPickerOpen(false), []);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setStored(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value: LocationContextType = {
    countryCode: stored?.countryCode ?? null,
    cityId: stored?.cityId ?? null,
    country,
    city,
    countries,
    isLoadingCountries: isLoading,
    setLocation,
    clearLocation,
    isPickerOpen,
    openPicker,
    closePicker,
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocationSelection() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocationSelection must be used within LocationProvider");
  return ctx;
}
