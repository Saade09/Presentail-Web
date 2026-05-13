import Constants from "expo-constants";
import { Platform } from "react-native";

import { API_BASE } from "@/lib/stripe";

type AnalyticsEventName =
  | "checkout_login_prompt_viewed"
  | "checkout_login_prompt_action"
  | "cart_viewed"
  | "checkout_started"
  | "payment_method_selected"
  | "order_placed"
  | "auth_social_failed";

type AnalyticsSurface = "cart" | "checkout-direct" | "cart-screen" | "checkout";

type AnalyticsAction =
  | "continue"
  | "google"
  | "apple"
  | "guest"
  | "dismissed"
  | "card"
  | "wallet"
  | "paypal"
  | "mamo"
  | "whish"
  | "western";

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  surface?: AnalyticsSurface;
  action?: AnalyticsAction;
  errorCode?: string;
};

function resolvePlatform(): "ios" | "android" | "web" {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

function resolveAppVersion(): string | undefined {
  const v = Constants.expoConfig?.version;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function trackEvent(event: AnalyticsEvent): void {
  const payload = JSON.stringify({
    ...event,
    platform: resolvePlatform(),
    appVersion: resolveAppVersion(),
  });
  try {
    void fetch(`${API_BASE}/api/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    }).catch(() => {});
  } catch {
    // best-effort; never block UI on analytics
  }
}
