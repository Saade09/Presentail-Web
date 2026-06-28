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

const BG = "#ffffff";

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
    return PICKER_COUNTRY_CODES
      .filter((code) => {
        const live = byCode.get(code);
        return live === undefined || live.isActive !== false;
      })
      .map((code) => {
        const live = byCode.get(code);
        const fallback = FALLBACK_COUNTRIES.find((f) => f.code === code)!;
        return {
          code,
          flag: live?.flag ?? fallback.flag,
          name: live?.name ?? fallback.name,
          cities: live?.cities ?? [],
          ready: !!live && !!(live.cities ?? []).filter((c) => c.isActive !== false)[0],
        };
      });
  }, [countries]);

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
    <div className="flex flex-col">
      {[...cities].sort((a, b) => (a.isActive === false ? 1 : 0) - (b.isActive === false ? 1 : 0)).map((city, idx) => {
        const inactive = city.isActive === false;
        return (
          <button
            key={city.id}
            type="button"
            onClick={inactive ? undefined : () => handleCitySelect(countryCode, city.id)}
            disabled={inactive}
            className={`w-full flex items-center justify-between px-5 py-3.5 min-h-[48px] text-start transition-colors ${
              idx > 0 ? "border-t border-stone-200/70" : ""
            } ${inactive ? "cursor-not-allowed opacity-40" : "hover:bg-stone-100/60"}`}
            data-testid={`button-city-${city.id}`}
          >
            <span className={`text-sm font-medium ${inactive ? "text-foreground/40" : "text-foreground"}`}>
              {cityName(city.id, city.name)}
              {inactive && (
                <span className="ml-1.5 text-xs font-normal text-foreground/35">
                  {t("location.cityUnavailable")}
                </span>
              )}
            </span>
            {!inactive && (
              <ChevronRight
                className={`w-4 h-4 text-stone-400 shrink-0 ${isRtl ? "rotate-180" : ""}`}
              />
            )}
          </button>
        );
      })}
    </div>
  );

  const skeletonRows = Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="h-14 my-0.5 rounded-lg bg-stone-200/50 animate-pulse" />
  ));

  return (
    <main
      className="h-screen overflow-hidden flex flex-col"
      style={{ backgroundColor: BG }}
      data-testid="page-landing"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Top bar */}
      <div className="relative flex items-center justify-center px-8 py-3 shrink-0">
        <div data-testid="text-wordmark">
          <span className="font-serif text-primary text-5xl leading-none">
            {language === "ar" ? "بريزانتيل" : "Presentail"}
          </span>
        </div>
        <div className="absolute end-8">
          <LanguageSwitcher />
        </div>
      </div>

      {/* Main content — single centered column, shifted slightly above center */}
      <div className="flex-1 flex items-start justify-center px-6 pt-6 overflow-hidden">
        <div className="w-full max-w-md flex flex-col gap-5">
          {/* Headline */}
          <div>
            <h1
              className="text-3xl xl:text-4xl font-serif text-foreground leading-tight text-center"
              data-testid="text-heading"
            >
              {t("locationPicker.sendGiftTo")}
            </h1>
            <p className="text-sm text-muted-foreground font-medium mt-1.5 text-center">
              {t("locationPicker.selectRecipientCountry")}
            </p>
          </div>

          {/* Country accordion */}
          <div className="rounded-2xl overflow-hidden border border-stone-200/80 bg-white/70 backdrop-blur-sm shadow-sm">
            {isLoadingCountries && countries.length === 0
              ? skeletonRows
              : rows.filter((row) => !selectedCountryCode || selectedCountryCode === row.code).map((row, idx) => {
                  const isOpen = selectedCountryCode === row.code;
                  return (
                    <div
                      key={row.code}
                      className={idx > 0 ? "border-t border-stone-200/70" : ""}
                    >
                      <button
                        type="button"
                        onClick={() => handleCountryClick(row.code, row.ready)}
                        disabled={!row.ready}
                        className={`w-full flex items-center justify-between px-4 py-4 min-h-[58px] text-start transition-colors disabled:opacity-50 ${
                          isOpen ? "bg-stone-100/60" : "hover:bg-stone-50/80"
                        }`}
                        data-testid={`button-country-${row.code.toLowerCase()}`}
                      >
                        <div className="flex items-center gap-3">
                          <CountryFlag code={row.code} className="w-6 aspect-[3/2] shrink-0" />
                          <span className="text-sm font-medium leading-tight text-foreground">
                            {countryName(row.code, row.name)}
                          </span>
                        </div>
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4 text-primary shrink-0" />
                        ) : (
                          <ChevronRight
                            className={`w-4 h-4 text-stone-400 shrink-0 ${isRtl ? "rotate-180" : ""}`}
                          />
                        )}
                      </button>

                      {isOpen && row.cities.length > 0 && (
                        <div className="border-t border-stone-200/70 bg-stone-50/60 overflow-y-auto" style={{ maxHeight: "calc(100svh - 22rem)" }}>
                          <CityList cities={row.cities} countryCode={row.code} />
                        </div>
                      )}
                    </div>
                  );
                })}
          </div>
        </div>
      </div>
    </main>
  );
}
