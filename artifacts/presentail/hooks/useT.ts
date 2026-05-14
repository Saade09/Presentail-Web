import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { translations } from "@/lib/translations";
import { localizedCountryName } from "@/data/countryNamesLocalized";

export function useT() {
  const { lang } = useLanguage();
  const { selectedCountry, selectedCity } = useDeliveryLocation();

  const countryName = localizedCountryName(
    lang,
    selectedCountry?.code,
    selectedCountry?.name ?? "Lebanon",
  );
  const cityName = selectedCity?.name ?? "Beirut";

  return useMemo(() => {
    const raw = translations[lang];
    return new Proxy(raw, {
      get(target, prop: string) {
        const val = (target as Record<string, string>)[prop];
        if (typeof val !== "string") return val;
        if (!val.includes("{")) return val;
        return val.replace(/\{country\}/g, countryName).replace(/\{city\}/g, cityName);
      },
    });
  }, [lang, countryName, cityName]);
}
