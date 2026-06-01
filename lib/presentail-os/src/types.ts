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
  /** Additional surcharge for booking this slot (USD). e.g. night-slot fee. */
  extraFee?: number;
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
  /**
   * Free delivery threshold in USD (the cart's internal currency).
   * When absent the hardcoded per-country default applies.
   */
  freeDeliveryThresholdUsd?: number;
  /**
   * When false, free delivery is not offered for this country
   * and delivery fees are always applied regardless of cart total.
   * When absent, defaults to true (free delivery enabled).
   */
  freeDeliveryEnabled?: boolean;
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

// ── Product catalog types ──────────────────────────────────────────────────

export type OSProductImage = {
  url: string;
  alt?: string;
};

export type OSProductCategory = {
  id: string;
  slug: string;
  name: string;
};

export type OSProductBrand = {
  id: string;
  slug: string;
  name: string;
  image?: string | null;
  description?: string;
};

export type OSProductOccasion = {
  id: string;
  slug: string;
  name: string;
};

/**
 * A product as returned by the Presentail OS catalog API.
 *
 * `id` is the slug used as the product identifier throughout the app.
 * `wcId` is the WooCommerce numeric id — required for order line items
 * until Phase 3 removes WooCommerce entirely.
 * `price` is always in USD (the WC base currency).
 */
export type OSProduct = {
  id: string;
  wcId?: number;
  name: string;
  price: number;
  description?: string;
  images: OSProductImage[];
  inStock: boolean;
  featured?: boolean;
  totalSales?: number;
  categories: OSProductCategory[];
  occasions: OSProductOccasion[];
  brands: OSProductBrand[];
  /**
   * When present, product is only deliverable to these ISO country codes
   * (uppercase, e.g. ["LB","AE"]). Absent means deliverable everywhere.
   */
  deliverableCountries?: string[];
  /**
   * When present, product is only deliverable to these city ids
   * (e.g. ["lb-beirut","ae-dubai"]). Absent means all cities in the country.
   */
  deliverableCities?: string[];
};

export type OSProductsResponse = {
  products: OSProduct[];
};

export type OSCategoriesResponse = {
  categories: OSProductCategory[];
};

export type OSBrandsResponse = {
  brands: OSProductBrand[];
};

export type OSOccasionsResponse = {
  occasions: OSProductOccasion[];
};
