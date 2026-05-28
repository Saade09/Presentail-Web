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
  | "auth_social_failed"
  | "suggested_message_picked"
  | "upsell_tab_clicked"
  | "upsell_item_added"
  | "upsell_checkout_proceeded";

type AnalyticsSurface =
  | "cart"
  | "checkout-direct"
  | "cart-screen"
  | "checkout"
  | "upsell_cart";

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
  | "western"
  | "general"
  | "love"
  | "birthday"
  | "graduation"
  | "getWellSoon"
  | "newBabyBorn"
  | "thankYou"
  | "sympathy"
  | "recommended"
  | "single_balloons"
  | "balloon_bundles"
  | "chocolate"
  | "plants"
  | "bears"
  | "candles";

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  surface?: AnalyticsSurface;
  action?: AnalyticsAction;
  errorCode?: string;
  productId?: string;
};

function generateSessionId(): string {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${(Math.floor(Math.random() * 4) + 8).toString(16)}${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}

const SESSION_ID: string = generateSessionId();

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
    sessionId: SESSION_ID,
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
