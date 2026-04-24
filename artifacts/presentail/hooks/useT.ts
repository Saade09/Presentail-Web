import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/lib/translations";

export function useT() {
  const { lang } = useLanguage();
  return translations[lang];
}
