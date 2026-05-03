import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
};

export type CategoryProductsResponse = { ok: boolean; products: Product[]; count: number; categoryName?: string };
export type OccasionProductsResponse = { ok: boolean; groups: { slug: string; label: string; count: number; products: Product[] }[]; total: number };
export type DeliveryLocationsResponse = { 
  countries: { id: string; name: string; code: string; flag: string; cities: { id: string; name: string }[] }[] 
};

// Query Hooks
export const useProducts = (
  params: { countryCode?: string } = {},
  enabled: boolean = true,
) => {
  const q = new URLSearchParams();
  if (params.countryCode) q.set("countryCode", params.countryCode);
  const qs = q.toString();

  return useQuery({
    queryKey: ["products", params],
    queryFn: () => apiFetch<{ ok: boolean; products: Product[] }>(`/woo/products${qs ? `?${qs}` : ""}`),
    enabled,
  });
};

export const useCategoryProducts = (
  slug: string,
  params: { countryCode?: string } = {},
) => {
  const q = new URLSearchParams();
  q.set("slug", slug);
  if (params.countryCode) q.set("countryCode", params.countryCode);
  return useQuery({
    queryKey: ["category", slug, params],
    queryFn: () => apiFetch<CategoryProductsResponse>(`/woo/category-products?${q.toString()}`),
    enabled: !!slug
  });
};

export const useOccasionProducts = (
  slug: string,
  params: { countryCode?: string } = {},
) => {
  const q = new URLSearchParams();
  q.set("slug", slug);
  if (params.countryCode) q.set("countryCode", params.countryCode);
  return useQuery({
    queryKey: ["occasion", slug, params],
    queryFn: () => apiFetch<OccasionProductsResponse>(`/woo/occasion-products?${q.toString()}`),
    enabled: !!slug
  });
};

export const useDeliveryLocations = () => {
  return useQuery({
    queryKey: ["delivery-locations"],
    queryFn: () => apiFetch<DeliveryLocationsResponse>("/delivery-locations")
  });
};

export const useFxRates = () => {
  return useQuery({
    queryKey: ["fx-rates"],
    queryFn: () => apiFetch<{ ok: boolean; base: string; rates: Record<string, number> }>("/fx/rates")
  });
};

export const useBrands = () => {
  return useQuery({
    queryKey: ["brands"],
    queryFn: () => apiFetch<{ ok: boolean; brands: { id: number; name: string; slug: string; count: number; image: string | null }[] }>("/woo/brands")
  });
};

// Auth Hooks
export const useCurrentUser = (token: string | null) => {
  return useQuery({
    queryKey: ["auth-me"],
    queryFn: () => apiFetch<{ ok: boolean; user: any }>("/auth/me"),
    enabled: !!token,
    retry: false
  });
};

export const checkEmailExists = (email: string) =>
  apiFetch<{ ok: boolean; exists: boolean }>(`/auth/exists?email=${encodeURIComponent(email)}`);

export const useLogin = () => {
  return useMutation({
    mutationFn: (data: any) => apiFetch<{ ok: boolean; token: string; user: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data)
    })
  });
};

export const requestPasswordReset = (email: string) =>
  apiFetch<{ ok: boolean; message?: string }>("/auth/reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const useRegister = () => {
  return useMutation({
    mutationFn: (data: any) => apiFetch<{ ok: boolean; token: string; user: any }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data)
    })
  });
};

// Social OAuth — these endpoints accept the identity token returned by the
// provider's web SDK, verify it server-side, and return a Presentail session
// token + user, identical in shape to /auth/login.
export const useGoogleOAuth = () => {
  return useMutation({
    mutationFn: (data: { credential: string }) =>
      apiFetch<{ ok: boolean; token: string; user: any }>("/auth/oauth/google", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
};

export const useAppleOAuth = () => {
  return useMutation({
    mutationFn: (data: {
      idToken: string;
      user?: { name?: { firstName?: string | null; lastName?: string | null } | null } | null;
    }) =>
      apiFetch<{ ok: boolean; token: string; user: any }>("/auth/oauth/apple", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
};

// Order Hooks
export const useCreateOrder = () => {
  return useMutation({
    mutationFn: (data: any) => apiFetch<{ ok: boolean; wcOrderId?: number; orderKey?: string; message?: string }>("/woo/order", {
      method: "POST",
      body: JSON.stringify(data)
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
  params: { countryCode?: string } = {},
) => {
  const q = new URLSearchParams();
  q.set("slug", slug);
  if (params.countryCode) q.set("countryCode", params.countryCode);
  return useQuery({
    queryKey: ["brand-products", slug, params],
    queryFn: () => apiFetch<{ ok: boolean; products: Product[]; count?: number; brandName?: string }>(`/woo/brand-products?${q.toString()}`),
    enabled: !!slug,
  });
};
