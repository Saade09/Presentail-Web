import { useLocale } from "@/contexts/LocaleContext";

const SERIF_AR = "'Noto Naskh Arabic', Georgia, serif";
const SERIF_DEFAULT = "'Playfair Display', 'Noto Naskh Arabic', Georgia, serif";

/**
 * Returns the correct serif/heading font-family string for the active locale.
 * Use this for inline `style` props that cannot rely on the `font-serif`
 * Tailwind class (which already picks up the right font via the CSS variable).
 */
export function useHeadingFont(): string {
  const { language } = useLocale();
  return language === "ar" ? SERIF_AR : SERIF_DEFAULT;
}
