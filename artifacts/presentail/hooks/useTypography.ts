import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Returns language-aware font-family names for the app's body and
 * display/heading text.
 *
 * • English and French:
 *     body    → Inter family
 *     display → PlayfairDisplay family (brand/heading aesthetic)
 *
 * • Arabic:
 *     body    → Noto Naskh Arabic (bundled via @expo-google-fonts/noto-naskh-arabic)
 *     display → Noto Naskh Arabic (PlayfairDisplay has no Arabic glyphs;
 *               NotoNaskhArabic is the only bundled Arabic-capable font)
 *
 * Usage:
 *   const typo = useTypography();
 *   <Text style={{ fontFamily: typo.body.medium }}>…</Text>
 *   <Text style={{ fontFamily: typo.display.medium }}>…</Text>
 *
 * The AppText component uses this hook automatically — components that
 * import AppText instead of RN's Text get language-aware fonts for free
 * without touching fontFamily values.
 */
export type TypographyWeight = {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
};

export type TypographyFonts = {
  /** Body / UI text weights. */
  body: TypographyWeight;
  /** Display / heading weights (PlayfairDisplay for EN/FR, NotoNaskhArabic for AR). */
  display: Omit<TypographyWeight, "bold"> & { bold: string };
  /** Convenience aliases — same as `body.*`. */
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
};

const EN_FR: TypographyFonts = {
  body: {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semibold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
  },
  display: {
    regular: "PlayfairDisplay_400Regular",
    medium: "PlayfairDisplay_500Medium",
    semibold: "PlayfairDisplay_600SemiBold",
    bold: "PlayfairDisplay_500Medium",
  },
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

const AR: TypographyFonts = {
  body: {
    regular: "NotoNaskhArabic_400Regular",
    medium: "NotoNaskhArabic_500Medium",
    semibold: "NotoNaskhArabic_600SemiBold",
    bold: "NotoNaskhArabic_700Bold",
  },
  display: {
    regular: "NotoNaskhArabic_400Regular",
    medium: "NotoNaskhArabic_500Medium",
    semibold: "NotoNaskhArabic_600SemiBold",
    bold: "NotoNaskhArabic_700Bold",
  },
  regular: "NotoNaskhArabic_400Regular",
  medium: "NotoNaskhArabic_500Medium",
  semibold: "NotoNaskhArabic_600SemiBold",
  bold: "NotoNaskhArabic_700Bold",
};

export function useTypography(): TypographyFonts {
  const { lang } = useLanguage();
  return lang === "AR" ? AR : EN_FR;
}
