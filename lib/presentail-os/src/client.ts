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

  // Primary: /api/delivery-locations (the current canonical endpoint).
  // If it responds with 2xx, trust it — even if countries is empty (OS has no
  // data published yet). Only fall back to the legacy path when the primary
  // itself fails (non-2xx), which handles old OS instances that haven't
  // deployed the new endpoint yet.
  const primaryRes = await tryFetch("/api/delivery-locations");
  if (primaryRes.ok) {
    return primaryRes.json() as Promise<OSLocationsResponse>;
  }

  // Primary failed — try the legacy endpoint (deprecated; some OS instances
  // may still serve it). /api/public/locations returns 410 on updated instances,
  // so a non-ok response here is a hard failure.
  const legacyRes = await tryFetch("/api/public/locations");
  if (!legacyRes.ok) {
    throw new Error(
      `Presentail OS locations API returned HTTP ${legacyRes.status} (primary: ${primaryRes.status})`,
    );
  }

  return legacyRes.json() as Promise<OSLocationsResponse>;
}
