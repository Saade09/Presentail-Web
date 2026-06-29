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

// Loopback / private ranges that no public IP-geolocation service can resolve.
// We short-circuit these locally so dev environments (and any internal proxy
// hop that leaks into req.ip) return the USD fallback cleanly without an
// outbound HTTP call.
export function isPrivateOrLoopback(ip: string): boolean {
  if (!ip) return true;
  // Strip any IPv6-mapped IPv4 prefix.
  const v = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (v === "::1" || v === "127.0.0.1" || v === "localhost") return true;
  if (v.startsWith("10.")) return true;
  if (v.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(v)) return true;
  // 100.64.0.0/10 — carrier-grade NAT / shared address space (RFC 6598).
  // Replit's internal mesh sometimes surfaces these via x-forwarded-for and
  // they are never globally routable, so treat them like private ranges.
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(v)) return true;
  // 169.254.0.0/16 — link-local
  if (v.startsWith("169.254.")) return true;
  // IPv6 unique local / link local
  if (/^f[cd][0-9a-f]{2}:/i.test(v)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(v)) return true;
  return false;
}

/**
 * Pick the real client IP from an x-forwarded-for chain. Returns the
 * leftmost entry that is publicly routable. Falls back to `req.ip` when
 * the header is missing or every entry is private. Used in production
 * because Replit puts requests through more than one proxy hop, so
 * `app.set("trust proxy", 1)` alone leaves `req.ip` pointing at an
 * internal hop and IP geolocation always returns USD.
 */
export function pickClientIp(
  forwardedFor: string | string[] | undefined,
  fallbackIp: string,
): string {
  const raw = Array.isArray(forwardedFor)
    ? forwardedFor.join(",")
    : (forwardedFor ?? "");
  const candidates = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const c of candidates) {
    const stripped = c.startsWith("::ffff:") ? c.slice(7) : c;
    if (!isPrivateOrLoopback(stripped)) return stripped;
  }
  return fallbackIp;
}

type CacheEntry = {
  countryCode: string | null;
  currencyCode: SupportedCurrency;
  expiresAt: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h positive cache
// Negative results are cached only briefly so a transient upstream blip
// can't pin a real visitor to USD for an hour. Long enough to stop a
// rapid-fire client from hammering the upstream provider.
const NEGATIVE_CACHE_TTL_MS = 60 * 1000; // 60s negative cache
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

function writeCache(
  ip: string,
  entry: Omit<CacheEntry, "expiresAt">,
  ttlMs: number,
): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    // Naive eviction: drop the oldest insertion. Map preserves insertion order.
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(ip, { ...entry, expiresAt: Date.now() + ttlMs });
}

const LOOKUP_TIMEOUT_MS = 1500;

export type IpLookupOutcome = {
  country: string | null;
  /** Which provider was actually consulted. `null` when no call was made. */
  provider: "ipapi.co" | "ipwho.is" | null;
  /** Short reason for the outcome — useful for log instrumentation. */
  reason:
    | "ok"
    | "non-2xx"
    | "rate-limited"
    | "error-body"
    | "invalid-body"
    | "timeout"
    | "network-error"
    | "all-failed";
};

async function fetchFromIpapi(ip: string): Promise<IpLookupOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    // ipapi.co's free endpoint returns a 2-letter country code as plain text,
    // BUT on rate-limit / error it returns a JSON body like
    // `{"error": true, "reason": "RateLimited"}` with a 200 OK. We have to
    // detect that explicitly — historically the code only checked
    // `text.startsWith("{")` and treated that as a generic failure, hiding
    // the rate-limit signal that would have told us to use a fallback.
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
      headers: { Accept: "text/plain, application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { country: null, provider: "ipapi.co", reason: "non-2xx" };
    }
    const text = (await res.text()).trim();
    if (!text) {
      return { country: null, provider: "ipapi.co", reason: "invalid-body" };
    }
    if (text.startsWith("{")) {
      // JSON error envelope — typically rate-limited.
      try {
        const parsed = JSON.parse(text) as { error?: unknown; reason?: unknown };
        if (parsed?.error === true) {
          const reason =
            typeof parsed.reason === "string" &&
            /rate.?limit/i.test(parsed.reason)
              ? "rate-limited"
              : "error-body";
          return { country: null, provider: "ipapi.co", reason };
        }
      } catch {
        // fallthrough to invalid-body
      }
      return { country: null, provider: "ipapi.co", reason: "error-body" };
    }
    const token = text.split(/\s+/)[0];
    if (token && /^[A-Za-z]{2}$/.test(token)) {
      return { country: token.toUpperCase(), provider: "ipapi.co", reason: "ok" };
    }
    return { country: null, provider: "ipapi.co", reason: "invalid-body" };
  } catch (err) {
    const reason = (err as { name?: string })?.name === "AbortError" ? "timeout" : "network-error";
    return { country: null, provider: "ipapi.co", reason };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromIpwhois(ip: string): Promise<IpLookupOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    // ipwho.is is a keyless backup provider used when ipapi.co rate-limits us.
    // Returns JSON; `success: false` indicates a failed lookup. Quota is
    // generous enough to cover transient ipapi.co outages.
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,message`,
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      return { country: null, provider: "ipwho.is", reason: "non-2xx" };
    }
    const json = (await res.json()) as {
      success?: unknown;
      country_code?: unknown;
    };
    if (json?.success === false) {
      return { country: null, provider: "ipwho.is", reason: "error-body" };
    }
    const code = typeof json?.country_code === "string" ? json.country_code.trim() : "";
    if (code && /^[A-Za-z]{2}$/.test(code)) {
      return { country: code.toUpperCase(), provider: "ipwho.is", reason: "ok" };
    }
    return { country: null, provider: "ipwho.is", reason: "invalid-body" };
  } catch (err) {
    const reason = (err as { name?: string })?.name === "AbortError" ? "timeout" : "network-error";
    return { country: null, provider: "ipwho.is", reason };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve an IP to an ISO country, with a fallback provider if the primary
 * is rate-limited or down. Exposes the upstream outcome so the calling
 * route can log diagnostic detail.
 */
export async function lookupCountryFromIp(ip: string): Promise<IpLookupOutcome> {
  const primary = await fetchFromIpapi(ip);
  if (primary.country) return primary;
  // Only fall through to the secondary provider when the primary failed in
  // a way that's likely transient or quota-related. Don't bother retrying
  // for "invalid-body" (the IP probably has no geolocation data anywhere).
  if (
    primary.reason === "rate-limited" ||
    primary.reason === "error-body" ||
    primary.reason === "non-2xx" ||
    primary.reason === "timeout" ||
    primary.reason === "network-error"
  ) {
    const secondary = await fetchFromIpwhois(ip);
    if (secondary.country) return secondary;
    return { country: null, provider: "ipwho.is", reason: "all-failed" };
  }
  return primary;
}

export type GeoCurrencyResult = {
  countryCode: string | null;
  currencyCode: SupportedCurrency;
  /** Diagnostic detail about how this result was produced. */
  source: "private-ip" | "cache" | "lookup";
  /** Populated when `source === "lookup"`. */
  lookup?: IpLookupOutcome;
};

export async function resolveGeoCurrency(ip: string): Promise<GeoCurrencyResult> {
  if (!ip || isPrivateOrLoopback(ip)) {
    return {
      countryCode: null,
      currencyCode: FALLBACK_DISPLAY_CURRENCY,
      source: "private-ip",
    };
  }
  const cached = readCache(ip);
  if (cached) {
    return {
      countryCode: cached.countryCode,
      currencyCode: cached.currencyCode,
      source: "cache",
    };
  }
  const outcome = await lookupCountryFromIp(ip);
  const country = outcome.country;
  const currency = currencyForCountry(country);
  // Cache positive results for an hour, negative results only briefly so a
  // single rate-limited / errored response doesn't pin this IP to USD.
  writeCache(
    ip,
    { countryCode: country, currencyCode: currency },
    country ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS,
  );
  return {
    countryCode: country,
    currencyCode: currency,
    source: "lookup",
    lookup: outcome,
  };
}

/**
 * Variant that skips the IP lookup and only consults the country→currency
 * map. Used when an upstream edge (e.g. Cloudflare's `cf-ipcountry`) has
 * already resolved the country, so we don't need to spend an outbound HTTP
 * call or burn ipapi.co quota.
 */
export function geoCurrencyForCountry(country: string | null): GeoCurrencyResult {
  const upper = country ? country.trim().toUpperCase() : null;
  return {
    countryCode: upper,
    currencyCode: currencyForCountry(upper),
    source: "lookup",
    lookup: { country: upper, provider: null, reason: "ok" },
  };
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

function writeCoordsCache(
  key: string,
  entry: Omit<CacheEntry, "expiresAt">,
  ttlMs: number,
): void {
  if (coordsCache.size >= COORDS_MAX_CACHE_SIZE) {
    const firstKey = coordsCache.keys().next().value;
    if (firstKey) coordsCache.delete(firstKey);
  }
  coordsCache.set(key, { ...entry, expiresAt: Date.now() + ttlMs });
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

export type GeoCurrencyByCoordsResult = {
  countryCode: string | null;
  currencyCode: SupportedCurrency;
};

export async function resolveGeoCurrencyByCoords(
  lat: number,
  lng: number,
): Promise<GeoCurrencyByCoordsResult> {
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
  writeCoordsCache(
    key,
    { countryCode: country, currencyCode: currency },
    country ? COORDS_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS,
  );
  return { countryCode: country, currencyCode: currency };
}

// Test-only hook. Avoids exporting cache directly.
export function __resetGeoCurrencyCacheForTests(): void {
  cache.clear();
  coordsCache.clear();
}
