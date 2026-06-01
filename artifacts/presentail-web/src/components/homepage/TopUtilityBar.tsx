import { useEffect, useState } from "react";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { ChevronDown, Clock, MapPin, Truck } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CountryFlag } from "@/components/CountryFlag";
import { AnimatePresence, motion } from "framer-motion";

const TICKER_INTERVAL = 3500;

export function TopUtilityBar() {
  const { country, city, openPicker } = useLocationSelection();
  const { t, countryName } = useLocale();
  const [idx, setIdx] = useState(0);

  const items = [
    { icon: <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />, label: t("utility.fastCheckout") },
    { icon: <Truck className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />, label: t("utility.sameDayDelivery") },
    { icon: <MapPin className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />, label: t("utility.noHassle") },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setIdx((i) => (i + 1) % items.length);
    }, TICKER_INTERVAL);
    return () => clearInterval(timer);
  }, [items.length]);

  return (
    <div className="bg-[#efefef] text-xs text-muted-foreground border-b border-border/60">
      <div className="container mx-auto px-4 h-10 flex items-center justify-between gap-4">

        {/* Sliding ticker */}
        <div className="flex items-center gap-1.5 text-foreground/80 overflow-hidden h-full min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="flex items-center gap-1.5"
            >
              {items[idx].icon}
              <span className="font-medium whitespace-nowrap">{items[idx].label}</span>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right side: country + language */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openPicker()}
            className="flex items-center gap-1.5 rounded-full bg-white/70 hover:bg-white px-3 py-1 text-foreground transition-colors"
            data-testid="button-country-selector"
          >
            {country ? (
              <CountryFlag code={country.code} className="w-[18px] aspect-[3/2] shrink-0" />
            ) : (
              <span className="text-base leading-none">🌍</span>
            )}
            <span className="font-medium">
              {city
                ? city.name
                : country
                  ? countryName(country.code, country.name)
                  : t("locationPicker.selectCountryLabel")}
            </span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          <LanguageSwitcher variant="pill" />
        </div>
      </div>
    </div>
  );
}
