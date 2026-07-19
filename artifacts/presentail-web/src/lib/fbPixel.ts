import type { CountrySlug } from "@/lib/locale-route";

const PIXEL_ID_LB = import.meta.env.VITE_FB_PIXEL_ID_LB as string | undefined;
const PIXEL_ID_AE = import.meta.env.VITE_FB_PIXEL_ID_AE as string | undefined;

function pixelIdForCountry(countrySlug: CountrySlug | null): string | null {
  if (countrySlug === "lb") return PIXEL_ID_LB ?? null;
  if (countrySlug === "ae") return PIXEL_ID_AE ?? null;
  return null;
}

let activePixelId: string | null = null;

/**
 * Set the active pixel ID for the current country. No-ops for CY/unknown or
 * when the corresponding env var is absent. Idempotent for repeat calls with
 * the same country.
 */
export function initPixel(countrySlug: CountrySlug | null): void {
  const pixelId = pixelIdForCountry(countrySlug);
  activePixelId = pixelId;
}

/**
 * Read the Facebook browser identifier (_fbp) from document.cookie.
 * Falls back to a locally generated token stored in localStorage so we
 * always send a stable identifier without loading fbevents.js.
 *
 * The generated fallback uses the documented _fbp format:
 *   fb.1.<timestamp_seconds>.<random_int>
 */
function getFbp(): string {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|;)\s*_fbp=([^;]+)/);
    if (match?.[1]) return match[1];
  }
  try {
    const stored = localStorage.getItem("_fbp_fallback");
    if (stored) return stored;
    const generated = `fb.1.${Math.floor(Date.now() / 1000)}.${Math.floor(Math.random() * 2147483648)}`;
    localStorage.setItem("_fbp_fallback", generated);
    return generated;
  } catch {
    return `fb.1.${Math.floor(Date.now() / 1000)}.${Math.floor(Math.random() * 2147483648)}`;
  }
}

/**
 * Read the Facebook click ID (_fbc) from the current page URL, cookie, or
 * persisted localStorage — in that priority order.
 *
 * Priority:
 *   1. Fresh `fbclid` URL param → formatted as `fb.1.<timestamp_ms>.<fbclid>`,
 *      persisted to localStorage under `_fbc_from_url` (overwrites stale value),
 *      and returned immediately.
 *   2. `_fbc` cookie (set by the Facebook pixel JS when loaded).
 *   3. Persisted `_fbc_from_url` from localStorage (carries the click ID across
 *      subsequent events in the same session after the initial URL load).
 *   4. `undefined` when nothing is available.
 */
function getFbclid(): string | undefined {
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const fbclid = params.get("fbclid");
      if (fbclid) {
        const fbc = `fb.1.${Date.now()}.${fbclid}`;
        try {
          localStorage.setItem("_fbc_from_url", fbc);
        } catch {
          // Ignore storage failures — still return the formatted value.
        }
        return fbc;
      }
    } catch {
      // Ignore URL-parsing errors.
    }
  }
  if (typeof document !== "undefined") {
    const cookieMatch = document.cookie.match(/(?:^|;)\s*_fbc=([^;]+)/);
    if (cookieMatch?.[1]) return cookieMatch[1];
  }
  try {
    const stored = localStorage.getItem("_fbc_from_url");
    if (stored) return stored;
  } catch {
    // Ignore storage failures.
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

function postPixelEvent(
  eventName: string,
  params?: FbPixelParams,
): void {
  if (!activePixelId) return;
  if (typeof fetch === "undefined") return;

  const pixelId = activePixelId;
  const fbp = getFbp();
  const fbclid = getFbclid();
  const sourceUrl =
    typeof window !== "undefined" ? window.location.href : undefined;

  const body: Record<string, unknown> = {
    eventName,
    pixelId,
    fbp,
    sourceUrl,
  };
  if (fbclid) body.fbclid = fbclid;
  if (params?.event_id) body.eventId = params.event_id;
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

/**
 * Fire a standard pixel event scoped to the active country pixel.
 * No-ops when no pixel is active (e.g. Cyprus or pixel env vars absent).
 */
export function trackFbEvent(event: string, params?: FbPixelParams): void {
  postPixelEvent(event, params);
}

/**
 * Fire a PageView pixel event scoped to the active country pixel.
 * No-ops when no pixel is active (e.g. Cyprus).
 */
export function trackFbPageView(): void {
  postPixelEvent("PageView");
}
