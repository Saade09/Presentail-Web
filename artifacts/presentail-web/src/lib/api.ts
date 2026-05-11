const LOCATION_STORAGE_KEY = "presentail_delivery_location_v1";

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

// Cookie-first auth. The web app and API are served from the same origin
// (Replit's shared proxy) so the Clerk session cookie is automatically
// sent with every same-origin request as long as `credentials: "include"`
// is set below. We intentionally do NOT inject an `Authorization: Bearer`
// header — the server's `clerkMiddleware()` reads the session cookie and
// populates `req.auth` from it.
//
// `setAuthTokenGetter` is kept as a no-op stub so any external caller
// that imported it during the migration doesn't break the build. It can
// be removed once no consumers reference it.
type TokenGetter = () => Promise<string | null>;
export function setAuthTokenGetter(_getter: TokenGetter): void {
  // intentional no-op; see comment above.
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

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}
