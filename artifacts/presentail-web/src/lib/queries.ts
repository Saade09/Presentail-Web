import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { fetchOsProducts, fetchOsBrands } from "./osClient";
import { mapOsProduct, isVisibleOsProduct, isDeliverableOsProduct } from "./osProductMapper";

// Brand slugs allowed to appear on the storefront.
// Must stay in sync with the server-side PRESENTAIL_OS_BRAND_ALLOWLIST default
// in artifacts/api-server/src/lib/osProductsCache.ts.
const OS_BRAND_ALLOWLIST = new Set(["presentail-flowers--gifts", "flower-scent"]);

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

// ── Occasion-type grouping (mirrors OCCASION_TYPE_CATEGORIES in routes/woo.ts) ─

const OCCASION_TYPE_CATEGORIES: { slug: string; label: string }[] = [
  { slug: "flowers", label: "Flowers & Bouquets" },
  { slug: "hand-bouquets", label: "Hand Bouquets" },
  { slug: "flower-boxes", label: "Flower Boxes" },
  { slug: "flower-vases", label: "Flower Vases" },
  { slug: "lux-arrangements", label: "Lux Arrangements" },
  { slug: "dried-flowers", label: "Dried Flowers" },
  { slug: "preserved-flowers", label: "Preserved Flowers" },
  { slug: "chocolate", label: "Chocolates" },
  { slug: "cakes", label: "Cakes & Sweets" },
  { slug: "arabic-sweets", label: "Arabic Sweets" },
  { slug: "balloons", label: "Balloons" },
  { slug: "stuffed-animals", label: "Stuffed Animals" },
  { slug: "plants", label: "Plants" },
  { slug: "baskets", label: "Baskets" },
  { slug: "beauty", label: "Beauty" },
  { slug: "bundles", label: "Gift Bundles" },
];

function groupOccasionProducts(
  products: Product[],
): { slug: string; label: string; count: number; products: Product[] }[] {
  const groups = new Map<string, { label: string; products: Product[] }>();
  const assigned = new Set<string>();

  for (const typecat of OCCASION_TYPE_CATEGORIES) {
    for (const p of products) {
      if (assigned.has(p.id)) continue;
      if (p.category === typecat.slug) {
        if (!groups.has(typecat.slug)) {
          groups.set(typecat.slug, { label: typecat.label, products: [] });
        }
        groups.get(typecat.slug)!.products.push(p);
        assigned.add(p.id);
      }
    }
  }

  return Array.from(groups.entries()).map(([slug, g]) => ({
    slug,
    label: g.label,
    count: g.products.length,
    products: g.products.slice(0, 10),
  }));
}

// ── Base OS products hook ──────────────────────────────────────────────────
//
// Fetches all products from Presentail OS for a given country+city+lang,
// applies visibility and deliverability filters, and maps to the Product type.
// All per-category/occasion/brand hooks share this query cache.
//
// When VITE_OS_API_KEY is set the browser fetches directly from OS (fastest).
// When the key is absent, or when OS is unreachable (e.g. CORS in dev), the
// hook falls back to the API server's /woo/products endpoint, which serves
// the same OS data from its in-process cache. apiFetch sends the stored
// x-store-country / x-store-city headers automatically so the country/city
// context is preserved in the fallback path.

function useOsAllProducts(params: LocalizedParams = {}, enabled = true) {
  return useQuery<Product[]>({
    queryKey: ["os-products", params.countryCode ?? null, params.cityId ?? null, params.lang ?? "en"],
    queryFn: async () => {
      const osKey = (import.meta.env.VITE_OS_API_KEY as string | undefined) ?? "";
      if (osKey) {
        try {
          const raw = await fetchOsProducts({
            countryCode: params.countryCode,
            cityId: params.cityId,
            lang: params.lang,
          });
          // Filter by country only — city-level restrictions are enforced at
          // checkout, not at browse time, because OS city IDs may not match
          // the web app's city slug format.
          return raw
            .filter(isVisibleOsProduct)
            .filter((p) =>
              isDeliverableOsProduct(p, params.countryCode ?? null, null),
            )
            .filter((p) =>
              Array.isArray(p.brands) && p.brands.some((b) => OS_BRAND_ALLOWLIST.has(b.slug)),
            )
            .map(mapOsProduct);
        } catch {
          // CORS / network failure — fall through to API server proxy below
        }
      }
      // Fallback: API server (already caches OS products; country/city resolved
      // via x-store-country / x-store-city headers injected by apiFetch).
      const data = await apiFetch<{ ok: boolean; products: Product[] }>("/woo/products");
      return data.products ?? [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

// Query Hooks
export const useProducts = (
  params: LocalizedParams = {},
  enabled: boolean = true,
) => {
  const result = useOsAllProducts(params, enabled);
  return {
    ...result,
    data: result.data != null
      ? { ok: true as const, products: result.data }
      : result.data,
  };
};

export const useCategoryProducts = (
  slug: string,
  params: LocalizedParams = {},
) => {
  const result = useOsAllProducts(params, !!slug);
  const data = useMemo(() => {
    if (!result.data) return undefined;
    const products = result.data.filter((p) => p.category === slug);
    return { ok: true as const, products, count: products.length } satisfies CategoryProductsResponse;
  }, [result.data, slug]);
  return { ...result, data };
};

export const useOccasionProducts = (
  slug: string,
  params: LocalizedParams = {},
) => {
  const result = useOsAllProducts(params, !!slug);
  const data = useMemo(() => {
    if (!result.data) return undefined;
    const matching = result.data.filter((p) => p.occasions.includes(slug));
    const groups = groupOccasionProducts(matching);
    return { ok: true as const, groups, total: matching.length } satisfies OccasionProductsResponse;
  }, [result.data, slug]);
  return { ...result, data };
};

export const useBrandProducts = (
  slug: string,
  params: LocalizedParams = {},
) => {
  return useQuery<{ ok: boolean; products: Product[]; count: number; brandName?: string }>({
    queryKey: ["brand-products", slug, params.countryCode ?? null, params.cityId ?? null, params.lang ?? "en"],
    queryFn: async () => {
      if (!slug) return { ok: true, products: [], count: 0 };
      const osKey = (import.meta.env.VITE_OS_API_KEY as string | undefined) ?? "";
      if (osKey) {
        try {
          const raw = await fetchOsProducts({
            countryCode: params.countryCode,
            cityId: params.cityId,
            lang: params.lang,
          });
          const products = raw
            .filter(isVisibleOsProduct)
            .filter((p) =>
              isDeliverableOsProduct(p, params.countryCode ?? null, params.cityId ?? null),
            )
            .filter((p) => Array.isArray(p.brands) && p.brands.some((b) => OS_BRAND_ALLOWLIST.has(b.slug)))
            .filter((p) => p.brands.some((b) => b.slug === slug))
            .map(mapOsProduct);
          const brandEntry = raw.flatMap((p) => p.brands).find((b) => b.slug === slug);
          const brandName = brandEntry?.name ?? slug;
          return { ok: true, products, count: products.length, brandName };
        } catch {
          // fall through to API server
        }
      }
      // Fallback: API server brand-products endpoint
      const data = await apiFetch<{ ok: boolean; products: Product[]; count: number; brandName?: string }>(
        `/woo/brand-products?slug=${encodeURIComponent(slug)}`,
      );
      return data;
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
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

// useBrands fetches brands from Presentail OS (direct when VITE_OS_API_KEY is
// set) or falls back to the API server's /woo/brands endpoint, which serves
// the same data from the OS brands cache.
export const useBrands = (_params: LocalizedParams = {}) => {
  return useQuery({
    queryKey: ["os-brands"],
    queryFn: async () => {
      const osKey = (import.meta.env.VITE_OS_API_KEY as string | undefined) ?? "";
      if (osKey) {
        try {
          const brands = await fetchOsBrands();
          return {
            ok: true as const,
            brands: brands.map((b) => ({
              id: b.slug,
              name: b.name,
              slug: b.slug,
              image: b.image_public_url ?? b.image_url ?? null,
              count: 0,
            })),
          };
        } catch {
          // fall through to API server
        }
      }
      // Fallback: API server brands endpoint
      const data = await apiFetch<{
        ok: boolean;
        brands: { id: string; name: string; slug: string; image: string | null }[];
      }>("/woo/brands");
      return {
        ok: true as const,
        brands: (data.brands ?? []).map((b) => ({ ...b, count: 0 })),
      };
    },
    staleTime: 10 * 60 * 1000,
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

// useSearch filters the OS product cache client-side for product matches.
// Category, occasion, and brand results are omitted (they are static and
// the caller's UI can derive them from useCatalogMetadata if needed).
export const useSearch = (q: string, params: LocalizedParams = {}) => {
  const [debouncedQ, setDebouncedQ] = useState(q);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  const allProducts = useOsAllProducts(params, debouncedQ.length >= 2);

  const data = useMemo((): SearchResponse | undefined => {
    if (!allProducts.data) return undefined;
    const needle = debouncedQ.toLowerCase();
    const products: SearchProduct[] = allProducts.data
      .filter((p) => p.name.toLowerCase().includes(needle))
      .slice(0, 20)
      .map((p) => ({
        slug: p.id,
        name: p.name,
        image: p.image,
        price: p.price,
        priceValue: p.priceValue,
      }));
    return { ok: true, products, categories: [], occasions: [], brands: [] };
  }, [allProducts.data, debouncedQ]);

  return {
    data: debouncedQ.length >= 2 ? data : undefined,
    isLoading: allProducts.isLoading,
    isFetching: allProducts.isFetching,
    isError: allProducts.isError,
    error: allProducts.error,
  };
};
