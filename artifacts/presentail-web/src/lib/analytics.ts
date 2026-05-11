type AnalyticsEventName =
  | "checkout_login_prompt_viewed"
  | "checkout_login_prompt_action";

type AnalyticsSurface = "cart" | "checkout-direct";

type AnalyticsAction = "continue" | "google" | "apple" | "guest" | "dismissed";

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  surface?: AnalyticsSurface;
  action?: AnalyticsAction;
  appVersion?: string;
};

export function trackEvent(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({ ...event, platform: "web" });
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/analytics/events", blob)) return;
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
  } catch {
    // best-effort; never block UI on analytics
  }
}
