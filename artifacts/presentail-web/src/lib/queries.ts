import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { fetchOsProducts, fetchOsProductPricing } from "./osClient";
import { mapOsProduct, isVisibleOsProduct, isDeliverableOsProduct } from "./osProductMapper";
import { readAttribution } from "./attribution";

// Brand slugs allowed to appear on the storefront.
// Fetched from /api/catalog/brand-allowlist on startup so it stays in sync
// with the server-side PRESENTAIL_OS_BRAND_ALLOWLIST env var.
// Returns null when the server has filtering disabled (empty allowlist).
// Falls back to the default two-brand set when the fetch fails (not cached,
// so the next call retries rather than permanently caching a failure).
const OS_BRAND_ALLOWLIST_FALLBACK = new Set(["presentail-flowers--gifts", "flower-scent"]);
// undefined = not yet fetched; null = fetched, filtering disabled; Set = fetched, filtering active
let _osBrandAllowlist: Set<string> | null | undefined = undefined;

async function getOsBrandAllowlist(): Promise<Set<string> | null> {
  if (_osBrandAllowlist !== undefined) return _osBrandAllowlist;
  try {
    const resp = await fetch("/api/catalog/brand-allowlist");
    if (resp.ok) {
      const data: { ok: boolean; slugs: string[] } = await resp.json();
      if (data.ok && Array.isArray(data.slugs)) {
        // Empty slugs array = filtering disabled on the server; mirror that client-side.
        _osBrandAllowlist = data.slugs.length > 0 ? new Set(data.slugs) : null;
        return _osBrandAllowlist;
      }
    }
  } catch {
    // network failure — return fallback without caching so next call retries
  }
  return OS_BRAND_ALLOWLIST_FALLBACK;
}

// Types matching the backend shape
export type Product = {
  id: string; // slug
  /** Numeric OS DB primary key. Used to fetch single-product pricing data. */
  osNumericId?: number | string;
  wcId: number;
  name: string;
  price: string;
  priceValue: number;
  /** Parsed discount price in USD. Null/undefined means no active discount. */
  discountPriceValue?: number | null;
  /** Parsed discount price in AED. Use directly for AED shoppers when available. */
  discountPriceAed?: number | null;
  image: { uri: string } | null;
  images?: { uri: string }[];
  category: string;
  categories: string[];
  inStock: boolean;
  description?: string;
  tag?: string;
  occasions: string[];
  brandNames?: string[];
  popularity?: number;
  hasInputField?: boolean;
  hasLetterField?: boolean;
  personalisationRequired?: boolean;
  isBestSeller?: boolean;
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
  // OS uses "roses-bouquets" and "hand-bouquet" (singular) for bouquet products
  { slug: "roses-bouquets", label: "Flowers & Bouquets" },
  { slug: "hand-bouquets", label: "Hand Bouquets" },
  { slug: "hand-bouquet", label: "Hand Bouquets" },
  { slug: "flower-boxes", label: "Flower Boxes" },
  { slug: "flower-vases", label: "Flower Vases" },
  // OS uses "vases" for vase products
  { slug: "vases", label: "Flower Vases" },
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
  // OS uses "gift-baskets" / "flower-baskets" for basket products
  { slug: "gift-baskets", label: "Gift Baskets" },
  { slug: "flower-baskets", label: "Flower Baskets" },
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
      if ((p.categories ?? [p.category]).includes(typecat.slug)) {
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

// ── Pricing enrichment ─────────────────────────────────────────────────────
//
// Fetches the server's pricing enrichment map once (cached 60 s by the
// server) and merges discount/regular-price fields into mapped products.
// This gives collection pages (Shop, category, occasion, brand) the same
// slash-price treatment that the PDP gets via per-product OS calls.
//
// The OS list endpoint omits regular_price / sale_price / discount_price_*.
// The API server batch-fetches single-product OS data after every cache
// refresh and exposes the results via GET /api/catalog/products-pricing.
// We call it once alongside (or after) the product list fetch so the round-
// trip happens at most once per staleTime window, not per product card.

type ProductsPricingMap = Record<string, {
  discountPriceUsd: number | null;
  discountPriceAed: number | null;
  regularPriceUsd: number | null;
}>;

async function fetchProductsPricing(): Promise<ProductsPricingMap> {
  try {
    const res = await fetch("/api/catalog/products-pricing");
    if (!res.ok) return {};
    const data = (await res.json()) as { ok: boolean; pricing?: ProductsPricingMap };
    return data.ok && data.pricing ? data.pricing : {};
  } catch {
    return {};
  }
}

/**
 * Fetch the set of best-seller product IDs from the API server.
 * The server computes this by blending app_orders DB counts with OS totalSales
 * after each cache refresh — the same source as the homepage best-sellers rail.
 * Used by the OS-direct path so badges are consistent regardless of whether
 * the browser fetches products from OS directly or through the API proxy.
 * Returns an empty Set on any failure so collection pages degrade gracefully.
 */
async function fetchBestSellerIds(): Promise<Set<string>> {
  try {
    const res = await fetch("/api/catalog/best-seller-ids");
    if (!res.ok) return new Set();
    const data = (await res.json()) as { ok: boolean; ids?: string[] };
    return data.ok && Array.isArray(data.ids) ? new Set(data.ids) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Merge pricing enrichment into a list of already-mapped Product objects.
 * Matches on product.osNumericId (string). Only overrides pricing when the
 * enrichment map has a non-null discount for that product.
 */
function mergeProductsPricing(products: Product[], pricing: ProductsPricingMap): Product[] {
  if (Object.keys(pricing).length === 0) return products;
  return products.map((p) => {
    if (p.osNumericId == null) return p;
    const entry = pricing[String(p.osNumericId)];
    if (!entry) return p;
    return {
      ...p,
      // regularPriceUsd is the crossed-out "was" price when the modern
      // regular_price/sale_price scheme is active on this product.
      priceValue: entry.regularPriceUsd != null ? entry.regularPriceUsd : p.priceValue,
      discountPriceValue: entry.discountPriceUsd,
      discountPriceAed: entry.discountPriceAed,
    };
  });
}

// Test-only exports — not part of the public API surface.
// Allows unit tests to exercise the pure fetch + merge logic without setting
// up full React/TanStack Query machinery.
export { mergeProductsPricing as __mergeProductsPricingForTest };
export { fetchProductsPricing as __fetchProductsPricingForTest };

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
//
// After products are fetched and mapped, a single call to
// /api/catalog/products-pricing merges sale pricing (slash prices, sale
// badges) so collection pages show the same treatment as the PDP.

function useOsAllProducts(params: LocalizedParams = {}, enabled = true) {
  return useQuery<Product[]>({
    queryKey: ["os-products", params.countryCode ?? null, params.cityId ?? null, params.lang ?? "en"],
    queryFn: async () => {
      const osKey = (import.meta.env.VITE_OS_API_KEY as string | undefined) ?? "";
      if (osKey) {
        try {
          const [raw, pricing, bestSellerIds, brandAllowlist] = await Promise.all([
            fetchOsProducts({
              countryCode: params.countryCode,
              cityId: params.cityId,
              lang: params.lang,
            }),
            fetchProductsPricing(),
            // Fetch best-seller IDs from the API server so the badge matches
            // the homepage rail (app_orders DB + OS totalSales blend) even
            // when the browser fetches products directly from OS.
            fetchBestSellerIds(),
            getOsBrandAllowlist(),
          ]);
          // Filter by country only — city-level restrictions are enforced at
          // checkout, not at browse time, because OS city IDs may not match
          // the web app's city slug format.
          const filtered = raw
            .filter(isVisibleOsProduct)
            .filter((p) =>
              isDeliverableOsProduct(p, params.countryCode ?? null, null),
            )
            .filter((p) =>
              brandAllowlist === null ||
              (Array.isArray(p.brands) && p.brands.some((b) => brandAllowlist.has(b.slug))),
            )
            .map((p) => ({ ...p, isBestSeller: bestSellerIds.has(p.id) }));
          const mapped = filtered.map(mapOsProduct);
          return mergeProductsPricing(mapped, pricing);
        } catch {
          // CORS / network failure — fall through to API server proxy below
        }
      }
      // Fallback: API server (already caches OS products; country/city resolved
      // via x-store-country / x-store-city headers injected by apiFetch).
      // Fetch pricing in parallel with the product list so collection pages
      // get slash prices on the fallback path too.
      const [data, pricing] = await Promise.all([
        apiFetch<{ ok: boolean; products: Product[] }>("/woo/products"),
        fetchProductsPricing(),
      ]);
      return mergeProductsPricing(data.products ?? [], pricing);
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
    const products = result.data.filter((p) => (p.categories ?? [p.category]).includes(slug));
    return { ok: true as const, products, count: products.length } satisfies CategoryProductsResponse;
  }, [result.data, slug]);
  return { ...result, data };
};

export const useOccasionFlatProducts = (
  slug: string,
  params: LocalizedParams = {},
) => {
  const result = useOsAllProducts(params, !!slug);
  const data = useMemo(() => {
    if (!result.data) return undefined;
    const products = result.data.filter((p) => p.occasions.includes(slug));
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
          const [raw, pricing, bestSellerIds, brandAllowlist] = await Promise.all([
            fetchOsProducts({
              countryCode: params.countryCode,
              cityId: params.cityId,
              lang: params.lang,
            }),
            fetchProductsPricing(),
            // Fetch best-seller IDs from the API server (app_orders + OS blend)
            // so the badge matches the homepage rail even on the OS-direct path.
            fetchBestSellerIds(),
            getOsBrandAllowlist(),
          ]);
          const mapped = raw
            .filter(isVisibleOsProduct)
            .filter((p) =>
              isDeliverableOsProduct(p, params.countryCode ?? null, params.cityId ?? null),
            )
            .filter((p) =>
              brandAllowlist === null ||
              (Array.isArray(p.brands) && p.brands.some((b) => brandAllowlist.has(b.slug))),
            )
            .filter((p) => p.brands.some((b) => b.slug === slug))
            .map((p) => ({ ...p, isBestSeller: bestSellerIds.has(p.id) }))
            .map(mapOsProduct);
          const products = mergeProductsPricing(mapped, pricing);
          const brandEntry = raw.flatMap((p) => p.brands).find((b) => b.slug === slug);
          const brandName = brandEntry?.name ?? slug;
          return { ok: true, products, count: products.length, brandName };
        } catch {
          // fall through to API server
        }
      }
      // Fallback: API server brand-products endpoint
      const [data, pricing] = await Promise.all([
        apiFetch<{ ok: boolean; products: Product[]; count: number; brandName?: string }>(
          `/woo/brand-products?slug=${encodeURIComponent(slug)}`,
        ),
        fetchProductsPricing(),
      ]);
      const products = mergeProductsPricing(data.products ?? [], pricing);
      return { ...data, products, count: products.length };
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

export type CatalogCategory = { id: string; name: string; icon: string; description?: string | null };
export type CatalogOccasion = { id: string; name: string; icon: string; description?: string; image?: CatalogImageRef };
export type CatalogBrand = { name: string; slug: string; image: string | null; count: number; sort_order?: number | null };
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

// useBrands fetches brands from the API server's /woo/brands endpoint, which
// serves only brands that have at least one cached product. The previous
// direct-to-OS path via VITE_OS_API_KEY has been removed because the OS
// catalog-attributes endpoint returns all brands regardless of whether any
// products are assigned to them, causing zero-product brands to appear in
// search and navigation surfaces.
export const useBrands = (_params: LocalizedParams = {}) => {
  return useQuery({
    queryKey: ["os-brands"],
    queryFn: async () => {
      const data = await apiFetch<{
        ok: boolean;
        brands: { id: string; name: string; slug: string; image: string | null; cover_image?: string | null }[];
      }>("/woo/brands");
      return {
        ok: true as const,
        brands: (data.brands ?? []).map((b) => ({ ...b, cover_image: b.cover_image ?? null, count: 0 })),
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
  liveStatus: boolean;
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
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "visible"
        ? 60_000
        : false,
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
      /** Presentail OS order ID (UUID). Preferred reference for tracking and customer-facing displays. */
      osOrderId?: string | null;
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
    mutationFn: (data: CreateWcOrderRequest) => {
      let attribution = null;
      try {
        attribution = readAttribution();
      } catch {
        // storage unavailable — never block checkout
      }
      const marketingAttribution = attribution
        ? {
            source: "website",
            first_touch: attribution.first_touch,
            last_touch: attribution.last_touch,
            conversion: {
              order_total: String((data as Record<string, unknown>).totalUsd ?? ""),
              currency: String((data as Record<string, unknown>).currencyCode ?? "USD"),
              converted_at: new Date().toISOString(),
            },
          }
        : undefined;
      return apiFetch<CreateWcOrderResponse>("/woo/order", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          ...(marketingAttribution ? { marketing_attribution: marketingAttribution } : {}),
        }),
        // Tag the request with the source platform so the admin funnel
        // dashboard can attribute revenue to "web" the same way analytics
        // events attribute counts.
        headers: { "x-app-platform": "web" },
      });
    },
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
      // Delivery context — pass these so the server includes the delivery fee
      // in the Stripe charge and validates delivery params at order finalization.
      district?: string;
      expressDelivery?: boolean;
      noAddress?: boolean;
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

export const useTabbyPayment = () => {
  return useMutation({
    mutationFn: (data: {
      items: PayCartItem[];
      orderId: string;
      district?: string;
      expressDelivery?: boolean;
      noAddress?: boolean;
      currency?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      returnUrl: string;
      failureReturnUrl: string;
    }) => apiFetch<{ ok: boolean; url?: string; id?: string; message?: string; code?: string }>("/payment/tabby", {
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
  discountPriceValue: number | null;
  discountPriceAed: number | null;
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

// ── Product availability (cross-city) ─────────────────────────────────────
//
// Used by ProductDetail to distinguish "product not available in this city"
// from "product genuinely does not exist". Only fetched when the main product
// lookup returns nothing (i.e., the product is absent from the current city's
// cached product list).

export type ProductAvailabilityStore = {
  storeKey: string;
  countryCode: string;
  countrySlug: string;
  cityId: string | null;
  citySlug: string;
  cityLabel: string;
};

export type ProductAvailabilityResponse =
  | { exists: false }
  | {
      exists: true;
      productName: string;
      slug: string;
      category?: string;
      brand?: string;
      availableStores: ProductAvailabilityStore[];
    };

export const useProductAvailability = (
  slug: string | undefined,
  options?: { enabled?: boolean },
) => {
  return useQuery<ProductAvailabilityResponse>({
    queryKey: ["product-availability", slug ?? ""],
    queryFn: async () => {
      if (!slug) return { exists: false };
      const data = await apiFetch<ProductAvailabilityResponse>(
        `/products/availability/${encodeURIComponent(slug)}`,
      );
      return data;
    },
    enabled: options?.enabled !== false && !!slug,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
};

/**
 * Fetches discount pricing for a single OS product from the single-product
 * endpoint, which includes discount_price_usd / discount_price_aed that the
 * list endpoint omits. Returns null values when no discount is set.
 * Pass `undefined` to skip the fetch (e.g. while the product is still loading).
 */
export const useOsProductPricing = (osNumericId: number | string | undefined) => {
  return useQuery({
    queryKey: ["os-product-pricing", osNumericId ?? ""],
    queryFn: () => fetchOsProductPricing(osNumericId!),
    enabled: osNumericId != null,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};

// useSearch filters the OS product cache client-side for product matches and
// searches categories, occasions, and brands by name.
export const useSearch = (q: string, params: LocalizedParams = {}) => {
  const [debouncedQ, setDebouncedQ] = useState(q);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  const allProducts = useOsAllProducts(params, debouncedQ.length >= 2);
  const catalogMetadata = useCatalogMetadata();
  const brandsData = useBrands(params);

  const data = useMemo((): SearchResponse | undefined => {
    if (!allProducts.data) return undefined;
    const needle = debouncedQ.toLowerCase();

    const products: SearchProduct[] = allProducts.data
      .filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          (p.description && p.description.toLowerCase().includes(needle)) ||
          (p.brandNames && p.brandNames.some((bn) => bn.toLowerCase().includes(needle))),
      )
      .slice(0, 20)
      .map((p) => ({
        slug: p.id,
        name: p.name,
        image: p.image,
        price: p.price,
        priceValue: p.priceValue,
        discountPriceValue: p.discountPriceValue ?? null,
        discountPriceAed: p.discountPriceAed ?? null,
      }));

    const categories: SearchCategory[] = (catalogMetadata.data?.categories ?? [])
      .filter((c) => c.name.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((c) => ({ slug: c.id, name: c.name }));

    const occasions: SearchOccasion[] = (catalogMetadata.data?.occasions ?? [])
      .filter((o) => o.name.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((o) => ({ slug: o.id, name: o.name }));

    const brands: SearchBrand[] = (brandsData.data?.brands ?? [])
      .filter((b) => b.name.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((b) => ({ slug: b.slug, name: b.name, image: b.image ?? null }));

    return { ok: true, products, categories, occasions, brands };
  }, [allProducts.data, debouncedQ, catalogMetadata.data, brandsData.data]);

  return {
    data: debouncedQ.length >= 2 ? data : undefined,
    isLoading: allProducts.isLoading,
    isFetching: allProducts.isFetching || catalogMetadata.isLoading || brandsData.isLoading,
    isError: allProducts.isError,
    error: allProducts.error,
  };
};
