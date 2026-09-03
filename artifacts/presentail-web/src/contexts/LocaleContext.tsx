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
  isLangAllowedForCountry,
  type Lang,
} from "@/lib/locale-route";
import { STRINGS, STRINGS_FR, STRINGS_EL } from "@/locales/index";

export type Language = Lang;

export { STRINGS, STRINGS_FR, STRINGS_EL };

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

type LocalizedNames = { en?: string; ar?: string; fr?: string; el?: string };

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

  // Blog routes live under a bare /{lang}/blog prefix (no country segment), so
  // parseLocalePath can't see their language — derive it from the path directly.
  const blogLangMatch = path.match(/^\/(en|ar|fr|el)\/blog(?:\/|$)/);
  const blogLang = blogLangMatch ? (blogLangMatch[1] as Language) : null;

  const language: Language = parsed.lang ?? blogLang ?? stored;
  const dir: "ltr" | "rtl" = language === "ar" ? "rtl" : "ltr";

  // Greek is Cyprus-only: a /el-ae/... or /el-lb/... URL (e.g. a Greek-selecting
  // shopper switching to a non-Cyprus city) gracefully falls back to English.
  useEffect(() => {
    if (
      parsed.hasLocalePrefix &&
      parsed.lang &&
      parsed.country &&
      !isLangAllowedForCountry(parsed.lang, parsed.country)
    ) {
      navigate(switchLanguage(currentRelativeUrl(path), "en"), { replace: true });
    }
  }, [parsed.hasLocalePrefix, parsed.lang, parsed.country, path, navigate]);

  // Persist URL-derived language to localStorage so reloads from `/` keep it.
  const urlLang = parsed.lang ?? blogLang;
  useEffect(() => {
    if (urlLang && urlLang !== stored) {
      startTransition(() => setStored(urlLang));
      try {
        window.localStorage.setItem(STORAGE_KEY, urlLang);
      } catch {
        // ignore
      }
    }
  }, [urlLang, stored]);

  useEffect(() => {
    // lang is set by DocumentMeta (App.tsx) which has country context and
    // can emit the full locale code (e.g. "en-LB") to match hreflang. This
    // effect only manages text direction so the document reflects RTL/LTR
    // immediately when the language changes, before DocumentMeta re-runs.
    document.documentElement.dir = dir;
  }, [dir]);

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
        if (language === "fr" || language === "el") {
          const companion = language === "fr" ? STRINGS_FR[k] : STRINGS_EL[k];
          if (companion) return format(companion, params);
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
