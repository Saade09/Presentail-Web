import { readAttribution } from "@/lib/attribution";

type WebEventType =
  | "page_view"
  | "product_view"
  | "add_to_cart"
  | "checkout_step"
  | "payment_started"
  | "payment_completed"
  | "payment_failed"
  | "promo_applied"
  | "promo_failed"
  | "search"
  | "search_no_result";

export type WebEventItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

export type WebEvent = {
  type: WebEventType;
  sessionId?: string;
  visitorId?: string;
  occurredAt?: string;
  value?: number;
  currency?: string;
  brand?: string;
  city?: string;
  items?: WebEventItem[];
  properties?: Record<string, unknown>;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
  trafficSource?: string;
  deviceType?: string;
  language?: string;
  url?: string;
  path?: string;
};

const VISITOR_ID_KEY = "@presentail/analytics-visitor-id";

function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(VISITOR_ID_KEY);
    if (existing) return existing;
    const next = generateSessionId();
    localStorage.setItem(VISITOR_ID_KEY, next);
    return next;
  } catch {
    return "";
  }
}

function deriveTrafficSource(utmSource?: string, referrer?: string): string | undefined {
  if (utmSource) return utmSource;
  if (!referrer) return "direct";
  try {
    const ref = new URL(referrer);
    const host = ref.hostname.replace(/^www\./, "");
    if (/google\.|bing\.|yahoo\.|duckduckgo\./.test(host)) return "organic_search";
    if (/facebook\.|instagram\.|twitter\.|tiktok\.|linkedin\.|snapchat\./.test(host)) return "social";
    return host || "referral";
  } catch {
    return "referral";
  }
}

/**
 * Post a web funnel event to `/api/web-events`. Uses the same
 * sessionId managed by this module so the server can correlate
 * web funnel events with the existing purchase-funnel monitors.
 * Auto-populates visitorId, occurredAt, attribution/UTM fields,
 * deviceType, language, url, and path from the browser environment.
 * Best-effort: failures are swallowed silently.
 */
export function trackWebEvent(event: WebEvent): void {
  if (typeof window === "undefined") return;
  SESSION_ID = getOrCreateSessionId();
  const visitorId = getOrCreateVisitorId();
  const referrer = document.referrer || undefined;
  const attribution = readAttribution();
  const lastTouch = attribution?.last_touch;
  const utmSource = lastTouch?.utm_source;
  const utmMedium = lastTouch?.utm_medium;
  const utmCampaign = lastTouch?.utm_campaign;
  const utmTerm = lastTouch?.utm_term;
  const utmContent = lastTouch?.utm_content;
  const trafficSource = deriveTrafficSource(utmSource, referrer);
  const deviceType = detectWebPlatform();
  const lang = (typeof navigator !== "undefined" ? navigator.language : undefined) ?? undefined;
  const enriched: WebEvent = {
    ...event,
    sessionId: SESSION_ID,
    visitorId,
    occurredAt: new Date().toISOString(),
    referrer,
    ...(utmSource ? { utmSource } : {}),
    ...(utmMedium ? { utmMedium } : {}),
    ...(utmCampaign ? { utmCampaign } : {}),
    ...(utmTerm ? { utmTerm } : {}),
    ...(utmContent ? { utmContent } : {}),
    ...(trafficSource ? { trafficSource } : {}),
    deviceType,
    ...(lang ? { language: lang } : {}),
    url: window.location.href,
    path: window.location.pathname,
  };
  const payload = JSON.stringify(enriched);
  try {
    void fetch("/api/web-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
    touchSession();
  } catch {
    // best-effort; never block UI on analytics
  }
}

type AnalyticsEventName =
  | "birthday_recipient_filter_viewed"
  | "birthday_recipient_selected"
  | "birthday_recipient_changed"
  | "birthday_recipient_cleared"
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
  | "recommended_product_clicked"
  | "free_delivery_qualification_message_viewed";

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
  | "tabby"
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
  /** birthday_recipient_* events */
  recipientKey?: string;
  previousRecipientKey?: string;
  productCount?: number;
  locale?: string;
  country?: string;
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
