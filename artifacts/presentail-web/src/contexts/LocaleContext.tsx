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
import {
  parseLocalePath,
  switchLanguage,
  isSupportedLang,
  type Lang,
} from "@/lib/locale-route";
import { STRINGS, STRINGS_FR } from "@/locales/index";

export type Language = Lang;

export { STRINGS, STRINGS_FR };

type LocaleContextType = {
  language: Language;
  setLanguage: (l: Language) => void;
  dir: "ltr" | "rtl";
  t: (key: keyof typeof STRINGS | string, params?: Record<string, string | number>) => string;
  countryName: (code: string, fallback: string) => string;
  cityName: (id: string, fallback: string) => string;
};

export const LocaleContext = createContext<LocaleContextType | null>(null);

const STORAGE_KEY = "presentail_lang_v1";
const LEGACY_STORAGE_KEY = "presentail_language_v1";

// Country / city name localization is sourced at runtime from the API's
// `/delivery-locations` payload (`localizedNames` on each country / city).
import { useDeliveryLocations } from "@/lib/queries";

type LocalizedNames = { en?: string; ar?: string; fr?: string };

function pickLocalized(
  names: LocalizedNames | undefined,
  language: Language,
  fallback: string,
): string {
  if (!names) return fallback;
  const exact = names[language];
  if (typeof exact === "string" && exact.length > 0) return exact;
  if (language !== "en" && typeof names.en === "string" && names.en.length > 0) {
    return names.en;
  }
  return fallback;
}

function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

function readStoredLang(): Language {
  const saved = getStartupItem(STORAGE_KEY);
  if (saved && isSupportedLang(saved)) return saved;
  const legacy = getStartupItem(LEGACY_STORAGE_KEY);
  if (legacy && isSupportedLang(legacy)) {
    try {
      window.localStorage.setItem(STORAGE_KEY, legacy);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignore
    }
    return legacy;
  }
  return "en";
}

const BASE_PREFIX = (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") ?? "";

function currentRelativeUrl(routerPath: string): string {
  if (typeof window === "undefined") return routerPath;
  return routerPath + window.location.search + window.location.hash;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [path, navigate] = useLocation();
  const parsed = parseLocalePath(path);

  const [stored, setStored] = useState<Language>(() => readStoredLang());

  const { data: deliveryLocations } = useDeliveryLocations();
  const { countryNames, cityNames } = useMemo(() => {
    const cN = new Map<string, LocalizedNames>();
    const cyN = new Map<string, LocalizedNames>();
    for (const country of deliveryLocations?.countries ?? []) {
      if (country.localizedNames) cN.set(country.code, country.localizedNames);
      for (const city of country.cities ?? []) {
        if (city.localizedNames) cyN.set(city.id, city.localizedNames);
      }
    }
    return { countryNames: cN, cityNames: cyN };
  }, [deliveryLocations]);

  const language: Language = parsed.lang ?? stored;
  const dir: "ltr" | "rtl" = language === "ar" ? "rtl" : "ltr";

  // Persist URL-derived language to localStorage so reloads from `/` keep it.
  useEffect(() => {
    if (parsed.lang && parsed.lang !== stored) {
      startTransition(() => setStored(parsed.lang!));
      try {
        window.localStorage.setItem(STORAGE_KEY, parsed.lang);
      } catch {
        // ignore
      }
    }
  }, [parsed.lang, stored]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language, dir]);

  // Sync across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && isSupportedLang(e.newValue)) {
        setStored(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setLanguage = useCallback(
    (lang: Language) => {
      setStored(lang);
      try {
        window.localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        // ignore
      }
      // Use window.location.pathname (stripped of Vite's BASE_URL) to get
      // the full locale path regardless of any nested wouter router scope.
      const rawPath =
        typeof window !== "undefined"
          ? window.location.pathname.slice(BASE_PREFIX.length) +
            window.location.search +
            window.location.hash
          : currentRelativeUrl(path);
      const next = switchLanguage(rawPath || "/", lang);
      if (next !== (rawPath || "/")) {
        navigate(next);
      }
    },
    [path, navigate],
  );

  const value = useMemo<LocaleContextType>(
    () => ({
      language,
      setLanguage,
      dir,
      t: (key, params) => {
        const k = key as string;
        if (language === "fr") {
          const fr = STRINGS_FR[k];
          if (fr) return format(fr, params);
          const en = STRINGS[k]?.en;
          return format(en ?? k, params);
        }
        const entry = STRINGS[k];
        if (!entry) return format(k, params);
        return format(entry[language as "en" | "ar"], params);
      },
      countryName: (code, fallback) =>
        pickLocalized(countryNames.get(code), language, fallback),
      cityName: (id, fallback) =>
        pickLocalized(cityNames.get(id), language, fallback),
    }),
    [language, dir, setLanguage, countryNames, cityNames],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

// Re-export for callers that still import from this module.
export { BASE_PREFIX };
