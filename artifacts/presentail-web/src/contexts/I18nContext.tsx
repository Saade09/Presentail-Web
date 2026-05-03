import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, ReactNode } from "react";

export type Language = "en" | "ar";
export type Direction = "ltr" | "rtl";

const STORAGE_KEY = "presentail_language_v1";

type Dict = Record<string, string>;

const translations: Record<Language, Dict> = {
  en: {
    "picker.headingCountry": "Send your gift to:",
    "picker.headingCity": "Send your gift to:",
    "picker.subtitleCountry": "Select the recipient's country",
    "picker.subtitleCity": "Select the recipient's city",
    "picker.changeCountry": "Change country",
    "picker.toggleArabic": "العربية",
    "picker.toggleEnglish": "English",

    "nav.shop": "Shop",
    "nav.occasions": "Occasions",
    "nav.brands": "Brands",
    "nav.about": "About",
    "nav.deliveringTo": "Delivering to",
    "nav.selectCity": "Select city",
    "nav.languageToggle": "العربية",

    "footer.tagline": "Beirut's premium florist and gifting house. Confident, generous, unhurried.",
    "footer.address1": "Rue Gouraud, Gemmayzeh",
    "footer.address2": "Beirut, Lebanon",
    "footer.shop": "Shop",
    "footer.handBouquets": "Hand Bouquets",
    "footer.flowerBoxes": "Flower Boxes",
    "footer.plants": "Plants",
    "footer.cakes": "Cakes",
    "footer.occasions": "Occasions",
    "footer.birthday": "Birthday",
    "footer.romance": "Romance",
    "footer.congratulations": "Congratulations",
    "footer.condolences": "Condolences",
    "footer.help": "Help",
    "footer.contact": "Contact Us",
    "footer.delivery": "Delivery Info",
    "footer.faq": "FAQ",
    "footer.terms": "Terms & Conditions",
    "footer.deliveryComingSoon": "Delivery Info — coming soon",
    "footer.faqComingSoon": "FAQ — coming soon",
    "footer.termsComingSoon": "Terms & Conditions — coming soon",
    "footer.copyright": "© {year} Presentail Lebanon. All rights reserved.",
    "footer.payments": "Secure payments by Stripe & Mamo",
  },
  ar: {
    "picker.headingCountry": "أرسل هديتك إلى:",
    "picker.headingCity": "أرسل هديتك إلى:",
    "picker.subtitleCountry": "اختر دولة المستلم",
    "picker.subtitleCity": "اختر مدينة المستلم",
    "picker.changeCountry": "تغيير الدولة",
    "picker.toggleArabic": "العربية",
    "picker.toggleEnglish": "English",

    "nav.shop": "المتجر",
    "nav.occasions": "المناسبات",
    "nav.brands": "العلامات",
    "nav.about": "من نحن",
    "nav.deliveringTo": "التوصيل إلى",
    "nav.selectCity": "اختر المدينة",
    "nav.languageToggle": "English",

    "footer.tagline": "بائع الزهور والهدايا الفاخر في بيروت. بثقة وكرم وعلى مهل.",
    "footer.address1": "شارع غورو، الجميزة",
    "footer.address2": "بيروت، لبنان",
    "footer.shop": "المتجر",
    "footer.handBouquets": "باقات يدوية",
    "footer.flowerBoxes": "صناديق الزهور",
    "footer.plants": "نباتات",
    "footer.cakes": "كعك",
    "footer.occasions": "المناسبات",
    "footer.birthday": "عيد ميلاد",
    "footer.romance": "رومانسية",
    "footer.congratulations": "تهنئة",
    "footer.condolences": "تعزية",
    "footer.help": "المساعدة",
    "footer.contact": "اتصل بنا",
    "footer.delivery": "معلومات التوصيل",
    "footer.faq": "الأسئلة الشائعة",
    "footer.terms": "الشروط والأحكام",
    "footer.deliveryComingSoon": "معلومات التوصيل — قريباً",
    "footer.faqComingSoon": "الأسئلة الشائعة — قريباً",
    "footer.termsComingSoon": "الشروط والأحكام — قريباً",
    "footer.copyright": "© {year} بريزنتيل لبنان. جميع الحقوق محفوظة.",
    "footer.payments": "مدفوعات آمنة عبر Stripe و Mamo",
  },
};

// Localized names for the picker's supported countries and their cities.
const countryNamesAr: Record<string, string> = {
  LB: "لبنان",
  AE: "الإمارات العربية المتحدة",
  CY: "قبرص",
};

const cityNamesAr: Record<string, string> = {
  "lb-beirut": "بيروت",
  "lb-jounieh": "جونيه",
  "lb-tripoli": "طرابلس",
  "lb-saida": "صيدا",
  "lb-tyre": "صور",
  "lb-zahle": "زحلة",
  "lb-byblos": "جبيل",
  "lb-baalbek": "بعلبك",
  "ae-dubai": "دبي",
  "ae-abu-dhabi": "أبو ظبي",
  "ae-sharjah": "الشارقة",
  "ae-ajman": "عجمان",
  "ae-ras-al-khaimah": "رأس الخيمة",
  "ae-fujairah": "الفجيرة",
  "ae-umm-al-quwain": "أم القيوين",
  "ae-al-ain": "العين",
  "cy-nicosia": "نيقوسيا",
  "cy-limassol": "ليماسول",
  "cy-larnaca": "لارنكا",
  "cy-paphos": "بافوس",
};

type I18nContextType = {
  lang: Language;
  dir: Direction;
  setLang: (l: Language) => void;
  toggleLang: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  countryName: (code: string, fallback: string) => string;
  cityName: (id: string, fallback: string) => string;
};

const I18nContext = createContext<I18nContextType | null>(null);

function readStored(): Language | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "en" || raw === "ar") return raw;
  } catch {
    // ignore
  }
  return null;
}

function detectInitial(): Language {
  if (typeof window === "undefined") return "en";
  const stored = readStored();
  if (stored) return stored;
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("lang");
    if (q === "ar" || q === "en") return q;
  } catch {
    // ignore
  }
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const initial = detectInitial();
    if (typeof document !== "undefined") {
      const d = initial === "ar" ? "rtl" : "ltr";
      document.documentElement.setAttribute("lang", initial);
      document.documentElement.setAttribute("dir", d);
    }
    return initial;
  });
  const dir: Direction = lang === "ar" ? "rtl" : "ltr";

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
  }, [lang, dir]);

  const setLang = useCallback((l: Language) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === "en" ? "ar" : "en");
  }, [lang, setLang]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const next = readStored();
        if (next) setLangState(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<I18nContextType>(() => {
    const dict = translations[lang];
    const t = (key: string, vars?: Record<string, string | number>) => {
      let s = dict[key] ?? translations.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, String(v));
        }
      }
      return s;
    };
    const countryName = (code: string, fallback: string) =>
      lang === "ar" ? (countryNamesAr[code] ?? fallback) : fallback;
    const cityName = (id: string, fallback: string) =>
      lang === "ar" ? (cityNamesAr[id] ?? fallback) : fallback;
    return { lang, dir, setLang, toggleLang, t, countryName, cityName };
  }, [lang, dir, setLang, toggleLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
