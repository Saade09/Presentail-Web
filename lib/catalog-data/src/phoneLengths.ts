// Per-country length bounds for the national subscriber number (digits
// only, excluding the dial code). Used by the personal-info phone field
// and any future client-side phone validation. The web storefront keeps
// its own copy of these bounds inline in `src/data/countryCodes.ts` and
// the API server has a matching map in `src/lib/phoneValidation.ts` —
// keep all three in sync when editing.
export type PhoneLengthBounds = { min: number; max: number };

export const PHONE_LENGTH_BOUNDS: Record<string, PhoneLengthBounds> = {
  LB: { min: 7, max: 8 },
  AE: { min: 8, max: 9 },
  CY: { min: 8, max: 8 },
  SA: { min: 8, max: 9 },
  KW: { min: 7, max: 8 },
  QA: { min: 7, max: 8 },
  BH: { min: 8, max: 8 },
  OM: { min: 8, max: 8 },
  JO: { min: 8, max: 9 },
  EG: { min: 9, max: 10 },
  SY: { min: 8, max: 9 },
  IQ: { min: 9, max: 10 },
  TR: { min: 10, max: 10 },
  GB: { min: 9, max: 10 },
  FR: { min: 9, max: 9 },
  DE: { min: 7, max: 11 },
  IT: { min: 9, max: 11 },
  ES: { min: 9, max: 9 },
  BE: { min: 8, max: 9 },
  NL: { min: 9, max: 9 },
  CH: { min: 9, max: 9 },
  SE: { min: 7, max: 13 },
  AU: { min: 9, max: 9 },
  CA: { min: 10, max: 10 },
  US: { min: 10, max: 10 },
  BR: { min: 10, max: 11 },
};

const FALLBACK_BOUNDS: PhoneLengthBounds = { min: 4, max: 15 };

export function getPhoneLengthBounds(countryIso: string): PhoneLengthBounds {
  return PHONE_LENGTH_BOUNDS[countryIso] ?? FALLBACK_BOUNDS;
}

export type PhoneValidationResult = "empty" | "ok" | "too_short" | "too_long";

export function validateNationalNumber(
  countryIso: string,
  rawLocal: string,
): PhoneValidationResult {
  const digits = (rawLocal ?? "").replace(/\D/g, "");
  if (!digits) return "empty";
  const { min, max } = getPhoneLengthBounds(countryIso);
  if (digits.length < min) return "too_short";
  if (digits.length > max) return "too_long";
  return "ok";
}
