import type { OSLocationsResponse } from "./types";

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

  // Primary: /api/delivery-locations (successor of the deprecated /api/public/locations).
  // The old endpoint returns `link: </api/delivery-locations>; rel="successor-version"`
  // and `deprecation: true` headers, so we try the new one first and fall back.
  const primaryPath = "/api/delivery-locations";
  const fallbackPath = "/api/public/locations";

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

  let res = await tryFetch(primaryPath);

  // Fall back to the legacy endpoint if the new one returns no countries.
  if (res.ok) {
    const body = (await res.json()) as OSLocationsResponse;
    if (body.countries && body.countries.length > 0) {
      return body;
    }
    // New endpoint returned empty — try legacy
    res = await tryFetch(fallbackPath);
  }

  if (!res.ok) {
    throw new Error(
      `Presentail OS locations API returned HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<OSLocationsResponse>;
}
