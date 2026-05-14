import type { Lang } from "@/lib/translations";

export const COUNTRY_NAMES_AR: Record<string, string> = {
  LB: "لبنان",
  AE: "الإمارات العربية المتحدة",
  CY: "قبرص",
  SA: "المملكة العربية السعودية",
  KW: "الكويت",
  QA: "قطر",
  BH: "البحرين",
  OM: "عُمان",
  JO: "الأردن",
  EG: "مصر",
  SY: "سوريا",
  IQ: "العراق",
  TR: "تركيا",
  US: "الولايات المتحدة",
  CA: "كندا",
  GB: "المملكة المتحدة",
  FR: "فرنسا",
  DE: "ألمانيا",
  AU: "أستراليا",
};

export const COUNTRY_NAMES_FR: Record<string, string> = {
  LB: "Liban",
  AE: "Émirats arabes unis",
  CY: "Chypre",
  SA: "Arabie saoudite",
  KW: "Koweït",
  QA: "Qatar",
  BH: "Bahreïn",
  OM: "Oman",
  JO: "Jordanie",
  EG: "Égypte",
  SY: "Syrie",
  IQ: "Irak",
  TR: "Turquie",
  US: "États-Unis",
  CA: "Canada",
  GB: "Royaume-Uni",
  FR: "France",
  DE: "Allemagne",
  AU: "Australie",
};

export function localizedCountryName(
  lang: Lang,
  code: string | null | undefined,
  fallback: string,
): string {
  const upper = code?.trim().toUpperCase();
  if (upper) {
    if (lang === "AR") return COUNTRY_NAMES_AR[upper] ?? fallback;
    if (lang === "FR") return COUNTRY_NAMES_FR[upper] ?? fallback;
  }
  return fallback;
}
