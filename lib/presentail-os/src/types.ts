/**
 * Typed interfaces for the Presentail OS public locations API.
 *
 * Field names match what os.presentail.com/api/public/locations returns.
 * `code` is lowercase from the OS (e.g. "lb", "ae") — callers must
 * toUpperCase() before comparing against internal ISO codes.
 */

export type OSTimeSlot = {
  label: string;
  cutoffHour: number;
};

export type OSCity = {
  id: string;
  name: string;
  isActive?: boolean;
  deliveryFee?: number;
  expressAvailable?: boolean;
  expressDeliveryLabel?: string;
  sameDayCutoffHour?: number;
  timeSlots?: OSTimeSlot[];
};

export type OSCountry = {
  /** Present when the OS has an explicit id; falls back to code. */
  id?: string;
  name: string;
  /** Lowercase ISO 3166-1 alpha-2, e.g. "lb", "ae". */
  code: string;
  /** Relative URL to a flag image, e.g. "/flags/lb.svg". */
  flagImageUrl?: string;
  /** Flag emoji — may be absent; use catalog-data fallback. */
  flag?: string;
  /** ISO 4217 currency code, e.g. "USD". */
  currency?: string;
  isActive?: boolean;
  preferredDefaultCityId?: string;
  cities: OSCity[];
};

export type OSLocationsResponse = {
  countries: OSCountry[];
};

export type OSExpressConfig = {
  expressDeliveryLabel?: string;
  expressAvailable?: boolean;
  sameDayCutoffHour?: number;
};
