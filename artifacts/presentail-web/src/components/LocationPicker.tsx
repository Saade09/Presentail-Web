import { useEffect, useRef, useState } from "react";
import { ChevronRight, ArrowLeft, X } from "lucide-react";
import {
  useLocationSelection,
  type DeliveryCountry,
} from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  onComplete?: (selection: { countryCode: string; cityId: string }) => void;
  onClose?: () => void;
  initialCountryCode?: string | null;
};

export function LocationPicker({
  onComplete,
  onClose,
  initialCountryCode = null,
}: Props) {
  const { countries, isLoadingCountries, setLocation } = useLocationSelection();
  const { t, countryName, cityName, language } = useLocale();
  const isRtl = language === "ar";
  const [selectedCountry, setSelectedCountry] =
    useState<DeliveryCountry | null>(() => {
      if (!initialCountryCode) return null;
      return countries.find((c) => c.code === initialCountryCode) ?? null;
    });
  const userInteractedRef = useRef<boolean>(!!selectedCountry);

  useEffect(() => {
    if (userInteractedRef.current || !initialCountryCode) return;
    const found = countries.find((c) => c.code === initialCountryCode);
    if (found) {
      setSelectedCountry(found);
      userInteractedRef.current = true;
    }
  }, [countries, initialCountryCode]);

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
    <div className="flex flex-col w-full">
      <div className="relative flex items-center justify-center mb-5 min-h-[28px]">
        {showCities ? (
          <button
            type="button"
            onClick={handleBackToCountries}
            aria-label={t("locationPicker.back")}
            data-testid="button-picker-back"
            className="absolute start-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-8 h-8 rounded-full text-primary hover:bg-secondary/60 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </button>
        ) : null}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("locationPicker.close")}
            data-testid="button-picker-close"
            className="absolute end-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-8 h-8 rounded-full text-primary hover:bg-secondary/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <h2 className="text-2xl md:text-[26px] font-serif text-primary text-center mb-1">
        {t("locationPicker.sendGiftTo")}
      </h2>
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground text-center mb-5">
        {sectionLabel}
      </p>

      <div
        className="flex flex-col overflow-y-auto -mx-1"
        style={{ maxHeight: "min(60vh, 480px)" }}
      >
        {isLoadingCountries && countries.length === 0 ? (
          <div className="flex flex-col">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[52px] mx-1 my-1 rounded-md bg-muted/60 animate-pulse"
              />
            ))}
          </div>
        ) : !showCities ? (
          countries.map((country, idx) => (
            <button
              key={country.id}
              type="button"
              onClick={() => handleCountrySelect(country)}
              className={`w-full flex items-center justify-between px-3 min-h-[52px] py-3 text-start transition-colors hover:bg-secondary/50 active:bg-secondary/70 ${
                idx > 0 ? "border-t border-border/70" : ""
              }`}
              data-testid={`button-country-${country.code.toLowerCase()}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl leading-none">{country.flag}</span>
                <span className="text-base font-medium text-foreground">
                  {countryName(country.code, country.name)}
                </span>
              </div>
              <ChevronRight
                className={`w-4 h-4 text-primary/70 ${isRtl ? "rotate-180" : ""}`}
              />
            </button>
          ))
        ) : (
          selectedCountry!.cities.map((city, idx) => (
            <button
              key={city.id}
              type="button"
              onClick={() => handleCitySelect(city.id)}
              className={`w-full flex items-center justify-between px-3 min-h-[52px] py-3 text-start transition-colors hover:bg-secondary/50 active:bg-secondary/70 ${
                idx > 0 ? "border-t border-border/70" : ""
              }`}
              data-testid={`button-city-${city.id}`}
            >
              <span className="text-base font-medium text-foreground">
                {cityName(city.id, city.name)}
              </span>
              <ChevronRight
                className={`w-4 h-4 text-primary/70 ${isRtl ? "rotate-180" : ""}`}
              />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
