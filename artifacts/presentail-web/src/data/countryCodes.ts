// Trimmed country dial-code list for the web storefront's phone field.
// Mirrors the mobile app's data/countryCodes.ts shape but only ships the
// markets we actually deliver to plus the most common diaspora origins,
// keeping the bundle small for a feature only signed-in shoppers see.
export type CountryDialCode = {
  code: string;
  name: string;
  dial: string;
  flag: string;
  // Inclusive min/max length of the national subscriber number (digits
  // only, excluding the dial code). Used by the personal-info phone card
  // and any future client-side phone validation. Numbers outside this
  // range are almost certainly typos so we reject them before calling
  // PUT /api/auth/me. Mobile / API server keep their own copy of these
  // bounds — keep all three in sync when editing.
  minDigits: number;
  maxDigits: number;
};

export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { code: "LB", name: "Lebanon", dial: "+961", flag: "🇱🇧", minDigits: 7, maxDigits: 8 },
  { code: "AE", name: "United Arab Emirates", dial: "+971", flag: "🇦🇪", minDigits: 8, maxDigits: 9 },
  { code: "CY", name: "Cyprus", dial: "+357", flag: "🇨🇾", minDigits: 8, maxDigits: 8 },
  { code: "SA", name: "Saudi Arabia", dial: "+966", flag: "🇸🇦", minDigits: 8, maxDigits: 9 },
  { code: "KW", name: "Kuwait", dial: "+965", flag: "🇰🇼", minDigits: 7, maxDigits: 8 },
  { code: "QA", name: "Qatar", dial: "+974", flag: "🇶🇦", minDigits: 7, maxDigits: 8 },
  { code: "BH", name: "Bahrain", dial: "+973", flag: "🇧🇭", minDigits: 8, maxDigits: 8 },
  { code: "OM", name: "Oman", dial: "+968", flag: "🇴🇲", minDigits: 8, maxDigits: 8 },
  { code: "JO", name: "Jordan", dial: "+962", flag: "🇯🇴", minDigits: 8, maxDigits: 9 },
  { code: "EG", name: "Egypt", dial: "+20", flag: "🇪🇬", minDigits: 9, maxDigits: 10 },
  { code: "SY", name: "Syria", dial: "+963", flag: "🇸🇾", minDigits: 8, maxDigits: 9 },
  { code: "IQ", name: "Iraq", dial: "+964", flag: "🇮🇶", minDigits: 9, maxDigits: 10 },
  { code: "TR", name: "Turkey", dial: "+90", flag: "🇹🇷", minDigits: 10, maxDigits: 10 },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧", minDigits: 9, maxDigits: 10 },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷", minDigits: 9, maxDigits: 9 },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪", minDigits: 7, maxDigits: 11 },
  { code: "IT", name: "Italy", dial: "+39", flag: "🇮🇹", minDigits: 9, maxDigits: 11 },
  { code: "ES", name: "Spain", dial: "+34", flag: "🇪🇸", minDigits: 9, maxDigits: 9 },
  { code: "BE", name: "Belgium", dial: "+32", flag: "🇧🇪", minDigits: 8, maxDigits: 9 },
  { code: "NL", name: "Netherlands", dial: "+31", flag: "🇳🇱", minDigits: 9, maxDigits: 9 },
  { code: "CH", name: "Switzerland", dial: "+41", flag: "🇨🇭", minDigits: 9, maxDigits: 9 },
  { code: "SE", name: "Sweden", dial: "+46", flag: "🇸🇪", minDigits: 7, maxDigits: 13 },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺", minDigits: 9, maxDigits: 9 },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦", minDigits: 10, maxDigits: 10 },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸", minDigits: 10, maxDigits: 10 },
  { code: "BR", name: "Brazil", dial: "+55", flag: "🇧🇷", minDigits: 10, maxDigits: 11 },
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

// Validate the digits-only national subscriber number against the
// per-country length bounds. Returns `"empty"` when the user cleared the
// field (callers may treat this as "remove phone"), `"ok"` when the
// length is plausible, and `"too_short"` / `"too_long"` otherwise so the
// caller can render an inline message in the user's locale.
export type PhoneValidationResult = "empty" | "ok" | "too_short" | "too_long";

export function validateNationalNumber(
  country: CountryDialCode,
  rawLocal: string,
): PhoneValidationResult {
  const digits = (rawLocal ?? "").replace(/\D/g, "");
  if (!digits) return "empty";
  if (digits.length < country.minDigits) return "too_short";
  if (digits.length > country.maxDigits) return "too_long";
  return "ok";
}
