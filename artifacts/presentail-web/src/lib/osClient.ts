/**
 * Browser-side Presentail OS API client.
 *
 * Reads VITE_OS_API_URL and VITE_OS_API_KEY from the Vite environment.
 * All requests include `x-api-key` and `workspace=presentail` query params.
 */

import type {
  OSProduct,
  OSProductBrand,
  OSProductCategory,
  OSProductOccasion,
  OSCatalogAttributeBrand,
} from "@workspace/presentail-os";

const OS_BASE_URL = (import.meta.env.VITE_OS_API_URL as string | undefined) ?? "https://os.presentail.com";
const OS_API_KEY = (import.meta.env.VITE_OS_API_KEY as string | undefined) ?? "";
const OS_WORKSPACE = "presentail";
const MAX_PAGES = 50;
const PAGE_SIZE = 100;

function osHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "x-api-key": OS_API_KEY,
  };
}

function osUrl(path: string, extra: Record<string, string> = {}): string {
  const url = new URL(`${OS_BASE_URL}${path}`);
  url.searchParams.set("workspace", OS_WORKSPACE);
  url.searchParams.set("apiKey", OS_API_KEY);
  for (const [k, v] of Object.entries(extra)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

type RawOsProduct = Omit<OSProduct, "id" | "hasInputField"> & {
  id: number | string;
  slug?: string;
  /** OS API returns category data under this key (not `categories`). */
  catalog_categories?: OSProductCategory[];
  /** OS API returns brand data under this key (not `brands`). */
  catalog_brands?: OSProductBrand[];
  /** OS API sends snake_case; some versions send camelCase — handle both. */
  has_input_field?: boolean;
  hasInputField?: boolean;
  has_letter_field?: boolean;
  hasLetterField?: boolean;
};

type RawOsProductsPage = {
  products: RawOsProduct[];
  totalPages?: number;
};

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normaliseProduct(raw: RawOsProduct): OSProduct {
  const id = raw.slug ?? nameToSlug(raw.name);
  // The OS API returns category data under `catalog_categories`, not `categories`.
  const categories = raw.catalog_categories ?? raw.categories ?? [];
  // The OS API returns brand data under `catalog_brands`, not `brands`.
  const brands = raw.catalog_brands ?? raw.brands ?? [];
  return {
    ...raw,
    categories,
    brands,
    id,
    // Preserve the raw numeric DB PK so callers can fetch single-product
    // endpoints (which expose discount_price_usd / discount_price_aed).
    osNumericId: raw.id,
    hasInputField: raw.has_input_field ?? raw.hasInputField ?? false,
    hasLetterField: raw.has_letter_field ?? raw.hasLetterField ?? false,
  };
}

function deduplicateSlugs(products: OSProduct[]): OSProduct[] {
  const counts = new Map<string, number>();
  for (const p of products) {
    counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
  }
  return products.map((p) => {
    if ((counts.get(p.id) ?? 0) > 1) {
      return { ...p, id: `${p.id}--${p.osNumericId}` };
    }
    return p;
  });
}

/** Shape returned by the OS single-product endpoint. */
type OsProductDetail = {
  product?: {
    price?: string | number | null;
    discount_price_usd?: string | number | null;
    discount_price_aed?: string | number | null;
    regular_price?: string | number | null;
    sale_price?: string | number | null;
    [key: string]: unknown;
  };
};

function parseOsPrice(v: unknown): number | null {
  if (v == null || v === "" || v === "0") return null;
  const n = parseFloat(String(v));
  return isFinite(n) && n > 0 ? n : null;
}

/**
 * Fetch discount pricing for a single OS product by its numeric DB ID.
 * The list endpoint omits regular_price / sale_price; this call fills them in
 * so the product detail page can show the slash price.
 *
 * Two paths:
 *  - When VITE_OS_API_KEY is set: calls OS directly (fastest).
 *  - When it is absent: routes through the API server proxy at
 *    /api/woo/product-pricing/:osId which uses the server-side key.
 *
 * Handles both pricing schemes:
 *  - Legacy: discount_price_usd / discount_price_aed  (explicit discount field)
 *  - Modern: regular_price + sale_price pair (OS-native; sale_price or price <
 *    regular_price is treated as the active (discounted) price; regular_price
 *    becomes the crossed-out price)
 *
 * Returns regularPriceUsd when the modern scheme is active so callers can
 * override product.priceValue (the base/crossed-out price).
 */
export async function fetchOsProductPricing(
  osId: number | string,
): Promise<{
  discountPriceUsd: number | null;
  discountPriceAed: number | null;
  /** Non-null only when the modern regular_price/sale_price scheme is active. */
  regularPriceUsd: number | null;
}> {
  // When there is no browser-side OS API key, call the API server proxy instead
  // of hitting OS directly (which would fail with 401).
  if (!OS_API_KEY) {
    const res = await fetch(`/api/woo/product-pricing/${encodeURIComponent(String(osId))}`);
    if (!res.ok) throw new Error(`product-pricing proxy returned HTTP ${res.status}`);
    const data = (await res.json()) as {
      ok: boolean;
      regularPriceUsd?: number | null;
      discountPriceUsd?: number | null;
      discountPriceAed?: number | null;
    };
    return {
      regularPriceUsd: data.regularPriceUsd ?? null,
      discountPriceUsd: data.discountPriceUsd ?? null,
      discountPriceAed: data.discountPriceAed ?? null,
    };
  }

  const res = await fetch(osUrl(`/api/products/${osId}`), { headers: osHeaders() });
  if (!res.ok) throw new Error(`OS product detail returned HTTP ${res.status}`);
  const body = (await res.json()) as OsProductDetail;
  const p = body.product ?? {};

  const regularPriceRaw = parseOsPrice(p.regular_price);
  const salePriceRaw = parseOsPrice(p.sale_price);
  const priceRaw = parseOsPrice(p.price);

  // Modern scheme: regular_price is the crossed-out "was" price; derive discount.
  if (regularPriceRaw != null && regularPriceRaw > 0) {
    let discountPriceUsd: number | null = null;
    if (salePriceRaw != null && salePriceRaw > 0 && salePriceRaw < regularPriceRaw) {
      discountPriceUsd = salePriceRaw;
    } else if (priceRaw != null && priceRaw > 0 && priceRaw < regularPriceRaw) {
      discountPriceUsd = priceRaw;
    }
    return {
      regularPriceUsd: regularPriceRaw,
      discountPriceUsd,
      discountPriceAed: parseOsPrice(p.discount_price_aed),
    };
  }

  // Legacy scheme: discount_price_usd / discount_price_aed.
  return {
    regularPriceUsd: null,
    discountPriceUsd: parseOsPrice(p.discount_price_usd),
    discountPriceAed: parseOsPrice(p.discount_price_aed),
  };
}

/**
 * Fetch all products from OS for a given country/city/lang.
 * Handles full pagination automatically (parallel page fetches after page 1).
 */
export async function fetchOsProducts(opts: {
  countryCode?: string;
  cityId?: string;
  lang?: string;
} = {}): Promise<OSProduct[]> {
  const extra: Record<string, string> = {};
  // OS API requires snake_case query params: country_code and city_slug.
  // Internal city IDs use a prefixed format (e.g. "ae-dubai"); strip the
  // two-letter country prefix to get the OS city slug ("dubai").
  // Confirmed: OS /api/products accepts country_code=LB and city_slug=dubai.
  if (opts.countryCode) extra["country_code"] = opts.countryCode;
  if (opts.cityId) extra["city_slug"] = opts.cityId.replace(/^[a-z]{2}-/, "");
  if (opts.lang && opts.lang !== "en") extra["lang"] = opts.lang;
  extra["page"] = "1";
  extra["pageSize"] = String(PAGE_SIZE);

  const firstRes = await fetch(osUrl("/api/products", extra), { headers: osHeaders() });
  if (!firstRes.ok) {
    throw new Error(`OS products API returned HTTP ${firstRes.status}`);
  }
  const firstBody = (await firstRes.json()) as RawOsProductsPage;
  if (!Array.isArray(firstBody.products)) {
    throw new Error("OS products API: unexpected response shape");
  }

  const totalPages = Math.min(firstBody.totalPages ?? 1, MAX_PAGES);
  const normalisedFirst = firstBody.products.map(normaliseProduct);
  if (totalPages <= 1) return deduplicateSlugs(normalisedFirst);

  const remaining = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => {
      const pageExtra = { ...extra, page: String(i + 2) };
      return fetch(osUrl("/api/products", pageExtra), { headers: osHeaders() });
    }),
  );

  const all: OSProduct[] = [...normalisedFirst];
  for (const res of remaining) {
    if (!res.ok) break;
    const body = (await res.json()) as RawOsProductsPage;
    if (Array.isArray(body.products)) all.push(...body.products.map(normaliseProduct));
  }
  return deduplicateSlugs(all);
}

/** Fetch product categories from OS. */
export async function fetchOsCategories(): Promise<OSProductCategory[]> {
  const res = await fetch(osUrl("/api/categories"), { headers: osHeaders() });
  if (!res.ok) throw new Error(`OS categories API returned HTTP ${res.status}`);
  const body = (await res.json()) as { categories?: OSProductCategory[] };
  return body.categories ?? [];
}

/** Fetch occasions from OS. */
export async function fetchOsOccasions(): Promise<OSProductOccasion[]> {
  const res = await fetch(osUrl("/api/occasions"), { headers: osHeaders() });
  if (!res.ok) throw new Error(`OS occasions API returned HTTP ${res.status}`);
  const raw = (await res.json()) as {
    items?: Array<{
      id: number | string;
      slug: string;
      name: string;
      is_featured?: boolean;
      image_url?: string | null;
      image_public_url?: string | null;
    }>;
    occasions?: OSProductOccasion[];
  };
  if (Array.isArray(raw.occasions)) return raw.occasions;
  const items = raw.items ?? [];
  return items.map((item) => ({
    id: String(item.id),
    slug: item.slug,
    name: item.name,
    featured: item.is_featured ?? false,
    imagePublicUrl: item.image_public_url ?? null,
    image: item.image_url ?? null,
  }));
}

/** Fetch brands from OS catalog-attributes endpoint. */
export async function fetchOsBrands(): Promise<OSCatalogAttributeBrand[]> {
  const res = await fetch(osUrl("/api/catalog-attributes/brands"), { headers: osHeaders() });
  if (!res.ok) throw new Error(`OS brands API returned HTTP ${res.status}`);
  const body = (await res.json()) as unknown;
  if (Array.isArray(body)) return body as OSCatalogAttributeBrand[];
  const typed = body as { brands?: OSCatalogAttributeBrand[] };
  return typed.brands ?? [];
}
