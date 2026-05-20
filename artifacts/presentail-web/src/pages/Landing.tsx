import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import {
  PICKER_COUNTRY_CODES,
  useLocationSelection,
  type DeliveryCountry,
  type DeliveryCity,
} from "@/contexts/LocationContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CountryFlag } from "@/components/CountryFlag";

const FALLBACK_COUNTRIES: Array<{ code: string; name: string; flag: string }> = [
  { code: "LB", name: "Lebanon", flag: "🇱🇧" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "CY", name: "Cyprus", flag: "🇨🇾" },
];

type LandingProps = {
  initialCountryCode?: string | null;
};

export default function Landing({ initialCountryCode = null }: LandingProps) {
  const { t, countryName, cityName, language } = useLocale();
  const { countries, isLoadingCountries, setLocation } = useLocationSelection();
  const isRtl = language === "ar";

  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(
    initialCountryCode
  );

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
        cities: (live?.cities ?? []).filter((c) => c.isActive !== false),
        ready: !!live && !!(live.cities ?? []).filter((c) => c.isActive !== false)[0],
      };
    });
  }, [countries]);

  const selectedRow = rows.find((r) => r.code === selectedCountryCode) ?? null;

  const handleCountryClick = (code: string, ready: boolean) => {
    if (!ready) return;
    setSelectedCountryCode((prev) => (prev === code ? null : code));
  };

  const handleCitySelect = (code: string, cityId: string) => {
    setLocation(code, cityId);
  };

  const CityList = ({
    cities,
    countryCode,
  }: {
    cities: DeliveryCity[];
    countryCode: string;
  }) => (
    <div className="flex flex-col overflow-y-auto" style={{ maxHeight: "min(60vh, 480px)" }}>
      {cities.map((city, idx) => (
        <button
          key={city.id}
          type="button"
          onClick={() => handleCitySelect(countryCode, city.id)}
          className={`w-full flex items-center justify-between px-4 py-4 min-h-[52px] text-start transition-colors hover:bg-secondary/40 ${
            idx > 0 ? "border-t border-border/60" : ""
          }`}
          data-testid={`button-city-${city.id}`}
        >
          <span className="text-base font-medium text-foreground">
            {cityName(city.id, city.name)}
          </span>
          <ChevronRight
            className={`w-4 h-4 text-muted-foreground shrink-0 ${isRtl ? "rotate-180" : ""}`}
          />
        </button>
      ))}
    </div>
  );

  const skeletonRows = Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="h-16 my-1 rounded-md bg-muted/60 animate-pulse" />
  ));

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      data-testid="page-landing"
    >
      <div className="w-full max-w-[800px] mx-auto px-6 pt-10 pb-16 flex-1 flex flex-col">
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
            <LanguageSwitcher />
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

        {/* Desktop two-column layout (md+) */}
        <div className="hidden md:flex gap-0 border border-border/60 rounded-xl overflow-hidden">
          {/* Left: country list */}
          <div className="w-[260px] shrink-0 border-r border-border/60 flex flex-col">
            {isLoadingCountries && countries.length === 0
              ? skeletonRows
              : rows.map((row, idx) => {
                  const isActive = selectedCountryCode === row.code;
                  return (
                    <button
                      key={row.code}
                      type="button"
                      onClick={() => handleCountryClick(row.code, row.ready)}
                      disabled={!row.ready}
                      className={`w-full flex items-center justify-between px-4 py-5 min-h-[64px] text-start transition-colors disabled:opacity-50 ${
                        idx > 0 ? "border-t border-border/60" : ""
                      } ${
                        isActive
                          ? "bg-secondary/60 font-semibold"
                          : "hover:bg-secondary/30"
                      }`}
                      data-testid={`button-country-${row.code.toLowerCase()}`}
                    >
                      <div className="flex items-center gap-3">
                        <CountryFlag code={row.code} className="w-7 h-auto rounded-sm shrink-0" />
                        <span className="text-sm font-medium leading-tight">
                          {countryName(row.code, row.name)}
                        </span>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? "text-primary" : "text-muted-foreground"
                        } ${isRtl ? "rotate-180" : ""}`}
                      />
                    </button>
                  );
                })}
          </div>

          {/* Right: city list */}
          <div className="flex-1 flex flex-col">
            {selectedRow ? (
              <>
                <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
                  <CountryFlag code={selectedRow.code} className="w-6 h-auto rounded-sm shrink-0" />
                  <span className="text-sm font-semibold text-primary">
                    {countryName(selectedRow.code, selectedRow.name)}
                  </span>
                </div>
                <div
                  className="flex flex-col overflow-y-auto"
                  style={{ maxHeight: "min(60vh, 480px)" }}
                >
                  {selectedRow.cities.map((city, idx) => (
                    <button
                      key={city.id}
                      type="button"
                      onClick={() => handleCitySelect(selectedRow.code, city.id)}
                      className={`w-full flex items-center justify-between px-5 py-4 min-h-[52px] text-start transition-colors hover:bg-secondary/40 ${
                        idx > 0 ? "border-t border-border/60" : ""
                      }`}
                      data-testid={`button-city-${city.id}`}
                    >
                      <span className="text-base font-medium text-foreground">
                        {cityName(city.id, city.name)}
                      </span>
                      <ChevronRight
                        className={`w-4 h-4 text-muted-foreground shrink-0 ${isRtl ? "rotate-180" : ""}`}
                      />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 py-12">
                <ChevronRight className="w-8 h-8 opacity-30" />
                <p className="text-sm">{t("locationPicker.selectCountry")}</p>
              </div>
            )}
          </div>
        </div>

        {/* Mobile accordion layout (below md) */}
        <div className="flex flex-col md:hidden">
          {isLoadingCountries && countries.length === 0
            ? skeletonRows
            : rows.map((row, idx) => {
                const isOpen = selectedCountryCode === row.code;
                return (
                  <div
                    key={row.code}
                    className={idx > 0 ? "border-t border-border/60" : ""}
                  >
                    <button
                      type="button"
                      onClick={() => handleCountryClick(row.code, row.ready)}
                      disabled={!row.ready}
                      className={`w-full flex items-center justify-between px-2 py-5 min-h-[56px] text-start transition-colors hover:bg-secondary/40 disabled:opacity-50 ${
                        isOpen ? "bg-secondary/30" : ""
                      }`}
                      data-testid={`button-country-${row.code.toLowerCase()}`}
                    >
                      <div className="flex items-center gap-4">
                        <CountryFlag code={row.code} className="w-8 h-auto rounded-sm shrink-0" />
                        <span className="text-lg font-medium">
                          {countryName(row.code, row.name)}
                        </span>
                      </div>
                      {isOpen ? (
                        <ChevronDown className="w-5 h-5 text-primary" />
                      ) : (
                        <ChevronRight
                          className={`w-5 h-5 text-muted-foreground ${isRtl ? "rotate-180" : ""}`}
                        />
                      )}
                    </button>

                    {isOpen && row.cities.length > 0 && (
                      <div className="bg-secondary/10 border-t border-border/40">
                        <CityList cities={row.cities} countryCode={row.code} />
                      </div>
                    )}
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}
