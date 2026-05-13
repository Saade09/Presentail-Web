// Per-country length bounds for the national subscriber number (digits
// only, excluding the dial code). Mirrors the client-side bounds in
// `artifacts/presentail-web/src/data/countryCodes.ts` and
// `artifacts/presentail/data/phoneLengths.ts`. Keep all three in sync
// when editing.
//
// Used by `PUT /api/auth/me` to reject obviously-malformed phone numbers
// before they reach WooCommerce. The client side already validates and
// shows an inline message; this is the server-side guard so a hand-rolled
// API call can't bypass it.
type Bounds = { min: number; max: number };

// Dial code (with leading "+") to bounds. Longest-prefix match wins so
// `+1268` (Antigua) beats `+1` (US/Canada).
const DIAL_BOUNDS: Record<string, Bounds> = {
  "+961": { min: 7, max: 8 }, // LB
  "+971": { min: 8, max: 9 }, // AE
  "+357": { min: 8, max: 8 }, // CY
  "+966": { min: 8, max: 9 }, // SA
  "+965": { min: 7, max: 8 }, // KW
  "+974": { min: 7, max: 8 }, // QA
  "+973": { min: 8, max: 8 }, // BH
  "+968": { min: 8, max: 8 }, // OM
  "+962": { min: 8, max: 9 }, // JO
  "+20": { min: 9, max: 10 }, // EG
  "+963": { min: 8, max: 9 }, // SY
  "+964": { min: 9, max: 10 }, // IQ
  "+90": { min: 10, max: 10 }, // TR
  "+44": { min: 9, max: 10 }, // GB
  "+33": { min: 9, max: 9 }, // FR
  "+49": { min: 7, max: 11 }, // DE
  "+39": { min: 9, max: 11 }, // IT
  "+34": { min: 9, max: 9 }, // ES
  "+32": { min: 8, max: 9 }, // BE
  "+31": { min: 9, max: 9 }, // NL
  "+41": { min: 9, max: 9 }, // CH
  "+46": { min: 7, max: 13 }, // SE
  "+61": { min: 9, max: 9 }, // AU
  "+1": { min: 10, max: 10 }, // US/CA
  "+55": { min: 10, max: 11 }, // BR
};

// Generic E.164 fallback for dial codes we don't enumerate. Total length
// (country code + national number) is capped at 15 digits, and ITU
// recommends ≥4 national digits.
const FALLBACK_BOUNDS: Bounds = { min: 4, max: 15 };

const SORTED_DIALS = Object.keys(DIAL_BOUNDS).sort(
  (a, b) => b.length - a.length,
);

export type PhoneValidation =
  | { ok: true; normalized: string }
  | { ok: false; reason: "malformed" | "too_short" | "too_long" };

// Strict E.164: leading "+", first national digit 1-9, total 2..15 digits
// after the "+". Anything else is rejected so a hand-rolled API caller
// can't smuggle a malformed number into the WooCommerce billing record.
const E164_RE = /^\+[1-9]\d{1,14}$/;

// Validate a stored phone string before we mirror it to WooCommerce.
// Empty / missing input is allowed (callers may treat it as "clear" and
// the normalized value is the empty string). Non-empty input must parse
// as strict E.164 and (when its dial code is known) fall inside the
// per-country length bounds. Returns the canonical "+digits" string so
// the caller can forward exactly what we validated.
export function validateStoredPhone(raw: string | null | undefined): PhoneValidation {
  if (raw === null || raw === undefined) return { ok: true, normalized: "" };
  const trimmed = String(raw).trim();
  if (!trimmed) return { ok: true, normalized: "" };

  // Strip whitespace and common separators (spaces, dashes, parens, dots)
  // before checking the shape — humans frequently paste "+961 3 123 456"
  // or "+1 (212) 555-1212". Anything else (letters, other symbols) is
  // treated as malformed.
  const compact = trimmed.replace(/[\s\-().]/g, "");
  if (!E164_RE.test(compact)) return { ok: false, reason: "malformed" };

  const digits = compact.slice(1); // strip leading "+"
  // Generic E.164 ceiling — total digits ≤ 15. The regex already enforces
  // this; the explicit check is here so the contract is obvious to readers.
  if (digits.length > 15) return { ok: false, reason: "too_long" };

  // Match the longest known dial prefix; if none match, fall back to the
  // generic E.164 bounds against the national portion.
  for (const dial of SORTED_DIALS) {
    const dialDigits = dial.slice(1);
    if (digits.startsWith(dialDigits)) {
      const national = digits.length - dialDigits.length;
      const bounds = DIAL_BOUNDS[dial]!;
      if (national < bounds.min) return { ok: false, reason: "too_short" };
      if (national > bounds.max) return { ok: false, reason: "too_long" };
      return { ok: true, normalized: compact };
    }
  }

  // Unknown dial code — apply the generic ITU floor on the national part.
  // We don't know how many digits belong to the country code here, so we
  // require the whole number to be at least the generic minimum.
  if (digits.length < 1 + FALLBACK_BOUNDS.min) {
    return { ok: false, reason: "too_short" };
  }
  return { ok: true, normalized: compact };
}
