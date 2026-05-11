import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import {
  FALLBACK_CURRENCY_CODE,
  currencyForCountry,
  isSupportedCurrencyCode,
  type CurrencyCode,
} from "@/data/currencies";
import { API_BASE } from "@/lib/stripe";

const TIMEOUT_MS = 4000;
// Short cap for the device-location read so a slow GPS lock can't block the
// first paint. We only need a coarse country-level fix; if it doesn't arrive
// quickly, the IP-based fallback is good enough.
const LOCATION_TIMEOUT_MS = 4000;
const PERMISSION_ASKED_KEY = "@presentail/location-permission-asked-v1";

export type GeoLookupResult = {
  countryCode: string | null;
  currencyCode: CurrencyCode;
};

let inFlight: Promise<GeoLookupResult> | null = null;
let cached: GeoLookupResult | null = null;
let deviceCached: GeoLookupResult | null = null;
let deviceInFlight: Promise<GeoLookupResult | null> | null = null;

function parseGeoResponse(json: unknown): GeoLookupResult {
  const obj = (json ?? {}) as { countryCode?: unknown; currencyCode?: unknown };
  const country =
    typeof obj.countryCode === "string" && obj.countryCode.trim()
      ? obj.countryCode.trim().toUpperCase()
      : null;
  const currency: CurrencyCode =
    typeof obj.currencyCode === "string" && isSupportedCurrencyCode(obj.currencyCode)
      ? obj.currencyCode
      : currencyForCountry(country);
  return { countryCode: country, currencyCode: currency };
}

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
      const result = parseGeoResponse(await res.json());
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

/** Whether the app has already shown the foreground-location prompt at least
 *  once on this install (regardless of grant/deny). Used so first-launch
 *  detection only triggers the system prompt one time. */
export async function hasAskedLocationPermission(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(PERMISSION_ASKED_KEY);
    return v === "1";
  } catch {
    return false;
  }
}

async function markLocationPermissionAsked(): Promise<void> {
  try {
    await AsyncStorage.setItem(PERMISSION_ASKED_KEY, "1");
  } catch {
    // best-effort
  }
}

type DetectDeviceOptions = {
  /** When true, ignore the "already asked" flag and re-prompt. Used by the
   *  manual "Detect from my location" button in settings. */
  force?: boolean;
};

/**
 * Ask the user for foreground location permission (only on the first call,
 * unless `force` is set), read a single low-accuracy fix, and resolve it to
 * a country + display currency via the server's
 * `/api/geo/currency-by-coords` endpoint.
 *
 * Returns `null` on every failure path (denied permission, timeout, network
 * error, no GPS, web platform, etc.) so the caller can transparently fall
 * back to the IP-based detection without surfacing an error to the user.
 * Never throws.
 */
export async function detectGeoFromDeviceLocation(
  opts: DetectDeviceOptions = {},
): Promise<GeoLookupResult | null> {
  if (Platform.OS === "web") return null;
  if (deviceCached && !opts.force) return deviceCached;
  if (deviceInFlight && !opts.force) return deviceInFlight;

  const run = (async (): Promise<GeoLookupResult | null> => {
    let Location: typeof import("expo-location");
    try {
      Location = await import("expo-location");
    } catch {
      return null;
    }

    try {
      const existing = await Location.getForegroundPermissionsAsync();
      let status = existing.status;
      const canAskAgain = existing.canAskAgain ?? true;
      const alreadyAsked = await hasAskedLocationPermission();

      if (status !== "granted") {
        // Skip the system prompt unless the caller explicitly opts in
        // (force) or this is genuinely the first time we're asking.
        if (!opts.force && alreadyAsked) return null;
        if (!canAskAgain) {
          await markLocationPermissionAsked();
          return null;
        }
        const requested = await Location.requestForegroundPermissionsAsync();
        await markLocationPermissionAsked();
        status = requested.status;
      } else {
        await markLocationPermissionAsked();
      }

      if (status !== "granted") return null;

      const positionPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Lowest,
      });
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS),
      );
      const position = await Promise.race([positionPromise, timeoutPromise]);
      if (!position || !position.coords) return null;

      const { latitude, longitude } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const url =
          `${API_BASE}/api/geo/currency-by-coords` +
          `?lat=${encodeURIComponent(String(latitude))}` +
          `&lng=${encodeURIComponent(String(longitude))}`;
        const res = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const result = parseGeoResponse(await res.json());
        if (!result.countryCode) return null;
        deviceCached = result;
        return result;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  })();

  deviceInFlight = run;
  try {
    return await run;
  } finally {
    deviceInFlight = null;
  }
}
