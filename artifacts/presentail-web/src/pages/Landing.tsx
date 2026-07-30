import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
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

// Static fallback landing hrefs for each country — used before city data loads.
// Points at the most prominent city for each country so crawlers always get a
// real navigable destination from the country-picker links.
const COUNTRY_FALLBACK_HREFS: Record<string, string> = {
  LB: buildLocalePath({ lang: "en", country: "lb" as CountrySlug, city: "beirut" }),
  AE: buildLocalePath({ lang: "en", country: "ae" as CountrySlug, city: "dubai" }),
  CY: buildLocalePath({ lang: "en", country: "cy" as CountrySlug, city: "nicosia" }),
};

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

    const active = [...cities]
      .filter((c) => c.isActive !== false)
      .sort((a, b) => {
        if (countryCode === "LB") {
          const aPin = PINNED_LB.indexOf(a.id);
          const bPin = PINNED_LB.indexOf(b.id);
          if (aPin !== -1 && bPin !== -1) return aPin - bPin;
          if (aPin !== -1) return -1;
          if (bPin !== -1) return 1;
          return cityName(a.id, a.name).localeCompare(cityName(b.id, b.name));
        }
        return 0;
      });

    const unavailable = cities.filter((c) => c.isActive === false);
    const hasBothGroups = active.length > 0 && unavailable.length > 0;

    const selectedLabel = countryName(countryCode, rows.find((r) => r.code === countryCode)?.name ?? countryCode);

    const renderCityRow = (city: DeliveryCity, idx: number, isInactive: boolean) => {
      const citySlug = cityIdToSlug(city.id);
      const href = buildLocalePath({ lang: "en", country: countrySlug, city: citySlug });
      const rowClass = `w-full flex items-center justify-between px-5 py-3.5 min-h-[48px] text-start transition-colors ${
        idx > 0 ? "border-t border-stone-200/70" : ""
      }`;

      if (isInactive) {
        return (
          <button
            key={city.id}
            type="button"
            disabled
            aria-disabled="true"
            tabIndex={-1}
            className={`${rowClass} cursor-not-allowed`}
            data-testid={`button-city-${city.id}`}
          >
            {/* contrast-ok: disabled city option – WCAG 1.4.3 inactive UI exception */}
            <span className="text-sm font-medium text-muted-foreground">
              {cityName(city.id, city.name)}
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
    };

    return (
      <div className="flex flex-col gap-3">
        {/* Available now / Delivery areas card */}
        {active.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-0.5">
              {t("locationPicker.deliveryAreasIn", { country: selectedLabel })}
            </p>
            <div className="rounded-2xl overflow-hidden border border-gray-200/80 bg-white/70 shadow-sm">
              {active.map((city, idx) => renderCityRow(city, idx, false))}
            </div>
          </div>
        )}

        {/* Coming soon card */}
        {hasBothGroups && unavailable.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-0.5">
              {t("locationPicker.comingSoon")}
            </p>
            <div className="rounded-2xl overflow-hidden border border-gray-200/80 bg-white/70 shadow-sm">
              {unavailable.map((city, idx) => renderCityRow(city, idx, true))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const selectedRow = selectedCountryCode ? rows.find((r) => r.code === selectedCountryCode) : null;
  const selectedLabel = selectedRow ? countryName(selectedRow.code, selectedRow.name) : "";

  const activeCities = selectedRow ? selectedRow.cities.filter((c) => c.isActive !== false) : [];
  const unavailableCities = selectedRow ? selectedRow.cities.filter((c) => c.isActive === false) : [];
  const hasBothGroups = activeCities.length > 0 && unavailableCities.length > 0;

  const description = selectedCountryCode
    ? t("locationPicker.chooseAreaDescription")
    : null;

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

      {/* Main content — single centered column. */}
      <div className={`flex-1 flex justify-center px-6 pt-6 overflow-hidden ${selectedCountryCode ? "items-stretch" : "items-start"}`}>
        <div className={`w-full max-w-md flex flex-col gap-4 ${selectedCountryCode ? "flex-1 min-h-0" : ""}`}>
          {/* Headline — changes once a country is picked */}
          <div className="shrink-0">
            <h1
              className="text-3xl xl:text-4xl font-serif text-foreground leading-tight text-center"
              data-testid="text-heading"
            >
              {selectedCountryCode
                ? t("locationPicker.whereInCountry", { country: selectedLabel })
                : t("locationPicker.sendGiftTo")}
            </h1>
            {selectedCountryCode ? (
              <>
                <p className="text-sm text-muted-foreground font-medium mt-1.5 text-center">
                  {t("locationPicker.selectDeliveryArea")}
                </p>
                {description && (
                  <p className="text-xs text-muted-foreground mt-1 text-center" data-testid="area-description">
                    {description}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground font-medium mt-1.5 text-center">
                  {t("locationPicker.selectRecipientCountry")}
                </p>
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  {t("landing.serviceDescription")}
                </p>
              </>
            )}
          </div>

          {/* Delivering to box */}
          {selectedCountryCode && selectedRow && (
            <div className="shrink-0" data-testid="delivering-to-row">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                {t("locationPicker.deliveringTo")}
              </p>
              <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-white/80 shadow-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CountryFlag code={selectedRow.code} className="w-[22px] aspect-[3/2] shrink-0" />
                  <span className="text-sm font-semibold text-primary truncate">
                    {selectedLabel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCountryCode(null)}
                  className="ms-3 text-xs font-semibold hover:underline underline-offset-2 transition-colors cursor-pointer shrink-0"
                  style={{ color: "#00414e" }}
                  data-testid="button-picker-change"
                >
                  {t("locationPicker.change")}
                </button>
              </div>
            </div>
          )}

          {/* Country list OR city cards */}
          {isLoadingCountries && countries.length === 0
            ? <div className="rounded-2xl overflow-hidden border border-gray-200/80 bg-white/70 backdrop-blur-sm shadow-sm">{skeletonRows}</div>
            : selectedCountryCode
            ? (selectedRow && selectedRow.cities.length > 0
              ? (
                <div className="flex-1 min-h-0 overflow-y-auto pb-2">
                  <CityList cities={selectedRow.cities} countryCode={selectedRow.code} />
                </div>
              ) : null)
            : (
              <div className="rounded-2xl overflow-hidden border border-gray-200/80 bg-white/70 backdrop-blur-sm shadow-sm">
                {rows.map((row, idx) => {
                  const countrySlug = countryCodeToSlug(row.code) as CountrySlug;
                  const firstActive = row.cities.find((c) => c.isActive !== false);
                  const countryHref = firstActive
                    ? buildLocalePath({ lang: "en", country: countrySlug, city: cityIdToSlug(firstActive.id) })
                    : (COUNTRY_FALLBACK_HREFS[row.code] ?? "/");
                  return (
                    <a
                      key={row.code}
                      href={countryHref}
                      onClick={(e) => { e.preventDefault(); handleCountryClick(row.code, row.ready); }}
                      aria-disabled={!row.ready ? "true" : undefined}
                      className={`w-full flex items-center justify-between px-4 py-4 min-h-[58px] text-start transition-colors hover:bg-gray-50/80 ${
                        !row.ready ? "opacity-50 cursor-default" : ""
                      } ${idx > 0 ? "border-t border-gray-200/70" : ""}`}
                      data-testid={`button-country-${row.code.toLowerCase()}`}
                    >
                      <div className="flex items-center gap-3">
                        <CountryFlag code={row.code} className="w-6 aspect-[3/2] shrink-0" />
                        <span className="text-sm font-medium leading-tight text-foreground">
                          {countryName(row.code, row.name)}
                        </span>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 text-stone-400 shrink-0 ${isRtl ? "rotate-180" : ""}`}
                      />
                    </a>
                  );
                })}
              </div>
            )
          }

        </div>
      </div>
    </main>
  );
}
