type WebEventType =
  | "product_view"
  | "add_to_cart"
  | "checkout_step"
  | "payment_started"
  | "payment_completed"
  | "promo_applied"
  | "promo_failed";

export type WebEventItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

export type WebEvent = {
  type: WebEventType;
  sessionId?: string;
  value?: number;
  currency?: string;
  brand?: string;
  city?: string;
  items?: WebEventItem[];
  properties?: Record<string, unknown>;
};

const WEB_EVENTS_API_KEY = (import.meta.env.VITE_OS_API_KEY as string | undefined) ?? "";

/**
 * Post a web funnel event to `/api/web-events`. Uses the same
 * sessionId managed by this module so the server can correlate
 * web funnel events with the existing purchase-funnel monitors.
 * Best-effort: failures are swallowed silently.
 */
export function trackWebEvent(event: WebEvent): void {
  if (typeof window === "undefined") return;
  SESSION_ID = getOrCreateSessionId();
  const payload = JSON.stringify({ ...event, sessionId: SESSION_ID });
  try {
    void fetch("/api/web-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": WEB_EVENTS_API_KEY,
      },
      body: payload,
      keepalive: true,
    }).catch(() => {});
    touchSession();
  } catch {
    // best-effort; never block UI on analytics
  }
}

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
  | "upsell_checkout_proceeded"
  | "signin_page_action"
  | "seo_entity_fetch_failed"
  | "web_vital"
  | "payment_error"
  | "signup_step_completed"
  | "payment_wallet_opened"
  | "payment_wallet_fallback"
  | "banner_clicked"
  | "product_unavailable_city_viewed"
  | "shop_selected_city_clicked"
  | "switch_back_city_clicked"
  | "browse_category_selected_city_clicked"
  | "recommended_product_clicked";

type AnalyticsSurface =
  | "cart"
  | "checkout-direct"
  | "cart-screen"
  | "checkout"
  | "upsell_modal";

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
  | "LCP"
  | "INP"
  | "CLS"
  | "TTFB"
  | "FCP"
  | "network"
  | "provider"
  | "catalog_cold"
  | "namePassword"
  | "otp";

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  surface?: AnalyticsSurface;
  action?: AnalyticsAction;
  appVersion?: string;
  errorCode?: string;
  productId?: string;
  metricValue?: number;
  /** Optional platform override. When set, takes precedence over the default "web" value added by trackEvent. */
  platform?: string;
  /** banner_clicked fields */
  bannerId?: string;
  linkKind?: string;
  linkSlug?: string;
  linkUrl?: string;
  /** recommended_product_clicked: 1-based position in the recommendations row */
  recommendationPosition?: number;
};

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${(Math.floor(Math.random() * 4) + 8).toString(16)}${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}

const SESSION_ID_KEY = "@presentail/analytics-session-id";
const SESSION_LAST_SEEN_KEY = "@presentail/analytics-session-last-seen";
const SESSION_TTL_MS = 30 * 60 * 1000;

let inMemoryFallbackId: string | null = null;

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(SESSION_ID_KEY);
    const lastSeenRaw = localStorage.getItem(SESSION_LAST_SEEN_KEY);
    const lastSeen = lastSeenRaw ? parseInt(lastSeenRaw, 10) : 0;
    if (existing && Date.now() - lastSeen < SESSION_TTL_MS) {
      return existing;
    }
    const next = generateSessionId();
    localStorage.setItem(SESSION_ID_KEY, next);
    localStorage.setItem(SESSION_LAST_SEEN_KEY, String(Date.now()));
    inMemoryFallbackId = null;
    return next;
  } catch {
    if (!inMemoryFallbackId) inMemoryFallbackId = generateSessionId();
    return inMemoryFallbackId;
  }
}

function touchSession(): void {
  try {
    localStorage.setItem(SESSION_LAST_SEEN_KEY, String(Date.now()));
  } catch {
    // best-effort
  }
}

let SESSION_ID: string = getOrCreateSessionId();

export function trackEvent(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  SESSION_ID = getOrCreateSessionId();
  // platform: "web" is the default; event.platform overrides it when explicitly set.
  const payload = JSON.stringify({ platform: "web", ...event, sessionId: SESSION_ID });
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/analytics/events", blob)) {
        touchSession();
        return;
      }
    }
  } catch {
    // fall through to fetch
  }
  try {
    void fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      credentials: "include",
      keepalive: true,
    }).catch(() => {});
    touchSession();
  } catch {
    // best-effort; never block UI on analytics
  }
}

/**
 * Detect whether the current browser context is a mobile or desktop web
 * session. Used exclusively for `web_vital` events so the dashboard can
 * show per-device-type sparklines.
 *
 * Priority:
 *  1. `navigator.userAgentData.mobile` (Chromium 90+, boolean, accurate)
 *  2. Viewport-width heuristic (< 768 px → mobile_web)
 */
function detectWebPlatform(): "mobile_web" | "desktop_web" {
  try {
    if (typeof navigator !== "undefined") {
      const uad = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData;
      if (uad?.mobile === true) return "mobile_web";
      if (uad?.mobile === false) return "desktop_web";
    }
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) return "mobile_web";
  } catch {
    // best-effort
  }
  return "desktop_web";
}

/**
 * Register web-vitals reporters. Call once from the app entry point.
 * Each metric is reported at most once per page load. The function is
 * a no-op in non-browser environments.
 *
 * Uses `reportAllChanges: false` so each metric is sent once (final
 * value) rather than on every update — keeps event volume low while
 * still capturing the authoritative reading.
 *
 * Each `web_vital` event carries a `platform` of `mobile_web` or
 * `desktop_web` so the dashboard can split LCP/INP/CLS by device type.
 */
export function trackWebVitals(): void {
  if (typeof window === "undefined") return;

  const webPlatform = detectWebPlatform();

  import("web-vitals").then(({ onLCP, onINP, onCLS, onTTFB, onFCP }) => {
    const report = (metricName: AnalyticsAction) => (metric: { value: number }) => {
      trackEvent({ name: "web_vital", action: metricName, metricValue: metric.value, platform: webPlatform });
    };
    onLCP(report("LCP"));
    onINP(report("INP"));
    onCLS(report("CLS"));
    onTTFB(report("TTFB"));
    onFCP(report("FCP"));
  }).catch(() => {
    // best-effort; never block on analytics
  });
}
