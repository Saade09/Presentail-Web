import { isSupportedCurrency, type SupportedCurrency } from "./fx";

// Country → display currency mapping. Mirrors the mobile-side mapping in
// `artifacts/presentail/data/currencies.ts` so detection is consistent across
// platforms. Only currencies the FX pipeline actually supports are returned;
// everything else falls back to USD via `currencyForCountry()` below.
const COUNTRY_TO_CURRENCY: Record<string, SupportedCurrency> = {
  AE: "AED",
  US: "USD",
  GB: "GBP",
  IM: "GBP",
  JE: "GBP",
  GG: "GBP",
  CA: "CAD",
  AU: "AUD",
  QA: "QAR",
  SA: "SAR",
  KW: "KWD",
  OM: "OMR",
  CH: "CHF",
  LI: "CHF",
  // Eurozone
  AT: "EUR",
  BE: "EUR",
  CY: "EUR",
  DE: "EUR",
  EE: "EUR",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GR: "EUR",
  HR: "EUR",
  IE: "EUR",
  IT: "EUR",
  LT: "EUR",
  LU: "EUR",
  LV: "EUR",
  MT: "EUR",
  NL: "EUR",
  PT: "EUR",
  SI: "EUR",
  SK: "EUR",
  AD: "EUR",
  MC: "EUR",
  SM: "EUR",
  VA: "EUR",
  ME: "EUR",
  XK: "EUR",
};

export const FALLBACK_DISPLAY_CURRENCY: SupportedCurrency = "USD";

export function currencyForCountry(
  countryCode: string | null | undefined,
): SupportedCurrency {
  if (!countryCode) return FALLBACK_DISPLAY_CURRENCY;
  const upper = countryCode.trim().toUpperCase();
  const mapped = COUNTRY_TO_CURRENCY[upper];
  if (mapped && isSupportedCurrency(mapped)) return mapped;
  return FALLBACK_DISPLAY_CURRENCY;
}

// Loopback / private ranges that ipapi.co can't resolve. We short-circuit
// these locally so dev environments return the USD fallback cleanly without
// an outbound HTTP call.
function isPrivateOrLoopback(ip: string): boolean {
  if (!ip) return true;
  // Strip any IPv6-mapped IPv4 prefix.
  const v = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (v === "::1" || v === "127.0.0.1" || v === "localhost") return true;
  if (v.startsWith("10.")) return true;
  if (v.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(v)) return true;
  // IPv6 unique local
  if (/^f[cd][0-9a-f]{2}:/i.test(v)) return true;
  return false;
}

type CacheEntry = {
  countryCode: string | null;
  currencyCode: SupportedCurrency;
  expiresAt: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_CACHE_SIZE = 5000;
const cache = new Map<string, CacheEntry>();

function readCache(ip: string): CacheEntry | null {
  const hit = cache.get(ip);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    cache.delete(ip);
    return null;
  }
  return hit;
}

function writeCache(ip: string, entry: Omit<CacheEntry, "expiresAt">): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    // Naive eviction: drop the oldest insertion. Map preserves insertion order.
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(ip, { ...entry, expiresAt: Date.now() + CACHE_TTL_MS });
}

const LOOKUP_TIMEOUT_MS = 1500;

async function fetchCountryFromIp(ip: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    // ipapi.co's free endpoint returns a 2-letter country code as plain text.
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
      headers: { Accept: "text/plain, application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (!text || text.startsWith("{")) return null;
    const token = text.split(/\s+/)[0];
    if (token && /^[A-Za-z]{2}$/.test(token)) return token.toUpperCase();
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type GeoCurrencyResult = {
  countryCode: string | null;
  currencyCode: SupportedCurrency;
};

export async function resolveGeoCurrency(ip: string): Promise<GeoCurrencyResult> {
  if (!ip || isPrivateOrLoopback(ip)) {
    return { countryCode: null, currencyCode: FALLBACK_DISPLAY_CURRENCY };
  }
  const cached = readCache(ip);
  if (cached) {
    return { countryCode: cached.countryCode, currencyCode: cached.currencyCode };
  }
  const country = await fetchCountryFromIp(ip);
  const currency = currencyForCountry(country);
  const result: GeoCurrencyResult = { countryCode: country, currencyCode: currency };
  writeCache(ip, result);
  return result;
}

// ── Coordinate-based country lookup ──────────────────────────────────────────
// Used by /geo/currency-by-coords to translate the device's GPS-reported
// latitude/longitude into an ISO country code. We use BigDataCloud's public,
// keyless `reverse-geocode-client` endpoint (works without an API key, no
// PII beyond the lat/lng leaves the server) and fall back to USD on any
// failure. Results are cached server-side keyed by lat/lng rounded to 0.1°
// (~11 km) so a few sequential lookups from the same area share a single
// outbound call without storing precise locations.

const COORDS_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const COORDS_MAX_CACHE_SIZE = 5000;
const coordsCache = new Map<string, CacheEntry>();

function coordsCacheKey(lat: number, lng: number): string {
  const round = (v: number) => Math.round(v * 10) / 10;
  return `${round(lat)},${round(lng)}`;
}

function readCoordsCache(key: string): CacheEntry | null {
  const hit = coordsCache.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    coordsCache.delete(key);
    return null;
  }
  return hit;
}

function writeCoordsCache(key: string, entry: Omit<CacheEntry, "expiresAt">): void {
  if (coordsCache.size >= COORDS_MAX_CACHE_SIZE) {
    const firstKey = coordsCache.keys().next().value;
    if (firstKey) coordsCache.delete(firstKey);
  }
  coordsCache.set(key, { ...entry, expiresAt: Date.now() + COORDS_CACHE_TTL_MS });
}

async function fetchCountryFromCoords(
  lat: number,
  lng: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client` +
      `?latitude=${encodeURIComponent(lat.toString())}` +
      `&longitude=${encodeURIComponent(lng.toString())}` +
      `&localityLanguage=en`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { countryCode?: unknown };
    const code = typeof json?.countryCode === "string" ? json.countryCode.trim() : "";
    if (code && /^[A-Za-z]{2}$/.test(code)) return code.toUpperCase();
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveGeoCurrencyByCoords(
  lat: number,
  lng: number,
): Promise<GeoCurrencyResult> {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return { countryCode: null, currencyCode: FALLBACK_DISPLAY_CURRENCY };
  }
  const key = coordsCacheKey(lat, lng);
  const cached = readCoordsCache(key);
  if (cached) {
    return { countryCode: cached.countryCode, currencyCode: cached.currencyCode };
  }
  const country = await fetchCountryFromCoords(lat, lng);
  const currency = currencyForCountry(country);
  const result: GeoCurrencyResult = { countryCode: country, currencyCode: currency };
  writeCoordsCache(key, result);
  return result;
}

// Test-only hook. Avoids exporting cache directly.
export function __resetGeoCurrencyCacheForTests(): void {
  cache.clear();
  coordsCache.clear();
}
