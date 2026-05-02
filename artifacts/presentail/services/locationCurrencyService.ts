import {
  FALLBACK_CURRENCY_CODE,
  currencyForCountry,
  type CurrencyCode,
} from "@/data/currencies";

const DEFAULT_GEO_URL = "https://ipapi.co/country/";
const TIMEOUT_MS = 4000;

function getGeoUrl(): string {
  const override = process.env.EXPO_PUBLIC_IP_GEO_URL;
  if (typeof override === "string" && override.trim().length > 0) {
    return override.trim();
  }
  return DEFAULT_GEO_URL;
}

async function fetchCountryCode(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(getGeoUrl(), {
      method: "GET",
      headers: { Accept: "text/plain, application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (!text) return null;
    // ipapi.co returns either a 2-letter country code as plain text,
    // or a JSON error like '{"error": true, ...}'. Handle both.
    if (text.startsWith("{")) {
      try {
        const obj = JSON.parse(text);
        const candidate =
          obj?.country_code || obj?.countryCode || obj?.country || null;
        if (typeof candidate === "string") return candidate.trim();
      } catch {
        return null;
      }
      return null;
    }
    // Plain text — first whitespace-delimited token only
    const token = text.split(/\s+/)[0];
    if (token && /^[A-Za-z]{2}$/.test(token)) return token;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Detect a supported currency code from the user's IP region. Returns
 * `FALLBACK_CURRENCY_CODE` if detection fails or the region isn't mapped.
 * Never throws.
 */
export async function detectCurrencyFromLocation(): Promise<CurrencyCode> {
  const country = await fetchCountryCode();
  return currencyForCountry(country);
}
