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

export async function fetchCategoryProducts(slug: string): Promise<{ products: WooProduct[]; categoryName: string }> {
  try {
    const res = await fetch(
      `${API_BASE}/api/woo/category-products?slug=${encodeURIComponent(slug)}`,
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

export async function fetchOccasionProducts(slug: string): Promise<OccasionGroup[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/woo/occasion-products?slug=${encodeURIComponent(slug)}`,
      { headers: { "Content-Type": "application/json" } }
    );
    const json = await res.json();
    if (json.ok && Array.isArray(json.groups)) return json.groups;
    return [];
  } catch {
    return [];
  }
}

export async function fetchBrandProducts(slug: string): Promise<WooProduct[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/woo/brand-products?slug=${encodeURIComponent(slug)}`,
      { headers: { "Content-Type": "application/json" } }
    );
    const json = await res.json();
    if (json.ok && Array.isArray(json.products)) return json.products;
    return [];
  } catch {
    return [];
  }
}

export async function fetchWooProducts(): Promise<WooProduct[]> {
  try {
    const res = await fetch(`${API_BASE}/api/woo/products`, {
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
};

export async function createWooOrder(
  payload: WooOrderPayload
): Promise<{ ok: true; wcOrderId: number } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/woo/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" };
  }
}
