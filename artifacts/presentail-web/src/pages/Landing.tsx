import { useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import {
  PICKER_COUNTRY_CODES,
  countryCodeToSlug,
  useLocationSelection,
  type DeliveryCountry,
} from "@/contexts/LocationContext";

const FALLBACK_COUNTRIES: Array<{ code: string; name: string; flag: string }> = [
  { code: "LB", name: "Lebanon", flag: "🇱🇧" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "CY", name: "Cyprus", flag: "🇨🇾" },
];

export default function Landing() {
  const { language, setLanguage, t, countryName } = useLocale();
  const { countries, isLoadingCountries, setLocation } = useLocationSelection();
  const [, navigate] = useLocation();

  const rows = useMemo(() => {
    const byCode = new Map<string, DeliveryCountry>();
    for (const c of countries) byCode.set(c.code, c);
    return PICKER_COUNTRY_CODES.map((code) => {
      const live = byCode.get(code);
      const fallback = FALLBACK_COUNTRIES.find((f) => f.code === code)!;
      return {
        code,
        flag: live?.flag ?? fallback.flag,
        name: live?.name ?? fallback.name,
        firstCityId: live?.cities[0]?.id ?? null,
        ready: !!live && !!live.cities[0],
      };
    });
  }, [countries]);

  const handleSelect = (code: string, firstCityId: string | null) => {
    if (firstCityId) {
      setLocation(code, firstCityId);
    }
    navigate(`/${countryCodeToSlug(code)}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="page-landing">
      <div className="w-full max-w-[560px] mx-auto px-6 pt-10 pb-16 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-10">
          <div className="flex-1" />
          <div
            className="flex items-center justify-center"
            data-testid="text-wordmark"
          >
            <span className="font-serif text-primary text-5xl md:text-6xl leading-none">
              {language === "ar" ? "بريزانتيل" : "Presentail"}
            </span>
          </div>
          <div className="flex-1 flex justify-end">
            <button
              type="button"
              onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-language-toggle"
            >
              {t("lang.toggle")}
            </button>
          </div>
        </div>

        <h1
          className="text-3xl md:text-[2rem] font-serif text-foreground mb-2 text-center"
          data-testid="text-heading"
        >
          {t("locationPicker.sendGiftTo")}
        </h1>
        <p
          className="text-sm text-foreground mb-10 text-center font-medium"
          data-testid="text-subtitle"
        >
          {t("locationPicker.selectCountry")}
        </p>

        <div className="flex flex-col">
          {isLoadingCountries && countries.length === 0
            ? Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 my-1 rounded-md bg-muted/60 animate-pulse"
                />
              ))
            : rows.map((row, idx) => (
                <button
                  key={row.code}
                  type="button"
                  onClick={() => handleSelect(row.code, row.firstCityId)}
                  disabled={!row.ready}
                  className={`w-full flex items-center justify-between px-2 py-5 min-h-[56px] text-start transition-colors hover:bg-secondary/40 disabled:opacity-50 ${
                    idx > 0 ? "border-t border-border/60" : ""
                  }`}
                  data-testid={`button-country-${row.code.toLowerCase()}`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl leading-none">{row.flag}</span>
                    <span className="text-lg font-medium">
                      {countryName(row.code, row.name)}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground rtl:rotate-180" />
                </button>
              ))}
        </div>
      </div>
    </div>
  );
}
