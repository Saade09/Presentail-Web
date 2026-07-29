const ADS_ID = (import.meta.env.VITE_GTAG_ADS_ID as string | undefined) ?? "AW-18281774261";
const ADS_CONVERSION_LABEL = "XYi_CNabpMccELX5to1E";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export type AdsPurchaseConversionParams = {
  transactionId: string;
  value: number;
  currency: string;
};

/**
 * Fire a Google Ads purchase conversion event.
 * No-ops when gtag is not loaded (e.g. blocked by an ad blocker or missing script).
 */
/**
 * Fire a generic GA4/Ads gtag event (e.g. campaign landing interactions).
 * No-ops when gtag is not loaded (ad blocker or missing script).
 */
export function fireGtagEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params ?? {});
}

export function fireAdsPurchaseConversion({
  transactionId,
  value,
  currency,
}: AdsPurchaseConversionParams): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", "conversion", {
    send_to: `${ADS_ID}/${ADS_CONVERSION_LABEL}`,
    transaction_id: transactionId,
    value,
    currency,
  });
}
