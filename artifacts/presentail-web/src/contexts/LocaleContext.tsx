import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from "react";

export type Language = "en" | "ar";

type Dict = Record<string, { en: string; ar: string }>;

const STRINGS: Dict = {
  "utility.deliverTo": { en: "Delivering to", ar: "التوصيل إلى" },
  "utility.help": { en: "Need help? We deliver across the GCC.", ar: "بحاجة إلى مساعدة؟ نوصّل في جميع أنحاء الخليج." },
  "nav.occasions": { en: "Occasions", ar: "المناسبات" },
  "nav.flowersPlants": { en: "Flowers & Plants", ar: "الأزهار والنباتات" },
  "nav.gifts": { en: "Gifts", ar: "الهدايا" },
  "nav.brands": { en: "Brands", ar: "العلامات" },
  "nav.about": { en: "About Us", ar: "من نحن" },
  "nav.searchAria": { en: "Search", ar: "بحث" },
  "nav.accountAria": { en: "Account", ar: "الحساب" },
  "nav.bagAria": { en: "Bag", ar: "الحقيبة" },
  "carousel.prev": { en: "Previous slide", ar: "الشريحة السابقة" },
  "carousel.next": { en: "Next slide", ar: "الشريحة التالية" },
  "bestSellers.title": { en: "Best Sellers", ar: "الأكثر مبيعاً" },
  "bestSellers.viewAll": { en: "View All", ar: "عرض الكل" },
  "lang.toggle": { en: "العربية", ar: "English" },
};

type LocaleContextType = {
  language: Language;
  setLanguage: (l: Language) => void;
  dir: "ltr" | "rtl";
  t: (key: keyof typeof STRINGS | string) => string;
};

const LocaleContext = createContext<LocaleContextType | null>(null);

const STORAGE_KEY = "presentail_lang_v1";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    return saved === "ar" ? "ar" : "en";
  });

  const dir: "ltr" | "rtl" = language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
    localStorage.setItem(STORAGE_KEY, language);
  }, [language, dir]);

  const value = useMemo<LocaleContextType>(
    () => ({
      language,
      setLanguage: setLanguageState,
      dir,
      t: (key) => {
        const entry = STRINGS[key as string];
        return entry ? entry[language] : (key as string);
      },
    }),
    [language, dir],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
