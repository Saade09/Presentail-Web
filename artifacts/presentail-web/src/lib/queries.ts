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
  localizedNames?: { ar?: string; fr?: string };
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
export type CatalogBrand = { name: string; slug: string };
export type CatalogProduct = {
  id: string;
  name: string;
  tag?: string;
  description?: string;
  category: string;
  occasions?: string[];
  image?: CatalogImageRef;
};

export type CatalogMetadataResponse = {
  categories: CatalogCategory[];
  occasions: CatalogOccasion[];
  brands: CatalogBrand[];
  products: CatalogProduct[];
};

export const useCatalogMetadata = () => {
  return useQuery({
    queryKey: ["catalog-metadata"],
    queryFn: () => apiFetch<CatalogMetadataResponse>("/catalog/metadata"),
    staleTime: 60 * 60 * 1000,
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

export const useBrands = (params: LocalizedParams = {}) => {
  const q = new URLSearchParams();
  if (params.countryCode) q.set("countryCode", params.countryCode);
  if (params.cityId) q.set("cityId", params.cityId);
  if (params.lang) q.set("lang", params.lang);
  const qs = q.toString();
  return useQuery({
    queryKey: ["brands", params],
    queryFn: () => apiFetch<{ ok: boolean; brands: { id: number; name: string; slug: string; count: number; image: string | null }[] }>(`/woo/brands${qs ? `?${qs}` : ""}`)
  });
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
  });
};

// Order Hooks
export const useCreateOrder = () => {
  return useMutation({
    mutationFn: (data: any) => apiFetch<{ ok: boolean; wcOrderId?: number; orderKey?: string; message?: string }>("/woo/order", {
      method: "POST",
      body: JSON.stringify(data),
      // Tag the request with the source platform so the admin funnel
      // dashboard can attribute revenue to "web" the same way analytics
      // events attribute counts.
      headers: { "x-app-platform": "web" },
    })
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
