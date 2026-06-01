import { useLanguage } from "@/contexts/LanguageContext";

type PlayfairWeight = "400Regular" | "500Medium" | "600SemiBold" | "700Bold";

const AR_FONT_MAP: Record<PlayfairWeight, string> = {
  "400Regular": "NotoNaskhArabic_400Regular",
  "500Medium": "NotoNaskhArabic_500Medium",
  "600SemiBold": "NotoNaskhArabic_600SemiBold",
  "700Bold": "NotoNaskhArabic_700Bold",
};

const EN_FONT_MAP: Record<PlayfairWeight, string> = {
  "400Regular": "PlayfairDisplay_400Regular",
  "500Medium": "PlayfairDisplay_500Medium",
  "600SemiBold": "PlayfairDisplay_600SemiBold",
  "700Bold": "PlayfairDisplay_700Bold",
};

export function useHeadingFont(weight: PlayfairWeight = "400Regular"): string {
  const { lang } = useLanguage();
  return lang === "AR" ? AR_FONT_MAP[weight] : EN_FONT_MAP[weight];
}
