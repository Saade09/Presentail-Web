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

  "categories.eyebrow": { en: "Curated Collections", ar: "تشكيلات مختارة" },
  "categories.title": { en: "Shop by Category", ar: "تسوّق حسب الفئة" },
  "categories.subtitle": {
    en: "From signature bouquets to artisanal cakes — every gift, beautifully presented.",
    ar: "من الباقات المميزة إلى الكعك الحرفي — كل هدية مقدّمة بأناقة.",
  },
  "categories.bouquets": { en: "Hand Bouquets", ar: "الباقات اليدوية" },
  "categories.boxes": { en: "Flower Boxes", ar: "صناديق الأزهار" },
  "categories.plants": { en: "Plants", ar: "النباتات" },
  "categories.cakes": { en: "Cakes", ar: "الكعك" },
  "categories.chocolate": { en: "Chocolate", ar: "الشوكولاتة" },
  "categories.gifts": { en: "Gift Sets", ar: "مجموعات الهدايا" },

  "occasions.eyebrow": { en: "For Every Moment", ar: "لكل لحظة" },
  "occasions.title": { en: "Shop by Occasion", ar: "تسوّق حسب المناسبة" },
  "occasions.subtitle": {
    en: "Find the perfect gesture for life's most meaningful days.",
    ar: "اعثر على اللمسة المثالية لأهمّ أيام الحياة.",
  },
  "occasions.birthday": { en: "Birthday", ar: "عيد ميلاد" },
  "occasions.romance": { en: "Love & Romance", ar: "الحب والرومانسية" },
  "occasions.anniversary": { en: "Anniversary", ar: "الذكرى السنوية" },
  "occasions.congrats": { en: "Congratulations", ar: "تهانينا" },
  "occasions.newBaby": { en: "New Baby", ar: "مولود جديد" },
  "occasions.thankYou": { en: "Thank You", ar: "شكراً لك" },
  "occasions.sympathy": { en: "Sympathy", ar: "تعازي" },
  "occasions.justBecause": { en: "Just Because", ar: "بدون سبب" },

  "brands.eyebrow": { en: "Maison Partners", ar: "شركاؤنا" },
  "brands.title": { en: "Brands We Love", ar: "علامات نحبّها" },
  "brands.subtitle": {
    en: "Hand-selected ateliers and chocolatiers, paired with our florals.",
    ar: "محترفون ومحلات شوكولاتة منتقاة بعناية، مع باقاتنا.",
  },
  "brands.viewAll": { en: "Discover All Brands", ar: "اكتشف كل العلامات" },

  "trust.delivery.title": { en: "Same-Day Delivery", ar: "توصيل في نفس اليوم" },
  "trust.delivery.desc": { en: "Order before 4pm across the GCC.", ar: "اطلب قبل الرابعة عصراً في الخليج." },
  "trust.fresh.title": { en: "Florist Guarantee", ar: "ضمان أزهارنا" },
  "trust.fresh.desc": { en: "Hand-arranged daily, freshness assured.", ar: "تنسيق يدوي يومي، نضارة مضمونة." },
  "trust.payment.title": { en: "Secure Checkout", ar: "دفع آمن" },
  "trust.payment.desc": { en: "Stripe, Mamo & PayPal protected.", ar: "محمي بـ Stripe وMamo وPayPal." },
  "trust.care.title": { en: "Concierge Care", ar: "خدمة شخصية" },
  "trust.care.desc": { en: "Real humans, ready to help 7 days.", ar: "فريق حقيقي لخدمتك ٧ أيام." },

  "editorial.eyebrow": { en: "The Atelier", ar: "الأتيليه" },
  "editorial.title": { en: "Designed in Beirut, Delivered Across the Gulf", ar: "مصمَّم في بيروت، يُسلَّم في الخليج" },
  "editorial.body": {
    en: "Every Presentail arrangement begins in our Gemmayzeh studio — where seasonal blooms, hand-tied ribbons, and considered details come together. We believe a gift should feel like an event, not an errand.",
    ar: "تبدأ كل تنسيقات بريزانتيل في استوديو الجميزة لدينا — حيث تجتمع الأزهار الموسمية والأشرطة المنسوجة يدوياً والتفاصيل المدروسة. نؤمن بأن الهدية يجب أن تكون حدثاً، لا مهمّة.",
  },
  "editorial.cta": { en: "Our Story", ar: "قصّتنا" },
  "editorial.feature1.title": { en: "Seasonal Sourcing", ar: "مصادر موسمية" },
  "editorial.feature1.desc": { en: "Direct from Dutch & Lebanese growers.", ar: "مباشرة من المزارعين الهولنديين واللبنانيين." },
  "editorial.feature2.title": { en: "Signature Wrapping", ar: "تغليف مميّز" },
  "editorial.feature2.desc": { en: "Our envelope-style boxes are made to keep.", ar: "علب على شكل مغلّف مصمّمة لتُحتفظ." },
  "editorial.badgeYears": { en: "12+", ar: "+12" },
  "editorial.badgeLabel": { en: "years of artistry", ar: "عاماً من الإبداع" },
  "editorial.imageAlt": { en: "Presentail atelier", ar: "أتيليه بريزانتيل" },

  "newsletter.eyebrow": { en: "Stay in Bloom", ar: "ابقَ مع الورد" },
  "newsletter.title": { en: "Join the Presentail List", ar: "انضم إلى قائمة بريزانتيل" },
  "newsletter.subtitle": {
    en: "Early access to seasonal collections, private events, and a 10% welcome offer.",
    ar: "وصول مبكّر للمجموعات الموسمية والفعاليات الخاصة، وعرض ترحيبي 10٪.",
  },
  "newsletter.placeholder": { en: "Your email address", ar: "بريدك الإلكتروني" },
  "newsletter.button": { en: "Subscribe", ar: "اشترك" },
  "newsletter.thanks": { en: "Welcome — check your inbox shortly.", ar: "أهلاً بك — تحقّق من بريدك قريباً." },
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
