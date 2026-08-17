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
  "lb-jbeil": "جبيل",
  "lb-jezzine": "جزّين",
  "lb-jounieh": "جونيه",
  "lb-kesserwan": "كسروان",
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
  "lb-jbeil": "Jbeil",
  "lb-jezzine": "Jezzine",
  "lb-jounieh": "Jounieh",
  "lb-kesserwan": "Kesrouan",
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
  "lb-zghorta": "Zgharta",
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

export const COUNTRY_NAMES_EL: Record<string, string> = {
  LB: "Λίβανος",
  AE: "Ηνωμένα Αραβικά Εμιράτα",
  CY: "Κύπρος",
  SA: "Σαουδική Αραβία",
  KW: "Κουβέιτ",
  QA: "Κατάρ",
  BH: "Μπαχρέιν",
  OM: "Ομάν",
  JO: "Ιορδανία",
  EG: "Αίγυπτος",
  SY: "Συρία",
  IQ: "Ιράκ",
  TR: "Τουρκία",
  US: "Ηνωμένες Πολιτείες",
  CA: "Καναδάς",
  GB: "Ηνωμένο Βασίλειο",
  FR: "Γαλλία",
  DE: "Γερμανία",
  AU: "Αυστραλία",
};

export const CITY_NAMES_EL: Record<string, string> = {
  "lb-akkar": "Ακάρ",
  "lb-aley": "Αλέι",
  "lb-baabda": "Μπάαμπντα",
  "lb-baalbeck": "Μπάαλμπεκ",
  "lb-batroun": "Μπατρούν",
  "lb-bcharee": "Μπσαρέ",
  "lb-beirut": "Βηρυτός",
  "lb-bent-jbeil": "Μπεντ Τζμπέιλ",
  "lb-chouf": "Σουφ",
  "lb-hasbaya": "Χάσμπαγια",
  "lb-hermel": "Χερμέλ",
  "lb-jbeil": "Βύβλος",
  "lb-jezzine": "Τζεζίν",
  "lb-jounieh": "Τζουνιέ",
  "lb-kesserwan": "Κεσερουάν",
  "lb-koura": "Κούρα",
  "lb-marjayoun": "Μαρτζαγιούν",
  "lb-metn": "Μετν",
  "lb-minnieh-dennaya": "Μινιέ-Ντενιέ",
  "lb-nabatieh": "Ναμπατίγιε",
  "lb-rechaya": "Ρασάγια",
  "lb-saida": "Σιδώνα",
  "lb-tripoli": "Τρίπολη",
  "lb-tyre": "Τύρος",
  "lb-west-bekaa": "Δυτική Μπεκάα",
  "lb-zahle": "Ζάχλε",
  "lb-zghorta": "Ζγκόρτα",
  "lb-byblos": "Βύβλος",
  "ae-dubai": "Ντουμπάι",
  "ae-abu-dhabi": "Άμπου Ντάμπι",
  "ae-sharjah": "Σάρτζα",
  "ae-ajman": "Ατζμάν",
  "ae-ras-al-khaimah": "Ρας αλ Χάιμα",
  "ae-fujairah": "Φουτζέιρα",
  "ae-umm-al-quwain": "Ουμ αλ Κουέιν",
  "ae-al-ain": "Αλ Άιν",
  "cy-nicosia": "Λευκωσία",
  "cy-limassol": "Λεμεσός",
  "cy-larnaca": "Λάρνακα",
  "cy-paphos": "Πάφος",
};

function normalizeLang(lang: string | null | undefined): LocalizableLang {
  const lower = (lang ?? "").toLowerCase();
  if (lower === "ar") return "ar";
  if (lower === "fr") return "fr";
  if (lower === "el") return "el";
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
  if (l === "el") return COUNTRY_NAMES_EL[upper] ?? fallback;
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
  if (l === "el") return CITY_NAMES_EL[id] ?? fallback;
  return fallback;
}

/**
 * Build the `{ ar?, fr? }` localized-name map for a given country code.
 * Returns `undefined` when neither translation is available so the API
 * can omit the field entirely.
 */
export function localizedNamesForCountry(
  code: string,
): { ar?: string; fr?: string; el?: string } | undefined {
  const upper = code.trim().toUpperCase();
  const ar = COUNTRY_NAMES_AR[upper];
  const fr = COUNTRY_NAMES_FR[upper];
  const el = COUNTRY_NAMES_EL[upper];
  if (!ar && !fr && !el) return undefined;
  const out: { ar?: string; fr?: string; el?: string } = {};
  if (ar) out.ar = ar;
  if (fr) out.fr = fr;
  if (el) out.el = el;
  return out;
}

export function localizedNamesForCity(
  id: string,
): { ar?: string; fr?: string; el?: string } | undefined {
  const ar = CITY_NAMES_AR[id];
  const fr = CITY_NAMES_FR[id];
  const el = CITY_NAMES_EL[id];
  if (!ar && !fr && !el) return undefined;
  const out: { ar?: string; fr?: string; el?: string } = {};
  if (ar) out.ar = ar;
  if (fr) out.fr = fr;
  if (el) out.el = el;
  return out;
}
