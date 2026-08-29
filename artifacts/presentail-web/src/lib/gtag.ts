import { readCampaignIdentity } from "@/lib/campaign";

// ── Market-aware Google Ads config ───────────────────────────────────────────
// VITE_GTAG_ADS_MARKET_CONFIG is a JSON object mapping 2-letter ISO country
// codes to Google Ads account IDs and conversion labels, e.g.:
//   {
//     "AE": { "accountId": "AW-18416346533", "label": "jZRuCIGEleocEKXLzM1E" },
//     "LB": { "accountId": "AW-18281774261", "label": "XYi_CNabpMccELX5to1E" },
//     "CY": { "accountId": "AW-18281774261", "label": "y0M9CJjcleocELX5to1E" }
//   }
// Adding a new market requires only updating the env var — no code changes.
// Parsed lazily on each call so that test stubs via vi.stubEnv() take effect.
type AdsMarketEntry = { accountId: string; label: string };

function getAdsMarketConfig(): Record<string, AdsMarketEntry> {
  try {
    const raw = import.meta.env.VITE_GTAG_ADS_MARKET_CONFIG as string | undefined;
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, AdsMarketEntry>;
  } catch {
    return {};
  }
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export type AdsPurchaseConversionParams = {
  transactionId: string;
  value: number;
  currency: string;
  /** 2-letter ISO country code of the delivery market (e.g. "AE", "LB", "CY"). */
  countryCode?: string;
};

export type GA4PurchaseItem = {
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
};

export type GA4PurchaseEventParams = {
  transactionId: string;
  value: number;
  currency: string;
  items: GA4PurchaseItem[];
};

/**
 * Fire a generic GA4/Ads gtag event (e.g. campaign landing interactions).
 * No-ops when gtag is not loaded (ad blocker or missing script).
 */
export function fireGtagEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const campaignKey = readCampaignIdentity();
  window.gtag("event", name, {
    ...(params ?? {}),
    ...(campaignKey ? { campaign_key: campaignKey } : {}),
  });
}

/**
 * Fire a GA4 purchase event for Google Merchant Center attribution.
 * Includes structured items[] array with item_id (osSlug), item_name, price, and quantity.
 * No-ops when gtag is not loaded (ad blocker or missing script).
 */
export function fireGA4PurchaseEvent({
  transactionId,
  value,
  currency,
  items,
}: GA4PurchaseEventParams): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const campaignKey = readCampaignIdentity();
  window.gtag("event", "purchase", {
    transaction_id: transactionId,
    value,
    currency,
    items,
    ...(campaignKey ? { campaign_key: campaignKey } : {}),
  });
}

/**
 * Fire a Google Ads purchase conversion event for the order's delivery market.
 *
 * The correct account and conversion label are looked up from
 * VITE_GTAG_ADS_MARKET_CONFIG using the order's delivery country code.
 * If no matching market entry exists, the call is a no-op — this prevents
 * orders from being double-credited to the wrong account.
 *
 * transaction_id is included on every conversion event as a second layer of
 * duplicate protection alongside the sessionStorage guard in OrderConfirmed.
 */
export function fireAdsPurchaseConversion({
  transactionId,
  value,
  currency,
  countryCode,
}: AdsPurchaseConversionParams): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const market = countryCode
    ? getAdsMarketConfig()[countryCode.toUpperCase()]
    : undefined;
  if (!market) return;
  const campaignKey = readCampaignIdentity();
  window.gtag("event", "conversion", {
    send_to: `${market.accountId}/${market.label}`,
    transaction_id: transactionId,
    value,
    currency,
    ...(campaignKey ? { campaign_key: campaignKey } : {}),
  });
}
