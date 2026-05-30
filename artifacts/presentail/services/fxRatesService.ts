import AsyncStorage from "@react-native-async-storage/async-storage";

import { applyFxRates, type CurrencyCode } from "@/data/currencies";
import { API_BASE } from "@/lib/stripe";
import { getStoredStoreHeaders } from "@/lib/storeHeaders";
import { trackEvent } from "@/lib/analytics";

type FxRatesResponse = {
  ok: boolean;
  base?: string;
  rates?: Record<string, number>;
  fetchedAt?: number;
  source?: "live" | "fallback";
};

type CachedFxRates = {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
  source: "live" | "fallback";
  cachedAt: number;
};

const CACHE_KEY = "@presentail/fx-rates-v1";
// How long a cached rate is considered "fresh enough" not to need a refresh.
// We still revalidate in the background after this, but we won't discard the
// cached values (they remain a usable stale fallback indefinitely).
const FRESH_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const FETCH_TIMEOUT_MS = 5000;

async function readCache(): Promise<CachedFxRates | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFxRates;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.rates ||
      typeof parsed.rates !== "object"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(value: CachedFxRates): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Cache is best-effort.
  }
}

async function fetchLiveRates(): Promise<CachedFxRates | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/api/fx/rates`, {
      headers: { Accept: "application/json", ...getStoredStoreHeaders() },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as FxRatesResponse;
    if (!json.ok || !json.rates) return null;
    const result: CachedFxRates = {
      base: json.base ?? "USD",
      rates: json.rates,
      fetchedAt: typeof json.fetchedAt === "number" ? json.fetchedAt : Date.now(),
      source: json.source ?? "live",
      cachedAt: Date.now(),
    };
    if (result.source === "fallback") {
      // Fire-and-forget: log to analytics so ops can see fallback exposure
      // on the mobile side alongside the server-side Slack alert.
      trackEvent({ name: "fx_rates_fallback" });
    }
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hydrate the in-memory CURRENCIES rates from the on-device cache, if any.
 * Returns true if cached rates were applied. Synchronous-feeling at the call
 * site (single AsyncStorage read) — meant to be awaited *before* first paint
 * so the UI doesn't flicker from static-fallback to live values.
 */
export async function hydrateFxRatesFromCache(): Promise<boolean> {
  const cached = await readCache();
  if (!cached) return false;
  applyFxRates(cached.rates as Partial<Record<CurrencyCode, number>>);
  return true;
}

/**
 * Stale-while-revalidate refresh. Resolves quickly with whatever's cached
 * (applying it immediately), then revalidates against the server in the
 * background and updates the in-memory rates + cache when the network call
 * completes. The returned promise resolves to `true` if rates were updated
 * during this call (either from cache or from the network).
 *
 * Never blocks startup: callers can fire-and-forget. Failures leave the
 * static fallback (or last-known cache) in place.
 */
export async function refreshFxRates(
  options: { applyCacheFirst?: boolean } = {},
): Promise<boolean> {
  const { applyCacheFirst = true } = options;
  const cached = await readCache();
  let appliedFromCache = false;
  if (cached && applyCacheFirst) {
    applyFxRates(cached.rates as Partial<Record<CurrencyCode, number>>);
    appliedFromCache = true;
  }

  const cacheIsFresh =
    cached != null &&
    cached.source === "live" &&
    Date.now() - cached.cachedAt < FRESH_TTL_MS;

  if (cacheIsFresh) {
    return appliedFromCache;
  }

  const live = await fetchLiveRates();
  if (!live) return appliedFromCache;

  applyFxRates(live.rates as Partial<Record<CurrencyCode, number>>);
  // Only persist live results to the cache — we don't want to overwrite a
  // previously good live snapshot with a server-side fallback response.
  if (live.source === "live") {
    await writeCache(live);
  }
  return true;
}
