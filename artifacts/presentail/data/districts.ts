export type District = { name: string; fee: number };

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
  { name: "Jbail", fee: 19 },
  { name: "Jezzine", fee: 29 },
  { name: "Kasserwan", fee: 11 },
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
  { name: "Zghorta", fee: 39 },
];

export const AE_DISTRICTS: District[] = [
  { name: "Dubai", fee: 13.61 },
  { name: "Ras Al Khaimah", fee: 13.61 },
  { name: "Umm Al Quwain", fee: 13.61 },
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
  if (code === "AE") return AE_DISTRICTS;
  if (code === "CY") return CY_DISTRICTS;
  return LB_DISTRICTS;
}
