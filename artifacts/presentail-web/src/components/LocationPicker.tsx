import { useEffect, useRef, useState } from "react";
import { ChevronRight, ArrowLeft, X } from "lucide-react";
import {
  useLocationSelection,
  type DeliveryCountry,
} from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { CountryFlag } from "@/components/CountryFlag";

type Props = {
  onComplete?: (selection: { countryCode: string; cityId: string }) => void;
  onClose?: () => void;
  initialCountryCode?: string | null;
  forceCountryStep?: boolean;
};

export function LocationPicker({
  onComplete,
  onClose,
  initialCountryCode = null,
  forceCountryStep = false,
}: Props) {
  const { countries, isLoadingCountries, setLocation } = useLocationSelection();
  const { t, countryName, cityName, language } = useLocale();
  const isRtl = language === "ar";
  const [selectedCountry, setSelectedCountry] =
    useState<DeliveryCountry | null>(() => {
      if (forceCountryStep || !initialCountryCode) return null;
      return countries.find((c) => c.code === initialCountryCode) ?? null;
    });
  const userInteractedRef = useRef<boolean>(!!selectedCountry);

  useEffect(() => {
    if (userInteractedRef.current || forceCountryStep || !initialCountryCode) return;
    const found = countries.find((c) => c.code === initialCountryCode);
    if (found) {
      setSelectedCountry(found);
      userInteractedRef.current = true;
    }
  }, [countries, initialCountryCode, forceCountryStep]);

  const handleCountrySelect = (country: DeliveryCountry) => {
    userInteractedRef.current = true;
    setSelectedCountry(country);
  };

  const handleBackToCountries = () => {
    userInteractedRef.current = true;
    setSelectedCountry(null);
  };

  const handleCitySelect = (cityId: string) => {
    if (!selectedCountry) return;
    setLocation(selectedCountry.code, cityId);
    onComplete?.({ countryCode: selectedCountry.code, cityId });
  };

  const showCities = !!selectedCountry;
  const sectionLabel = showCities
    ? t("locationPicker.selectCityLabel")
    : t("locationPicker.selectCountryLabel");

  return (
    <div className="relative flex flex-col w-full min-h-0 flex-1">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t("locationPicker.close")}
          data-testid="button-picker-close"
          className="absolute top-0 end-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-primary hover:bg-secondary/60 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {showCities && (
        <button
          type="button"
          onClick={handleBackToCountries}
          aria-label={t("locationPicker.back")}
          data-testid="button-picker-back"
          className="self-start inline-flex items-center justify-center w-8 h-8 rounded-full text-primary hover:bg-secondary/60 transition-colors mb-3"
        >
          <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
        </button>
      )}

      <h2 className="text-2xl md:text-[26px] font-serif text-primary text-start mb-1">
        {t("locationPicker.sendGiftTo")}
      </h2>

      {showCities && selectedCountry ? (
        <div className="mt-3 mb-4 flex items-center justify-between gap-3 bg-secondary/60 rounded-[14px] px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <CountryFlag code={selectedCountry.code} className="w-[22px] aspect-[3/2] shrink-0" />
            <span className="text-sm font-semibold text-primary truncate">
              {countryName(selectedCountry.code, selectedCountry.name)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleBackToCountries}
            data-testid="button-country-header-change"
            className="text-xs font-semibold text-primary hover:opacity-80 transition-opacity shrink-0 cursor-pointer"
          >
            {t("locationPicker.change")}
          </button>
        </div>
      ) : null}

      <p className="text-sm font-bold text-foreground text-start mb-4 mt-3">
        {sectionLabel}
      </p>

      <div className="flex flex-col overflow-y-auto min-h-0 flex-1">
        {isLoadingCountries && countries.length === 0 ? (
          <div className="flex flex-col">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[56px] my-1 rounded-md bg-muted/60 animate-pulse"
              />
            ))}
          </div>
        ) : !showCities ? (
          countries.map((country, idx) => (
            <button
              key={country.id}
              type="button"
              onClick={() => handleCountrySelect(country)}
              className={`w-full flex items-center justify-between px-5 min-h-[56px] py-3 text-start transition-colors active:bg-secondary/40 cursor-pointer ${
                idx > 0 ? "border-t border-border" : ""
              }`}
              data-testid={`button-country-${country.code.toLowerCase()}`}
            >
              <div className="flex items-center gap-3.5">
                <CountryFlag code={country.code} className="w-[22px] aspect-[3/2] shrink-0" />
                <span className="text-base font-medium text-foreground">
                  {countryName(country.code, country.name)}
                </span>
              </div>
              <ChevronRight
                className={`w-4 h-4 text-primary/70 shrink-0 ${isRtl ? "rotate-180" : ""}`}
              />
            </button>
          ))
        ) : (
          selectedCountry!.cities.filter((city) => city.isActive !== false).map((city, idx) => {
            return (
              <button
                key={city.id}
                type="button"
                onClick={() => handleCitySelect(city.id)}
                className={`w-full flex items-center justify-between px-5 min-h-[56px] py-3 text-start transition-colors active:bg-secondary/40 cursor-pointer ${
                  idx > 0 ? "border-t border-border" : ""
                }`}
                data-testid={`button-city-${city.id}`}
              >
                <span className="text-base font-medium text-foreground">
                  {cityName(city.id, city.name)}
                </span>
                <ChevronRight
                  className={`w-4 h-4 shrink-0 text-primary/70 ${isRtl ? "rotate-180" : ""}`}
                />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
