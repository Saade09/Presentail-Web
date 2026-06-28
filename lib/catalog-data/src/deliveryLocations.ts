import type { DeliveryCountryData } from "./types";

/**
 * Canonical list of countries + cities Presentail can deliver to. The web
 * storefront and the API server import this directly; the mobile app uses
 * it as the offline fallback when `/delivery-locations` is unreachable.
 */
export const DELIVERY_COUNTRIES: DeliveryCountryData[] = [
  {
    id: "lb",
    name: "Lebanon",
    code: "LB",
    flag: "\u{1F1F1}\u{1F1E7}",
    currency: "USD",
    isActive: true,
    preferredDefaultCityId: "lb-beirut",
    cities: [
      { id: "lb-akkar", name: "Akkar", isActive: true },
      { id: "lb-aley", name: "Aley", isActive: true },
      { id: "lb-baabda", name: "Baabda", isActive: true },
      { id: "lb-baalbeck", name: "Baalbeck", isActive: true },
      { id: "lb-batroun", name: "Batroun", isActive: true },
      { id: "lb-bcharee", name: "Bcharee", isActive: true },
      { id: "lb-beirut", name: "Beirut", isActive: true },
      { id: "lb-bent-jbeil", name: "Bent Jbeil", isActive: true },
      { id: "lb-chouf", name: "Chouf", isActive: true },
      { id: "lb-hasbaya", name: "Hasbaya", isActive: true },
      { id: "lb-hermel", name: "Hermel", isActive: true },
      { id: "lb-jbail", name: "Jbail", isActive: true },
      { id: "lb-jezzine", name: "Jezzine", isActive: true },
      { id: "lb-kasserwan", name: "Kasserwan", isActive: true },
      { id: "lb-koura", name: "Koura", isActive: true },
      { id: "lb-marjayoun", name: "Marjayoun", isActive: true },
      { id: "lb-metn", name: "Metn", isActive: true },
      { id: "lb-minnieh-dennaya", name: "Minnieh-Dennaya", isActive: true },
      { id: "lb-nabatieh", name: "Nabatieh", isActive: true },
      { id: "lb-rechaya", name: "Rechaya", isActive: true },
      { id: "lb-saida", name: "Saida", isActive: true },
      { id: "lb-tripoli", name: "Tripoli", isActive: true },
      { id: "lb-tyre", name: "Tyre", isActive: true },
      { id: "lb-west-bekaa", name: "West Bekaa", isActive: true },
      { id: "lb-zahle", name: "Zahle", isActive: true },
      { id: "lb-zghorta", name: "Zgharta", isActive: true },
    ],
  },
  {
    id: "ae",
    name: "United Arab Emirates",
    code: "AE",
    flag: "\u{1F1E6}\u{1F1EA}",
    currency: "AED",
    isActive: true,
    cities: [
      { id: "ae-dubai", name: "Dubai", isActive: true },
      { id: "ae-ras-al-khaimah", name: "Ras Al Khaimah", isActive: true },
      { id: "ae-umm-al-quwain", name: "Umm Al Quwain", isActive: false },
      { id: "ae-fujairah", name: "Fujairah", isActive: true },
      { id: "ae-ajman", name: "Ajman", isActive: true },
      { id: "ae-sharjah", name: "Sharjah", isActive: true },
      { id: "ae-abu-dhabi", name: "Abu Dhabi", isActive: true },
    ],
  },
  {
    id: "cy",
    name: "Cyprus",
    code: "CY",
    flag: "\u{1F1E8}\u{1F1FE}",
    currency: "EUR",
    isActive: true,
    cities: [
      { id: "cy-larnaca", name: "Larnaca", isActive: true },
      { id: "cy-limassol", name: "Limassol", isActive: true },
      { id: "cy-nicosia", name: "Nicosia", isActive: true },
      { id: "cy-paphos", name: "Paphos", isActive: true },
    ],
  },
];

export const DEFAULT_FALLBACK_COUNTRY_CODE = "LB";
