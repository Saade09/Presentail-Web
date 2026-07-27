// CyberSource Payer Authentication (3DS) — shared charge-data helpers.
//
// The backend payer-auth endpoints (check-enrollment frictionless path and
// validate) return the 3DS metadata as FLAT fields on the response body —
// they are NOT nested under a `payerAuthData` key. This module is the single
// place that maps those flat responses into the `payerAuthData` object the
// charge endpoint expects. The field list mirrors `PayerAuthenticationData`
// in artifacts/api-server/src/lib/cybersource.ts — keep the two in sync.

export type CsPayerAuthChargeData = {
  cavv?: string;
  eciRaw?: string;
  eci?: string;
  xid?: string;
  specificationVersion?: string;
  directoryServerTransactionId?: string;
  paSpecificationVersion?: string;
  authenticationTransactionId?: string;
  commerceIndicator?: string;
};

const PAYER_AUTH_FIELDS = [
  "cavv",
  "eciRaw",
  "eci",
  "xid",
  "specificationVersion",
  "directoryServerTransactionId",
  "paSpecificationVersion",
  "authenticationTransactionId",
  "commerceIndicator",
] as const;

/**
 * Picks only the recognised 3DS fields (non-empty strings) from a flat
 * enrollment/validate response. Unknown keys (`ok`, `enrolled`, `stepUpUrl`,
 * `accessToken`, …) are dropped so nothing unexpected reaches the charge
 * endpoint.
 */
export function extractCsPayerAuthData(
  res: Record<string, unknown>,
): CsPayerAuthChargeData {
  const out: CsPayerAuthChargeData = {};
  for (const key of PAYER_AUTH_FIELDS) {
    const value = res[key];
    if (typeof value === "string" && value !== "") out[key] = value;
  }
  return out;
}

/**
 * True when the extracted metadata carries an actual 3DS proof the charge can
 * use. Mirrors the backend `pa_required` gate (cavv OR eciRaw/eci present) —
 * charging without proof would be rejected server-side anyway, so the
 * checkout short-circuits with the bank-verification toast instead.
 */
export function hasCsPayerAuthProof(data: CsPayerAuthChargeData): boolean {
  if (typeof data.cavv === "string" && data.cavv.trim() !== "") return true;
  const eci = data.eciRaw ?? data.eci ?? "";
  return eci.trim() !== "";
}
