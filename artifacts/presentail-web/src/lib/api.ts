const LOCATION_STORAGE_KEY = "presentail_delivery_location_v1";
const TOKEN_KEY = "presentail_web_token";

function getStoredLocation(): { countryCode?: string; cityId?: string } {
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      countryCode: parsed?.countryCode ?? undefined,
      cityId: parsed?.cityId ?? undefined,
    };
  } catch {
    return {};
  }
}

// `setAuthTokenGetter` is kept as a no-op stub for backwards compatibility
// with any external callers that imported it during prior migrations.
type TokenGetter = () => Promise<string | null>;
export function setAuthTokenGetter(_getter: TokenGetter): void {
  // intentional no-op
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const loc = getStoredLocation();
  if (loc.countryCode) headers.set("x-store-country", loc.countryCode);
  if (loc.cityId) headers.set("x-store-city", loc.cityId);

  const storedToken = localStorage.getItem(TOKEN_KEY);
  if (storedToken) {
    headers.set("Authorization", `Bearer ${storedToken}`);
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const err = new Error(
      errorData.message || `API error ${res.status}`
    ) as Error & { status: number; code?: string };
    err.status = res.status;
    err.code = errorData.code;
    throw err;
  }

  return res.json() as Promise<T>;
}
