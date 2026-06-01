/**
 * Delivery location service.
 *
 * Fetches the canonical list of supported delivery countries + cities from
 * the API server's /api/delivery-locations endpoint (which is backed by the
 * Presentail OS cache). Falls back to the static list in
 * `constants/deliveryLocations.ts` only when the network call fails.
 *
 * City trust policy:
 *   - When the API returns cities for a country, those cities are used as-is.
 *     The server (osLocationsCache) is the source of truth; we no longer
 *     overwrite remote cities with the hardcoded district list, because the
 *     whole point of Phase 1 is to let Presentail OS drive city changes
 *     without a code deploy.
 *   - When the API returns zero cities for a country (e.g. data not yet
 *     entered in OS), the fallback district list for that country is used
 *     so the picker is never empty.
 *   - Countries not present in the response at all are dropped; we do not
 *     silently inject hardcoded countries (the server already handles that).
 */
import {
  FALLBACK_DELIVERY_COUNTRIES,
  type DeliveryCountry,
} from "@/constants/deliveryLocations";
import { isSupportedCurrencyCode } from "@/data/currencies";

const TIMEOUT_MS = 4000;

// Hard allowlist: this app only delivers to Lebanon, UAE, and Cyprus.
// Any remote feed that returns extra countries must be filtered down to
// these codes so the country picker can never display unsupported destinations.
const ALLOWED_COUNTRY_CODES = new Set(["LB", "AE", "CY"]);

function getEndpoint(): string | null {
  const override = process.env.EXPO_PUBLIC_DELIVERY_LOCATIONS_URL;
  if (typeof override === "string" && override.trim().length > 0) {
    return override.trim();
  }
  return null;
}

function sanitizeCountries(raw: unknown): DeliveryCountry[] | null {
  if (!raw || typeof raw !== "object") return null;
  const arr = (raw as { countries?: unknown }).countries;
  if (!Array.isArray(arr)) return null;
  const out: DeliveryCountry[] = [];
  for (const c of arr) {
    if (!c || typeof c !== "object") continue;
    const obj = c as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : null;
    const name = typeof obj.name === "string" ? obj.name : null;
    const code = typeof obj.code === "string" ? obj.code : null;
    const flag = typeof obj.flag === "string" ? obj.flag : "";
    const currencyRaw = typeof obj.currency === "string" ? obj.currency : null;
    const isActive = obj.isActive !== false;
    const citiesRaw = Array.isArray(obj.cities) ? obj.cities : [];
    if (!id || !name || !code) continue;
    // Drop any country outside our supported delivery footprint.
    const upperCode = code.trim().toUpperCase();
    if (!ALLOWED_COUNTRY_CODES.has(upperCode)) continue;
    const currency = isSupportedCurrencyCode(currencyRaw) ? currencyRaw : "USD";

    const remoteCities = citiesRaw
      .map((cc) => {
        if (!cc || typeof cc !== "object") return null;
        const cobj = cc as Record<string, unknown>;
        const cid = typeof cobj.id === "string" ? cobj.id : null;
        const cname = typeof cobj.name === "string" ? cobj.name : null;
        if (!cid || !cname) return null;
        const city: DeliveryCountry["cities"][number] = {
          id: cid,
          name: cname,
          isActive: cobj.isActive !== false,
        };
        if (typeof cobj.expressAvailable === "boolean") {
          city.expressAvailable = cobj.expressAvailable;
        }
        if (typeof cobj.sameDayCutoffHour === "number") {
          city.sameDayCutoffHour = cobj.sameDayCutoffHour;
        }
        if (typeof cobj.expressDeliveryLabel === "string") {
          city.expressDeliveryLabel = cobj.expressDeliveryLabel;
        }
        if (Array.isArray(cobj.timeSlots)) {
          const sanitizedSlots = (cobj.timeSlots as unknown[])
            .filter(
              (s): s is { label: string; startHour?: number; endHour?: number; cutoffHour: number; extraFee?: number } =>
                !!s &&
                typeof s === "object" &&
                typeof (s as Record<string, unknown>).label === "string" &&
                typeof (s as Record<string, unknown>).cutoffHour === "number",
            )
            .map((s) => ({
              label: s.label,
              ...(typeof s.startHour === "number" ? { startHour: s.startHour } : {}),
              ...(typeof s.endHour === "number" ? { endHour: s.endHour } : {}),
              cutoffHour: s.cutoffHour,
              ...(typeof s.extraFee === "number" ? { extraFee: s.extraFee } : {}),
            }));
          // Always assign, even when empty — an empty array is a deliberate
          // signal from the server that no OS slots are configured for this
          // city; callers fall back to lib/delivery hardcoded tables.
          city.timeSlots = sanitizedSlots;
        }
        return city;
      })
      .filter(Boolean) as DeliveryCountry["cities"];

    // Trust OS cities when present. Fall back to hardcoded districts only
    // when the server returned zero cities (data not yet entered in OS).
    const fallback = FALLBACK_DELIVERY_COUNTRIES.find(
      (fc) => fc.code.toUpperCase() === upperCode,
    );
    const cities =
      remoteCities.length > 0
        ? remoteCities
        : (fallback?.cities ?? []).map((fc) => ({
            id: fc.id,
            name: fc.name,
            isActive: fc.isActive,
          }));

    out.push({
      id,
      name,
      code: upperCode,
      flag,
      currency,
      isActive,
      cities,
      // Preserve the static preferred-default-city hint (UX preference
      // owned by the fallback list; OS does not carry this field yet).
      preferredDefaultCityId: fallback?.preferredDefaultCityId,
    });
  }
  return out.length > 0 ? out : null;
}

export type FetchDeliveryLocationsResult = {
  countries: DeliveryCountry[];
  source: "remote" | "fallback";
  error: Error | null;
};

export async function fetchDeliveryLocations(): Promise<FetchDeliveryLocationsResult> {
  const endpoint = getEndpoint();
  if (!endpoint) {
    return {
      countries: FALLBACK_DELIVERY_COUNTRIES,
      source: "fallback",
      error: null,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Delivery locations endpoint responded ${res.status}`);
    }
    const data = await res.json();
    const sanitized = sanitizeCountries(data);
    if (!sanitized) {
      throw new Error("Delivery locations endpoint returned an unexpected shape");
    }
    return { countries: sanitized, source: "remote", error: null };
  } catch (err) {
    return {
      countries: FALLBACK_DELIVERY_COUNTRIES,
      source: "fallback",
      error: err instanceof Error ? err : new Error("Unknown error"),
    };
  } finally {
    clearTimeout(timer);
  }
}
