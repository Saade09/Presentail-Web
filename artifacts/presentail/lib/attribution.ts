import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@presentail/attribution_v1";
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

const MARKETING_PARAMS = [
  "gclid",
  "gbraid",
  "wbraid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_id",
  "utm_term",
  "utm_content",
] as const;

type MarketingParam = (typeof MARKETING_PARAMS)[number];

export type AttributionTouch = {
  captured_at: string;
  landing_page_url?: string;
  landing_page_path?: string;
} & Partial<Record<MarketingParam, string>>;

export type Attribution = {
  first_touch: AttributionTouch;
  last_touch: AttributionTouch;
};

type StoredAttribution = {
  first_touch: AttributionTouch;
  last_touch: AttributionTouch;
};

/**
 * In-memory write-through cache.
 *
 * `captureAttributionFromUrl` requires two sequential AsyncStorage calls (read
 * then write) before the new attribution is visible to `readAttribution`. If
 * the checkout's `submitWooOrder` reads attribution during that async window
 * it would see `null` even though a fresh ad click just arrived.
 *
 * This cache is updated synchronously — before any I/O — the moment a URL
 * with marketing params is parsed, so `readAttribution` always sees the latest
 * captured attribution even if AsyncStorage hasn't committed yet.
 */
let _memCache: StoredAttribution | null = null;

function parseUrlParams(url: string): { params: URLSearchParams; href: string; path: string } {
  try {
    const parsed = new URL(url);
    return {
      params: parsed.searchParams,
      href: parsed.href,
      path: parsed.pathname + parsed.search,
    };
  } catch {
    const q = url.split("?")[1] ?? "";
    return { params: new URLSearchParams(q), href: url, path: url };
  }
}

function hasMarketingParam(params: URLSearchParams): boolean {
  return MARKETING_PARAMS.some((p) => params.has(p));
}

function buildTouch(href: string, path: string, params: URLSearchParams): AttributionTouch {
  const touch: AttributionTouch = {
    captured_at: new Date().toISOString(),
    landing_page_url: href,
    landing_page_path: path,
  };
  for (const param of MARKETING_PARAMS) {
    const val = params.get(param);
    if (val) touch[param] = val;
  }
  return touch;
}

function isExpired(touch: AttributionTouch): boolean {
  try {
    const ts = new Date(touch.captured_at).getTime();
    return Date.now() - ts > TTL_MS;
  } catch {
    return true;
  }
}

export async function captureAttributionFromUrl(url: string | null): Promise<void> {
  if (!url) return;
  try {
    const { params, href, path } = parseUrlParams(url);
    if (!hasMarketingParam(params)) return;
    const touch = buildTouch(href, path, params);

    // Write to the in-memory cache immediately — before any async I/O — so
    // readAttribution() returns the correct attribution even if AsyncStorage
    // hasn't committed yet. We use `touch` as an optimistic first_touch; it
    // is corrected once the existing stored value is read below.
    _memCache = { first_touch: touch, last_touch: touch };

    let existing: StoredAttribution | null = null;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) existing = JSON.parse(raw) as StoredAttribution;
    } catch {
      // ignore read error
    }
    const next: StoredAttribution = {
      first_touch:
        existing && !isExpired(existing.first_touch)
          ? existing.first_touch
          : touch,
      last_touch: touch,
    };

    // Update the cache with the definitive first_touch now that we have it.
    _memCache = next;

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — silent fallback
  }
}

export async function readAttribution(): Promise<Attribution | null> {
  // Fast path: return from the in-memory cache if present and not expired.
  // This covers the window between captureAttributionFromUrl parsing a URL
  // (synchronous) and the AsyncStorage write completing (async).
  if (_memCache && !isExpired(_memCache.first_touch)) {
    return { first_touch: _memCache.first_touch, last_touch: _memCache.last_touch };
  }

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredAttribution;
    if (isExpired(stored.first_touch)) {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      return null;
    }
    // Warm the cache from storage so subsequent reads are instant.
    _memCache = stored;
    return { first_touch: stored.first_touch, last_touch: stored.last_touch };
  } catch {
    return null;
  }
}
