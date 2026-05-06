/**
 * Delivery location service.
 *
 * Tries to fetch the canonical list of supported delivery countries + cities
 * from the Presentail OS Replit app. If the call fails (network error,
 * non-2xx, malformed response, or timeout) we fall back to the static list
 * in `constants/deliveryLocations.ts` so the app still functions offline.
 *
 * Expected Presentail OS contract:
 *   GET {EXPO_PUBLIC_DELIVERY_LOCATIONS_URL}
 *   200 OK
 *   { "countries": [
 *       {
 *         "id": "lb",
 *         "name": "Lebanon",
 *         "code": "LB",
 *         "flag": "🇱🇧",
 *         "currency": "USD",
 *         "isActive": true,
 *         "cities": [
 *           { "id": "lb-beirut", "name": "Beirut", "isActive": true },
 *           ...
 *         ]
 *       },
 *       ...
 *     ]
 *   }
 *
 * The base URL can be overridden with the `EXPO_PUBLIC_DELIVERY_LOCATIONS_URL`
 * env var. When unset, the service immediately uses the fallback list.
 */
import {
  FALLBACK_DELIVERY_COUNTRIES,
  type DeliveryCountry,
} from "@/constants/deliveryLocations";
import { isSupportedCurrencyCode } from "@/data/currencies";

const TIMEOUT_MS = 4000;

// Hard allowlist: this app only delivers to Lebanon, UAE, and Cyprus.
// Any remote feed that returns extra countries (e.g. an unrelated upstream
// like the legacy `lebanon-luxury-showcase` deployment) MUST be filtered
// down to these codes so the country picker can never display unsupported
// destinations. Reconcile each remote country's `cities` against the
// fallback district list so the proper delivery districts are always used
// even if the upstream returns wrong/legacy city names.
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
        return {
          id: cid,
          name: cname,
          isActive: cobj.isActive !== false,
        };
      })
      .filter(Boolean) as DeliveryCountry["cities"];
    // Reconcile cities against the fallback district list. The fallback is
    // the source of truth for delivery districts (the upstream feed has
    // historically returned legacy city names like Beirut/Jounieh/Tripoli
    // for Lebanon instead of our 26 districts). If the remote returned a
    // matching city (by id or name) we keep its `isActive`; otherwise we
    // default to active.
    const fallback = FALLBACK_DELIVERY_COUNTRIES.find(
      (fc) => fc.code.toUpperCase() === upperCode,
    );
    const cities = fallback
      ? fallback.cities.map((fc) => {
          const match = remoteCities.find(
            (rc) =>
              rc.id === fc.id ||
              rc.name.trim().toLowerCase() === fc.name.trim().toLowerCase(),
          );
          return { id: fc.id, name: fc.name, isActive: match ? match.isActive : true };
        })
      : remoteCities;
    out.push({ id, name, code: upperCode, flag, currency, isActive, cities });
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
