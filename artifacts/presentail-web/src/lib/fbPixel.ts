import type { CountrySlug } from "@/lib/locale-route";

const PIXEL_ID_LB = import.meta.env.VITE_FB_PIXEL_ID_LB as string | undefined;
const PIXEL_ID_AE = import.meta.env.VITE_FB_PIXEL_ID_AE as string | undefined;

function pixelIdForCountry(countrySlug: CountrySlug | null): string | null {
  if (countrySlug === "lb") return PIXEL_ID_LB ?? null;
  if (countrySlug === "ae") return PIXEL_ID_AE ?? null;
  return null;
}

/**
 * The pixel ID last passed to fbq('init'). null = no pixel active (CY, unknown,
 * or env var absent). All event calls use fbq('trackSingle', activePixelId, ...)
 * so events are scoped to exactly the active pixel even when multiple pixels have
 * been initialized in the same session (e.g. LB→AE SPA navigation).
 */
let activePixelId: string | null = null;

type AnyFn = (...args: unknown[]) => void;

interface FbqObj extends AnyFn {
  callMethod?: AnyFn;
  push: AnyFn;
  loaded: boolean;
  version: string;
  queue: unknown[];
}

function getFbq(): FbqObj | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { fbq?: FbqObj }).fbq;
}

function injectPixelScript(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { fbq?: FbqObj; _fbq?: FbqObj };
  if (w.fbq) return;

  const queue: unknown[] = [];
  const fn: AnyFn = function (...args: unknown[]) {
    if ((fn as unknown as FbqObj).callMethod) {
      ((fn as unknown as FbqObj).callMethod as AnyFn)(...args);
    } else {
      queue.push(args);
    }
  };
  const fbqObj = fn as unknown as FbqObj;
  fbqObj.push = fn;
  fbqObj.loaded = true;
  fbqObj.version = "2.0";
  fbqObj.queue = queue;
  w.fbq = fbqObj;
  if (!w._fbq) w._fbq = fbqObj;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  const firstScript = document.getElementsByTagName("script")[0];
  firstScript?.parentNode?.insertBefore(script, firstScript);
}

/**
 * Call on every country change (including initial load) from FbPixelTracker.
 *
 * - Injects fbevents.js on first call to a trackable country (LB/AE).
 * - Calls fbq('init', pixelId) when a new pixel ID is needed.
 * - Sets activePixelId = null for CY/unknown so subsequent event calls no-op.
 * - Subsequent trackFbEvent calls use trackSingle(activePixelId) so only the
 *   active country's pixel receives events, even if another was previously init'd.
 */
export function initPixel(countrySlug: CountrySlug | null): void {
  if (typeof window === "undefined") return;
  const pixelId = pixelIdForCountry(countrySlug);

  if (!pixelId) {
    activePixelId = null;
    return;
  }

  if (pixelId === activePixelId) return;

  injectPixelScript();
  const fn = getFbq();
  if (!fn) return;
  fn("init", pixelId);
  activePixelId = pixelId;
}

export type FbPixelParams = {
  content_name?: string;
  content_ids?: string[];
  content_type?: string;
  value?: number;
  currency?: string;
  num_items?: number;
  event_id?: string;
};

/**
 * Fire a standard pixel event scoped to the active country pixel via trackSingle.
 * No-ops when no pixel is active (e.g. Cyprus or pixel env vars absent).
 */
export function trackFbEvent(event: string, params?: FbPixelParams): void {
  if (!activePixelId) return;
  const fn = getFbq();
  if (!fn) return;
  if (params !== undefined) {
    fn("trackSingle", activePixelId, event, params);
  } else {
    fn("trackSingle", activePixelId, event);
  }
}

/**
 * Fire a PageView pixel event scoped to the active country pixel via trackSingle.
 * No-ops when no pixel is active (e.g. Cyprus).
 */
export function trackFbPageView(): void {
  if (!activePixelId) return;
  const fn = getFbq();
  if (!fn) return;
  fn("trackSingle", activePixelId, "PageView");
}
