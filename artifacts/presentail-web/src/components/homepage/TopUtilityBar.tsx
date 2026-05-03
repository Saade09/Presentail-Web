import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { ChevronDown } from "lucide-react";

export function TopUtilityBar() {
  const { country, city, openPicker } = useLocationSelection();
  const { language, setLanguage, t } = useLocale();

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
              {country?.name ?? "Select country"}
            </span>
            {city && (
              <span className="hidden md:inline opacity-70">· {city.name}</span>
            )}
            <ChevronDown className="w-3 h-3" />
          </button>

          <span className="opacity-40">|</span>

          <button
            type="button"
            onClick={() => setLanguage(language === "en" ? "ar" : "en")}
            className="hover:text-foreground transition-colors font-medium text-foreground"
            data-testid="button-language-toggle"
          >
            {t("lang.toggle")}
          </button>
        </div>
      </div>
    </div>
  );
}
