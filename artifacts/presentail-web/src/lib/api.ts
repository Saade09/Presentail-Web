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

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("presentail_token");
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const loc = getStoredLocation();
  if (loc.countryCode) headers.set("x-store-country", loc.countryCode);
  if (loc.cityId) headers.set("x-store-city", loc.cityId);

  const res = await fetch(`/api${path}`, { ...options, headers });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `API error ${res.status}`);
  }
  
  return res.json() as Promise<T>;
}
