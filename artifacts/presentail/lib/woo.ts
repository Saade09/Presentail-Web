import { Platform } from "react-native";
import { API_BASE } from "./stripe";

export type WooProduct = {
  id: string;
  wcId: number;
  osNumericId?: number | string | null;
  name: string;
  price: string;
  priceValue: number;
  image: { uri: string } | null;
  images?: Array<{ uri: string }>;
  category: string;
  inStock: boolean;
  description?: string;
  tag?: string;
  occasions: string[];
  popularity?: number;
  hasInputField?: boolean;
  hasLetterField?: boolean;
  personalisationRequired?: boolean;
  discountPriceValue?: number | null;
  discountPriceAed?: number | null;
  isBestSeller?: boolean;
};

function absoluteApiImageUri(uri: string): string {
  if (!uri.startsWith("/api/")) return uri;
  return `${API_BASE.replace(/\/$/, "")}${uri}`;
}

function absoluteOptionalApiImageUri(uri: string | null | undefined): string | null {
  return uri ? absoluteApiImageUri(uri) : null;
}

export function resolveWooProductImageUrls(product: WooProduct): WooProduct {
  return {
    ...product,
    image: product.image?.uri
      ? { ...product.image, uri: absoluteApiImageUri(product.image.uri) }
      : product.image,
    images: product.images?.map((image) => ({
      ...image,
      uri: absoluteApiImageUri(image.uri),
    })),
  };
}

function resolveWooProductList(products: WooProduct[]): WooProduct[] {
  return products.map(resolveWooProductImageUrls);
}

export type ProductPricingEntry = {
  discountPriceUsd: number | null;
  discountPriceAed: number | null;
  regularPriceUsd: number | null;
};

export type ProductPricingMap = Record<string, ProductPricingEntry>;

export async function fetchProductsPricing(): Promise<ProductPricingMap> {
  try {
    const res = await fetch(`${API_BASE}/api/catalog/products-pricing`);
    if (!res.ok) return {};
    const json = await res.json();
    if (json.ok && json.pricing && typeof json.pricing === "object") {
      return json.pricing as ProductPricingMap;
    }
    return {};
  } catch {
    return {};
  }
}

export function applyPricingToProducts<T extends Pick<WooProduct, "osNumericId" | "discountPriceValue" | "discountPriceAed" | "priceValue">>(
  products: T[],
  pricingMap: ProductPricingMap,
): T[] {
  if (Object.keys(pricingMap).length === 0) return products;
  return products.map((p) => {
    const key = p.osNumericId != null ? String(p.osNumericId) : null;
    if (!key) return p;
    const entry = pricingMap[key];
    if (!entry) return p;
    return {
      ...p,
      discountPriceValue: entry.discountPriceUsd ?? p.discountPriceValue ?? null,
      discountPriceAed: entry.discountPriceAed ?? p.discountPriceAed ?? null,
    };
  });
}

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
  if (!filter) return;
  if (filter.countryCode) params.set("countryCode", filter.countryCode);
  if (filter.cityId) params.set("cityId", filter.cityId);
}

export function sortKeyToApiSort(key: string): string {
  const MAP: Record<string, string> = {
    recommended: "recommended",
    bestSeller: "best_sellers",
    newest: "newest",
    priceUp: "price_asc",
    priceDown: "price_desc",
  };
  return MAP[key] ?? "recommended";
}

function storeHeaders(filter?: DeliveryFilter): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (filter?.countryCode) h["x-store-country"] = filter.countryCode;
  if (filter?.cityId) h["x-store-city"] = filter.cityId;
  return h;
}

export async function fetchCategoryProducts(
  slug: string,
  filter?: DeliveryFilter,
  sort?: string,
): Promise<{ products: WooProduct[]; categoryName: string }> {
  try {
    const params = new URLSearchParams({ slug });
    appendDeliveryParams(params, filter);
    if (sort) params.set("sort", sort);
    const res = await fetch(
      `${API_BASE}/api/woo/category-products?${params.toString()}`,
      { headers: storeHeaders(filter) }
    );
    const json = await res.json();
    if (json.ok && Array.isArray(json.products)) {
      return { products: resolveWooProductList(json.products), categoryName: json.categoryName ?? slug };
    }
    return { products: [], categoryName: slug };
  } catch {
    return { products: [], categoryName: slug };
  }
}

export async function fetchOccasionProducts(
  slug: string,
  filter?: DeliveryFilter,
  sort?: string,
): Promise<OccasionGroup[]> {
  try {
    const params = new URLSearchParams({ slug });
    appendDeliveryParams(params, filter);
    if (sort) params.set("sort", sort);
    const res = await fetch(
      `${API_BASE}/api/woo/occasion-products?${params.toString()}`,
      { headers: storeHeaders(filter) }
    );
    const json = await res.json();
    if (json.ok && Array.isArray(json.groups)) {
      return json.groups.map((group: OccasionGroup) => ({
        ...group,
        products: resolveWooProductList(group.products),
      }));
    }
    return [];
  } catch {
    return [];
  }
}

export type BrandProductsResult = {
  products: WooProduct[];
  brandImage: string | null;
  brandName: string | null;
  brandDescription: string | null;
  brandCoverImage: string | null;
};

export async function fetchBrandProducts(
  slug: string,
  filter?: DeliveryFilter,
  sort?: string,
): Promise<BrandProductsResult> {
  try {
    const params = new URLSearchParams({ slug });
    appendDeliveryParams(params, filter);
    if (sort) params.set("sort", sort);
    const res = await fetch(
      `${API_BASE}/api/woo/brand-products?${params.toString()}`,
      { headers: storeHeaders(filter) }
    );
    const json = await res.json();
    if (json.ok && Array.isArray(json.products)) {
      return {
        products: resolveWooProductList(json.products),
        brandImage: absoluteOptionalApiImageUri(json.brandImage),
        brandName: typeof json.brandName === "string" ? json.brandName : null,
        brandDescription: typeof json.brandDescription === "string" ? json.brandDescription : null,
        brandCoverImage: absoluteOptionalApiImageUri(json.brandCoverImage),
      };
    }
    return { products: [], brandImage: null, brandName: null, brandDescription: null, brandCoverImage: null };
  } catch {
    return { products: [], brandImage: null, brandName: null, brandDescription: null, brandCoverImage: null };
  }
}

export type WooProductsResult =
  | { ok: true; products: WooProduct[] }
  | { ok: false };

export async function fetchWooProducts(filter?: DeliveryFilter): Promise<WooProductsResult> {
  try {
    const params = new URLSearchParams();
    appendDeliveryParams(params, filter);
    const qs = params.toString();
    const url = qs
      ? `${API_BASE}/api/woo/products?${qs}`
      : `${API_BASE}/api/woo/products`;
    const res = await fetch(url, {
      headers: storeHeaders(filter),
    });
    if (!res.ok) return { ok: false };
    const json = await res.json();
    if (json.ok && Array.isArray(json.products)) {
      return { ok: true, products: resolveWooProductList(json.products) };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export type MarketingAttributionTouch = {
  captured_at?: string;
  referrer?: string;
  landing_page_url?: string;
  landing_page_path?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_id?: string;
  utm_term?: string;
  utm_content?: string;
};

export type MarketingAttribution = {
  source?: string;
  first_touch?: MarketingAttributionTouch;
  last_touch?: MarketingAttributionTouch;
  conversion?: {
    order_total?: string;
    currency?: string;
    converted_at?: string;
  };
};

export type WooOrderPayload = {
  orderId: string;
  items: { name: string; quantity: number; price: number; wcId?: number; customInput?: string }[];
  billing: { firstName: string; lastName: string; email: string; phone: string };
  recipient: { firstName: string; lastName: string; phone: string };
  district: string;
  districtFee: number;
  expressFee: number;
  // True when the customer ticked "I don't know the address" at checkout.
  // The API uses this to apply a flat $35 USD delivery fee instead of the
  // per-district fee (still subject to the free-delivery threshold).
  noAddress?: boolean;
  // ISO-3166 alpha-2 country codes derived from the customer's selected
  // billing/shipping country. The API persists these on the WC order so
  // tax and shipping records reflect the actual destination instead of
  // a hardcoded LB. Optional for backward compatibility — the server
  // falls back to LB if either is missing.
  billingCountry?: string;
  shippingCountry?: string;
  // Optional reference from the upstream PSP (Stripe session id, Mamo
  // payment id, PayPal order id) so support can correlate a failed WC
  // creation to the actual settled payment.
  paymentRef?: string;
  deliveryDetails: string;
  /** Verified OS Address Book place selected at mobile checkout. */
  addressBookPlace?: {
    placeId: string;
    name: string;
    officialName?: string;
    districtName?: string;
    districtCityId?: string;
    lat?: number;
    lng?: number;
    internalDetail?: string;
    typedQuery?: string;
    selectionSource?: string;
  };
  deliveryDate: string;
  deliverySlot: string;
  cardMessage?: string;
  cardFrom?: string;
  cardTo?: string;
  qrLink?: string;
  qrLabel?: string;
  orderNotes?: string;
  paymentMethod: "card" | "wallet" | "apple_pay" | "google_pay" | "whish" | "western" | "mamo" | "paypal" | "tabby";
  identitySecret?: boolean;
  // Per-install device id used by the API to route order push
  // notifications. The owning user (when signed in) is derived server-side
  // from the JWT in the Authorization header — never sent in the body.
  appDeviceId?: string;
  // Optional marketing attribution data captured from UTM params / gclid.
  // Passed through to the OS order payload for ad spend attribution.
  marketing_attribution?: MarketingAttribution;
};

export type WcBrand = {
  id: string;
  name: string;
  slug: string;
  count: number;
  image: string | null;
};

export function resolveWcBrandImageUrl<T extends { image: string | null }>(brand: T): T {
  return {
    ...brand,
    image: absoluteOptionalApiImageUri(brand.image),
  };
}

// Mobile icon fallback map for OS-only categories that have no hardcoded entry.
// Mirrors the OS_CATEGORY_ICONS map on the API server so the chip renders a
// recognisable icon even when the category doesn't exist in the static list.
const OS_CATEGORY_ICONS_MOBILE: Record<string, string> = {
  "dried-flowers": "flower-poppy",
  "artificial-flowers": "flower-outline",
  "balloon-deco": "balloon",
  beauty: "lipstick",
  accessories: "hanger",
  candles: "candle",
  perfume: "bottle-tonic",
  jewelry: "diamond-stone",
  spa: "spa",
  "home-decor": "lamp",
  sweets: "candy",
};

// fetchOsOccasions reads the OS-filtered occasion list from /api/catalog/metadata.
// The server already applies isOccasionActive() so inactive occasions (e.g. Colleague,
// Friend, Children) are absent from the response. Maps to the mobile Occasion shape:
// icon and image are merged from the local static list where available; OS-only
// occasions fall back to a "star" icon and a null image.
// Returns the full static list on network failure so the screen is never blank.
export async function fetchOsOccasions(lang?: string): Promise<{ id: string; name: string; icon: string; image: any; description?: string }[]> {
  const { occasions: staticOccasions } = await import("@/data/catalog");
  try {
    const params = new URLSearchParams();
    if (lang && lang !== "en") params.set("lang", lang);
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/api/catalog/metadata${qs ? `?${qs}` : ""}`);
    if (!res.ok) return staticOccasions;
    const json = await res.json();
    if (!Array.isArray(json.occasions)) {
      return staticOccasions;
    }
    if (json.occasions.length === 0) return [];
    const localBySlug = new Map(staticOccasions.map((o: { id: string }) => [o.id, o]));
    return json.occasions.map((o: { id: string; name: string; icon?: string; description?: string }) => {
      const local = localBySlug.get(o.id) as { id: string; name: string; icon: string; image: any; description?: string } | undefined;
      return {
        id: o.id,
        name: o.name,
        icon: local?.icon ?? o.icon ?? "star",
        image: local?.image ?? null,
        ...(o.description !== undefined ? { description: o.description } : {}),
      };
    });
  } catch {
    return staticOccasions;
  }
}

// fetchWcCategories reads the OS-filtered category list from
// /api/catalog/metadata (same endpoint as fetchWcBrands).
// Maps to the mobile Category shape: icon and image are merged from the
// local static list where available; OS-only categories fall back to the
// OS_CATEGORY_ICONS_MOBILE map and a null image.
// Returns the full static list on network failure so the screen is never blank.
export async function fetchWcCategories(lang?: string): Promise<{ id: string; name: string; icon: string; image: any; description?: string | null }[]> {
  const { categories: staticCategories } = await import("@/data/catalog");
  try {
    const params = new URLSearchParams();
    if (lang && lang !== "en") params.set("lang", lang);
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/api/catalog/metadata${qs ? `?${qs}` : ""}`);
    if (!res.ok) return staticCategories;
    const json = await res.json();
    if (!Array.isArray(json.categories) || json.categories.length === 0) {
      return staticCategories;
    }
    const localBySlug = new Map(staticCategories.map((c: { id: string; name: string; icon: string; image: any }) => [c.id, c]));
    return json.categories.map((c: { id: string; name: string; icon?: string; description?: string | null }) => {
      const local = localBySlug.get(c.id);
      return {
        id: c.id,
        name: c.name,
        icon: local?.icon ?? c.icon ?? OS_CATEGORY_ICONS_MOBILE[c.id] ?? "tag",
        image: local?.image ?? null,
        description: c.description ?? null,
      };
    });
  } catch {
    return staticCategories;
  }
}

// fetchWcBrands reads from /api/catalog/metadata (Presentail OS).
// Brands are global — the delivery filter is accepted for call-site
// compatibility but is no longer forwarded to the server.
export async function fetchWcBrands(_filter?: DeliveryFilter): Promise<WcBrand[]> {
  try {
    const res = await fetch(`${API_BASE}/api/catalog/metadata`);
    const json = await res.json();
    if (Array.isArray(json.brands)) {
      return json.brands.map((b: { name: string; slug: string; image?: string | null; count?: number }) => ({
        id: b.slug,
        name: b.name,
        slug: b.slug,
        count: b.count ?? 0,
        image: b.image ?? null,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

export async function createWooOrder(
  payload: WooOrderPayload,
  opts: { authToken?: string | null; filter?: DeliveryFilter } = {},
): Promise<{ ok: true; wcOrderId: number } | { ok: false; message: string }> {
  try {
    const headers: Record<string, string> = storeHeaders(opts.filter);
    if (opts.authToken) headers.Authorization = `Bearer ${opts.authToken}`;
    // Tag the request with the source platform so the admin funnel dashboard
    // can break revenue down per ios/android the same way the analytics
    // events break down counts. Best-effort — server normalises and ignores
    // anything outside its allowlist.
    headers["x-app-platform"] =
      Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";

    const res = await fetch(`${API_BASE}/api/woo/order`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" }; // i18n-ignore
  }
}
