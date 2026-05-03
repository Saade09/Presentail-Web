import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  useLocationSelection,
  type DeliveryCountry,
} from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

type Props = {
  onComplete?: (selection: { countryCode: string; cityId: string }) => void;
  initialCountryCode?: string | null;
};

export function LocationPicker({
  onComplete,
  initialCountryCode = null,
}: Props) {
  const { countries, isLoadingCountries, setLocation } = useLocationSelection();
  const { t, countryName, cityName } = useLocale();
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

  const handleChangeCountry = () => {
    userInteractedRef.current = true;
    setSelectedCountry(null);
  };

  const handleCitySelect = (cityId: string) => {
    if (!selectedCountry) return;
    setLocation(selectedCountry.code, cityId);
    onComplete?.({ countryCode: selectedCountry.code, cityId });
  };

  return (
    <div className="w-full max-w-[560px] mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-12">
        <div className="flex-1" />
        <div className="text-2xl font-serif font-bold text-primary tracking-tight">
          PRESENTAIL
        </div>
        <div className="flex-1 flex justify-end">
          <LanguageSwitcher />
        </div>
      </div>

      <h1 className="text-3xl md:text-4xl font-serif text-foreground mb-2">
        {t("locationPicker.sendGiftTo")}
      </h1>
      <p className="text-muted-foreground mb-8">
        {selectedCountry
          ? t("locationPicker.selectCity")
          : t("locationPicker.selectCountry")}
      </p>

      {selectedCountry && (
        <div className="flex items-center justify-between bg-background border rounded-xl px-4 py-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">{selectedCountry.flag}</span>
            <span className="font-medium">
              {countryName(selectedCountry.code, selectedCountry.name)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleChangeCountry}
            className="text-sm text-primary hover:underline"
            data-testid="button-change-country"
          >
            {t("locationPicker.changeCountry")}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {isLoadingCountries && countries.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-muted animate-pulse"
            />
          ))
        ) : !selectedCountry ? (
          countries.map((country) => (
            <button
              key={country.id}
              type="button"
              onClick={() => handleCountrySelect(country)}
              className="w-full flex items-center justify-between bg-background border hover:border-primary/40 hover:bg-secondary/30 transition-colors rounded-xl px-5 py-4 text-left"
              data-testid={`button-country-${country.code.toLowerCase()}`}
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl leading-none">{country.flag}</span>
                <span className="text-base font-medium">
                  {countryName(country.code, country.name)}
                </span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground rtl:rotate-180" />
            </button>
          ))
        ) : (
          selectedCountry.cities.map((city) => (
            <button
              key={city.id}
              type="button"
              onClick={() => handleCitySelect(city.id)}
              className="w-full flex items-center justify-between bg-background border hover:border-primary/40 hover:bg-secondary/30 transition-colors rounded-xl px-5 py-4 text-left"
              data-testid={`button-city-${city.id}`}
            >
              <span className="text-base font-medium">
                {cityName(city.id, city.name)}
              </span>
              <ChevronRight className="w-5 h-5 text-muted-foreground rtl:rotate-180" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
