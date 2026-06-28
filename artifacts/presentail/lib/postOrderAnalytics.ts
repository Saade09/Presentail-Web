import { trackEvent, type AnalyticsEvent } from "@/lib/analytics";
import { trackFbMobileEvent } from "@/lib/fbPixel";

/**
 * Fire all post-purchase analytics events after a mobile order is confirmed.
 *
 * Called from checkout.tsx finishAfterPaymentSettled() on the success path,
 * right after WooCommerce order creation succeeds.
 *
 * Extracted as a standalone function so it can be unit-tested without
 * rendering the full Checkout component — if this function is altered or
 * the trackFbMobileEvent call removed, the fbPixel.purchase.test.ts suite
 * will catch it.
 *
 * Parameters mirror the closure variables captured at the call site.
 */
export function firePostOrderAnalytics(params: {
  /** Payment method ID (e.g. "card", "wallet", "apple_pay"). */
  payMethod: string;
  /** ISO country code of the shopper's selected delivery country. */
  effectiveCountry: string | null | undefined;
  /** Grand total in the displayed currency. */
  feesGrand: number;
  /** Three-letter ISO currency code (e.g. "USD", "AED"). */
  currencyCode: string;
  /** OS product IDs for all items in the cart. */
  contentIds: string[];
  /** Sender email — present for signed-in shoppers, empty string for guests. */
  senderEmail: string;
  /** Whether the signed-in shopper already has a phone on file. */
  hasProfilePhone: boolean;
  /** The shopper's stored profile phone (when hasProfilePhone is true). */
  profilePhone: string | undefined;
  /** The phone number entered in the WhatsApp field (when not on file). */
  senderWhatsapp: string;
  /** Dial prefix of the sender's selected country (e.g. "+961"). */
  senderCountryDial: string;
}): void {
  const {
    payMethod,
    effectiveCountry,
    feesGrand,
    currencyCode,
    contentIds,
    senderEmail,
    hasProfilePhone,
    profilePhone,
    senderWhatsapp,
    senderCountryDial,
  } = params;

  // Funnel terminal step — emitted once the WC order has actually been created.
  trackEvent({
    name: "order_placed",
    surface: "checkout",
    action: payMethod as AnalyticsEvent["action"],
  });

  // Facebook Conversions API — Purchase event via the mobile CAPI endpoint.
  // Deduplication is handled server-side by sendCapiEvent() in fbConversions.ts.
  // Note: mobile does not send a client-side event_id (web does); this is by
  // design — the server generates one for CAPI deduplication.
  trackFbMobileEvent("Purchase", {
    countryCode: effectiveCountry,
    value: feesGrand,
    currency: currencyCode,
    contentIds,
    email: senderEmail || undefined,
    phone: hasProfilePhone
      ? profilePhone || undefined
      : senderWhatsapp.trim()
        ? `${senderCountryDial} ${senderWhatsapp}`.trim()
        : undefined,
  });
}
