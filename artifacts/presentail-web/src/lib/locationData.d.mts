// Type declarations for locationData.mjs — the plain-ESM per-country business
// metadata registry. Imported through the typed facade locationData.ts.

export interface CountryLocationData {
  /** E.164 phone number, e.g. "+9613136532" */
  phone: string;
  /** Contact email address */
  email: string;
  /** schema.org openingHours strings, e.g. ["Mo-Su 08:00-24:00"] */
  openingHours: string[];
  /** schema.org priceRange: "$", "$$", "$$$", or "$$$$" */
  priceRange: string;
  /** Human-readable delivery coverage, e.g. "All of Lebanon" */
  deliveryRadius: string;
  /** Google Maps search URL for the country */
  mapUrl: string;
  /** Human-readable city/area names served in this country */
  serviceAreas: string[];
  /** Comma-separated accepted currency codes */
  currenciesAccepted: string;
  /** Comma-separated accepted payment methods */
  paymentAccepted: string;
}

/** Per-country registry keyed by lowercase country code ("lb" | "ae" | "cy"). */
export const LOCATION_DATA: Record<string, CountryLocationData>;
