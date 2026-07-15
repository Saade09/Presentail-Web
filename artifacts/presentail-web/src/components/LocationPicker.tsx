import { useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
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

  const availableCities = selectedCountry
    ? selectedCountry.cities.filter((c) => c.isActive !== false)
    : [];
  const unavailableCities = selectedCountry
    ? selectedCountry.cities.filter((c) => c.isActive === false)
    : [];
  const hasBothGroups = availableCities.length > 0 && unavailableCities.length > 0;

  const description = selectedCountry
    ? hasBothGroups
      ? t("locationPicker.currentlyDeliverTo", {
          areas: availableCities.map((c) => cityName(c.id, c.name)).join(", "),
        })
      : t("locationPicker.chooseAreaDescription")
    : "";

  const selectedCountryLabel = selectedCountry
    ? countryName(selectedCountry.code, selectedCountry.name)
    : "";

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

      <h2 className="text-2xl md:text-[26px] font-serif text-primary text-center md:text-start mb-1">
        {showCities && selectedCountry
          ? t("locationPicker.whereInCountry", { country: selectedCountryLabel })
          : t("locationPicker.sendGiftTo")}
      </h2>

      {!showCities ? (
        <p className="text-sm text-muted-foreground font-medium mt-1 mb-4 text-center md:text-start">
          {t("locationPicker.selectRecipientCountry")}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground font-medium mt-1 mb-0.5 text-center md:text-start">
            {t("locationPicker.selectDeliveryArea")}
          </p>
          <p className="text-xs text-muted-foreground mb-4 text-center md:text-start" data-testid="area-description">
            {description}
          </p>
        </>
      )}

      {showCities && selectedCountry && (
        <div className="mb-3" data-testid="delivering-to-row">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            {t("locationPicker.deliveringTo")}
          </p>
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-border">
            <div className="flex items-center gap-2 min-w-0">
              <CountryFlag code={selectedCountry.code} className="w-[20px] aspect-[3/2] shrink-0" />
              <span className="text-sm font-semibold text-primary truncate">
                {selectedCountryLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={handleBackToCountries}
              data-testid="button-picker-change"
              className="ms-3 text-xs font-semibold text-teal-600 hover:text-teal-700 hover:underline underline-offset-2 transition-colors cursor-pointer shrink-0"
            >
              {t("locationPicker.change")}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col min-h-0 max-h-[60vh] overflow-y-auto gap-3">
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
          <div className="rounded-xl border border-border overflow-hidden">
            {countries.map((country, idx) => (
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
            ))}
          </div>
        ) : (
          <>
            {availableCities.length > 0 && (
              <div>
                {hasBothGroups ? (
                  <p className="text-xs font-medium text-muted-foreground mb-2 px-0.5" data-testid="section-available-now">
                    {t("locationPicker.availableNow")}
                  </p>
                ) : (
                  <p className="text-xs font-medium text-muted-foreground mb-2 px-0.5" data-testid="section-delivery-areas">
                    {t("locationPicker.deliveryAreasIn", { country: selectedCountryLabel })}
                  </p>
                )}
                <div className="rounded-xl border border-border overflow-hidden">
                  {availableCities.map((city, idx) => (
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
                  ))}
                </div>
              </div>
            )}

            {unavailableCities.length > 0 && (
              <div>
                {hasBothGroups && (
                  <p className="text-xs font-medium text-muted-foreground mb-2 px-0.5" data-testid="section-coming-soon">
                    {t("locationPicker.comingSoon")}
                  </p>
                )}
                <div className="rounded-xl border border-border overflow-hidden">
                  {unavailableCities.map((city, idx) => (
                    <button
                      key={city.id}
                      type="button"
                      disabled
                      aria-disabled="true"
                      tabIndex={-1}
                      className={`w-full flex items-center px-5 min-h-[56px] py-3 text-start cursor-not-allowed ${
                        idx > 0 ? "border-t border-border" : ""
                      }`}
                      data-testid={`button-city-${city.id}`}
                    >
                      {/* contrast-ok: disabled button – WCAG 1.4.3 inactive UI exception */}
                      <span className="text-base font-medium text-muted-foreground">
                        {cityName(city.id, city.name)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
