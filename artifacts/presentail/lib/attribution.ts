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
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — silent fallback
  }
}

export async function readAttribution(): Promise<Attribution | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredAttribution;
    if (isExpired(stored.first_touch)) {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      return null;
    }
    return { first_touch: stored.first_touch, last_touch: stored.last_touch };
  } catch {
    return null;
  }
}
