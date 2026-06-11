import { API_BASE } from "@/lib/stripe";

export type FbMobileEventName =
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

export type FbMobileEventParams = {
  countryCode: string | null | undefined;
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

  const body: Record<string, unknown> = { event, countryCode };
  if (rest.value != null) body.value = rest.value;
  if (rest.currency) body.currency = rest.currency;
  if (rest.contentIds && rest.contentIds.length > 0) body.contentIds = rest.contentIds;
  if (rest.contentName) body.contentName = rest.contentName;
  if (rest.email) body.email = rest.email;
  if (rest.phone) body.phone = rest.phone;

  try {
    void fetch(`${API_BASE}/api/fb/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    // best-effort; never block UI on pixel events
  }
}
