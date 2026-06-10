import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

// Types matching the backend shape
export type Product = {
  id: string; // slug
  wcId: number;
  name: string;
  price: string;
  priceValue: number;
  image: { uri: string } | null;
  images?: { uri: string }[];
  category: string;
  inStock: boolean;
  description?: string;
  tag?: string;
  occasions: string[];
  popularity?: number;
};

export type CategoryProductsResponse = { ok: boolean; products: Product[]; count: number; categoryName?: string };
export type OccasionProductsResponse = { ok: boolean; groups: { slug: string; label: string; count: number; products: Product[] }[]; total: number };
export type DeliveryCity = {
  id: string;
  name: string;
  isActive?: boolean;
  /** Native delivery fee for this city, in the country's display currency. */
  fee?: number;
  /** Whether express delivery is available for this city (from Presentail OS). */
  expressAvailable?: boolean;
  /** Per-city delivery time slots from Presentail OS. Empty means use hardcoded defaults. */
  timeSlots?: Array<{ label: string; startHour?: number; endHour?: number; cutoffHour: number; extraFee?: number }>;
  /**
   * Per-day-of-week slots from OS. Keys are lowercase English weekday names (e.g. "monday").
   * When present, use slotsByDay[dayOfWeek] for the selected date instead of the flat timeSlots array.
   */
  slotsByDay?: Record<string, Array<{ label: string; startHour?: number; endHour?: number; cutoffHour: number; extraFee?: number }>>;
  localizedNames?: { ar?: string; fr?: string };
  /** Per-city free-delivery threshold in USD from Presentail OS. Overrides the country-level threshold when present. */
  freeDeliveryThresholdUsd?: number;
  /** Whether free delivery is enabled for this city. Overrides the country-level flag when present. */
  freeDeliveryEnabled?: boolean;
};
export type DeliveryCountry = {
  id: string;
  name: string;
  code: string;
  flag: string;
  currency?: string;
  isActive?: boolean;
  cities: DeliveryCity[];
  preferredDefaultCityId?: string;
  localizedNames?: { ar?: string; fr?: string };
  /** Free-delivery threshold in USD from Presentail OS. */
  freeDeliveryThresholdUsd?: number;
  /** Whether free delivery is enabled for this country. */
  freeDeliveryEnabled?: boolean;
};
export type DeliveryLocationsResponse = { countries: DeliveryCountry[] };

type LocalizedParams = { countryCode?: string; cityId?: string; lang?: string };

// Query Hooks
export const useProducts = (
  params: LocalizedParams = {},
  enabled: boolean = true,
) => {
  const q = new URLSearchParams();
  if (params.countryCode) q.set("countryCode", params.countryCode);
  if (params.cityId) q.set("cityId", params.cityId);
  if (params.lang) q.set("lang", params.lang);
  const qs = q.toString();

  return useQuery({
    queryKey: ["products", params],
    queryFn: () => apiFetch<{ ok: boolean; products: Product[] }>(`/woo/products${qs ? `?${qs}` : ""}`),
    enabled,
  });
};

export const useCategoryProducts = (
  slug: string,
  params: LocalizedParams = {},
) => {
  const q = new URLSearchParams();
  q.set("slug", slug);
  if (params.countryCode) q.set("countryCode", params.countryCode);
  if (params.cityId) q.set("cityId", params.cityId);
  if (params.lang) q.set("lang", params.lang);
  return useQuery({
    queryKey: ["category", slug, params],
    queryFn: () => apiFetch<CategoryProductsResponse>(`/woo/category-products?${q.toString()}`),
    enabled: !!slug
  });
};

export const useOccasionProducts = (
  slug: string,
  params: LocalizedParams = {},
) => {
  const q = new URLSearchParams();
  q.set("slug", slug);
  if (params.countryCode) q.set("countryCode", params.countryCode);
  if (params.cityId) q.set("cityId", params.cityId);
  if (params.lang) q.set("lang", params.lang);
  return useQuery({
    queryKey: ["occasion", slug, params],
    queryFn: () => apiFetch<OccasionProductsResponse>(`/woo/occasion-products?${q.toString()}`),
    enabled: !!slug
  });
};

// `/delivery-locations` is the single source of truth — the payload comes
// straight from `@workspace/catalog-data` server-side and already includes
// the canonical city list, per-city `fee`, and `localizedNames`. No
// client-side allowlist or fallback city map is needed any more; the lib
// itself only contains the supported destinations (LB / AE / CY).

export const useDeliveryLocations = () => {
  return useQuery({
    queryKey: ["delivery-locations"],
    queryFn: async () => {
      const data = await apiFetch<DeliveryLocationsResponse>("/delivery-locations");
      const countries = (data.countries ?? []).map((c) => ({
        ...c,
        code: c.code.toUpperCase(),
      }));
      return { ...data, countries };
    },
    // Poll every 10 minutes so city availability, fees, and free-delivery
    // thresholds from Presentail OS propagate to the web app automatically
    // without a page reload.
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });
};

// Static catalog metadata (categories, occasions, brands) sourced from
// `@workspace/catalog-data` server-side. Useful as a fallback for
// descriptions and bundled imagery when the WooCommerce payload is
// missing those fields. The endpoint is a flat snapshot — cache it for
// the session. Type matches `CatalogMetadataResponse` in OpenAPI.
export type CatalogImageRef = { asset?: string; uri?: string } | null;

export type CatalogCategory = { id: string; name: string; icon: string; image?: CatalogImageRef };
export type CatalogOccasion = { id: string; name: string; icon: string; description?: string; image?: CatalogImageRef };
export type CatalogBrand = { name: string; slug: string; image: string | null; count: number };
export type CatalogMetadataResponse = {
  categories: CatalogCategory[];
  occasions: CatalogOccasion[];
  brands: CatalogBrand[];
};

export const useCatalogMetadata = () => {
  return useQuery({
    queryKey: ["catalog-metadata"],
    queryFn: () => apiFetch<CatalogMetadataResponse>("/catalog/metadata"),
    staleTime: 5 * 60 * 1000,
  });
};


// Display-currency metadata served by `/currencies`. Mirrors the
// CurrenciesResponse OpenAPI schema.
export type CurrenciesResponse = {
  currencies: {
    code: string;
    name: string;
    flag?: string;
    symbol: string;
    symbolPosition: "left" | "right";
    spaceBetween: boolean;
    rate?: number;
    decimals: number;
  }[];
  fallbackCode: string;
  countryToCurrency: Record<string, string>;
};

export const useCurrenciesData = () => {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: () => apiFetch<CurrenciesResponse>("/currencies"),
    staleTime: 60 * 60 * 1000,
  });
};

export const useFxRates = () => {
  return useQuery({
    queryKey: ["fx-rates"],
    queryFn: () => apiFetch<{ ok: boolean; base: string; rates: Record<string, number> }>("/fx/rates")
  });
};

// useBrands is backed by the /catalog/metadata endpoint (Presentail OS).
// Brands are global — countryCode/cityId/lang params are accepted for call-site
// compatibility but are no longer forwarded to the server.
export const useBrands = (_params: LocalizedParams = {}) => {
  const result = useCatalogMetadata();
  return {
    ...result,
    data: result.data
      ? {
          ok: true as const,
          brands: result.data.brands.map((b) => ({
            id: b.slug,
            name: b.name,
            slug: b.slug,
            image: b.image,
            count: b.count,
          })),
        }
      : undefined,
  };
};

// Customer's order history — combines guest checkouts (matched by email/phone)
// with logged-in orders, since the server links every checkout to a canonical
// customer row.
export type MyOrder = {
  appOrderId: string;
  wcOrderId: number | null;
  state: string;
  recipientName: string | null;
  deliveryDate: string | null;
  deliverySlot: string | null;
  createdAt: string;
  status: string | null;
  total: string | null;
  currency: string | null;
  itemsCount: number;
  items: { name: string; quantity: number; image: string | null }[];
};

// Pass `true` when the caller has confirmed there is an active session
// (Clerk's `useAuth().isSignedIn`). The query is disabled otherwise so we
// don't fire an anonymous request that would 401.
export const useMyOrders = (enabled: boolean) => {
  return useQuery({
    queryKey: ["my-orders"],
    queryFn: () => apiFetch<{ ok: boolean; orders: MyOrder[] }>("/me/orders"),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
};

// Typed contract for the /api/woo/order request body.
// couponCode is optional — omit when no coupon has been applied.
export type CreateWcOrderRequest = {
  orderId: string;
  paymentMethod: string;
  paymentRef?: string;
  currencyCode?: string;
  couponCode?: string;
  [key: string]: unknown;
};

// Typed contract for the /api/woo/order response body.
// The server always returns { ok: boolean } plus method-specific fields.
export type CreateWcOrderResponse =
  | {
      ok: true;
      wcOrderId: number | null;
      orderKey?: string;
      /** Coupon discount in display currency (from WC discount_total). Zero when no coupon. */
      couponDiscount: number;
      /** True when the coupon was rejected post-payment and the order was created without it. */
      couponRejected?: boolean;
      /** WC's coupon error message when couponRejected is true. */
      couponMessage?: string;
    }
  | {
      ok: false;
      message?: string;
      /** "coupon_invalid" when the coupon was rejected and no payment had been captured. */
      code?: string;
      queued?: boolean;
    };

// Order Hooks
export const useCreateOrder = () => {
  return useMutation({
    mutationFn: (data: CreateWcOrderRequest) =>
      apiFetch<CreateWcOrderResponse>("/woo/order", {
        method: "POST",
        body: JSON.stringify(data),
        // Tag the request with the source platform so the admin funnel
        // dashboard can attribute revenue to "web" the same way analytics
        // events attribute counts.
        headers: { "x-app-platform": "web" },
      }),
  });
};

// Cart item sent to hosted-payment endpoints. Prices are resolved server-side
// from the WooCommerce catalog using wcId — never send client-controlled amounts.
type PayCartItem = { wcId: number; quantity: number };

// Hosted-payment-session hooks. Each returns a redirect URL the storefront
// sends the shopper to; on return we finalize the order via /woo/order.
export const useStripeCheckoutSession = () => {
  return useMutation({
    mutationFn: (data: {
      items: { wcId: number; quantity: number; name?: string; description?: string; image?: string }[];
      // orderId binds this session to the order so the server can prevent
      // replay attacks (paid session reused for a different, higher-value order).
      orderId: string;
      currency?: string;
      email?: string;
      metadata?: Record<string, string>;
      successUrl: string;
      cancelUrl: string;
    }) => apiFetch<{ ok: boolean; id?: string; url?: string; message?: string; code?: string }>("/checkout/session", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  });
};

export const useMamoPayment = () => {
  return useMutation({
    mutationFn: (data: {
      items: PayCartItem[];
      // orderId binds this session to the order so the server can prevent replay attacks.
      orderId: string;
      district?: string;
      expressDelivery?: boolean;
      noAddress?: boolean;
      currency?: string;
      title?: string;
      description?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      returnUrl: string;
      failureReturnUrl: string;
    }) => apiFetch<{ ok: boolean; url?: string; id?: string; message?: string; code?: string }>("/payment/mamo", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  });
};

export const usePaypalPayment = () => {
  return useMutation({
    mutationFn: (data: {
      items: PayCartItem[];
      district?: string;
      expressDelivery?: boolean;
      noAddress?: boolean;
      currency?: string;
      returnUrl: string;
      cancelUrl: string;
      orderId: string;
    }) => apiFetch<{ ok: boolean; url?: string; id?: string; message?: string; code?: string }>("/payment/paypal", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  });
};

// Search result types
export type SearchProduct = {
  slug: string;
  name: string;
  image: { uri: string } | null;
  price: string;
  priceValue: number;
};

export type SearchCategory = {
  slug: string;
  name: string;
};

export type SearchOccasion = {
  slug: string;
  name: string;
};

export type SearchBrand = {
  slug: string;
  name: string;
  image?: string | null;
};

export type SearchResponse = {
  ok: boolean;
  products: SearchProduct[];
  categories: SearchCategory[];
  occasions: SearchOccasion[];
  brands: SearchBrand[];
};

export const useSearch = (q: string, params: LocalizedParams = {}) => {
  const [debouncedQ, setDebouncedQ] = useState(q);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  const qs = new URLSearchParams({ q: debouncedQ });
  if (params.countryCode) qs.set("countryCode", params.countryCode);
  if (params.cityId) qs.set("cityId", params.cityId);
  if (params.lang) qs.set("lang", params.lang);

  return useQuery({
    queryKey: ["search", debouncedQ, params],
    queryFn: () => apiFetch<SearchResponse>(`/woo/search?${qs.toString()}`),
    enabled: debouncedQ.length >= 2,
    staleTime: 30 * 1000,
  });
};

export const useBrandProducts = (
  slug: string,
  params: LocalizedParams = {},
) => {
  const q = new URLSearchParams();
  q.set("slug", slug);
  if (params.countryCode) q.set("countryCode", params.countryCode);
  if (params.cityId) q.set("cityId", params.cityId);
  if (params.lang) q.set("lang", params.lang);
  return useQuery({
    queryKey: ["brand-products", slug, params],
    queryFn: () => apiFetch<{ ok: boolean; products: Product[]; count?: number; brandName?: string }>(`/woo/brand-products?${q.toString()}`),
    enabled: !!slug,
  });
};
