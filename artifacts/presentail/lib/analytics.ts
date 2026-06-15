import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { API_BASE } from "@/lib/stripe";

type AnalyticsEventName =
  | "checkout_login_prompt_viewed"
  | "checkout_login_prompt_action"
  | "signin_page_action"
  | "cart_viewed"
  | "checkout_started"
  | "payment_method_selected"
  | "order_placed"
  | "auth_social_failed"
  | "suggested_message_picked"
  | "upsell_tab_clicked"
  | "upsell_item_added"
  | "upsell_checkout_proceeded"
  | "order_push_tapped"
  | "fx_rates_fallback"
  | "mobile_ttid"
  | "payment_error"
  | "signup_step_completed";

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
  | "apple_pay"
  | "google_pay"
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
  | "candles"
  | "home"
  | "product"
  | "brand"
  | "category"
  | "occasion"
  | "network"
  | "provider"
  | "namePassword"
  | "otp";

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  surface?: AnalyticsSurface;
  action?: AnalyticsAction;
  errorCode?: string;
  productId?: string;
  state?: string;
  appOrderId?: string;
  wcOrderId?: string;
  metricValue?: number;
};

const SESSION_STORAGE_KEY = "@presentail/analytics_session";
const SESSION_TTL_MS = 30 * 60 * 1000;

type StoredSession = { id: string; lastSeen: number };

function generateSessionId(): string {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${(Math.floor(Math.random() * 4) + 8).toString(16)}${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}

async function loadOrCreateSessionId(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const stored: StoredSession = JSON.parse(raw) as StoredSession;
      if (
        typeof stored.id === "string" &&
        typeof stored.lastSeen === "number" &&
        Date.now() - stored.lastSeen < SESSION_TTL_MS
      ) {
        return stored.id;
      }
    }
  } catch {
    // storage unavailable — fall through to generate a fresh id
  }
  const id = generateSessionId();
  try {
    await AsyncStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ id, lastSeen: Date.now() } satisfies StoredSession),
    );
  } catch {
    // best-effort
  }
  return id;
}

async function touchSession(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ id, lastSeen: Date.now() } satisfies StoredSession),
    );
  } catch {
    // best-effort
  }
}

const sessionIdPromise: Promise<string> = loadOrCreateSessionId();

function resolvePlatform(): "ios" | "android" | "web" {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

function resolveAppVersion(): string | undefined {
  const v = Constants.expoConfig?.version;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Screen time-to-interactive helper for mobile.
 *
 * Call once per screen mount when the primary content is ready to display.
 * `startMs` should be `Date.now()` captured at the earliest measurable
 * point (module load for the home screen, component mount for detail screens).
 * The elapsed value is clamped to [0, 60 000] ms server-side.
 *
 * Fires at most once per `screen` value per JS runtime lifetime so that
 * background/foreground cycles or React strict-mode double-invocations do
 * not inflate the sample count.
 */
const _ttidFired = new Set<string>();
export function trackScreenTTID(screen: "home" | "product" | "brand" | "category" | "occasion", startMs: number): void {
  if (_ttidFired.has(screen)) return;
  _ttidFired.add(screen);
  const elapsed = Math.max(0, Date.now() - startMs);
  trackEvent({ name: "mobile_ttid", action: screen, metricValue: elapsed });
}

export function trackEvent(event: AnalyticsEvent): void {
  void (async () => {
    const sessionId = await sessionIdPromise;
    void touchSession(sessionId);
    const payload = JSON.stringify({
      ...event,
      platform: resolvePlatform(),
      appVersion: resolveAppVersion(),
      sessionId,
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
  })();
}
