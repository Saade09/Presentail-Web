import { API_BASE } from "@/lib/stripe";
import { loadStoredFbc } from "@/lib/analytics";

export type FbMobileEventName =
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

export type FbMobileEventParams = {
  countryCode: string | null | undefined;
  /** Client-generated event ID for Facebook CAPI deduplication. When provided,
   * the server forwards it to sendCapiEvent so Facebook can match this mobile
   * app event against any web pixel event for the same purchase. */
  eventId?: string;
  value?: number;
  currency?: string;
  contentIds?: string[];
  contentName?: string;
  email?: string;
  phone?: string;
};

const ENABLED =
  process.env.EXPO_PUBLIC_FB_PIXEL_ENABLED !== "false" &&
  process.env.EXPO_PUBLIC_FB_PIXEL_ENABLED !== "0";

/**
 * Fire a Facebook CAPI event from the mobile app.
 *
 * Automatically loads the stored `fbc` value (captured from the Facebook ad
 * deep-link that opened the app) and forwards it to the server so Meta can
 * attribute the event to the originating ad click — even after the shopper
 * has navigated away from the landing URL.
 *
 * Fire-and-forget: never awaited, never throws, never blocks UI.
 * Cyprus country code and missing env-var config are silently skipped
 * server-side.
 */
export function trackFbMobileEvent(
  event: FbMobileEventName,
  params: FbMobileEventParams,
): void {
  if (!ENABLED) return;

  const { countryCode, ...rest } = params;
  if (!countryCode) return;

  void (async () => {
    const body: Record<string, unknown> = { event, countryCode };
    if (rest.eventId) body.eventId = rest.eventId;
    if (rest.value != null) body.value = rest.value;
    if (rest.currency) body.currency = rest.currency;
    if (rest.contentIds && rest.contentIds.length > 0) body.contentIds = rest.contentIds;
    if (rest.contentName) body.contentName = rest.contentName;
    if (rest.email) body.email = rest.email;
    if (rest.phone) body.phone = rest.phone;

    // Load the fbc value captured from the Facebook ad deep-link that opened
    // the app.  Best-effort: if AsyncStorage is unavailable the field is simply
    // omitted and the event is still sent without attribution.
    try {
      const fbc = await loadStoredFbc();
      if (fbc) body.fbc = fbc;
    } catch {
      // storage unavailable — proceed without fbc
    }

    try {
      void fetch(`${API_BASE}/api/fb/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    } catch {
      // best-effort; never block UI on pixel events
    }
  })();
}
