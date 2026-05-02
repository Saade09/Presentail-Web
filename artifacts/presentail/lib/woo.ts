import { API_BASE } from "./stripe";

export type WooProduct = {
  id: string;
  wcId: number;
  name: string;
  price: string;
  priceValue: number;
  image: { uri: string } | null;
  category: string;
  inStock: boolean;
  description?: string;
  tag?: string;
  occasions: string[];
};

export type OccasionGroup = {
  slug: string;
  label: string;
  count: number;
  products: WooProduct[];
};

export type DeliveryFilter = {
  countryCode?: string | null;
  cityId?: string | null;
};

function appendDeliveryParams(params: URLSearchParams, filter?: DeliveryFilter) {
  // TODO: forward to backend filtering once Presentail OS supports it.
  // For now we send these as opaque query params; the WooCommerce API
  // ignores them and returns the full catalogue.
  if (!filter) return;
  if (filter.countryCode) params.set("countryCode", filter.countryCode);
  if (filter.cityId) params.set("cityId", filter.cityId);
}

export async function fetchCategoryProducts(
  slug: string,
  filter?: DeliveryFilter,
): Promise<{ products: WooProduct[]; categoryName: string }> {
  try {
    const params = new URLSearchParams({ slug });
    appendDeliveryParams(params, filter);
    const res = await fetch(
      `${API_BASE}/api/woo/category-products?${params.toString()}`,
      { headers: { "Content-Type": "application/json" } }
    );
    const json = await res.json();
    if (json.ok && Array.isArray(json.products)) {
      return { products: json.products, categoryName: json.categoryName ?? slug };
    }
    return { products: [], categoryName: slug };
  } catch {
    return { products: [], categoryName: slug };
  }
}

export async function fetchOccasionProducts(
  slug: string,
  filter?: DeliveryFilter,
): Promise<OccasionGroup[]> {
  try {
    const params = new URLSearchParams({ slug });
    appendDeliveryParams(params, filter);
    const res = await fetch(
      `${API_BASE}/api/woo/occasion-products?${params.toString()}`,
      { headers: { "Content-Type": "application/json" } }
    );
    const json = await res.json();
    if (json.ok && Array.isArray(json.groups)) return json.groups;
    return [];
  } catch {
    return [];
  }
}

export async function fetchBrandProducts(
  slug: string,
  filter?: DeliveryFilter,
): Promise<WooProduct[]> {
  try {
    const params = new URLSearchParams({ slug });
    appendDeliveryParams(params, filter);
    const res = await fetch(
      `${API_BASE}/api/woo/brand-products?${params.toString()}`,
      { headers: { "Content-Type": "application/json" } }
    );
    const json = await res.json();
    if (json.ok && Array.isArray(json.products)) return json.products;
    return [];
  } catch {
    return [];
  }
}

export async function fetchWooProducts(filter?: DeliveryFilter): Promise<WooProduct[]> {
  try {
    const params = new URLSearchParams();
    appendDeliveryParams(params, filter);
    const qs = params.toString();
    const url = qs
      ? `${API_BASE}/api/woo/products?${qs}`
      : `${API_BASE}/api/woo/products`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
    });
    const json = await res.json();
    if (json.ok && Array.isArray(json.products)) {
      return json.products;
    }
    return [];
  } catch {
    return [];
  }
}

export type WooOrderPayload = {
  orderId: string;
  items: { name: string; quantity: number; price: number; wcId?: number }[];
  billing: { firstName: string; lastName: string; email: string; phone: string };
  recipient: { firstName: string; lastName: string; phone: string };
  district: string;
  districtFee: number;
  expressFee: number;
  deliveryDetails: string;
  deliveryDate: string;
  deliverySlot: string;
  cardMessage?: string;
  cardFrom?: string;
  cardTo?: string;
  qrLink?: string;
  qrLabel?: string;
  orderNotes?: string;
  paymentMethod: "card" | "wallet" | "whish" | "western" | "mamo" | "paypal";
  identitySecret?: boolean;
  // Per-install device id used by the API to route order push
  // notifications. The owning user (when signed in) is derived server-side
  // from the JWT in the Authorization header — never sent in the body.
  appDeviceId?: string;
};

export type WcBrand = {
  id: number;
  name: string;
  slug: string;
  count: number;
  image: string | null;
};

export async function fetchWcBrands(): Promise<WcBrand[]> {
  try {
    const res = await fetch(`${API_BASE}/api/woo/brands`, {
      headers: { "Content-Type": "application/json" },
    });
    const json = await res.json();
    if (json.ok && Array.isArray(json.brands)) return json.brands;
    return [];
  } catch {
    return [];
  }
}

export async function createWooOrder(
  payload: WooOrderPayload,
  opts: { authToken?: string | null } = {},
): Promise<{ ok: true; wcOrderId: number } | { ok: false; message: string }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    // When the buyer is signed in, send their JWT so the server can
    // associate the order with their user id (and route push
    // notifications back to all their devices).
    if (opts.authToken) headers.Authorization = `Bearer ${opts.authToken}`;

    const res = await fetch(`${API_BASE}/api/woo/order`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" };
  }
}
