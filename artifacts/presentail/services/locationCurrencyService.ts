import {
  FALLBACK_CURRENCY_CODE,
  currencyForCountry,
  isSupportedCurrencyCode,
  type CurrencyCode,
} from "@/data/currencies";
import { API_BASE } from "@/lib/stripe";

const TIMEOUT_MS = 4000;

/**
 * Detect a supported display currency from the caller's IP. Calls the
 * server-side `/api/geo/currency` endpoint (which sees the real client IP via
 * the proxy and caches lookups) instead of hitting a third-party geolocation
 * service from the device. Always returns a supported currency — falls back
 * to USD on any error, timeout or unrecognized region. Never throws.
 */
export async function detectCurrencyFromLocation(): Promise<CurrencyCode> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/api/geo/currency`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return FALLBACK_CURRENCY_CODE;
    const json = (await res.json()) as {
      countryCode?: string | null;
      currencyCode?: string;
    };
    if (json && typeof json.currencyCode === "string" && isSupportedCurrencyCode(json.currencyCode)) {
      return json.currencyCode;
    }
    // Fallback: map the country ourselves if the server returned a country
    // but a currency we don't recognize locally.
    return currencyForCountry(json?.countryCode ?? null);
  } catch {
    return FALLBACK_CURRENCY_CODE;
  } finally {
    clearTimeout(timer);
  }
}
