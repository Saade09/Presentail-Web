import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useLocationSelection, type DeliveryCountry } from "@/contexts/LocationContext";

type Props = {
  onComplete?: () => void;
  initialCountryCode?: string | null;
};

export function LocationPicker({ onComplete, initialCountryCode = null }: Props) {
  const { countries, isLoadingCountries, setLocation } = useLocationSelection();
  const [selectedCountry, setSelectedCountry] = useState<DeliveryCountry | null>(() => {
    if (!initialCountryCode) return null;
    return countries.find((c) => c.code === initialCountryCode) ?? null;
  });
  // Once the user explicitly chooses or clears, do not re-hydrate from props.
  const userInteractedRef = useRef<boolean>(!!selectedCountry);

  // If countries load after initial render, hydrate the preselected country
  // (only before the user has interacted).
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
    onComplete?.();
  };

  return (
    <div className="w-full max-w-[560px] mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-12">
        <div className="flex-1" />
        <div className="text-2xl font-serif font-bold text-primary tracking-tight">
          PRESENTAIL
        </div>
        <div className="flex-1 flex justify-end">
          <a
            href="?lang=ar"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-arabic"
          >
            العربية
          </a>
        </div>
      </div>

      <h1 className="text-3xl md:text-4xl font-serif text-foreground mb-2">
        Send your gift to:
      </h1>
      <p className="text-muted-foreground mb-8">
        {selectedCountry ? "Select the recipient's city" : "Select the recipient's country"}
      </p>

      {selectedCountry && (
        <div className="flex items-center justify-between bg-background border rounded-xl px-4 py-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">{selectedCountry.flag}</span>
            <span className="font-medium">{selectedCountry.name}</span>
          </div>
          <button
            type="button"
            onClick={handleChangeCountry}
            className="text-sm text-primary hover:underline"
            data-testid="button-change-country"
          >
            Change country
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
                <span className="text-base font-medium">{country.name}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
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
              <span className="text-base font-medium">{city.name}</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
