import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  startTransition,
  ReactNode,
} from "react";
import { getStartupItem } from "@/lib/startupState";
import { useLocation } from "wouter";
import { useDeliveryLocations, type DeliveryLocationsResponse } from "@/lib/queries";
import { useServerEvents } from "@/hooks/useServerEvents";
import {
  parseLocalePath,
  buildLocalePath,
  cityIdToSlug,
  isSupportedCountrySlug,
  isSupportedLang,
  type CountrySlug,
  type Lang,
} from "@/lib/locale-route";

const STORAGE_KEY = "presentail_delivery_location_v1";
const LANG_STORAGE_KEY = "presentail_lang_v1";

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
  deliveryDataStatus?: DeliveryLocationsResponse["dataStatus"];
  isLoadingCountries: boolean;
  setLocation: (countryCode: string, cityId: string) => void;
  clearLocation: () => void;
  isPickerOpen: boolean;
  pickerForceCountryStep: boolean;
  openPicker: (options?: { forceCountryStep?: boolean }) => void;
  closePicker: () => void;
};

export const LocationContext = createContext<LocationContextType | null>(null);

function readStored(): StoredLocation | null {
  try {
    const raw = getStartupItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLocation;
    if (!parsed?.countryCode || !parsed?.cityId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readStoredLang(): Lang {
  const v = getStartupItem(LANG_STORAGE_KEY);
  return v && isSupportedLang(v) ? v : "en";
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [path, navigate] = useLocation();
  const parsed = parseLocalePath(path);

  const [stored, setStored] = useState<StoredLocation | null>(() => readStored());
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerForceCountryStep, setPickerForceCountryStep] = useState(false);
  const { data, isLoading } = useDeliveryLocations();

  // Subscribe to server-sent events so any change made in OS (city active
  // state, express flag, time slots, fees) propagates to this tab immediately
  // when the API server receives the delivery_config.updated webhook — without
  // waiting for the 10-minute React Query poll interval.
  useServerEvents();

  const countries = useMemo<DeliveryCountry[]>(() => {
    const all = data?.countries ?? [];
    const order = new Map<PickerCountryCode, number>(
      PICKER_COUNTRY_CODES.map((c, i) => [c, i] as const),
    );
    const orderOf = (code: string): number =>
      isPickerCountryCode(code) ? (order.get(code) ?? 99) : 99;
    return all
      .filter((c) => isPickerCountryCode(c.code) && c.isActive !== false)
      .sort((a, b) => orderOf(a.code) - orderOf(b.code))
      .map((c) => ({ ...c, cities: c.cities }));
  }, [data]);

  // URL is the source of truth when it carries a valid locale prefix.
  const fromUrlCountryCode = parsed.country
    ? (parsed.country.toUpperCase() as PickerCountryCode)
    : null;
  const fromUrlCityId =
    parsed.country && parsed.city ? `${parsed.country}-${parsed.city}` : null;

  const countryCode = fromUrlCountryCode ?? stored?.countryCode ?? null;
  const cityId = fromUrlCityId ?? stored?.cityId ?? null;

  // Persist URL → localStorage so reloads from `/` still know the location.
  useEffect(() => {
    if (!fromUrlCountryCode || !fromUrlCityId) return;
    if (
      stored?.countryCode === fromUrlCountryCode &&
      stored?.cityId === fromUrlCityId
    ) {
      return;
    }
    const next = { countryCode: fromUrlCountryCode, cityId: fromUrlCityId };
    startTransition(() => setStored(next));
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, [fromUrlCountryCode, fromUrlCityId, stored?.countryCode, stored?.cityId]);

  const country = useMemo(() => {
    if (!countryCode) return null;
    return countries.find((c) => c.code === countryCode) ?? null;
  }, [countryCode, countries]);

  const city = useMemo(() => {
    if (!cityId || !country) return null;
    return country.cities.find((ct) => ct.id === cityId) ?? null;
  }, [cityId, country]);

  const setLocation = useCallback(
    (cc: string, cid: string) => {
      const next: StoredLocation = { countryCode: cc, cityId: cid };
      setStored(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      const newCountrySlug = cc.toLowerCase();
      if (!isSupportedCountrySlug(newCountrySlug)) return;
      const newCitySlug = cityIdToSlug(cid);
      const lang: Lang = parsed.lang ?? readStoredLang();
      const rest = parsed.hasLocalePrefix ? parsed.rest : "";
      const newPath = buildLocalePath({
        lang,
        country: newCountrySlug as CountrySlug,
        city: newCitySlug,
        rest,
      });
      const search = typeof window !== "undefined" ? window.location.search : "";
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      navigate(newPath + search + hash);
    },
    [parsed.lang, parsed.rest, parsed.hasLocalePrefix, navigate],
  );

  const clearLocation = useCallback(() => {
    setStored(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const openPicker = useCallback(
    (options?: { forceCountryStep?: boolean }) => {
      setPickerForceCountryStep(!!options?.forceCountryStep);
      setIsPickerOpen(true);
    },
    [],
  );
  const closePicker = useCallback(() => {
    setIsPickerOpen(false);
    setPickerForceCountryStep(false);
  }, []);


  // Sync across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        const parsed = e.newValue
          ? (JSON.parse(e.newValue) as StoredLocation)
          : null;
        setStored(
          parsed?.countryCode && parsed?.cityId ? parsed : null,
        );
      } catch {
        setStored(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value: LocationContextType = {
    countryCode,
    cityId,
    country,
    city,
    countries,
    deliveryDataStatus: data?.dataStatus ?? "fallback",
    isLoadingCountries: isLoading,
    setLocation,
    clearLocation,
    isPickerOpen,
    pickerForceCountryStep,
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
