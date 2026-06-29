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
  referrer?: string;
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

function hasMarketingParam(url: URL): boolean {
  return MARKETING_PARAMS.some((p) => url.searchParams.has(p));
}

function buildTouch(url: URL, referrer: string): AttributionTouch {
  const touch: AttributionTouch = {
    captured_at: new Date().toISOString(),
    referrer: referrer || undefined,
    landing_page_url: url.href,
    landing_page_path: url.pathname + url.search,
  };
  for (const param of MARKETING_PARAMS) {
    const val = url.searchParams.get(param);
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

function readRaw(): StoredAttribution | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAttribution;
  } catch {
    return null;
  }
}

export function captureAttribution(href: string, referrer: string): void {
  try {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return;
    }
    if (!hasMarketingParam(url)) return;
    const touch = buildTouch(url, referrer);
    const existing = readRaw();
    const next: StoredAttribution = {
      first_touch:
        existing && !isExpired(existing.first_touch)
          ? existing.first_touch
          : touch,
      last_touch: touch,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — silent fallback
  }
}

export function readAttribution(): Attribution | null {
  try {
    const stored = readRaw();
    if (!stored) return null;
    if (isExpired(stored.first_touch)) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      return null;
    }
    return { first_touch: stored.first_touch, last_touch: stored.last_touch };
  } catch {
    return null;
  }
}
