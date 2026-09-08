import type { CountrySlug } from "@/lib/locale-route";

const PIXEL_ID_LB = import.meta.env.VITE_FB_PIXEL_ID_LB as string | undefined;
const PIXEL_ID_AE = import.meta.env.VITE_FB_PIXEL_ID_AE as string | undefined;

function pixelIdForCountry(countrySlug: CountrySlug | null): string | null {
  if (countrySlug === "lb") return PIXEL_ID_LB ?? null;
  if (countrySlug === "ae") return PIXEL_ID_AE ?? null;
  return null;
}

let activePixelId: string | null = null;
let lastPageViewKey: string | null = null;

/**
 * Set the active pixel ID for the current country. No-ops for CY/unknown or
 * when the corresponding env var is absent. Idempotent for repeat calls with
 * the same country.
 */
export function initPixel(countrySlug: CountrySlug | null): string | null {
  const pixelId = pixelIdForCountry(countrySlug);
  activePixelId = pixelId;
  if (!pixelId || typeof window === "undefined" || !window.fbq) return pixelId;

  const initialized = new Set(window.__presentailMetaInitializedPixels ?? []);
  if (!initialized.has(pixelId)) {
    window.fbq("init", pixelId);
    initialized.add(pixelId);
    window.__presentailMetaInitializedPixels = [...initialized];
  }
  return pixelId;
}

/**
 * Read the Facebook browser identifier (_fbp) from document.cookie.
 * Never fabricate this value: only fbevents.js can create an identifier that
 * Meta can match to its browser-side data.
 */
function getFbp(): string | undefined {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|;)\s*_fbp=([^;]+)/);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  return undefined;
}

/**
 * Read the pre-formatted Facebook click identifier captured synchronously by
 * index.html. Reading the URL here is intentionally forbidden: React effects
 * run after AttributionTracker has cleaned fbclid from the visible URL.
 */
function getFbclid(): string | undefined {
  if (typeof document !== "undefined") {
    const cookieMatch = document.cookie.match(/(?:^|;)\s*_fbc=([^;]+)/);
    if (cookieMatch?.[1]) {
      try {
        return decodeURIComponent(cookieMatch[1]);
      } catch {
        return cookieMatch[1];
      }
    }
  }
  return undefined;
}

export type FbPixelParams = {
  content_name?: string;
  content_ids?: string[];
  content_type?: string;
  value?: number;
  currency?: string;
  num_items?: number;
  event_id?: string;
  /**
   * Customer data to improve Meta event match quality.
   * All fields are plain-text — hashed server-side before being sent to Meta.
   * Never log or expose these values in browser DevTools or error messages.
   */
  userData?: {
    /** Plain-text email address. */
    em?: string;
    /** Plain-text first name. */
    fn?: string;
    /** Plain-text last name. */
    ln?: string;
    /** Plain-text phone number (local or international format). */
    ph?: string;
  };
};

function createEventId(eventName: string): string {
  const prefix = `fb-${eventName.toLowerCase()}`;
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function relayPixelEvent(
  eventName: string,
  eventId: string,
  params?: FbPixelParams,
  sourceUrl?: string,
): void {
  if (!activePixelId) return;
  if (typeof fetch === "undefined") return;

  const pixelId = activePixelId;
  const fbp = getFbp();
  const fbclid = getFbclid();

  const body: Record<string, unknown> = {
    eventName,
    pixelId,
    eventId,
    sourceUrl:
      sourceUrl ??
      (typeof window !== "undefined" ? window.location.href : undefined),
  };
  if (fbp) body.fbp = fbp;
  if (fbclid) body.fbclid = fbclid;
  if (params?.value != null) body.value = params.value;
  if (params?.currency) body.currency = params.currency;
  if (params?.content_ids) body.contentIds = params.content_ids;
  if (params?.content_name) body.contentName = params.content_name;
  if (params?.num_items != null) body.numItems = params.num_items;

  // Collect whichever user-data fields the caller supplied, sending only
  // non-empty values. Fields are hashed server-side.
  if (params?.userData) {
    const ud: Record<string, string> = {};
    if (params.userData.em) ud.em = params.userData.em;
    if (params.userData.fn) ud.fn = params.userData.fn;
    if (params.userData.ln) ud.ln = params.userData.ln;
    if (params.userData.ph) ud.ph = params.userData.ph;
    if (Object.keys(ud).length > 0) body.userData = ud;
  }

  fetch("/api/pixel/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {
    // Fire-and-forget — never surface analytics failures to the user.
  });
}

function browserPixelParams(params?: FbPixelParams): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (params?.content_name) result.content_name = params.content_name;
  if (params?.content_ids) result.content_ids = params.content_ids;
  if (params?.content_type) result.content_type = params.content_type;
  if (params?.value != null) result.value = params.value;
  if (params?.currency) result.currency = params.currency;
  if (params?.num_items != null) result.num_items = params.num_items;
  return result;
}

/**
 * Fire a standard pixel event scoped to the active country pixel.
 * No-ops when no pixel is active (e.g. Cyprus or pixel env vars absent).
 */
export function trackFbEvent(event: string, params?: FbPixelParams): void {
  if (!activePixelId) return;
  const eventId = params?.event_id ?? createEventId(event);
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq(
      "trackSingle",
      activePixelId,
      event,
      browserPixelParams(params),
      { eventID: eventId },
    );
  }
  relayPixelEvent(event, eventId, params);
}

/**
 * Fire a PageView pixel event scoped to the active country pixel.
 * No-ops when no pixel is active (e.g. Cyprus).
 */
export function trackFbPageView(): void {
  if (!activePixelId || typeof window === "undefined") return;
  const pageKey = `${activePixelId}:${window.location.pathname}`;
  if (pageKey === lastPageViewKey) return;
  lastPageViewKey = pageKey;

  const initial = window.__presentailMetaInitialPageView;
  if (
    initial &&
    !initial.relayed &&
    initial.pixelId === activePixelId &&
    initial.pathname === window.location.pathname
  ) {
    initial.relayed = true;
    relayPixelEvent("PageView", initial.eventId, undefined, initial.sourceUrl);
    return;
  }
  trackFbEvent("PageView");
}
