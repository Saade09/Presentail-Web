import type {
  OSLocationsResponse,
  OSProductsResponse,
  OSCategoriesResponse,
  OSBrandsResponse,
  OSOccasionsResponse,
  OSCreateOrderPayload,
  OSCreateOrderResponse,
} from "./types";

const DEFAULT_BASE_URL = "https://os.presentail.com";
const DEFAULT_WORKSPACE = "presentail";
const FETCH_TIMEOUT_MS = 10_000;

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
export async function fetchOsProducts(
  config: PresentailOsConfig,
  opts: { countryCode?: string; cityId?: string; lang?: string } = {},
): Promise<OSProductsResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;
  const { lang = "en" } = opts;

  if (!apiKey) {
    throw new Error("PRESENTAIL_OS_API_KEY is required for fetchOsProducts.");
  }

  async function tryProductFetch(path: string): Promise<Response> {
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("workspace", workspace);
    url.searchParams.set("apiKey", apiKey);
    if (opts.countryCode) url.searchParams.set("countryCode", opts.countryCode);
    if (opts.cityId) url.searchParams.set("cityId", opts.cityId);
    if (lang !== "en") url.searchParams.set("lang", lang);
    return fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "PresentailApp/1.0",
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  }

  // Primary endpoint: /api/products
  let res = await tryProductFetch("/api/products");
  if (res.ok) {
    const body = (await res.json()) as OSProductsResponse;
    if (Array.isArray(body.products)) return body;
  }

  // Fallback: /api/stickers (legacy OS path)
  res = await tryProductFetch("/api/stickers");
  if (!res.ok) {
    throw new Error(`Presentail OS products API returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as OSProductsResponse;
  // The stickers endpoint may wrap products under a different key.
  if (!Array.isArray(body.products)) {
    throw new Error("Presentail OS products API: unexpected response shape");
  }
  return body;
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
 * Fetch brands from Presentail OS.
 * Throws on failure — caller handles graceful fallback.
 */
export async function fetchOsBrands(
  config: PresentailOsConfig,
): Promise<OSBrandsResponse> {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, workspace = DEFAULT_WORKSPACE } = config;

  if (!apiKey) {
    throw new Error("PRESENTAIL_OS_API_KEY is required for fetchOsBrands.");
  }

  const url = new URL(`${baseUrl}/api/brands`);
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
    throw new Error(`Presentail OS brands API returned HTTP ${res.status}`);
  }
  return res.json() as Promise<OSBrandsResponse>;
}

/**
 * Fetch occasions from Presentail OS.
 * Throws on failure — caller handles graceful fallback.
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
  return res.json() as Promise<OSOccasionsResponse>;
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

  const body = (await res.json().catch(() => ({}))) as OSCreateOrderResponse;

  if (!res.ok) {
    const msg =
      (typeof body.message === "string" && body.message) ||
      `Presentail OS order API returned HTTP ${res.status}`;
    throw new Error(msg);
  }

  return body;
}
