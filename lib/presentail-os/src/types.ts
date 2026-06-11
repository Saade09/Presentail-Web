/**
 * Typed interfaces for the Presentail OS public locations API.
 *
 * Field names match what os.presentail.com/api/public/locations returns.
 * `code` is lowercase from the OS (e.g. "lb", "ae") — callers must
 * toUpperCase() before comparing against internal ISO codes.
 */

export type OSTimeSlot = {
  label: string;
  /** Hour of day (0–23) the slot window opens (e.g. 9 for 9 AM). */
  startHour?: number;
  /** Hour of day (0–23) the slot window closes (e.g. 14 for 2 PM). */
  endHour?: number;
  cutoffHour: number;
  /** Additional surcharge for booking this slot (USD). e.g. night-slot fee. */
  extraFee?: number;
};

export type OSCity = {
  /** Integer city identifier (used for DB/OS references). */
  id: number;
  /** URL-safe slug used as string key (e.g. "beirut", "dubai"). */
  slug: string;
  name: string;
  isActive?: boolean;
  deliveryFee?: number;
  expressAvailable?: boolean;
  expressDeliveryLabel?: string;
  sameDayCutoffHour?: number;
  timeSlots?: OSTimeSlot[];
  /**
   * Per-day-of-week time slot configuration. Keys are lowercase English weekday
   * names (e.g. "monday", "tuesday"). When present, clients should use
   * slotsByDay[dayOfWeek] for the selected delivery date instead of the flat
   * timeSlots array, falling back to timeSlots when the key is absent.
   */
  slotsByDay?: Record<string, OSTimeSlot[]>;
  /**
   * Total express delivery fee in the country's display currency (not USD).
   * Use getUsdAmount(expressFeeTotal, country.currency) to get USD amount.
   */
  expressFeeTotal?: number;
  /**
   * Express surcharge portion of expressFeeTotal (expressFeeTotal - deliveryFee).
   * In the country's display currency.
   */
  expressSurcharge?: number;
  /**
   * Free delivery threshold in the country's display currency for this city.
   * Use getUsdAmount to convert to USD before comparison with cart total.
   * When present, overrides the country-level freeDeliveryThreshold.
   */
  freeDeliveryThreshold?: number;
  /**
   * Whether free delivery is enabled for this specific city.
   * When present, overrides the country-level freeDeliveryEnabled.
   */
  freeDeliveryEnabled?: boolean;
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
   * Free delivery threshold in the country's display currency.
   * Use getUsdAmount to convert to USD before comparison with cart total.
   * When absent the hardcoded per-country default applies.
   */
  freeDeliveryThreshold?: number;
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
  featured?: boolean;
  /** Private storage URL (auth-gated). Use imagePublicUrl when available. */
  image?: string | null;
  /** Public CDN URL (e.g. /api/storage/public-objects/…). Preferred over image. */
  imagePublicUrl?: string | null;
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
  /** Total number of products matching the query (used for pagination). */
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
};

export type OSCategoriesResponse = {
  categories: OSProductCategory[];
};

export type OSCatalogAttributeBrand = {
  id: number | string;
  slug: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  image_public_url?: string | null;
  sort_order?: number;
};

export type OSCatalogAttributeBrandsResponse = {
  brands: OSCatalogAttributeBrand[];
};

export type OSOccasionsResponse = {
  occasions: OSProductOccasion[];
};

// ── Order creation types ───────────────────────────────────────────────────

export type OSOrderLineItem = {
  /** OS product slug (the `id` field on OSProduct). */
  productId: string;
  productName: string;
  quantity: number;
  /** Server-verified price from the OS cache, in USD. */
  priceUsd: number;
};

export type OSOrderFeeItem = {
  name: string;
  quantity: number;
  /** Fee amount in USD. */
  priceUsd: number;
};

export type OSCreateOrderPayload = {
  /** Workspace slug, e.g. "presentail". */
  workspace: string;
  /** Presentail app-generated order id (UUID). */
  appOrderId: string;
  items: OSOrderLineItem[];
  /** Non-catalog fee line items (e.g. card printing). */
  feeItems?: OSOrderFeeItem[];
  billing: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    countryCode?: string;
  };
  recipient: {
    firstName: string;
    lastName: string;
    phone: string;
  };
  delivery: {
    district: string;
    cityId?: string;
    countryCode?: string;
    address: string;
    date?: string;
    slot?: string;
    isExpress: boolean;
    noAddress: boolean;
    /** Computed server-side delivery fee in USD (0 when free). */
    feeUsd: number;
    /** Express surcharge in USD (0 when not express). */
    expressSurchargeUsd: number;
    /** Night-slot surcharge in USD (0 when standard slot). */
    slotFeeUsd: number;
  };
  cardMessage?: string;
  cardFrom?: string;
  cardTo?: string;
  qrLink?: string;
  qrLabel?: string;
  orderNotes?: string;
  identitySecret?: boolean;
  payment: {
    /** Normalised payment method key, e.g. "card", "mamo", "paypal". */
    method: string;
    /** PSP reference (Stripe session id, Mamo link id, PayPal order id). */
    ref?: string;
    /** True when the server confirmed payment with the PSP before this call. */
    verified: boolean;
    /** ISO 4217 display currency code, e.g. "USD", "LBP". */
    currencyCode?: string;
    /** Authoritative total in USD (sum of product subtotal + all fees). */
    totalUsd: number;
  };
  /** Normalised platform string: "ios" | "android" | "web" | null. */
  platform?: string | null;
  couponCode?: string;
};

export type OSCreateOrderResponse = {
  /** OS-assigned order UUID (preferred field name). */
  order_id?: string;
  /** OS-assigned order id (legacy alias for order_id). */
  id?: string;
  /** Echo of appOrderId. */
  appOrderId?: string;
  status?: string;
  message?: string;
};
