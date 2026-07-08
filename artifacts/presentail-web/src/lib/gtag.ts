const ADS_ID = (import.meta.env.VITE_GTAG_ADS_ID as string | undefined) ?? "AW-18281774261";
const ADS_CONVERSION_LABEL = "XYi_CNabpMccELX5to1E";

// Second Google Ads account — added alongside the original without touching
// its behavior. Both accounts must receive a purchase conversion ping on
// every completed order.
const ADS_ID_2 = (import.meta.env.VITE_GTAG_ADS_ID_2 as string | undefined) ?? "AW-18306046187";
const ADS_CONVERSION_LABEL_2 = "XAOLCKLftMwcEOuxgJlE";

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
  // Second Google Ads account's purchase conversion — fired alongside the
  // original as a separate event (Ads conversions cannot share a single
  // gtag call across accounts), never replacing it.
  window.gtag("event", "conversion", {
    send_to: `${ADS_ID_2}/${ADS_CONVERSION_LABEL_2}`,
    transaction_id: transactionId,
    value,
    currency,
  });
}
