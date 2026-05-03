import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { ChevronDown } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function TopUtilityBar() {
  const { country, city, openPicker } = useLocationSelection();
  const { t, countryName, cityName } = useLocale();

  return (
    <div className="bg-secondary/60 border-b border-border/60 text-xs text-muted-foreground">
      <div className="container mx-auto px-4 h-9 flex items-center justify-between gap-4">
        <p className="hidden sm:block truncate">{t("utility.help")}</p>

        <div className="flex items-center gap-3 ms-auto">
          <button
            type="button"
            onClick={openPicker}
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            data-testid="button-country-selector"
          >
            <span className="text-base leading-none">{country?.flag ?? "🌍"}</span>
            <span className="font-medium text-foreground">
              {country
                ? countryName(country.code, country.name)
                : t("locationPicker.selectCountry")}
            </span>
            {city && (
              <span className="hidden md:inline opacity-70">
                · {cityName(city.id, city.name)}
              </span>
            )}
            <ChevronDown className="w-3 h-3" />
          </button>

          <span className="opacity-40">|</span>

          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
