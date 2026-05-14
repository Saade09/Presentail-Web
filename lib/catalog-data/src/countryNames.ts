import type { LocalizableLang } from "./types";

/** Localized country names by ISO 3166-1 alpha-2 code. */
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

/** Localized city names keyed by city id. */
export const CITY_NAMES_AR: Record<string, string> = {
  "lb-akkar": "عكار",
  "lb-aley": "عاليه",
  "lb-baabda": "بعبدا",
  "lb-baalbeck": "بعلبك",
  "lb-batroun": "البترون",
  "lb-bcharee": "بشري",
  "lb-beirut": "بيروت",
  "lb-bent-jbeil": "بنت جبيل",
  "lb-chouf": "الشوف",
  "lb-hasbaya": "حاصبيا",
  "lb-hermel": "الهرمل",
  "lb-jbail": "جبيل",
  "lb-jezzine": "جزّين",
  "lb-jounieh": "جونيه",
  "lb-kasserwan": "كسروان",
  "lb-koura": "الكورة",
  "lb-marjayoun": "مرجعيون",
  "lb-metn": "المتن",
  "lb-minnieh-dennaya": "المنية - الضنية",
  "lb-nabatieh": "النبطية",
  "lb-rechaya": "راشيا",
  "lb-saida": "صيدا",
  "lb-tripoli": "طرابلس",
  "lb-tyre": "صور",
  "lb-west-bekaa": "البقاع الغربي",
  "lb-zahle": "زحلة",
  "lb-zghorta": "زغرتا",
  "lb-byblos": "جبيل",
  "ae-dubai": "دبي",
  "ae-abu-dhabi": "أبو ظبي",
  "ae-sharjah": "الشارقة",
  "ae-ajman": "عجمان",
  "ae-ras-al-khaimah": "رأس الخيمة",
  "ae-fujairah": "الفجيرة",
  "ae-umm-al-quwain": "أم القيوين",
  "ae-al-ain": "العين",
  "cy-nicosia": "نيقوسيا",
  "cy-limassol": "ليماسول",
  "cy-larnaca": "لارنكا",
  "cy-paphos": "بافوس",
};

export const CITY_NAMES_FR: Record<string, string> = {
  "lb-akkar": "Akkar",
  "lb-aley": "Aley",
  "lb-baabda": "Baabda",
  "lb-baalbeck": "Baalbek",
  "lb-batroun": "Batroun",
  "lb-bcharee": "Bcharré",
  "lb-beirut": "Beyrouth",
  "lb-bent-jbeil": "Bent Jbeil",
  "lb-chouf": "Chouf",
  "lb-hasbaya": "Hasbaya",
  "lb-hermel": "Hermel",
  "lb-jbail": "Jbeil",
  "lb-jezzine": "Jezzine",
  "lb-jounieh": "Jounieh",
  "lb-kasserwan": "Kesrouan",
  "lb-koura": "Koura",
  "lb-marjayoun": "Marjayoun",
  "lb-metn": "Metn",
  "lb-minnieh-dennaya": "Minnieh-Dennié",
  "lb-nabatieh": "Nabatieh",
  "lb-rechaya": "Rachaya",
  "lb-saida": "Saïda",
  "lb-tripoli": "Tripoli",
  "lb-tyre": "Tyr",
  "lb-west-bekaa": "Bekaa-Ouest",
  "lb-zahle": "Zahlé",
  "lb-zghorta": "Zghorta",
  "lb-byblos": "Byblos",
  "ae-dubai": "Dubaï",
  "ae-abu-dhabi": "Abou Dhabi",
  "ae-sharjah": "Charjah",
  "ae-ajman": "Ajman",
  "ae-ras-al-khaimah": "Ras el Khaïmah",
  "ae-fujairah": "Foujaïrah",
  "ae-umm-al-quwain": "Oumm al Qaïwaïn",
  "ae-al-ain": "Al-Aïn",
  "cy-nicosia": "Nicosie",
  "cy-limassol": "Limassol",
  "cy-larnaca": "Larnaca",
  "cy-paphos": "Paphos",
};

function normalizeLang(lang: string | null | undefined): LocalizableLang {
  const lower = (lang ?? "").toLowerCase();
  if (lower === "ar") return "ar";
  if (lower === "fr") return "fr";
  return "en";
}

export function localizedCountryName(
  lang: string | null | undefined,
  code: string | null | undefined,
  fallback: string,
): string {
  const upper = code?.trim().toUpperCase();
  if (!upper) return fallback;
  const l = normalizeLang(lang);
  if (l === "ar") return COUNTRY_NAMES_AR[upper] ?? fallback;
  if (l === "fr") return COUNTRY_NAMES_FR[upper] ?? fallback;
  return fallback;
}

export function localizedCityName(
  lang: string | null | undefined,
  id: string | null | undefined,
  fallback: string,
): string {
  if (!id) return fallback;
  const l = normalizeLang(lang);
  if (l === "ar") return CITY_NAMES_AR[id] ?? fallback;
  if (l === "fr") return CITY_NAMES_FR[id] ?? fallback;
  return fallback;
}

/**
 * Build the `{ ar?, fr? }` localized-name map for a given country code.
 * Returns `undefined` when neither translation is available so the API
 * can omit the field entirely.
 */
export function localizedNamesForCountry(
  code: string,
): { ar?: string; fr?: string } | undefined {
  const upper = code.trim().toUpperCase();
  const ar = COUNTRY_NAMES_AR[upper];
  const fr = COUNTRY_NAMES_FR[upper];
  if (!ar && !fr) return undefined;
  const out: { ar?: string; fr?: string } = {};
  if (ar) out.ar = ar;
  if (fr) out.fr = fr;
  return out;
}

export function localizedNamesForCity(
  id: string,
): { ar?: string; fr?: string } | undefined {
  const ar = CITY_NAMES_AR[id];
  const fr = CITY_NAMES_FR[id];
  if (!ar && !fr) return undefined;
  const out: { ar?: string; fr?: string } = {};
  if (ar) out.ar = ar;
  if (fr) out.fr = fr;
  return out;
}
