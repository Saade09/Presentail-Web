import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { ChevronDown, Clock } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function TopUtilityBar() {
  const { country, openPicker } = useLocationSelection();
  const { t, countryName } = useLocale();

  return (
    <div className="bg-[#f3f3f3] text-xs text-muted-foreground">
      <div className="container mx-auto px-4 h-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 text-foreground/80">
          <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span className="font-medium">{t("utility.fastCheckout")}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openPicker()}
            className="flex items-center gap-1.5 rounded-full bg-white/70 hover:bg-white px-3 py-1 text-foreground transition-colors"
            data-testid="button-country-selector"
          >
            <span className="text-base leading-none">{country?.flag ?? "🌍"}</span>
            <span className="font-medium">
              {country
                ? countryName(country.code, country.name)
                : t("locationPicker.selectCountry")}
            </span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          <LanguageSwitcher variant="pill" />
        </div>
      </div>
    </div>
  );
}
