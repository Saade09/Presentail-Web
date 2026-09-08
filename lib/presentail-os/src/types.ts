/**
 * Typed interfaces for the Presentail OS public locations API.
 *
 * Field names match what os.presentail.com/api/public/locations returns.
 * `code` is lowercase from the OS (e.g. "lb", "ae") — callers must
 * toUpperCase() before comparing against internal ISO codes.
 */

export type OSTimeSlot = {
  label: string;
  /** Stable OS-assigned identifier for this slot (e.g. "night-same-day"). Absent for legacy/hardcoded fallback slots. */
  slotId?: string;
  /** Hour of day (0–23) the slot window opens (e.g. 9 for 9 AM). */
  startHour?: number;
  /** Hour of day (0–23) the slot window closes (e.g. 14 for 2 PM). */
  endHour?: number;
  cutoffHour: number;
  /** Minute component of the booking cutoff. Absent means :00. */
  cutoffMinute?: number;
  /** Additional surcharge for booking this slot (USD). e.g. night-slot fee.
   * A value of exactly 0 means the slot is explicitly free (override) — distinct from undefined (no override). */
  extraFee?: number;
  /** When true, this slot is available for same-day orders. Absent means no same-day/next-day restriction. */
  sameDayEnabled?: boolean;
  /** When true, this slot is available for next-day orders. Absent means no same-day/next-day restriction. */
  nextDayEnabled?: boolean;
  /** Whether this slot is enabled at all. Absent is treated as true (backwards compat). */
  enabled?: boolean;
  /** Explicit service identity supplied by OS. Used for premium fulfillment services. */
  serviceType?: "midnight" | string;
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
  /** Minute component of the same-day cutoff. Absent means :00. */
  sameDayCutoffMinute?: number;
  /** False when the live ext and legacy operational feeds contradict. */
  operationsConfigConsistent?: boolean;
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
  sameDayCutoffMinute?: number;
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
  /** Whether the category is active in the OS catalog. */
  is_active?: boolean;
  is_featured?: boolean;
  /** Private storage URL (auth-gated). Use imagePublicUrl when available. */
  image?: string | null;
  /** Public CDN URL (e.g. /api/storage/public-objects/…). Preferred over image. */
  imagePublicUrl?: string | null;
  description?: string | null;
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
  /**
   * Boolean active flag — false means inactive, undefined or true means active.
   * The OS API may also express this as `status: "inactive"` | `"active"`.
   * Both representations are checked by isOccasionActive in catalog.ts so a
   * field-name change on the OS side does not silently expose all occasions.
   */
  isActive?: boolean;
  /**
   * String status alternative to `isActive`.  "inactive" means hidden; any
   * other value (including absent) means active.  Both this and `isActive`
   * are checked so the catalogue survives a field-convention change.
   */
  status?: string;
  /** Private storage URL (auth-gated). Use imagePublicUrl when available. */
  image?: string | null;
  /** Public CDN URL (e.g. /api/storage/public-objects/…). Preferred over image. */
  imagePublicUrl?: string | null;
  /**
   * Zero-based position index from the OS best-selling sort response.
   * Lower index = ranked higher by the OS sales signal.
   * Absent for occasions that entered the cache via product tagging rather
   * than the dedicated OS occasions endpoint (those have no OS rank).
   */
  osPosition?: number;
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
  /**
   * Raw numeric (or UUID string) database primary key returned by the OS API.
   * Always set after normalisation; used as `productId` when creating OS orders
   * because the order endpoint looks products up by their DB PK, not by slug.
   */
  osNumericId?: number | string;
  wcId?: number;
  name: string;
  price: number;
  /**
   * Authoritative regular price for UAE shoppers, in AED. This is kept as the
   * OS decimal string so consumers that publish prices can avoid FX conversion
   * and avoid changing the precision configured in OS.
   */
  priceAed?: string | null;
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
  /** Discounted price in USD. Null/absent means no active discount. */
  discount_price_usd?: string | null;
  /** Discounted price in AED. Use directly for AED shoppers when available. */
  discount_price_aed?: string | null;
  /**
   * The original (non-discounted) price in USD as set in the OS admin.
   * When present and valid (> 0), this is the crossed-out "was" price shown
   * alongside `sale_price`. Takes precedence over `discount_price_usd` /
   * `discount_price_aed` for determining the base price to display.
   * Absent means no OS-native regular/sale price pair is configured.
   */
  regular_price?: string | null;
  /**
   * The active sale price in USD as set in the OS admin.
   * Only meaningful when `regular_price` is also present and valid.
   * When `sale_price` < `regular_price` (both valid), it is used as
   * `discountPriceValue` (shown prominently) and `regular_price` becomes the
   * crossed-out base price. Falls back to `discount_price_usd` behaviour when
   * absent or invalid.
   */
  sale_price?: string | null;
  /**
   * When true, a short personalisation note (max 22 chars) can be entered
   * for this product at the time of ordering.
   */
  hasInputField?: boolean;
  /**
   * When true, customers can add a single letter (1 character) to this
   * product at checkout (e.g. letter boxes).
   */
  hasLetterField?: boolean;
  /**
   * When true, the personalisation input is mandatory — the shopper must
   * fill it before adding to cart. Set by AI inference in the OS products
   * cache (e.g. letter boxes, engraved items, printing products).
   * Defaults to false (optional) when not yet classified.
   */
  personalisationRequired?: boolean;
  /**
   * Whether this product is in the top 20 by total sales across all stores.
   * Computed server-side after every OS cache refresh; false for all other products.
   * Used to render a "Best Seller" badge on product cards.
   */
  isBestSeller?: boolean;
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
  /** Canonical slug. May be absent when the OS hasn't assigned one yet; callers
   *  should derive a slug from `name` in that case rather than skipping the brand. */
  slug?: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  image_public_url?: string | null;
  /**
   * Wide banner/cover photo URL for the brand storefront header.
   * Returned by the OS API as `banner_image_url` (absolute public CDN URL).
   * Distinct from the brand logo (image_url/image_public_url).
   * Null or absent when the OS admin has not set a banner photo for this brand.
   */
  banner_image_url?: string | null;
  /**
   * Legacy alias — kept for forward-compatibility in case a future OS version
   * renames the field. Prefer `banner_image_url` for new code.
   */
  cover_image?: string | null;
  sort_order?: number;
  /** Whether this brand is active in the OS admin.
   *  May be a boolean (true/false) or a string ("active"/"inactive").
   *  Absent means the OS didn't send the field — treat as active. */
  is_active?: boolean | string;
};

export type OSCatalogAttributeBrandsResponse = {
  brands: OSCatalogAttributeBrand[];
};

export type OSOccasionsResponse = {
  occasions: OSProductOccasion[];
};

export type OSOccasionStat = {
  slug: string;
  /** Total number of orders that included a product tagged with this occasion. */
  totalOrders?: number;
  /** Total revenue (USD) from products tagged with this occasion. */
  totalRevenue?: number;
  /** Generic sales count — used when the endpoint only returns a single metric. */
  totalSales?: number;
};

export type OSOccasionStatsResponse = {
  occasions: OSOccasionStat[];
};

// ── Real-delivery photo feed contract (Presentail OS) ────────────────────────
//
// Shape returned by GET /api/storefront/real-deliveries?country=LB&city=Beirut
// (authenticated with x-api-key). OS pre-filters all eligibility — the storefront
// trusts `eligibility.*` and must never expose asset_url, product.id raw, or any
// order/customer identifier in a public response.
export type OSRealDeliveryPhotoRecord = {
  /** Stable OS photo identifier. Use as React key and deduplication token. */
  photo_id: string;
  /** Opaque OS asset identifier (internal use only). */
  asset_id: string;
  /** OS public-object URL. Server-side only — route through the image proxy. */
  asset_url: string;
  /** ISO-8601 capture timestamp, newest first. */
  captured_at: string;
  product: {
    /** OS numeric product database PK. Map to catalog slug for storefront URLs. */
    id: number;
    name: string;
    image_url: string;
  };
  location: {
    /** ISO country code, e.g. "LB", "AE". */
    country: string;
    /** Human-readable city name, e.g. "Beirut", "Dubai". */
    city: string;
  };
  /** All four must be true for the photo to be eligible for display. */
  eligibility: {
    approved: boolean;
    completed: boolean;
    product_active: boolean;
    in_stock: boolean;
  };
};

export type OSRealDeliveryPhotosResponse = {
  photos?: OSRealDeliveryPhotoRecord[];
  /** Approved same-domain destination for the "View more" CTA. May be absent. */
  view_more_url?: string;
};

// ── Order creation types ───────────────────────────────────────────────────

export type OSOrderLineItem = {
  /** OS product database primary key (numeric id or UUID). Used — not the slug — because the OS orders endpoint looks up products by their DB PK. */
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
    /** Stable OS slot identifier; required for premium services. */
    slotId?: string;
    /** Distinct fulfillment service marker. */
    serviceType?: "midnight" | string;
    /** Recipient-zone delivery-window start/end instants. */
    windowStart?: string;
    windowEnd?: string;
    timeZone?: string;
    isExpress: boolean;
    noAddress: boolean;
    /** Recipient phone number for this delivery (E.164 format when available). */
    phone?: string;
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
    /**
     * Actual amount in the payment currency (what the customer paid).
     * Not currently accepted by the OS API — reserved for future use when
     * OS adds support for multi-currency payment amounts.
     */
    totalAmount?: number;
  };
  /**
   * Structured delivery address for the OS order view.
   * Maps to the OS `delivery_address` block (address_1, city, country, phone).
   */
  delivery_address?: {
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    phone?: string;
  };
  /**
   * ISO 8601 datetime string for the start of the delivery window
   * (e.g. "2026-06-18T10:00:00"). For express orders, set to submission time.
   */
  window_start?: string;
  /**
   * ISO 8601 datetime string for the end of the delivery window
   * (e.g. "2026-06-18T13:00:00"). Omitted for express orders.
   */
  window_end?: string;
  /** Delivery type: "standard", "express", or "midnight". */
  delivery_type?: string;
  /** Special instructions for the delivery (from order notes). */
  delivery_instructions?: string;
  /** Normalised platform string: "ios" | "android" | "web" | null. */
  platform?: string | null;
  /**
   * True when the sender opted in to transactional WhatsApp order/delivery
   * updates (confirmed, dispatched, delivered, delay) at checkout. Sent
   * snake_case on the wire, consistent with other OS fields. OS must treat
   * an absent field as false (no opt-in). The target number is the sender's
   * billing phone (E.164) already present in `billing.phone`.
   */
  whatsapp_opt_in?: boolean;
  /**
   * Free-form order metadata forwarded to OS (e.g. marketing_attribution,
   * address_book_place). Keys use snake_case on the wire.
   */
  metadata?: Record<string, unknown>;
  couponCode?: string;
  /** OS-assigned coupon ID returned by the coupon validate endpoint. */
  couponId?: string | number;
  /** Discount amount in USD already applied to totalUsd. */
  couponDiscountUsd?: number;
};

// ── Address Book (verified landmarks / well-known places) ──────────────────

/**
 * A verified place from the Presentail OS Address Book, normalised into the
 * internal camelCase shape. The OS Address Book is the single source of
 * truth — this shape is a public-safe projection only (no internal notes,
 * contacts, or verification history ever leave OS through this type).
 */
export type OSAddressBookPlace = {
  /** OS Address Book place id (string; numeric ids are stringified). */
  id: string;
  /** Display name shown to shoppers (e.g. "AUBMC"). */
  name: string;
  /** Official name when different from the display name. */
  officialName?: string | null;
  /** Public aliases, abbreviations, and multilingual variants. */
  aliases: string[];
  /** Place type (hospital, university, hotel, mall, ...). */
  type?: string | null;
  /** ISO 3166-1 alpha-2 country code (uppercase). */
  countryCode?: string | null;
  /** OS district/city slug the place belongs to (e.g. "beirut"). */
  districtId?: string | null;
  /** OS district/city display name (e.g. "Beirut"). */
  districtName?: string | null;
  /** Area/neighbourhood within the district (e.g. "Hamra"). */
  area?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Location has been verified by the OS team. */
  verified: boolean;
  /** Place is published (visible outside OS admin). */
  published: boolean;
  /** Place may be offered during checkout. */
  checkoutEnabled: boolean;
  /** Place-specific follow-up question (e.g. "Where inside AUBMC?"). */
  followUpQuestion?: string | null;
  /** Placeholder for the follow-up field. */
  followUpPlaceholder?: string | null;
};

export type OSAddressBookPlacesResponse = {
  places: OSAddressBookPlace[];
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
