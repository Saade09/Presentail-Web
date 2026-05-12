// Trimmed country dial-code list for the web storefront's phone field.
// Mirrors the mobile app's data/countryCodes.ts shape but only ships the
// markets we actually deliver to plus the most common diaspora origins,
// keeping the bundle small for a feature only signed-in shoppers see.
export type CountryDialCode = {
  code: string;
  name: string;
  dial: string;
  flag: string;
};

export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { code: "LB", name: "Lebanon", dial: "+961", flag: "🇱🇧" },
  { code: "AE", name: "United Arab Emirates", dial: "+971", flag: "🇦🇪" },
  { code: "CY", name: "Cyprus", dial: "+357", flag: "🇨🇾" },
  { code: "SA", name: "Saudi Arabia", dial: "+966", flag: "🇸🇦" },
  { code: "KW", name: "Kuwait", dial: "+965", flag: "🇰🇼" },
  { code: "QA", name: "Qatar", dial: "+974", flag: "🇶🇦" },
  { code: "BH", name: "Bahrain", dial: "+973", flag: "🇧🇭" },
  { code: "OM", name: "Oman", dial: "+968", flag: "🇴🇲" },
  { code: "JO", name: "Jordan", dial: "+962", flag: "🇯🇴" },
  { code: "EG", name: "Egypt", dial: "+20", flag: "🇪🇬" },
  { code: "SY", name: "Syria", dial: "+963", flag: "🇸🇾" },
  { code: "IQ", name: "Iraq", dial: "+964", flag: "🇮🇶" },
  { code: "TR", name: "Turkey", dial: "+90", flag: "🇹🇷" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪" },
  { code: "IT", name: "Italy", dial: "+39", flag: "🇮🇹" },
  { code: "ES", name: "Spain", dial: "+34", flag: "🇪🇸" },
  { code: "BE", name: "Belgium", dial: "+32", flag: "🇧🇪" },
  { code: "NL", name: "Netherlands", dial: "+31", flag: "🇳🇱" },
  { code: "CH", name: "Switzerland", dial: "+41", flag: "🇨🇭" },
  { code: "SE", name: "Sweden", dial: "+46", flag: "🇸🇪" },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
  { code: "BR", name: "Brazil", dial: "+55", flag: "🇧🇷" },
];

export function splitPhone(raw: string | undefined | null): {
  country: CountryDialCode;
  local: string;
} {
  const fallback = COUNTRY_DIAL_CODES[0];
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { country: fallback, local: "" };
  if (trimmed.startsWith("+")) {
    const compact = trimmed.replace(/\s+/g, "");
    const sorted = [...COUNTRY_DIAL_CODES].sort(
      (a, b) => b.dial.length - a.dial.length,
    );
    const match = sorted.find((c) => compact.startsWith(c.dial));
    if (match) {
      return {
        country: match,
        local: compact.slice(match.dial.length).replace(/^[\s-]+/, ""),
      };
    }
  }
  return { country: fallback, local: trimmed };
}
