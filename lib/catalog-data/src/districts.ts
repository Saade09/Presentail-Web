import type { District } from "./types";

export const LB_DISTRICTS: District[] = [
  { name: "Akkar", fee: 39 },
  { name: "Aley", fee: 19 },
  { name: "Baabda", fee: 11 },
  { name: "Baalbeck", fee: 39 },
  { name: "Batroun", fee: 19 },
  { name: "Bcharee", fee: 39 },
  { name: "Beirut", fee: 8 },
  { name: "Bent Jbeil", fee: 39 },
  { name: "Chouf", fee: 29 },
  { name: "Hasbaya", fee: 39 },
  { name: "Hermel", fee: 39 },
  { name: "Jbeil", fee: 19 },
  { name: "Jezzine", fee: 29 },
  { name: "Kesserwan", fee: 11 },
  { name: "Koura", fee: 29 },
  { name: "Marjayoun", fee: 39 },
  { name: "Metn", fee: 11 },
  { name: "Minnieh-Dennaya", fee: 39 },
  { name: "Nabatieh", fee: 39 },
  { name: "Rechaya", fee: 39 },
  { name: "Saida", fee: 29 },
  { name: "Tripoli", fee: 29 },
  { name: "Tyre", fee: 39 },
  { name: "West Bekaa", fee: 39 },
  { name: "Zahle", fee: 29 },
  { name: "Zgharta", fee: 39 },
];

export const AE_DISTRICTS: District[] = [
  { name: "Dubai", fee: 13.61 },
  { name: "Ras Al Khaimah", fee: 13.61 },
  { name: "Fujairah", fee: 13.61 },
  { name: "Ajman", fee: 13.61 },
  { name: "Sharjah", fee: 13.61 },
  { name: "Abu Dhabi", fee: 13.61 },
];

export const CY_DISTRICTS: District[] = [
  { name: "Larnaca", fee: 11 },
  { name: "Limassol", fee: 11 },
  { name: "Nicosia", fee: 11 },
  { name: "Paphos", fee: 11 },
];

export function districtsForCountry(code?: string): District[] {
  const upper = code?.trim().toUpperCase();
  if (upper === "AE") return AE_DISTRICTS;
  if (upper === "CY") return CY_DISTRICTS;
  return LB_DISTRICTS;
}

/**
 * Look up the per-district delivery fee by country code + district name.
 * Returns 0 when the district is unknown for the country.
 */
export function feeForDistrict(
  countryCode: string | null | undefined,
  districtName: string | null | undefined,
): number {
  if (!districtName) return 0;
  const list = districtsForCountry(countryCode ?? undefined);
  const match = list.find(
    (d) => d.name.toLowerCase() === districtName.trim().toLowerCase(),
  );
  return match?.fee ?? 0;
}
