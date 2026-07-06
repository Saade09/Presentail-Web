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
import {
  buildLocalePath,
  cityIdToSlug,
  countryCodeToSlug,
  type CountrySlug,
} from "@/lib/locale-route";

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

  const PINNED_LB = [
    "lb-beirut",
    "lb-metn",
    "lb-kesserwan",
    "lb-baabda",
    "lb-aley",
    "lb-tripoli",
    "lb-jbeil",
    "lb-chouf",
  ];

  const CityList = ({
    cities,
    countryCode,
  }: {
    cities: DeliveryCity[];
    countryCode: string;
  }) => {
    const countrySlug = countryCodeToSlug(countryCode) as CountrySlug;
    const sortedCities = [...cities].sort((a, b) => {
      const aInactive = a.isActive === false;
      const bInactive = b.isActive === false;
      if (aInactive !== bInactive) return aInactive ? 1 : -1;
      if (!aInactive && !bInactive && countryCode === "LB") {
        const aPin = PINNED_LB.indexOf(a.id);
        const bPin = PINNED_LB.indexOf(b.id);
        if (aPin !== -1 && bPin !== -1) return aPin - bPin;
        if (aPin !== -1) return -1;
        if (bPin !== -1) return 1;
        return cityName(a.id, a.name).localeCompare(cityName(b.id, b.name));
      }
      return 0;
    });
    return (
      <div className="flex flex-col">
        {sortedCities.map((city, idx) => {
          const inactive = city.isActive === false;
          const citySlug = cityIdToSlug(city.id);
          const href = buildLocalePath({ lang: "en", country: countrySlug, city: citySlug });
          const rowClass = `w-full flex items-center justify-between px-5 py-3.5 min-h-[48px] text-start transition-colors ${
            idx > 0 ? "border-t border-stone-200/70" : ""
          }`;
          if (inactive) {
            return (
              <button
                key={city.id}
                type="button"
                disabled
                className={`${rowClass} cursor-not-allowed opacity-40`}
                data-testid={`button-city-${city.id}`}
              >
                {/* contrast-ok: disabled city option (cursor-not-allowed + opacity-40 on parent) – WCAG 1.4.3 inactive UI exception */}
                <span className="text-sm font-medium text-foreground/40">
                  {cityName(city.id, city.name)}
                  {/* contrast-ok: disabled city label – WCAG 1.4.3 inactive UI exception */}
                  <span className="ml-1.5 text-xs font-normal text-foreground/35">
                    {t("location.cityUnavailable")}
                  </span>
                </span>
              </button>
            );
          }
          return (
            <a
              key={city.id}
              href={href}
              onClick={(e) => { e.preventDefault(); handleCitySelect(countryCode, city.id); }}
              className={`${rowClass} hover:bg-gray-100/60`}
              data-testid={`button-city-${city.id}`}
            >
              <span className="text-sm font-medium text-foreground">
                {cityName(city.id, city.name)}
              </span>
              <ChevronRight
                className={`w-4 h-4 text-stone-400 shrink-0 ${isRtl ? "rotate-180" : ""}`}
              />
            </a>
          );
        })}
      </div>
    );
  };

  const skeletonRows = Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="h-14 my-0.5 rounded-lg bg-gray-200/50 animate-pulse" />
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

      {/* Main content — single centered column.
          When a country is expanded: stretch to fill height so the city list
          reaches the viewport bottom. When collapsed: content-sized. */}
      <div className={`flex-1 flex justify-center px-6 pt-6 overflow-hidden ${selectedCountryCode ? "items-stretch" : "items-start"}`}>
        <div className={`w-full max-w-md flex flex-col gap-5 ${selectedCountryCode ? "flex-1 min-h-0" : ""}`}>
          {/* Headline */}
          <div className="shrink-0">
            <h1
              className="text-3xl xl:text-4xl font-serif text-foreground leading-tight text-center"
              data-testid="text-heading"
            >
              {t("locationPicker.sendGiftTo")}
            </h1>
            <p className="text-sm text-muted-foreground font-medium mt-1.5 text-center">
              {t("locationPicker.selectRecipientCountry")}
            </p>
            <p className="text-xs text-muted-foreground mt-1 text-center">
              {t("landing.serviceDescription")}
            </p>
          </div>

          {/* Country accordion */}
          <div className={`rounded-2xl overflow-hidden border border-gray-200/80 bg-white/70 backdrop-blur-sm shadow-sm ${selectedCountryCode ? "flex flex-col flex-1 min-h-0" : ""}`}>
            {isLoadingCountries && countries.length === 0
              ? skeletonRows
              : rows.filter((row) => !selectedCountryCode || selectedCountryCode === row.code).map((row, idx) => {
                  const isOpen = selectedCountryCode === row.code;
                  return (
                    <div
                      key={row.code}
                      className={`${idx > 0 ? "border-t border-gray-200/70" : ""} ${isOpen ? "flex flex-col flex-1 min-h-0" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => handleCountryClick(row.code, row.ready)}
                        disabled={!row.ready}
                        className={`w-full shrink-0 flex items-center justify-between px-4 py-4 min-h-[58px] text-start transition-colors disabled:opacity-50 ${
                          isOpen ? "bg-gray-100/60" : "hover:bg-gray-50/80"
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
                        <div className="border-t border-gray-200/70 bg-gray-50/60 flex-1 min-h-0 overflow-y-auto">
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
