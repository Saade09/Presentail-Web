import type {
  OSLocationsResponse,
  OSProduct,
  OSProductCategory,
  OSProductsResponse,
  OSCategoriesResponse,
  OSCatalogAttributeBrandsResponse,
  OSOccasionsResponse,
  OSCreateOrderPayload,
  OSCreateOrderResponse,
} from "./types";

const DEFAULT_BASE_URL = "https://os.presentail.com";
const DEFAULT_WORKSPACE = "presentail";
const FETCH_TIMEOUT_MS = 25_000;

export type PresentailOsConfig = {
  /** Base URL of the Presentail OS instance. Defaults to https://os.presentail.com. */
  baseUrl?: string;
  /** API key for the public locations endpoint. Required. */
  apiKey: string;
  /** Workspace slug to pass to the public endpoint. Defaults to "presentail". */
  workspace?: string;
};

/**
 * Fetch the full locations + delivery config from Presentail OS.
 *
 * The API key is sent in the `x-api-key` header. It is also included as the
 * `apiKey` query parameter because the public endpoint currently requires it
 * there; the header form is preferred to avoid the key appearing in server logs.
 *
 * Throws with a descriptive message if the API key is absent or the
 * request fails. The caller is responsible for graceful fallback.
 */
export async function fetchOsLocations(
  config: PresentailOsConfig,
): Promise<OSLocationsResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;

  if (!apiKey) {
    throw new Error(
      "PRESENTAIL_OS_API_KEY is required but was not provided. " +
        "Set this environment variable to enable live delivery configuration from Presentail OS.",
    );
  }

  async function tryFetch(path: string): Promise<Response> {
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("workspace", workspace);
    url.searchParams.set("apiKey", apiKey);
    return fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "PresentailApp/1.0",
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  }

  // Primary: /api/delivery-locations-ext (enriched endpoint with slug, expressFeeTotal,
  // expressSurcharge, and freeDeliveryThreshold fields). Fall back to the
  // plain /api/delivery-locations for older OS instances that haven't deployed
  // the ext endpoint yet. A non-ok response from both is a hard failure.
  const primaryRes = await tryFetch("/api/delivery-locations-ext");
  if (primaryRes.ok) {
    return primaryRes.json() as Promise<OSLocationsResponse>;
  }

  // Primary failed — try the legacy endpoint.
  const legacyRes = await tryFetch("/api/delivery-locations");
  if (legacyRes.ok) {
    return legacyRes.json() as Promise<OSLocationsResponse>;
  }

  // Both endpoints failed — try the oldest legacy path as a last resort.
  const oldLegacyRes = await tryFetch("/api/public/locations");
  if (!oldLegacyRes.ok) {
    throw new Error(
      `Presentail OS locations API returned HTTP ${oldLegacyRes.status} (primary ext: ${primaryRes.status}, legacy: ${legacyRes.status})`,
    );
  }

  return oldLegacyRes.json() as Promise<OSLocationsResponse>;
}

/**
 * Fetch the full product catalog from Presentail OS.
 *
 * Tries `/api/products` first (primary endpoint). Falls back to
 * `/api/stickers` for legacy OS deployments that use the older path.
 *
 * Throws if both endpoints fail or the API key is absent.
 * The caller is responsible for graceful fallback (e.g. WooCommerce).
 *
 * @param countryCode  Optional ISO 3166-1 alpha-2 to filter by country (uppercase).
 * @param cityId       Optional city id to filter by city.
 * @param lang         BCP-47 language tag (default "en").
 */

/**
 * Maximum number of pages to fetch in a single `fetchOsProducts` call.
 * At 100 products per page this covers up to 5 000 products — well above
 * any realistic catalog size. Acts as a circuit-breaker against an
 * unexpectedly large response or a buggy `totalPages` field.
 */
const MAX_PAGES = 50;
const DEFAULT_PAGE_SIZE = 100;

/**
 * Raw product shape as returned by the OS API wire format.
 * The OS API returns a numeric `id` (database PK). A `slug` field may be
 * present on newer OS deployments; when absent, the slug is derived from the
 * product name so URLs remain human-readable (e.g. "velvet-rose-bouquet").
 * After normalisation, `OSProduct.id` is always a URL-safe string slug.
 */
type RawOSProduct = Omit<OSProduct, "id"> & {
  id: number | string;
  slug?: string;
  /** OS API returns category data under this key (not `categories`). */
  catalog_categories?: OSProductCategory[];
};

type RawOSProductsResponse = Omit<OSProductsResponse, "products"> & {
  products: RawOSProduct[];
};

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Intermediate type that retains the raw numeric id for collision resolution. */
type NormalisedProduct = OSProduct & { _rawNumericId: number | string };

function normaliseProduct(raw: RawOSProduct): NormalisedProduct {
  // Prefer an explicit slug from the API; fall back to a name-derived slug so
  // product URLs are human-readable rather than numeric IDs.
  const id = raw.slug ?? nameToSlug(raw.name);
  // The OS API returns category data under `catalog_categories`, not `categories`.
  // Prefer `catalog_categories` when present so filtering by category works correctly.
  const categories = raw.catalog_categories ?? raw.categories ?? [];
  return { ...raw, categories, id, _rawNumericId: raw.id };
}

/**
 * Resolve slug collisions (products with the same name) by appending the
 * numeric OS id so every product has a unique URL segment.
 * E.g. two "Happy Birthday Balloon" products become
 *   "happy-birthday-balloon--650" and "happy-birthday-balloon--651".
 */
function deduplicateSlugs(products: NormalisedProduct[]): OSProduct[] {
  const counts = new Map<string, number>();
  for (const p of products) {
    counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
  }
  return products.map((p) => {
    const { _rawNumericId, ...rest } = p as NormalisedProduct & Record<string, unknown>;
    // Always preserve the raw OS database PK as osNumericId so order submission
    // can send the correct identifier (the OS orders endpoint looks up products
    // by their DB PK, not by slug).
    const withNumericId: OSProduct = { ...(rest as OSProduct), osNumericId: _rawNumericId };
    if ((counts.get(p.id) ?? 0) > 1) {
      return { ...withNumericId, id: `${p.id}--${_rawNumericId}` };
    }
    return withNumericId;
  });
}

export async function fetchOsProducts(
  config: PresentailOsConfig,
  opts: { countryCode?: string; cityId?: string; lang?: string } = {},
): Promise<OSProductsResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;
  const { lang = "en" } = opts;

  if (!apiKey) {
    throw new Error("PRESENTAIL_OS_API_KEY is required for fetchOsProducts.");
  }

  async function fetchPage(path: string, page: number): Promise<Response> {
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("workspace", workspace);
    url.searchParams.set("apiKey", apiKey);
    // OS API requires snake_case query params: country_code and city_slug.
    // Internal city IDs use a prefixed format (e.g. "ae-dubai"); strip the
    // two-letter country prefix to get the OS city slug ("dubai").
    // Confirmed: OS /api/products accepts country_code=LB and city_slug=dubai.
    if (opts.countryCode) url.searchParams.set("country_code", opts.countryCode);
    if (opts.cityId) url.searchParams.set("city_slug", opts.cityId.replace(/^[a-z]{2}-/, ""));
    if (lang !== "en") url.searchParams.set("lang", lang);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(DEFAULT_PAGE_SIZE));
    return fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "PresentailApp/1.0",
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  }

  async function fetchAllPages(path: string): Promise<OSProductsResponse | null> {
    const firstRes = await fetchPage(path, 1);
    if (!firstRes.ok) return null;
    const firstBody = (await firstRes.json()) as RawOSProductsResponse;
    if (!Array.isArray(firstBody.products)) return null;

    const totalPages = Math.min(firstBody.totalPages ?? 1, MAX_PAGES);
    const normalisedFirst = firstBody.products.map(normaliseProduct);
    if (totalPages <= 1) {
      return { ...firstBody, products: deduplicateSlugs(normalisedFirst) };
    }

    // Fetch remaining pages in parallel.
    const remaining = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(path, i + 2)),
    );
    const allProducts: NormalisedProduct[] = [...normalisedFirst];
    for (const res of remaining) {
      if (!res.ok) break; // stop collecting on any error; use what we have
      const body = (await res.json()) as RawOSProductsResponse;
      if (Array.isArray(body.products)) allProducts.push(...body.products.map(normaliseProduct));
    }
    return { ...firstBody, products: deduplicateSlugs(allProducts) };
  }

  // Primary endpoint: /api/products
  const primary = await fetchAllPages("/api/products");
  if (primary) return primary;

  // Fallback: /api/stickers (legacy OS path)
  const legacyRes = await fetchPage("/api/stickers", 1);
  if (!legacyRes.ok) {
    throw new Error(`Presentail OS products API returned HTTP ${legacyRes.status}`);
  }
  const rawBody = (await legacyRes.json()) as RawOSProductsResponse;
  if (!Array.isArray(rawBody.products)) {
    throw new Error("Presentail OS products API: unexpected response shape");
  }
  return { ...rawBody, products: rawBody.products.map(normaliseProduct) };
}

/**
 * Fetch product categories from Presentail OS.
 * Throws on failure — caller handles graceful fallback.
 */
export async function fetchOsCategories(
  config: PresentailOsConfig,
): Promise<OSCategoriesResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;

  if (!apiKey) {
    throw new Error("PRESENTAIL_OS_API_KEY is required for fetchOsCategories.");
  }

  const url = new URL(`${baseUrl}/api/categories`);
  url.searchParams.set("workspace", workspace);
  url.searchParams.set("apiKey", apiKey);
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "PresentailApp/1.0",
      "x-api-key": apiKey,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Presentail OS categories API returned HTTP ${res.status}`);
  }
  return res.json() as Promise<OSCategoriesResponse>;
}

/**
 * Fetch all brands from the Presentail OS public catalog-attributes endpoint.
 * Returns brands with canonical slugs, names, images, and sort_order regardless
 * of whether any products are currently linked to them.
 * Throws on failure — caller handles graceful fallback.
 */
export async function fetchOsCatalogAttributesBrands(
  config: PresentailOsConfig,
): Promise<OSCatalogAttributeBrandsResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;

  if (!apiKey) {
    throw new Error("PRESENTAIL_OS_API_KEY is required for fetchOsCatalogAttributesBrands.");
  }

  const url = new URL(`${baseUrl}/api/catalog-attributes/brands`);
  url.searchParams.set("workspace", workspace);
  url.searchParams.set("apiKey", apiKey);
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "PresentailApp/1.0",
      "x-api-key": apiKey,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Presentail OS catalog-attributes/brands API returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  // The endpoint may return { brands: [...] } or a bare array.
  if (Array.isArray(body)) {
    return { brands: body as OSCatalogAttributeBrandsResponse["brands"] };
  }
  return body as OSCatalogAttributeBrandsResponse;
}

/**
 * Fetch occasions from Presentail OS.
 * Throws on failure — caller handles graceful fallback.
 *
 * The OS API returns { items: [...], total, page, pageSize, totalPages } where
 * each item uses snake_case keys (is_featured, image_url). We normalise to the
 * OSProductOccasion shape used throughout the app.
 */
export async function fetchOsOccasions(
  config: PresentailOsConfig,
): Promise<OSOccasionsResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;

  if (!apiKey) {
    throw new Error("PRESENTAIL_OS_API_KEY is required for fetchOsOccasions.");
  }

  const url = new URL(`${baseUrl}/api/occasions`);
  url.searchParams.set("workspace", workspace);
  url.searchParams.set("apiKey", apiKey);
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "PresentailApp/1.0",
      "x-api-key": apiKey,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Presentail OS occasions API returned HTTP ${res.status}`);
  }

  const raw = (await res.json()) as {
    items?: Array<{
      id: number | string;
      slug: string;
      name: string;
      is_featured?: boolean;
      image_url?: string | null;
      image_public_url?: string | null;
    }>;
    occasions?: Array<{
      id: string;
      slug: string;
      name: string;
      featured?: boolean;
      image?: string | null;
      imagePublicUrl?: string | null;
    }>;
  };

  // Support both the snake_case paginated shape { items } and the legacy { occasions } shape.
  if (Array.isArray(raw.occasions)) {
    return { occasions: raw.occasions };
  }

  const items = raw.items ?? [];
  return {
    occasions: items.map((item) => {
      const toAbs = (u: string | null | undefined) =>
        u ? (u.startsWith("http") ? u : `${baseUrl}${u}`) : null;
      return {
        id: String(item.id),
        slug: item.slug,
        name: item.name,
        featured: item.is_featured ?? false,
        // imagePublicUrl is the public-objects CDN path (accessible with x-api-key via our proxy).
        // image is the raw upload path (private, not directly servable).
        imagePublicUrl: toAbs(item.image_public_url),
        image: toAbs(item.image_url),
      };
    }),
  };
}

/**
 * Fetch the live status of a single order from Presentail OS.
 *
 * Uses a short 3-second timeout so a slow or unavailable OS does not block
 * the order-history response. Returns `null` on any failure so the caller
 * can fall back to the stored state.
 *
 * @param osOrderId  UUID assigned by OS when the order was created.
 */
export async function fetchOsOrderStatus(
  config: PresentailOsConfig,
  osOrderId: string,
): Promise<{ status: string } | null> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;

  if (!apiKey || !osOrderId) return null;

  try {
    const url = new URL(`${baseUrl}/api/orders/${encodeURIComponent(osOrderId)}`);
    url.searchParams.set("workspace", workspace);
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "PresentailApp/1.0",
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as
      | { status?: string; state?: string }
      | null;
    if (!body) return null;
    const status = body.status ?? body.state;
    if (typeof status !== "string" || !status) return null;
    return { status };
  } catch {
    return null;
  }
}

/**
 * Submit a new order to Presentail OS.
 *
 * The API key is sent in the `x-api-key` header. The workspace slug is sent
 * as the `workspace` query parameter (and embedded in the payload body).
 *
 * Throws with a descriptive message if the API key is absent or the
 * request fails with a non-2xx status. The caller is responsible for
 * surfacing the error to the client.
 */
export async function createOsOrder(
  config: PresentailOsConfig,
  payload: OSCreateOrderPayload,
): Promise<OSCreateOrderResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;

  if (!apiKey) {
    throw new Error(
      "PRESENTAIL_OS_API_KEY is required but was not provided. " +
        "Set this environment variable to enable order submission to Presentail OS.",
    );
  }

  const url = new URL(`${baseUrl}/api/orders`);
  url.searchParams.set("workspace", workspace);
  // API key is sent as both Bearer token and x-api-key — OS /api/orders
  // requires Bearer auth; x-api-key is kept for backward compatibility.
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "PresentailApp/1.0",
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ ...payload, workspace }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const rawText = await res.text().catch(() => "");
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // not JSON — use raw text snippet as fallback
    }
    const snippet = rawText.length > 500 ? rawText.slice(0, 500) + "…" : rawText;
    // Log the full raw body so ops can diagnose OS-side rejections.
    // (imported logger is not available here; use console.warn which the
    //  API server's pino transport captures at WARN level)
    console.warn(
      `[presentail-os] createOsOrder HTTP ${res.status} raw body: ${snippet}`,
    );
    const msg =
      (typeof parsed["error"] === "string" && parsed["error"]) ||
      (typeof parsed["message"] === "string" && parsed["message"]) ||
      snippet ||
      `Presentail OS order API returned HTTP ${res.status}`;
    throw new Error(msg);
  }

  const body = (await res.json().catch(() => ({}))) as OSCreateOrderResponse;
  return body;
}
