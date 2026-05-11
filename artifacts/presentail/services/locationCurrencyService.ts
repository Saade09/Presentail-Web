import {
  FALLBACK_CURRENCY_CODE,
  currencyForCountry,
  isSupportedCurrencyCode,
  type CurrencyCode,
} from "@/data/currencies";
import { API_BASE } from "@/lib/stripe";

const TIMEOUT_MS = 4000;

export type GeoLookupResult = {
  countryCode: string | null;
  currencyCode: CurrencyCode;
};

let inFlight: Promise<GeoLookupResult> | null = null;
let cached: GeoLookupResult | null = null;

/**
 * Detect the caller's country and supported display currency from their IP.
 * Calls the server-side `/api/geo/currency` endpoint (which sees the real
 * client IP via the proxy and caches lookups) instead of hitting a third-party
 * geolocation service from the device. Always returns a usable shape — falls
 * back to USD with a null country on any error, timeout or unrecognized
 * region. Never throws. The first successful result is cached for the lifetime
 * of the JS context so multiple callers (CurrencyContext +
 * DeliveryLocationProvider) share a single network round-trip.
 */
export async function detectGeoFromLocation(): Promise<GeoLookupResult> {
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/api/geo/currency`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) {
        return { countryCode: null, currencyCode: FALLBACK_CURRENCY_CODE };
      }
      const json = (await res.json()) as {
        countryCode?: string | null;
        currencyCode?: string;
      };
      const country =
        typeof json?.countryCode === "string" && json.countryCode.trim()
          ? json.countryCode.trim().toUpperCase()
          : null;
      const currency: CurrencyCode =
        json && typeof json.currencyCode === "string" && isSupportedCurrencyCode(json.currencyCode)
          ? json.currencyCode
          : currencyForCountry(country);
      const result: GeoLookupResult = { countryCode: country, currencyCode: currency };
      cached = result;
      return result;
    } catch {
      return { countryCode: null, currencyCode: FALLBACK_CURRENCY_CODE };
    } finally {
      clearTimeout(timer);
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Backwards-compatible wrapper used by CurrencyContext. Returns just the
 * currency code from the geo lookup.
 */
export async function detectCurrencyFromLocation(): Promise<CurrencyCode> {
  const { currencyCode } = await detectGeoFromLocation();
  return currencyCode;
}
