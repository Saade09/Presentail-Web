import { useState, useEffect, useRef, useMemo, useCallback, Fragment, lazy, Suspense } from "react";
import { useCart, effectivePrice } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LazyWebPhoneField } from "@/components/LazyWebPhoneField";
import { Textarea } from "@/components/ui/textarea";
import DeliveryDetailsField, { flattenPlaceAddress, type CheckoutPlace, type PlaceDistrictNotice } from "@/components/checkout/DeliveryDetailsField";
import { CARD_MESSAGE_KEY, CARD_TO_KEY, CARD_FROM_KEY, CARD_QR_LINK_KEY, COUPON_STORAGE_KEY, COUPON_DISCOUNT_KEY, ORDER_NOTE_KEY } from "./Cart";

import { buildCardFrom } from "@/lib/cardFrom";
import {
  FIRST_ORDER_COUPON_CODE,
  isFirstOrderPromoActive,
  clearFirstOrderPromo,
  markHasOrdered,
} from "@/lib/campaign";
import {
  useCreateOrder,
  useDeliveryLocations,
  useStripeCheckoutSession,
  useMamoPayment,
  usePaypalPayment,
  useTabbyPayment,
  useFxRates,
} from "@/lib/queries";
import { useCreateCheckoutPaymentIntent } from "@workspace/api-client-react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Lock, MapPin, BookUser, CalendarDays, ChevronDown, Loader2, Plus, Zap } from "lucide-react";
import { buildFeeNode } from "@/lib/feeNode";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/contexts/LocaleContext";
import { Logo } from "@/components/Logo";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { useIpDetectedCountry } from "@/lib/useIpDetectedCountry";

import { FormattedPrice } from "@/components/FormattedPrice";
import { SalePrice } from "@/components/SalePrice";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { DeliveryPickerModal, type DeliveryPickerSelection } from "@/components/delivery/DeliveryPickerModal";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import applePayLogo from "@/assets/payment-logos/applepay.svg";
import googlePayLogo from "@/assets/payment-logos/googlepay.svg";
import visaLogo from "@/assets/payment-logos/visa.svg";
import mastercardLogo from "@/assets/payment-logos/mastercard.svg";
import amexLogo from "@/assets/payment-logos/amex.svg";
import whishLogo from "@/assets/payment-logos/whish.svg";
import paypalLogo from "@/assets/payment-logos/paypal.svg";
import westernUnionLogo from "@/assets/payment-logos/western-union.svg";
import tabbyLogo from "@/assets/payment-logos/tabby.svg";
import klarnaLogo from "@/assets/payment-logos/klarna.svg";
import { CheckoutLoginDialog } from "@/components/cart/CheckoutLoginDialog";
import { CheckoutSignInCard } from "@/components/checkout/CheckoutSignInCard";
import { isFrictionlessCheckoutEnabled } from "@/lib/frictionlessCheckout";
import { CheckoutSkeleton } from "@/components/skeletons/CheckoutSkeleton";
import { DeliveryRecap } from "@/components/checkout/DeliveryRecap";
import { PhoneInfoTooltip } from "@/components/checkout/PhoneInfoTooltip";
import { CheckoutField } from "@/components/checkout/CheckoutField";
import { cn } from "@/lib/utils";
import { useMidnightSlotValidation } from "@/components/delivery/useMidnightSlotValidation";
import { joinRecipientName } from "@/lib/recipientName";
import { OrderSummaryPanel } from "@/components/checkout/OrderSummaryPanel";
import { trackEvent, trackWebEvent } from "@/lib/analytics";
import { fireGtagEvent } from "@/lib/gtag";
import { trackFbEvent } from "@/lib/fbPixel";
import { useNow } from "@/lib/useNow";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  dayLabels,
  expressSurchargeForCountry,
  firstAvailableDay,
  formatDeliveryRow,
  freeDeliveryThresholdUsd,
  getCountryHour,
  getLocalIso,
  isExpressDeliveryAvailable,
  isMidnightSlot,
  slotTimeRangeForLabel,
  timeSlotsForCountry,
} from "@workspace/delivery";
import { checkStaleSlotSelection } from "@/components/delivery/staleSlotCheck";
import {
  isApplePayBrowser,
  webNextPaymentMethod,
  webPaymentMethodLabelKey,
  webVisiblePayMethods,
  type WebPaymentMethodId,
} from "./checkoutPayMethods";
import { calcCheckoutFees, activeCurrencyForCountry } from "./checkoutFees";
import { classifyDistrictChange, feesDiffer } from "./checkoutDistrictChange";
import {
  DistrictChangeNotice,
  isDeliveryGateBlocked,
  type DistrictRevalState,
} from "@/components/checkout/DistrictChangeNotice";
import { withTimeout, withTimeoutAsNull } from "@/lib/withTimeout";
import { sortAECities } from "@/lib/aeDistricts";
import { computeCartTotal, toStripeMinorUnits, roundToNearestFive } from "@workspace/display-currency";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

// Lazily loaded — @stripe/react-stripe-js (and therefore js.stripe.com) are
// never bundled into the instant checkout chunk and are only fetched when the
// user picks a Stripe-backed payment method (card / Apple Pay / Google Pay).
import { LocationCombobox } from "@/components/checkout/LocationCombobox";
const LazyStripeSection = lazy(() =>
  import("@/components/StripeCheckoutSection").then((m) => ({ default: m.StripeCheckoutSection })),
);

/**
 * Absolute return URL for payment providers, pointing at the order-confirmed
 * page. Includes the current locale prefix (/en-lb/beirut) parsed from the
 * URL: bare "/order-confirmed" is not a first-class server entry point
 * (serve.mjs non-locale guard falls back to the SPA shell + client redirect),
 * and a hosted/redirect payment must land directly on the locale route so
 * order finalization runs immediately.
 */
function orderConfirmedReturnUrl(status: "success" | "failed", extraQuery = ""): string {
  const origin = window.location.origin;
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const withoutBase = base && window.location.pathname.startsWith(base)
    ? window.location.pathname.slice(base.length)
    : window.location.pathname;
  const localeMatch = withoutBase.match(/^\/[a-z]{2}-[a-z]{2}\/[a-z0-9-]+/);
  const localePrefix = localeMatch ? localeMatch[0] : "";
  return `${origin}${base}${localePrefix}/order-confirmed?status=${status}${extraQuery}`;
}

function toTitleCase(s: string): string {
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// Returns null for unrecognised codes so the caller falls back to the
// generic message or the raw Stripe message.
function stripeDeclineMsg(
  error: { decline_code?: string | null; code?: string | null },
  t: (key: string) => string,
): string | null {
  const code = error.decline_code ?? error.code;
  if (code === "insufficient_funds") return t("checkout.stripe.declineInsufficientFunds");
  if (code === "card_velocity_exceeded") return t("checkout.stripe.declineVelocityExceeded");
  if (code === "do_not_honor") return t("checkout.stripe.declineDoNotHonor");
  if (code === "lost_card" || code === "stolen_card") return t("checkout.stripe.declineLostStolen");
  if (code === "expired_card") return t("checkout.stripe.declineExpiredCard");
  if (code === "incorrect_cvc") return t("checkout.stripe.declineIncorrectCvc");
  return null;
}

// The country code of the Stripe merchant account used for Apple Pay / Google
// Pay PaymentRequest construction. This must match the account's registered
// country (e.g. "CY" for the Cyprus account), NOT the shopper's delivery
// country. Lebanon ("LB") is not a supported Stripe merchant country and causes
// the PaymentRequest constructor to throw on every attempt.
// Configurable via VITE_STRIPE_MERCHANT_COUNTRY (default "US").
const STRIPE_MERCHANT_COUNTRY: string =
  (import.meta.env.VITE_STRIPE_MERCHANT_COUNTRY as string | undefined) || "US";

// Maps the active display-currency to its most likely Stripe merchant country.
// Mirrors the mobile checkout's countryFromCurrency / resolveCountryCode pattern.
function countryFromCurrency(currencyCode?: string): string | undefined {
  if (currencyCode === "AED") return "AE";
  if (currencyCode === "EUR") return "CY";
  if (currencyCode === "USD") return "LB";
  return undefined;
}

function resolveCheckoutCountry(selectedCountryCode?: string | null, currencyCode?: string): string {
  return selectedCountryCode || countryFromCurrency(currencyCode) || "LB";
}

// Module-level Stripe promise caches — lazily initialised via dynamic import so
// @stripe/stripe-js is NOT bundled into the eagerly-evaluated checkout chunk,
// and js.stripe.com is NOT fetched until a Stripe-dependent payment method is
// first selected. Subsequent calls return the same cached promise.
let _stripePromise: Promise<import("@stripe/stripe-js").Stripe | null> | null = null;
let _stripePromiseGulf: Promise<import("@stripe/stripe-js").Stripe | null> | null = null;

// Merchant country for the Gulf Stripe account (AE). Configured via
// VITE_STRIPE_MERCHANT_COUNTRY_GULF; falls back to "AE".
const STRIPE_MERCHANT_COUNTRY_GULF: string =
  (import.meta.env.VITE_STRIPE_MERCHANT_COUNTRY_GULF as string | undefined) || "AE";

/**
 * Returns the Stripe.js promise for the correct account based on the shopper's
 * DELIVERY country code, not their display currency.
 *
 * Routing rule (mirrors the API server):
 *   countryCode === "AE"  → Gulf account (VITE_STRIPE_PUBLISHABLE_KEY_GULF)
 *   anything else         → main account (VITE_STRIPE_PUBLISHABLE_KEY)
 *
 * A Lebanon shopper who has selected AED as display currency still delivers to
 * Lebanon ("LB") and must use the main account — the Lebanon main Stripe account
 * handles all non-UAE deliveries regardless of display currency.
 */
function getStripePromise(deliveryCountryCode?: string) {
  if (deliveryCountryCode === "AE") {
    return (_stripePromiseGulf ??= import("@stripe/stripe-js").then(({ loadStripe }) =>
      loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_GULF || null),
    ));
  }
  return (_stripePromise ??= import("@stripe/stripe-js").then(({ loadStripe }) =>
    loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || null),
  ));
}

// The web checkout supports a subset of the shared payment-method catalog
// (no Western Union). All availability / label / fallback decisions go
// through the pure helpers in `./checkoutPayMethods`, which wrap the shared
// `@workspace/pay-methods` table and mirror the mobile checkout.
type PaymentMethodId = WebPaymentMethodId | "klarna";

// Branded submit button — swaps the generic teal button for a method-specific
// branded button when the shopper has selected Apple Pay, Google Pay, PayPal,
// or Whish. All other methods fall back to the existing teal button.
type PaymentSubmitButtonProps = {
  paymentMethod: PaymentMethodId;
  total: number;
  onClick: () => void;
  disabled: boolean;
  isProcessing: boolean;
  // True while the wallet PaymentIntent is still being pre-created. The wallet
  // buttons show a spinner and stay disabled so the native sheet is never opened
  // with a client-estimated total.
  walletPreparing?: boolean;
};

// Brand-name string constants for the payment submit button.
// These are proper nouns / product names exempt from i18n translation.
const ALT_APPLE_PAY = "Apple Pay"; // i18n-ignore

// Express delivery promise (desktop sidebar): SLA and quote-anchor TTL.
// The "Arrives by" time = quote anchor + SLA; the quote re-anchors (and the
// whole panel + pricing revalidate) once the anchor is older than the TTL.
const EXPRESS_SLA_MINUTES = 90;
const EXPRESS_QUOTE_TTL_MS = 10 * 60 * 1000;
const ALT_GOOGLE_PAY = "Google Pay"; // i18n-ignore
const ALT_PAYPAL = "PayPal"; // i18n-ignore
const LABEL_PAY_PAYPAL = "Pay with PayPal"; // i18n-ignore
const ALT_WHISH = "Whish"; // i18n-ignore
const LABEL_PAY_WHISH = "Pay with Whish Money"; // i18n-ignore
const ALT_TABBY = "Tabby"; // i18n-ignore
const ALT_KLARNA = "Klarna"; // i18n-ignore
const LABEL_PAY_TABBY = "Pay in 4 with Tabby"; // i18n-ignore

// Countries where Klarna billing is supported. Used to populate the editable
// billing-country selector in the Klarna payment tile. Country names are UI
// labels — kept in English intentionally (ISO country names are broadly
// understood; translating them adds no value for payment selection).
const KLARNA_BILLING_COUNTRIES = [
  { code: "AT", name: "Austria" }, // i18n-ignore
  { code: "BE", name: "Belgium" }, // i18n-ignore
  { code: "DE", name: "Germany" }, // i18n-ignore
  { code: "DK", name: "Denmark" }, // i18n-ignore
  { code: "ES", name: "Spain" }, // i18n-ignore
  { code: "FI", name: "Finland" }, // i18n-ignore
  { code: "FR", name: "France" }, // i18n-ignore
  { code: "GB", name: "United Kingdom" }, // i18n-ignore
  { code: "IT", name: "Italy" }, // i18n-ignore
  { code: "LB", name: "Lebanon" }, // i18n-ignore
  { code: "NL", name: "Netherlands" }, // i18n-ignore
  { code: "NO", name: "Norway" }, // i18n-ignore
  { code: "PL", name: "Poland" }, // i18n-ignore
  { code: "PT", name: "Portugal" }, // i18n-ignore
  { code: "SE", name: "Sweden" }, // i18n-ignore
  { code: "US", name: "United States" }, // i18n-ignore
] as const;

function PaymentSubmitButton({ paymentMethod, total, onClick, disabled, isProcessing, walletPreparing }: PaymentSubmitButtonProps) {
  const { t } = useLocale();
  const base = "flex-1 h-14 flex items-center justify-center gap-2 transition-opacity disabled:opacity-60 cursor-pointer select-none";
  // While the wallet PaymentIntent is being prepared, keep the button disabled
  // and show a spinner so the shopper can't open the native sheet before the
  // server amount is known.
  const showWalletSpinner = isProcessing || walletPreparing;

  if (paymentMethod === "apple_pay") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || walletPreparing}
        data-testid="button-submit-payment"
        className={`${base} rounded-full px-6`}
        style={{ backgroundColor: "#000" }}
      >
        {showWalletSpinner
          ? <Loader2 className="h-5 w-5 animate-spin text-white" />
          : <img src={applePayLogo} alt={ALT_APPLE_PAY} style={{ height: 22, width: "auto", filter: "brightness(0) invert(1)" }} draggable={false} />}
      </button>
    );
  }

  if (paymentMethod === "google_pay") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || walletPreparing}
        data-testid="button-submit-payment"
        className={`${base} rounded-xl px-6`}
        style={{ backgroundColor: "#000" }}
      >
        {showWalletSpinner
          ? <Loader2 className="h-5 w-5 animate-spin text-white" />
          : <img src={googlePayLogo} alt={ALT_GOOGLE_PAY} style={{ height: 26, width: "auto" }} draggable={false} />}
      </button>
    );
  }

  if (paymentMethod === "paypal") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-testid="button-submit-payment"
        className={`${base} rounded-xl px-6`}
        style={{ backgroundColor: "#0070BA" }}
      >
        {isProcessing
          ? <span className="text-white text-sm font-medium">{t("checkout.processing")}</span>
          : <>
              <img
                src={paypalLogo}
                alt={ALT_PAYPAL}
                data-testid="payment-submit-logo-paypal"
                className="block max-w-full object-contain"
                style={{ height: 20, width: "auto" }}
                draggable={false}
              />
              <span className="text-white text-sm font-semibold">{LABEL_PAY_PAYPAL}</span>
            </>}
      </button>
    );
  }

  if (paymentMethod === "whish") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-testid="button-submit-payment"
        className={`${base} rounded-xl px-6`}
        style={{ backgroundColor: "#D31F37" }}
      >
        {isProcessing
          ? <span className="text-white text-sm font-medium">{t("checkout.processing")}</span>
          : <>
              <img
                src={whishLogo}
                alt={ALT_WHISH}
                data-testid="payment-submit-logo-whish"
                className="block max-w-full object-contain"
                style={{ height: 16, width: "auto" }}
                draggable={false}
              />
              <span className="text-white text-sm font-semibold">{LABEL_PAY_WHISH}</span>
            </>}
      </button>
    );
  }

  if (paymentMethod === "tabby") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-testid="button-submit-payment"
        className={`${base} rounded-xl px-6`}
        style={{ backgroundColor: "#3AFEB2" }}
      >
        {isProcessing
          ? <span className="text-sm font-medium" style={{ color: "#1a1a1a" }}>{t("checkout.processing")}</span>
          : <>
              <img src={tabbyLogo} alt={ALT_TABBY} style={{ height: 36, width: "auto" }} draggable={false} />
              <span className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>{LABEL_PAY_TABBY}</span>
            </>}
      </button>
    );
  }

  if (paymentMethod === "klarna") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-testid="button-submit-payment"
        className={`${base} rounded-xl px-6`}
        style={{ backgroundColor: "#FFB3C7" }}
      >
        {isProcessing
          ? <span className="text-sm font-medium text-gray-900">{t("checkout.processing")}</span>
          : <span className="text-sm font-semibold text-gray-900">{t("checkout.pay.klarnaLabel")}</span>}
      </button>
    );
  }

  return (
    <Button
      size="lg"
      className="flex-1 h-14 rounded-xl text-white font-semibold text-base"
      style={{ backgroundColor: "hsl(var(--primary))" }}
      onClick={onClick}
      disabled={disabled}
      data-testid="button-submit-payment"
    >
      {isProcessing ? t("checkout.processing") : <>{t("checkout.placeOrderNow_prefix")} <FormattedPrice usdValue={total} /></>}
    </Button>
  );
}

type SavedAddress = {
  id: number;
  label: string;
  nickname?: string | null;
  isDefault: boolean;
  countryCode?: string | null;
  district?: string | null;
  addressLine?: string | null;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
  directions?: string | null;
  recipientFirstName?: string | null;
  recipientLastName?: string | null;
  recipientPhone?: string | null;
  recipientPhoneCountryCode?: string | null;
};

function addressDisplayLabel(a: SavedAddress): string {
  const parts: string[] = [];
  if (a.nickname) parts.push(a.nickname);
  else parts.push(a.label.charAt(0).toUpperCase() + a.label.slice(1));
  if (a.district) parts.push(a.district);
  return parts.join(" · ");
}

export function applyAddressToRecipient(
  a: SavedAddress,
  setRecipient: React.Dispatch<React.SetStateAction<{ firstName: string; lastName: string; phone: string; district: string; address: string; deliveryDate: string; cardMessage: string; cardTo: string }>>,
  opts: { onlyEmpty?: boolean } = {},
) {
  const phone = [a.recipientPhoneCountryCode, a.recipientPhone].filter(Boolean).join("");
  const addressLine = [a.addressLine, a.building ? `Bldg: ${a.building}` : null, a.apartment ? `Apt: ${a.apartment}` : null]
    .filter(Boolean)
    .join(" · ");
  setRecipient((prev) => {
    // When onlyEmpty=true (auto-prefill path) we never overwrite a field the
    // shopper has already typed — we only fill in blank slots. When called
    // manually (picker click), we always apply the full address.
    const fill = (existing: string, fromAddress: string) =>
      opts.onlyEmpty ? existing || fromAddress : fromAddress || existing;
    // Saved addresses may still carry split first/last names (legacy rows).
    // The checkout now uses a single recipient-name field, so join them into
    // one display name — never populate the (retired) lastName slot.
    const savedFullName = joinRecipientName(a.recipientFirstName, a.recipientLastName);
    return {
      ...prev,
      firstName: fill(prev.firstName, savedFullName),
      lastName: "",
      phone: fill(prev.phone, phone),
      district: fill(prev.district, a.district ?? ""),
      address: fill(prev.address, addressLine),
    };
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const PENDING_ORDER_KEY = "presentail_pending_order_v1";

// Typed shape of the /api/woo/order response. The generated hook uses `any`,
// so we narrow it here to avoid `as any` casts in the order-handling code.
type CreateOrderResponse =
  | { ok: true; wcOrderId: number | null; osOrderId?: string | null; orderKey?: string; couponDiscount: number; totalUsd?: number; districtFeeUsd?: number; expressFeeUsd?: number; slotFeeUsd?: number; deliveryFeeUsd?: number }
  | { ok: false; message?: string; code?: string; queued?: boolean };

// Stable signature of the inputs that determine the server-computed wallet
// charge. Used to decide whether a pre-created PaymentIntent is still valid for
// the current cart/delivery/coupon state. All fields that affect the charged
// amount or the server's cart snapshot are included — `district` is included
// so a country/district change always forces a fresh PI even when the delivery
// fee happens to be the same (fee-neutral country switch).
type WalletPiSignatureInput = {
  items: { wcId?: number; osSlug?: string; quantity: number }[];
  currency: string;
  email?: string;
  deliveryFeeUsd: number;
  expressDelivery: boolean;
  noAddress: boolean;
  couponCode?: string;
  deliverySlot?: string;
  deliverySlotId?: string;
  deliveryCityId?: string;
  deliveryDate?: string;
  district?: string;
};
function walletPiSignature(input: WalletPiSignatureInput): string {
  return JSON.stringify({
    items: input.items.map((i) => ({ w: i.wcId ?? 0, s: i.osSlug ?? "", q: i.quantity })),
    currency: input.currency,
    email: input.email ?? "",
    deliveryFeeUsd: Math.round(input.deliveryFeeUsd * 100) / 100,
    expressDelivery: input.expressDelivery,
    noAddress: input.noAddress,
    couponCode: input.couponCode ?? "",
    deliverySlot: input.deliverySlot ?? "",
    deliverySlotId: input.deliverySlotId ?? "",
    deliveryCityId: input.deliveryCityId ?? "",
    deliveryDate: input.deliveryDate ?? "",
    district: input.district ?? "",
  });
}

// hint: Logic changed on both sides. Requires understanding intent of each change.
function CheckoutForm() {
  const { items, subtotal, clearCart, itemCount, isHydrated } = useCart();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  // Mirror the cart-button gate for direct visits to /checkout: signed-out
  // shoppers see the same dismissible login prompt; dismissing returns them
  // to the cart with no state lost. Suppressed once they've explicitly
  // chosen "Checkout as Guest" so they're not re-prompted on every render.
  // The cart's guest button forwards `?guest=1` so we don't double-prompt
  // when transitioning from the cart-side dialog to /checkout.
  const [guestAcked, setGuestAcked] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("guest") === "1";
  });
  // Tracks when the shopper clicked "Checkout as Guest" so that the dialog's
  // onOpenChange(false) — which fires as a cleanup side-effect when the dialog
  // unmounts after setGuestAcked(true) re-renders — doesn't redirect to /cart.
  const guestContinuing = useRef(false);
  // Frictionless checkout flag: when on, guests land on checkout directly —
  // no login gate — and see the optional sign-in card instead.
  const frictionlessCheckout = isFrictionlessCheckoutEnabled();
  const showLoginGate =
    !frictionlessCheckout && !authLoading && !user && !guestAcked;
  const { toast } = useToast();
  const { t, dir, cityName, language } = useLocale();
  const { countryCode, country, city: locationCity } = useLocationSelection();
  const { currencyCode } = useDisplayCurrency();
  const { data: fxRatesData } = useFxRates();
  const { country: ipCountry, settled: ipCountrySettled } = useIpDetectedCountry();

  // The checkout currency always matches the shopper's display currency,
  // regardless of delivery country. The Gulf Stripe account (AE) and the
  // Cyprus account (CY) accept the shopper's display currency directly so
  // the Order Summary and the Apple/Google Pay sheet always show the same
  // currency and amount.
  const checkoutCurrency = currencyCode;

  // ── Lazy Stripe state ──────────────────────────────────────────────────────
  // @stripe/react-stripe-js is dynamically imported via LazyStripeSection so
  // js.stripe.com is never fetched for Mamo, PayPal, Whish, or Western Union.
  // stripeNeeded becomes true (and stays true) the first time a Stripe-backed
  // payment method (card / Apple Pay / Google Pay) is selected, which triggers
  // the dynamic import and mounts LazyStripeSection.  Once mounted it calls
  // onStripeReady with the resolved Stripe instance so we can run the wallet
  // probe and confirm card payments without needing the hooks in this component.
  const [stripePromise, setStripePromise] = useState<
    Promise<import("@stripe/stripe-js").Stripe | null> | null
  >(null);
  const [stripe, setStripe] = useState<import("@stripe/stripe-js").Stripe | null>(null);
  const [elements, setElements] = useState<import("@stripe/stripe-js").StripeElements | null>(null);
  // Stays true once set so LazyStripeSection is never unmounted after first load.
  const [stripeNeeded, setStripeNeeded] = useState(false);
  // Tracks whether the Stripe <PaymentElement> has fired its onReady callback.
  const triggerStripeLoad = useCallback(() => {
    setStripePromise(getStripePromise(countryCode ?? undefined));
    setStripeNeeded(true);
  }, [countryCode]);

  const handleStripeReady = useCallback(
    (s: import("@stripe/stripe-js").Stripe | null, e: import("@stripe/stripe-js").StripeElements | null) => {
      setStripe(s);
      setElements(e);
    },
    [],
  );
  // Fetch Klarna rollout status once on page load. The server uses the
  // payer's real IP (not the delivery address) to determine their country and
  // applies the KLARNA_ROLLOUT flag. Safe default: false (off).
  //
  // Session ID is stable for the life of the browser session (stored in
  // sessionStorage so the same shopper gets the same cohort result across
  // page loads and tab refreshes within the same session). Using Date.now()
  // would re-bucket the shopper on every load — contradicting percentage-
  // rollout's determinism guarantee.
  useEffect(() => {
    let sessionId: string;
    try {
      const stored = sessionStorage.getItem("_klarna_session_id");
      if (stored) {
        sessionId = stored;
      } else {
        sessionId = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
        sessionStorage.setItem("_klarna_session_id", sessionId);
      }
    } catch {
      sessionId = Math.random().toString(36).slice(2);
    }
    void apiFetch<{ ok: boolean; enabled: boolean; payerCountry: string | null }>(
      `/checkout/klarna-status?sessionId=${encodeURIComponent(sessionId)}`,
    )
      .then((data) => { if (data?.ok) setKlarnaEnabled(data.enabled); })
      .catch(() => { /* leave klarnaEnabled=false */ });
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  const createOrder = useCreateOrder();
  const stripeSession = useStripeCheckoutSession();
  const createPaymentIntent = useCreateCheckoutPaymentIntent();
  const mamoPayment = useMamoPayment();
  const paypalPayment = usePaypalPayment();
  const tabbyPayment = useTabbyPayment();
  // Expiry field managed here so we can read it in the submit handler.
  const {
    data: locations,
    isLoading: locationsLoading,
    isError: locationsError,
    isFetching: locationsFetching,
    refetch: refetchLocations,
  } = useDeliveryLocations();
  const { expressSurchargeUsd: osExpressSurchargeUsd } = useDeliveryConfig();
  const [stripeCardError, setStripeCardError] = useState<string | null>(null);
  const [klarnaEnabled, setKlarnaEnabled] = useState(false);
  // ── Klarna billing country ────────────────────────────────────────────────
  // Separate editable state for the payer's billing country — distinct from
  // the delivery location. Defaults to "LB" and syncs from IP-detected
  // countryCode once it resolves (unless the shopper manually overrides it).
  const [klarnaBillingCountry, setKlarnaBillingCountry] = useState<string>("LB");
  const klarnaBillingCountryManual = useRef(false);
  useEffect(() => {
    if (countryCode && !klarnaBillingCountryManual.current) {
      setKlarnaBillingCountry(countryCode.toUpperCase().slice(0, 2));
    }
  }, [countryCode]);
  // ─────────────────────────────────────────────────────────────────────────

  // ── Saved card / save-card state (declarations) ─────────────────────────
  const [saveCard, setSaveCard] = useState(false);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<
    { id: string; brand: string; last4: string; expMonth: number; expYear: number }[]
  >([]);
  const [selectedSavedCardId, setSelectedSavedCardId] = useState<string | null>(null);
  // ─────────────────────────────────────────────────────────────────────────

  const [step, setStep] = useState(1);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [orderNote, setOrderNote] = useState(() => {
    try { return localStorage.getItem(ORDER_NOTE_KEY) ?? ""; } catch { return ""; }
  });
  const [noteOpen, setNoteOpen] = useState(() => {
    try { return (localStorage.getItem(ORDER_NOTE_KEY) ?? "").length > 0; } catch { return false; }
  });

  // Saved addresses for signed-in shoppers
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const defaultAddressAppliedRef = useRef(false);
  // Raw address sub-fields from the last applied saved address.
  // Populated whenever applyAddressToRecipient is called; cleared when the
  // shopper manually edits the address textarea (so stale sub-fields can't
  // accompany a free-typed address they didn't come from).
  const savedAddressSubFieldsRef = useRef<{
    building?: string;
    apartment?: string;
    floor?: string;
  } | null>(null);

  // Seed `recipient.deliveryDate` from the shared delivery-selection
  // store so a window the shopper picked from the product page lands
  // in the checkout date input on first render. The same store is the
  // single source of truth — `useDeliverySelection()` is called below
  // for the mode/slot seeds.
  const seededDeliverySelection = useDeliverySelection();
  const [qrLink] = useState(() => {
    try { return localStorage.getItem(CARD_QR_LINK_KEY) ?? ""; } catch { return ""; }
  });

  const [recipient, setRecipient] = useState({
    firstName: (() => { try { return localStorage.getItem(CARD_TO_KEY) ?? ""; } catch { return ""; } })(),
    lastName: "",
    phone: "",
    district: locationCity?.name ?? "",
    address: "",
    deliveryDate:
      seededDeliverySelection.date && seededDeliverySelection.mode !== "express"
        ? seededDeliverySelection.date
        : "",
    cardMessage: (() => { try { return localStorage.getItem(CARD_MESSAGE_KEY) ?? ""; } catch { return ""; } })(),
    cardTo: (() => { try { return localStorage.getItem(CARD_TO_KEY) ?? ""; } catch { return ""; } })(),
  });

  const [sender, setSender] = useState({
    firstName: user?.firstName ?? "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    phone: user?.phone || "",
  });

  // Signed-in shoppers already gave us their identity at signup, so we
  // hide the sender Name/Email inputs and only keep the WhatsApp field
  // visible when the profile has no phone yet (so we can ask once and
  // persist it back to the account). `hadProfilePhoneOnMountRef` is
  // captured once so post-order we can decide whether to PUT the typed
  // phone back to the profile — re-reading `user.phone` after a save
  // would flip the flag and we'd skip future saves incorrectly.
  const isSignedIn = !!user;
  const profilePhone = (user?.phone ?? "").trim();
  const hasProfilePhone = isSignedIn && profilePhone.length > 0;
  const hadProfilePhoneOnMountRef = useRef<boolean | null>(null);
  useEffect(() => {
    try {
      if (orderNote) {
        localStorage.setItem(ORDER_NOTE_KEY, orderNote);
      } else {
        localStorage.removeItem(ORDER_NOTE_KEY);
      }
    } catch { /* best-effort */ }
  }, [orderNote]);

  useEffect(() => {
    if (!user) return;
    if (hadProfilePhoneOnMountRef.current === null) {
      hadProfilePhoneOnMountRef.current = profilePhone.length > 0;
    }
    // Keep sender state in sync if the auth user resolves after mount
    // (e.g. cookie hydration races the first render). We never overwrite
    // a value the shopper already typed.
    setSender((prev) => ({
      firstName: prev.firstName || user.firstName || "",
      lastName: prev.lastName || user.lastName || "",
      email: prev.email || user.email || "",
      phone: prev.phone || user.phone || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Fetch saved payment methods (cards) when the authenticated user is on step 2.
  useEffect(() => {
    if (!user || step !== 2) return;
    let cancelled = false;
    apiFetch<{ ok: boolean; paymentMethods: { id: string; brand: string; last4: string; expMonth: number; expYear: number }[] }>("/checkout/payment-methods")
      .then((r) => {
        if (cancelled) return;
        setSavedPaymentMethods(r.paymentMethods ?? []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, step]);

  const handleRemoveSavedCard = useCallback(async (pmId: string) => {
    try {
      await apiFetch(`/checkout/payment-methods/${pmId}`, { method: "DELETE" });
      setSavedPaymentMethods((prev) => prev.filter((pm) => pm.id !== pmId));
      setSelectedSavedCardId((prev) => (prev === pmId ? null : prev));
    } catch {
      // Silently ignore — the card will still show up but the shopper can retry
    }
  }, []);

  // Fetch saved addresses for signed-in shoppers so we can offer pre-fill.
  // Silently no-ops for guests — the addresses endpoint returns 401 which
  // we swallow here. Pre-fill fires exactly once per checkout session (guarded
  // by `defaultAddressAppliedRef`) and only if the shopper hasn't already
  // typed something into the recipient fields.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch<{ ok: boolean; addresses: SavedAddress[] }>("/me/addresses")
      .then((r) => {
        if (cancelled) return;
        const addrs = r.addresses ?? [];
        setSavedAddresses(addrs);
        if (!defaultAddressAppliedRef.current) {
          defaultAddressAppliedRef.current = true;
          const def = addrs.find((a) => a.isDefault) ?? addrs[0];
          if (def) {
            applyAddressToRecipient(def, setRecipient, { onlyEmpty: true });
            savedAddressSubFieldsRef.current = {
              building: def.building ?? undefined,
              floor: def.floor ?? undefined,
              apartment: def.apartment ?? undefined,
            };
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Best-effort: save the typed delivery address to the shopper's profile
  // when they've toggled "Save this address" and are signed in. Never
  // blocks the order flow — failures are silently swallowed.
  const maybeSaveNewAddress = async () => {
    if (!isSignedIn || !saveAddress || noAddress) return;
    const district = recipient.district.trim();
    const addressLine = recipient.address.trim();
    if (!district || !addressLine) return;
    const cc = (countryCode ?? "LB").toUpperCase().slice(0, 2);
    try {
      await apiFetch("/me/addresses", {
        method: "POST",
        body: JSON.stringify({
          label: "home",
          countryCode: cc,
          district,
          addressLine,
          building: null,
          apartment: null,
          directions: null,
          nickname: null,
          // The single recipient-name value is stored whole in the firstName
          // column; lastName is retired for new saves (legacy rows still join).
          recipientFirstName: recipient.firstName.trim() || null,
          recipientLastName: null,
          recipientPhone: recipient.phone.trim() || null,
          recipientPhoneCountryCode: null,
          isDefault: false,
        }),
      });
    } catch {
      // best-effort — never block the order
    }
  };

  // Best-effort: persist the typed WhatsApp number to the profile when
  // a signed-in shopper had no phone on file before this checkout. Never
  // blocks the order flow — failures are logged and swallowed.
  const maybeSaveProfilePhone = async () => {
    if (!isSignedIn) return;
    if (hadProfilePhoneOnMountRef.current !== false) return;
    const phoneToSave = sender.phone.trim();
    if (!phoneToSave) return;
    try {
      await apiFetch("/auth/me", {
        method: "PUT",
        body: JSON.stringify({ phone: phoneToSave }),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[checkout] post-order phone save failed", err);
    }
  };

  const deliverySelection = seededDeliverySelection;
  // Seed the in-checkout date/slot/mode from the shared delivery-selection
  // store so a window the shopper picked from the product page survives
  // into the checkout summary. With no persisted choice, wait for the selected
  // city's OS schedule instead of preselecting a country-wide fallback slot.
  const persistedScheduleMode =
    deliverySelection.mode && deliverySelection.mode !== "express"
      ? "schedule"
      : deliverySelection.mode === "express"
        ? "express"
        : "schedule";
  const [deliverySlot, setDeliverySlot] = useState<string>(
    deliverySelection.slotLabel ?? "",
  );
  const [deliverySlotId, setDeliverySlotId] = useState<string | undefined>(
    deliverySelection.slotId ?? undefined,
  );
  const [deliveryMode, setDeliveryMode] = useState<"express" | "schedule">(
    persistedScheduleMode,
  );
  // Stable platform flag — derived from navigator once per component mount.
  // Used to gate Apple Pay (Safari only) and Google Pay (non-Safari) tiles.
  // Chrome on Mac is excluded: isApplePayBrowser() returns false there so the
  // tile correctly shows Google Pay instead of a mis-labelled Apple Pay button.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const appleDevice = useMemo(() => isApplePayBrowser(), []);
  const [paymentMethod, setPaymentMethodState] = useState<PaymentMethodId>(
    () => (appleDevice ? "apple_pay" : "google_pay"),
  );
  // Tracks whether the Stripe PaymentRequest probe confirmed a wallet (Apple Pay /
  // Google Pay) is available on this browser. Starts true (rows visible while probe
  // is pending), flipped to false when probe resolves as unsupported so the rows
  // are hidden and the shopper can't manually re-select an unavailable method.
  const [walletSupported, setWalletSupported] = useState(true);
  // Wrap the setter so user-driven payment-method picks emit a funnel
  // event. We deliberately do NOT instrument the auto-fallback effect
  // below (e.g. AE customers being switched off whish) so the funnel
  // reflects shopper intent, not server-driven correction.
  const setPaymentMethod = (m: PaymentMethodId) => {
    setPaymentMethodState((prev) => {
      if (prev !== m) {
        trackEvent({
          name: "payment_method_selected",
          surface: "checkout",
          action: m as WebPaymentMethodId,
        });
      }
      return m;
    });
    // Trigger Stripe initialisation immediately when the shopper explicitly
    // picks a Stripe-backed method.  Mamo, PayPal, Whish, and Western Union
    // never load Stripe.  triggerStripeLoad() is idempotent.
    if (m === "card" || m === "apple_pay" || m === "google_pay" || m === "klarna") {
      triggerStripeLoad();
    }
  };

  const [noAddress, setNoAddress] = useState(false);
  // ── Landmark recognition (verified OS Address Book places) ──────────────
  // selectedPlace: verified place explicitly chosen from the Delivery Details
  // suggestion dropdown (null = plain free-text address, today's behaviour).
  // placeTypedQuery preserves what the shopper typed before selecting so the
  // Change action restores it and the order records the original query.
  // placeDistrictNotice drives the green "Delivery district updated" banner —
  // set only when the selection actually moved the district (never silently).
  const [selectedPlace, setSelectedPlace] = useState<CheckoutPlace | null>(null);
  const [placeInternalDetail, setPlaceInternalDetail] = useState("");
  const [placeTypedQuery, setPlaceTypedQuery] = useState("");
  const [placeDistrictNotice, setPlaceDistrictNotice] = useState<PlaceDistrictNotice | null>(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [identitySecret, setIdentitySecret] = useState(false);
  // "Get order updates on WhatsApp" — checked by default. Plain component
  // state (like identitySecret) so the choice persists across Delivery
  // Details ↔ Payment navigation and validation errors within a checkout.
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);
  const whatsappDefaultShownRef = useRef(false);
  // Set on the first failed/attempted "Continue to Payment" click. Drives ALL
  // Step-1 inline errors (recipient name, phone, district, address, guest
  // sender name/email/phone): before the first attempt no errors show; after
  // it, each currently-invalid required field shows its message and clears
  // per-field as soon as it becomes valid.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [recipientPhoneValid, setRecipientPhoneValid] = useState(false);
  const [senderPhoneValid, setSenderPhoneValid] = useState(false);
  // The exact country the sender phone field's picker currently displays
  // (ISO-3166) and its dial code. Fed by WebPhoneField.onCountryChange — the
  // SAME state that renders the visible +prefix — so payment routing can
  // never disagree with what the phone UI shows. Null until the field mounts
  // (or, for signed-in users with a saved phone, until the profile number is
  // parsed). Null routes to Stripe.
  const [senderPhoneCountry, setSenderPhoneCountry] = useState<string | null>(null);
  const [senderPhoneDialCode, setSenderPhoneDialCode] = useState<string | null>(null);
  const [deliveryPickerOpen, setDeliveryPickerOpen] = useState(false);

  // ── District-change revalidation state ────────────────────────────────────
  // Drives the inline amber notice under the district dropdown, the Order
  // Summary "Delivery selection required" card, and the payment-CTA gate.
  // See checkoutDistrictChange.ts for the pure classification rules.
  const [districtReval, setDistrictReval] = useState<DistrictRevalState>({ status: "idle" });
  // Render-synced mirror so effects and guards can read the latest state
  // without adding it to their dependency arrays.
  const districtRevalRef = useRef(districtReval);
  districtRevalRef.current = districtReval;
  // Monotonic token: each district change bumps it, and only the outcome
  // carrying the latest token may write state — so rapid district switching
  // never lets a stale availability result win.
  const districtChangeEpochRef = useRef(0);
  // Focus target for the inline notice (focused when a selection is cleared).
  const districtNoticeRef = useRef<HTMLDivElement>(null);

  // Coupon / gift card — seeded from localStorage so a code entered on the
  // cart page survives the cart → checkout navigation without re-entry.
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState(() => {
    try { return localStorage.getItem(COUPON_STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  const [couponApplied, setCouponApplied] = useState(() => {
    try { return (localStorage.getItem(COUPON_STORAGE_KEY) ?? "").length > 0; } catch { return false; }
  });
  // Inline error shown below the coupon input when the order fails due to an
  // invalid/expired coupon code. Cleared when the shopper edits or re-applies.
  const [couponError, setCouponError] = useState<string | null>(null);
  // State for the pre-payment prices-updated confirmation dialog.
  // Holds the server-authoritative breakdown so the dialog can show each line.
  const [pricesConfirmState, setPricesConfirmState] = useState<{
    open: boolean;
    subtotal: number;
    districtFee: number;
    expressFee: number;
    slotFee: number;
    couponDiscount: number;
    newTotal: number;
    currency: string;
    resolve: ((ok: boolean) => void) | null;
  }>({ open: false, subtotal: 0, districtFee: 0, expressFee: 0, slotFee: 0, couponDiscount: 0, newTotal: 0, currency: "USD", resolve: null });
  // Server-authoritative USD fee override. Set when the pre-payment fee check
  // (or the wallet PI pre-creation effect) confirms the server's exact breakdown.
  // OrderSummaryPanel and PaymentSubmitButton read the display* variables derived
  // below, which prefer this override over client-computed values so the visible
  // total always equals what will be charged. Cleared when any fee-affecting
  // input changes (deliveryMode, district, coupon, etc.) — see useEffect below.
  const [serverFeesOverride, setServerFeesOverride] = useState<{
    subtotalUsd: number;
    districtFeeUsd: number;
    expressFeeUsd: number;
    slotFeeUsd: number;
    couponDiscountUsd: number;
  } | null>(null);
  // Discount amount confirmed by server coupon validation (display currency).
  // Initialized from localStorage (set by Cart.tsx validate flow) so the
  // sidebar shows the discounted total before payment, not just after order.
  const [confirmedCouponDiscount, setConfirmedCouponDiscount] = useState(() => {
    try {
      // Only restore a stored discount when a coupon code is also stored.
      // COUPON_DISCOUNT_KEY can outlive COUPON_STORAGE_KEY when an order
      // completes and only the code key is cleared, causing a silent discount
      // on the next unrelated checkout session.
      if (!(localStorage.getItem(COUPON_STORAGE_KEY) ?? "")) return 0;
      return parseFloat(localStorage.getItem(COUPON_DISCOUNT_KEY) ?? "0") || 0;
    } catch { return 0; }
  });
  const [cardProcessing, setCardProcessing] = useState(false);
  // ─────────────────────────────────────────────────────────────────────────
  const couponInputRef = useRef<HTMLInputElement>(null);
  // Stores the server-assigned order ID for the current checkout attempt.
  // Generated once via /api/orders/next-id and reused across retries so
  // a shopper who retries after a card decline reuses the same order ID.
  const orderIdRef = useRef<string | null>(null);

  // Refs for Return-key focus chaining between checkout text fields.
  const recipientFirstNameRef = useRef<HTMLInputElement>(null);
  // True once the shopper has opened the phone info tooltip during this
  // checkout session — used to fire the continue-after-tooltip analytics
  // event exactly once when they successfully advance to Payment.
  const phoneTooltipInteractedRef = useRef(false);
  const senderFirstNameRef = useRef<HTMLInputElement>(null);
  const senderLastNameRef = useRef<HTMLInputElement>(null);
  const senderEmailRef = useRef<HTMLInputElement>(null);
  const continueToPaymentRef = useRef<HTMLButtonElement>(null);

  const focusNextOnEnter = (
    nextRef: React.RefObject<HTMLElement | null>,
  ) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nextRef.current?.focus();
    }
  };

  const ensureOrderId = async (): Promise<string> => {
    if (orderIdRef.current) return orderIdRef.current;
    const res = await apiFetch<{ ok: boolean; orderId: string }>("/orders/next-id", {
      method: "POST",
      body: JSON.stringify({ countryCode: countryCode ?? "LB" }),
    });
    orderIdRef.current = res.orderId;
    return res.orderId;
  };

  const [couponValidating, setCouponValidating] = useState(false);

  type LoyaltyCoupon = { code: string; points: number; discountPercent: number };
  const [loyaltyCoupon, setLoyaltyCoupon] = useState<LoyaltyCoupon | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);

  useEffect(() => {
    if (!user || step !== 2) return;
    let cancelled = false;
    setLoyaltyLoading(true);
    apiFetch<{ ok: boolean; loyalty: { points: number; coupons: Array<{ code: string; discountPercent: number; status: string }> } }>("/loyalty/me")
      .then((r) => {
        if (cancelled) return;
        const active = r.loyalty?.coupons?.find((c) => c.status === "active");
        setLoyaltyCoupon(active
          ? { code: active.code, points: r.loyalty.points, discountPercent: active.discountPercent }
          : null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          console.warn("[loyalty] /loyalty/me fetch failed — loyalty toggle will be hidden");
        }
      })
      .finally(() => {
        if (!cancelled) setLoyaltyLoading(false);
      });
    return () => {
      cancelled = true;
      setLoyaltyLoading(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, step]);

  // ── Fees ref (TDZ-safe access for effects) ────────────────────────────────
  // calcCheckoutFees is declared late in this component (after several useMemo
  // calls it depends on). Effects that fire early (checkout_step, auto-promo)
  // close over districtFee/expressFee/slotFee from that later declaration and
  // can hit a Temporal Dead Zone when React's reconnectPassiveEffects (Suspense
  // un-hide / Strict Mode remount) re-invokes the effect callback before the
  // render that owns the outer const has run. Storing the fees in a ref updated
  // synchronously during each render is the safe alternative: refs are never in
  // TDZ and the update happens before any effects execute.
  const checkoutFeesRef = useRef({ districtFee: 0, expressFee: 0, slotFee: 0 });

  // ── Campaign first-order auto-discount ────────────────────────────────────
  // When the campaign landing page showed the "10% off your first order"
  // promo (localStorage flag), silently auto-apply the virtual FIRST10 coupon
  // once a sender email is available. Failures never surface an error — the
  // flag is simply cleared when the server says the shopper is not eligible.
  const autoPromoAttemptedFor = useRef<string | null>(null);
  const autoPromoEmail = (sender.email || user?.email || "").trim();
  useEffect(() => {
    if (!isFirstOrderPromoActive()) return;
    if (couponApplied || couponValidating) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(autoPromoEmail)) return;
    if (items.length === 0 || subtotal <= 0) return;
    if (autoPromoAttemptedFor.current === autoPromoEmail.toLowerCase()) return;
    autoPromoAttemptedFor.current = autoPromoEmail.toLowerCase();
    let cancelled = false;
    apiFetch<{ ok: boolean; error?: string; discountAmountUsd?: number }>("/coupons/validate", {
      method: "POST",
      body: JSON.stringify({
        code: FIRST_ORDER_COUPON_CODE,
        customerEmail: autoPromoEmail,
        cartItems: items.map((i) => ({ osSlug: i.product.id, priceUsd: effectivePrice(i.product), quantity: i.quantity })),
        cartTotalUsd: subtotal + checkoutFeesRef.current.districtFee + checkoutFeesRef.current.expressFee + checkoutFeesRef.current.slotFee,
      }),
    })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          const discount = res.discountAmountUsd ?? 0;
          try {
            localStorage.setItem(COUPON_STORAGE_KEY, FIRST_ORDER_COUPON_CODE);
            localStorage.setItem(COUPON_DISCOUNT_KEY, String(discount));
          } catch { /* best-effort */ }
          setCouponInput(FIRST_ORDER_COUPON_CODE);
          setCouponApplied(true);
          setConfirmedCouponDiscount(discount);
          setCouponError(null);
        } else if (res.error === "not_first_order") {
          clearFirstOrderPromo();
        }
      })
      .catch((err: unknown) => {
        // apiFetch throws on non-2xx and attaches the parsed body as `.data`.
        // Clear the promo flag on definite ineligibility (structured `error`
        // field), never on transient/network failures.
        if (cancelled) return;
        const data = (err as { data?: { error?: string } } | null)?.data;
        if (data?.error === "not_first_order") {
          clearFirstOrderPromo();
        }
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPromoEmail, couponApplied, couponValidating, items.length, subtotal]);

  const handleCouponApply = async (codeOverride?: string) => {
    const code = (codeOverride !== undefined ? codeOverride : couponInput).trim().toUpperCase();
    if (!code || couponValidating) return;
    setCouponError(null);
    setCouponValidating(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        error?: string;
        message?: string;
        discountAmountUsd?: number;
      }>("/coupons/validate", {
        method: "POST",
        body: JSON.stringify({
          code,
          customerEmail: user?.email ?? "",
          cartItems: items.map((i) => ({ osSlug: i.product.id, priceUsd: effectivePrice(i.product), quantity: i.quantity })),
          cartTotalUsd: subtotal + districtFee + expressFee + slotFee,
        }),
      });
      if (res.ok) {
        const discount = res.discountAmountUsd ?? 0;
        try {
          localStorage.setItem(COUPON_STORAGE_KEY, code);
          localStorage.setItem(COUPON_DISCOUNT_KEY, String(discount));
        } catch { /* best-effort */ }
        setCouponInput(code);
        setCouponApplied(true);
        setConfirmedCouponDiscount(discount);
        setCouponError(null);
        trackWebEvent({
          type: "checkout_promo_applied",
          value: discount,
          currency: "USD",
          properties: { outcome: "success", code },
        });
      } else {
        trackWebEvent({
          type: "checkout_promo_applied",
          properties: { outcome: "invalid", code },
        });
        setCouponError(res.message ?? t("checkout.coupon.invalid"));
        setConfirmedCouponDiscount(0);
        try { localStorage.removeItem(COUPON_DISCOUNT_KEY); } catch { /* best-effort */ }
      }
    } catch (err) {
      const msg = err instanceof Error && err.message && !err.message.startsWith("API error ")
        ? err.message
        : t("checkout.coupon.error");
      setCouponError(msg);
    } finally {
      setCouponValidating(false);
    }
  };

  const handleCouponRemove = () => {
    try {
      localStorage.removeItem(COUPON_STORAGE_KEY);
      localStorage.removeItem(COUPON_DISCOUNT_KEY);
    } catch { /* best-effort */ }
    setCouponInput("");
    setCouponApplied(false);
    setCouponOpen(false);
    setCouponError(null);
    setConfirmedCouponDiscount(0);
  };

  const handleCouponToggle = () => {
    const next = !couponOpen;
    setCouponOpen(next);
    if (next) {
      trackWebEvent({ type: "checkout_promo_expanded", properties: { step } });
      setTimeout(() => couponInputRef.current?.focus(), 80);
    }
  };

  // WhatsApp order-updates checkbox (default checked). Fires the analytics
  // events from the spec — never includes the raw phone number.
  const handleWhatsappOptInToggle = (checked: boolean) => {
    setWhatsappOptIn(checked);
    if (!checked) {
      trackWebEvent({ type: "whatsapp_updates_disabled", properties: { step } });
    }
  };
  // Fire whatsapp_updates_default_shown once per checkout view, when the
  // Sender Details card (step 1) first renders with the default-checked box.
  useEffect(() => {
    if (whatsappDefaultShownRef.current) return;
    whatsappDefaultShownRef.current = true;
    trackWebEvent({
      type: "whatsapp_updates_default_shown",
      properties: { defaultChecked: true },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desktop anonymous-gift checkbox — same underlying identitySecret flag as
  // the mobile "Keep my identity secret" checkbox, plus an analytics event.
  const handleAnonymousGiftToggle = (checked: boolean) => {
    setIdentitySecret(checked);
    trackWebEvent({
      type: "checkout_anonymous_gift_toggled",
      properties: { enabled: checked },
    });
  };

  const loyaltyToggleOn =
    couponApplied && !!loyaltyCoupon &&
    couponInput.trim().toUpperCase() === loyaltyCoupon.code.trim().toUpperCase();

  const handleLoyaltyToggle = (active: boolean) => {
    if (active && loyaltyCoupon) {
      handleCouponApply(loyaltyCoupon.code);
    } else {
      handleCouponRemove();
    }
  };

  // Sync confirmed selection from the in-summary picker into checkout's
  // local state. Called synchronously by DeliveryPickerModal.handleConfirm
  // before the modal closes, so the confirmed values are available immediately
  // and totals / deliveryRowText update on the same render cycle.
  const handleDeliveryPickerConfirm = (sel: DeliveryPickerSelection) => {
    if (sel.mode === "express") {
      setDeliveryMode("express");
    } else {
      setDeliveryMode("schedule");
      if (sel.date) setRecipient((r) => ({ ...r, deliveryDate: sel.date }));
      if (sel.slotLabel) setDeliverySlot(sel.slotLabel);
      // Always sync the slot ID (may be undefined for hardcoded/legacy slots)
      // so a stale ID from a previous selection can't point fee lookups at a
      // different same-label slot configuration than the one just confirmed.
      setDeliverySlotId(sel.slotId ?? undefined);
    }
    // The picker only offers options valid for the currently selected city,
    // so a confirmed pick resolves the district-change notice. Pending/error
    // states stay: availability data for the new district is still unknown.
    const st = districtRevalRef.current.status;
    if (st === "invalid" || st === "feeChanged") {
      setDistrictReval({ status: "idle" });
    }
  };

  // All cities for the selected country (both active and inactive) — sourced
  // from the OS cache so toggling a city in Presentail OS propagates within
  // the polling interval. Inactive cities are shown greyed-out and unclickable;
  // only active cities (isActive !== false) can be selected.
  const activeCities = useMemo(() => {
    const cities =
      locations?.countries.find((c) => c.code === countryCode)?.cities ?? [];
    if (countryCode !== "AE") return cities;
    // For UAE, sort by delivery volume so Dubai appears first, and push any
    // inactive (unserved) emirates to the bottom.
    return sortAECities(cities);
  }, [locations, countryCode]);

  // Pre-compute the selected city so we can read its OS express flag below.
  // Only active cities are eligible for selection, so we restrict the lookup.
  const selectedCityData = useMemo(() => {
    const active = activeCities.filter((c) => c.isActive !== false);
    return active.find(
      (c) => c.name === (recipient.district || active[0]?.name || ""),
    );
  }, [activeCities, recipient.district]);

  // Express Delivery (1–3 hrs) is offered only between 8 AM and 10 PM in
  // the recipient country's local time, mirroring the mobile rule. Also
  // gated by the OS per-city `expressAvailable` flag — when the OS marks
  // a city as express-unavailable the button is disabled regardless of time.
  // When no longer available we silently fall back to the scheduled flow
  // so the order can still be placed. `useNow` ticks every minute so the
  // computed availability flips automatically when the cutoff passes
  // mid-session, even without an unrelated re-render.
  const now = useNow();
  const expressAvailable = useMemo(() => {
    const timeOk = isExpressDeliveryAvailable(countryCode, now);
    // Use `=== true` so a null/missing city (data not yet loaded, or OS
    // hasn't set the flag) defaults to false — prevents showing express for
    // cities where OS has disabled it before the query resolves.
    const cityOk = selectedCityData?.expressAvailable === true;
    return timeOk && cityOk;
  }, [countryCode, now, selectedCityData]);
  const expressSurcharge = expressSurchargeForCountry(countryCode);

  // Quote-anchored express delivery promise (desktop sidebar panel).
  // The "Arrives by" deadline is computed ONCE when express is selected (or
  // when the delivery country/city changes) — it does not tick forward each
  // minute. When the anchor grows stale (quote expiry, 10 min) the next
  // minute tick re-anchors it; fees/total derive from the same render pass,
  // so promise and pricing revalidate together (atomically).
  const [expressQuote, setExpressQuote] = useState<{ anchorMs: number; deadlineMs: number } | null>(null);
  useEffect(() => {
    if (deliveryMode !== "express" || !expressAvailable) {
      setExpressQuote(null);
      return;
    }
    setExpressQuote((q) => {
      const nowMs = Date.now();
      if (q && nowMs - q.anchorMs < EXPRESS_QUOTE_TTL_MS) return q;
      return { anchorMs: nowMs, deadlineMs: nowMs + EXPRESS_SLA_MINUTES * 60 * 1000 };
    });
    // `now` (minute tick) intentionally in deps: it drives the staleness check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryMode, expressAvailable, countryCode, recipient.district, now]);

  // Format the deadline in the market's timezone (not the shopper's device
  // timezone) with locale-aware time formatting.
  const marketTimeZone = countryCode === "AE" ? "Asia/Dubai" : "Asia/Beirut";
  const expressArrivesBy = useMemo(() => {
    if (!expressQuote) return null;
    try {
      return new Intl.DateTimeFormat(
        language === "ar" ? "ar" : language === "fr" ? "fr" : "en",
        { hour: "numeric", minute: "2-digit", timeZone: marketTimeZone },
      ).format(new Date(expressQuote.deadlineMs));
    } catch {
      return null;
    }
  }, [expressQuote, language, marketTimeZone]);

  // Use only the selected city's OS time slots. If OS has no schedule for the
  // city, keep this empty rather than displaying a country-wide fallback.
  // `selectedCityData?.timeSlots` is populated from /api/delivery-locations.
  const timeSlots = useMemo(() => {
    if (selectedCityData?.timeSlots?.length) return selectedCityData.timeSlots;
    if (selectedCityData?.slotsByDay) {
      const derived = Object.values(selectedCityData.slotsByDay)
        .flat()
        .filter((s, i, arr) => arr.findIndex((t) => t.cutoffHour === s.cutoffHour) === i);
      if (derived.length > 0) return derived;
    }
    return [];
  }, [selectedCityData]);

  useMidnightSlotValidation(
    timeSlots,
    selectedCityData?.id ? String(selectedCityData.id) : null,
    countryCode,
    selectedCityData?.slotsByDay,
  );

  useEffect(() => {
    // Only fall back once city data has loaded; firing before that would
    // reset a seeded "express" selection while expressAvailable is still
    // false simply because selectedCityData hasn't arrived yet.
    if (locationsLoading) return;
    // While a district change is being revalidated (or already cleared the
    // selection), never silently convert express → schedule: the explicit
    // district-change flow owns the transition and its messaging.
    if (isDeliveryGateBlocked(districtRevalRef.current)) return;
    if (deliveryMode === "express" && !expressAvailable) {
      setDeliveryMode("schedule");
    }
  }, [deliveryMode, expressAvailable, locationsLoading]);

  // Emit exactly one checkout_started event per checkout mount, but only
  // after auth has resolved AND the shopper is allowed past the login
  // gate (signed in or explicitly continuing as guest). Without the
  // `authLoading` guard the effect would fire during the brief loading
  // window — when `showLoginGate` is still false because `user` hasn't
  // hydrated yet — and double-count signed-out shoppers who then bounce
  // off the prompt, corrupting the cart→checkout ratio. The ref makes
  // the emission idempotent across the auth-loading → resolved
  // transition.
  // Emit checkout_viewed exactly once, after auth resolves, carrying the
  // shopper's auth/guest state for the optional sign-in funnel analysis.
  const checkoutViewedRef = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (showLoginGate) return;
    if (checkoutViewedRef.current) return;
    checkoutViewedRef.current = true;
    trackWebEvent({
      type: "checkout_viewed",
      currency: checkoutCurrency,
      properties: {
        auth_state: user ? "authenticated" : "guest",
        frictionless_checkout: frictionlessCheckout,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, showLoginGate]);

  const checkoutStartedRef = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (showLoginGate) return;
    if (checkoutStartedRef.current) return;
    checkoutStartedRef.current = true;
    trackEvent({ name: "checkout_started", surface: "checkout" });
    trackFbEvent("InitiateCheckout", user?.email
      ? {
          userData: {
            em: user.email,
            ...(user.firstName ? { fn: user.firstName } : {}),
            ...(user.lastName ? { ln: user.lastName } : {}),
          },
        }
      : undefined);
    // GA4 mirror — begin_checkout so the campaign funnel is visible in
    // GA4 DebugView / reports alongside the internal checkout_step event.
    fireGtagEvent("begin_checkout", {
      currency: checkoutCurrency,
      value: subtotal,
      items: items.map((i) => ({
        item_id: i.product.id,
        item_name: i.product.name,
        price: i.product.priceValue,
        quantity: i.quantity,
      })),
    });
    trackWebEvent({
      type: "checkout_step",
      items: items.map((i) => ({
        productId: i.product.id,
        name: i.product.name,
        price: i.product.priceValue,
        quantity: i.quantity,
      })),
      value: subtotal,
      currency: checkoutCurrency,
      city: locationCity?.name ?? locationCity?.id ?? undefined,
      properties: {
        city: locationCity?.name ?? locationCity?.id ?? undefined,
        deliverySlot: deliverySlot || undefined,
        deliveryFee: checkoutFeesRef.current.districtFee + checkoutFeesRef.current.expressFee + checkoutFeesRef.current.slotFee,
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, showLoginGate]);

  // Reflect any in-checkout edits to the delivery mode / date / slot back
  // into the shared delivery-selection store so the next surface (cart,
  // product page, support tools that read the same key) stays in sync.
  // The first render is intentionally skipped — otherwise just visiting
  // checkout would persist a "default" schedule selection that the
  // shopper never explicitly chose, polluting the product page and cart
  // for subsequent visits.
  const didSyncDeliveryRef = useRef(false);
  useEffect(() => {
    if (!didSyncDeliveryRef.current) {
      didSyncDeliveryRef.current = true;
      return;
    }
    const mode: "express" | "today_slot" | "schedule" =
      deliveryMode === "express"
        ? "express"
        : recipient.deliveryDate &&
            recipient.deliveryDate === new Date().toISOString().slice(0, 10)
          ? "today_slot"
          : "schedule";
    deliverySelection.setSelection({
      mode,
      date:
        deliveryMode === "express"
          ? new Date().toISOString().slice(0, 10)
          : recipient.deliveryDate || null,
      slotLabel: deliveryMode === "express" ? null : deliverySlot || null,
      slotId: deliveryMode === "express" ? null : deliverySlotId ?? null,
      serviceType:
        deliveryMode !== "express" &&
        isMidnightSlot(
          (deliverySlotId
            ? timeSlots.find(
                (slot) =>
                  (slot as typeof slot & { slotId?: string }).slotId === deliverySlotId,
              )
            : undefined) ?? timeSlots.find((slot) => slot.label === deliverySlot),
          selectedCityData?.id,
        )
          ? "midnight"
          : null,
      cityId: deliveryMode === "express" ? null : selectedCityData?.id ?? null,
      // A change caused by the sold-out correction effect below is a system
      // re-pick; anything else here reflects an explicit checkout interaction.
      source: systemCorrectionRef.current ? "system_reselected" : "user_selected",
    });
    systemCorrectionRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryMode, deliverySlot, deliverySlotId, recipient.deliveryDate]);

  const prevCountryRef = useRef(countryCode);
  useEffect(() => {
    if (countryCode !== prevCountryRef.current) {
      prevCountryRef.current = countryCode;
      setRecipient((r) => ({ ...r, district: "" }));
      // Do not carry a window across countries; a fresh selection will be
      // chosen only after the target city's OS schedule is available.
      setDeliverySlot("");
      // A country switch is a fresh start — drop any district-change notice
      // and invalidate in-flight revalidations for the old country.
      districtChangeEpochRef.current++;
      setDistrictReval({ status: "idle" });
    }
  }, [countryCode]);

  // Clear a pre-populated district when OS marks that city inactive (e.g. a
  // saved address was stored before the city was deactivated, or the location
  // context passed in an inactive city on mount).  Runs whenever activeCities
  // updates so the picker cannot silently hold an unavailable city.
  useEffect(() => {
    if (!activeCities.length) return;
    setRecipient((r) => {
      if (!r.district) return r;
      const match = activeCities.find((c) => c.name === r.district);
      if (match && match.isActive === false) return { ...r, district: "" };
      return r;
    });
  }, [activeCities]);

  // Country-aware mount-time correction: when the selected date is today (or
  // absent) and today has no remaining slots for this country, advance to the
  // first available day.  Runs whenever timeSlots updates (e.g. OS city data
  // arrives after the initial render), but only corrects toward a later date —
  // it never moves a future date backward.
  const deliveryDayInitRef = useRef(false);
  // Set just before the correction effect rewrites the delivery date so the
  // sync effect above attributes the change to the system, not the shopper.
  const systemCorrectionRef = useRef(false);
  useEffect(() => {
    if (locationsLoading) {
      return;
    }
    // A district change cleared (or is revalidating) the selection: the
    // shopper must explicitly re-pick — never auto-substitute a slot here.
    if (isDeliveryGateBlocked(districtRevalRef.current)) return;
    if (timeSlots.length === 0) {
      setDeliverySlot("");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const currentDate = recipient.deliveryDate;
    // Only correct when the current date is today or not yet set.
    if (currentDate && currentDate !== today) return;
    // Skip if already corrected and nothing has changed.
    if (deliveryDayInitRef.current && currentDate && currentDate !== today) return;
    deliveryDayInitRef.current = true;
    const h = getCountryHour(countryCode, new Date());
    const todayHasSlots = timeSlots.some((s) => s.cutoffHour > h);
    if (todayHasSlots) {
      // Today still has available slots — ensure the pre-selected slot is the
      // first one that hasn't yet passed its cutoff.
      const firstAvailableSlot = timeSlots.find((s) => s.cutoffHour > h);
      if (firstAvailableSlot && !deliverySlot) {
        setDeliverySlot(firstAvailableSlot.label);
      }
      return;
    }
    // Today is fully sold out — advance to the first available future day.
    const result = firstAvailableDay(today, timeSlots, h, today);
    if (result) {
      systemCorrectionRef.current = true;
      setRecipient((r) => ({ ...r, deliveryDate: result.iso }));
      setDeliverySlot(result.slot.label);
      if (result.iso !== today) setDeliveryMode("schedule");
      // Persist the corrected selection so the product page / cart stay in sync.
      deliverySelection.setSelection({
        mode: result.iso !== today ? "schedule" : "today_slot",
        date: result.iso,
        slotLabel: result.slot.label,
        slotId: result.slot.slotId ?? null,
        serviceType: isMidnightSlot(result.slot, selectedCityData?.id)
          ? "midnight"
          : null,
        cityId: selectedCityData?.id ?? null,
        source: "system_reselected",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeSlots]);

  // ── District-change revalidation ──────────────────────────────────────────
  // On a district change, the current delivery selection is revalidated
  // against the new city's live availability: preserved when still valid,
  // preserved-with-notice when only the fee changed, cleared with a
  // persistent amber notice (and payment blocked) when invalid. The shopper
  // is never silently handed a substitute slot.

  // Clear the current method/date/slot after a district change invalidated it.
  const clearDeliverySelectionForDistrictChange = () => {
    systemCorrectionRef.current = true;
    setDeliveryMode("schedule");
    setDeliverySlot("");
    setDeliverySlotId(undefined);
    setRecipient((r) => ({ ...r, deliveryDate: "" }));
  };

  // Classify the (pre-change) selection against `newCity` and apply the
  // outcome. `oldFeeUsd` is the district+slot fee charged before the change,
  // captured synchronously when the shopper picked the new district.
  const applyDistrictChangeOutcome = (
    districtName: string,
    newCity: NonNullable<typeof selectedCityData>,
    epoch: number,
    oldFeeUsd: number,
  ) => {
    // Latest district wins — out-of-order results from rapid switching are dropped.
    if (epoch !== districtChangeEpochRef.current) return;
    const prevBlocked = isDeliveryGateBlocked(districtRevalRef.current);
    const osCountry = locations?.countries.find((c) => c.code === countryCode);
    const outcome = classifyDistrictChange({
      mode: deliveryMode,
      slotLabel: deliverySlot,
      slotId: deliverySlotId ?? null,
      dateIso: recipient.deliveryDate || null,
      countryCode: countryCode ?? "LB",
      subtotal,
      noAddress,
      city: newCity,
      countryFreeDeliveryThresholdUsd: osCountry?.freeDeliveryThresholdUsd,
      countryFreeDeliveryEnabled: osCountry?.freeDeliveryEnabled,
    });
    if (outcome.kind === "invalid") {
      clearDeliverySelectionForDistrictChange();
      setDistrictReval({
        status: "invalid",
        districtName,
        cityId: newCity.id,
        reason: outcome.reason,
      });
      return;
    }
    if (outcome.kind === "none") {
      // Nothing was selected. If a previous district change already cleared
      // the selection, stay in the required-action state (with the new
      // district's name) — switching again, including back to the original
      // district, must never resurrect the cleared slot or unblock payment.
      setDistrictReval(
        prevBlocked
          ? { status: "invalid", districtName, cityId: newCity.id, reason: "slot" }
          : { status: "idle" },
      );
      return;
    }
    // Selection kept. Re-point a same-label slot at the new city's slot id so
    // fee lookups and the order payload use the new city's configuration.
    if (deliveryMode !== "express") {
      if ((outcome.slotId ?? undefined) !== deliverySlotId) {
        setDeliverySlotId(outcome.slotId ?? undefined);
        deliverySelection.setSelection({ slotId: outcome.slotId ?? null, cityId: newCity.id ?? null });
      } else {
        deliverySelection.setSelection({ cityId: newCity.id ?? null });
      }
    }
    setDistrictReval(
      feesDiffer(oldFeeUsd, outcome.newFeeUsd)
        ? { status: "feeChanged", districtName, cityId: newCity.id, oldFeeUsd, newFeeUsd: outcome.newFeeUsd }
        : { status: "idle" },
    );
  };

  // Entry point for a district change (combobox pick or saved-address apply).
  // Captures the pre-change fee synchronously, then classifies immediately
  // when the new city's data is already in memory, or parks in pending until
  // /api/delivery-locations resolves it (payment stays blocked meanwhile).
  const beginDistrictRevalidation = (districtName: string) => {
    const epoch = ++districtChangeEpochRef.current;
    const oldFeeUsd =
      checkoutFeesRef.current.districtFee + checkoutFeesRef.current.slotFee;
    const newCity = activeCities.find(
      (c) => c.isActive !== false && c.name === districtName,
    );
    if (!newCity) {
      setDistrictReval({
        status: locationsError && !locations ? "error" : "pending",
        districtName,
        epoch,
        oldFeeUsd,
      });
      return;
    }
    applyDistrictChangeOutcome(districtName, newCity, epoch, oldFeeUsd);
  };

  const handleDistrictSelect = (districtName: string) => {
    const prevEffective =
      recipient.district ||
      activeCities.find((c) => c.isActive !== false)?.name ||
      "";
    setRecipient((r) => ({ ...r, district: districtName }));
    if (!districtName || districtName === prevEffective) return;
    beginDistrictRevalidation(districtName);
  };

  // Retry after an availability-fetch failure: show the loading state again
  // and refetch. The pending-resolution effect below applies the result.
  const handleDistrictRevalRetry = () => {
    const st = districtRevalRef.current;
    if (st.status === "error") {
      setDistrictReval({
        status: "pending",
        districtName: st.districtName,
        cityId: st.cityId,
        epoch: st.epoch,
        oldFeeUsd: st.oldFeeUsd,
      });
    }
    void refetchLocations();
  };

  // Resolve a pending/errored district change when delivery-locations data
  // (re)arrives: classify against the now-known city, or surface the
  // recoverable error state when the fetch failed.
  useEffect(() => {
    const st = districtRevalRef.current;
    if (st.status !== "pending" && st.status !== "error") return;
    const newCity = activeCities.find(
      (c) => c.isActive !== false && c.name === st.districtName,
    );
    if (newCity) {
      applyDistrictChangeOutcome(st.districtName, newCity, st.epoch, st.oldFeeUsd);
      return;
    }
    if (locationsLoading || locationsFetching) return;
    if (locations && !newCity) {
      // Data arrived but the picked district is not an active city (e.g. it
      // was deactivated mid-session) — clear and require an explicit re-pick.
      if (st.status === "pending" && st.epoch === districtChangeEpochRef.current) {
        clearDeliverySelectionForDistrictChange();
        setDistrictReval({ status: "invalid", districtName: st.districtName, reason: "slot" });
      }
      return;
    }
    if (locationsError && st.status === "pending") {
      setDistrictReval({
        status: "error",
        districtName: st.districtName,
        cityId: st.cityId,
        epoch: st.epoch,
        oldFeeUsd: st.oldFeeUsd,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCities, locations, locationsLoading, locationsFetching, locationsError, districtReval]);

  // The ask-recipient flow hides the district field entirely — any pending
  // district-change notice is moot once no address is being collected now.
  useEffect(() => {
    if (noAddress && districtRevalRef.current.status !== "idle") {
      setDistrictReval({ status: "idle" });
    }
  }, [noAddress]);

  // Move focus to the inline notice when a district change clears the
  // selection, so keyboard and screen-reader users land on the explanation.
  // Slight delay lets the combobox popover's focus-restore finish first.
  const prevRevalStatusRef = useRef<DistrictRevalState["status"]>("idle");
  useEffect(() => {
    const prev = prevRevalStatusRef.current;
    prevRevalStatusRef.current = districtReval.status;
    if (districtReval.status === "invalid" && prev !== "invalid") {
      const id = window.setTimeout(() => {
        districtNoticeRef.current?.focus();
      }, 120);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [districtReval.status]);

  // Persisted-selection sanitization: a slot restored from the shared
  // delivery-selection store (refresh / back-navigation) must exist in the
  // CURRENT district's live schedule, otherwise it is dropped and the
  // required-action state is shown — a stale promise is never silently kept.
  // Runs once, as soon as the city's live schedule is known.
  const persistedSanitizedRef = useRef(false);
  useEffect(() => {
    if (persistedSanitizedRef.current) return;
    if (locationsLoading || !selectedCityData) return;
    persistedSanitizedRef.current = true;
    if (deliveryMode === "express" || !deliverySlot) return;
    const today = getLocalIso(countryCode);
    const dateIso = recipient.deliveryDate || today;
    if (dateIso === today) {
      // Today fully sold out is owned by the mount-time correction effect
      // above (it advances to the first available day) — don't double-handle.
      const h = getCountryHour(countryCode, new Date());
      const todaySoldOut =
        timeSlots.length > 0 && !timeSlots.some((s) => s.cutoffHour > h);
      if (todaySoldOut) return;
    }
    const osCountry = locations?.countries.find((c) => c.code === countryCode);
    const outcome = classifyDistrictChange({
      mode: "schedule",
      slotLabel: deliverySlot,
      slotId: deliverySlotId ?? null,
      dateIso: recipient.deliveryDate || null,
      countryCode: countryCode ?? "LB",
      subtotal,
      noAddress,
      city: selectedCityData,
      countryFreeDeliveryThresholdUsd: osCountry?.freeDeliveryThresholdUsd,
      countryFreeDeliveryEnabled: osCountry?.freeDeliveryEnabled,
    });
    if (outcome.kind === "invalid") {
      clearDeliverySelectionForDistrictChange();
      setDistrictReval({
        status: "invalid",
        districtName: selectedCityData.name,
        cityId: selectedCityData.id,
        reason: "slot",
      });
    } else if (outcome.kind === "kept" && (outcome.slotId ?? undefined) !== deliverySlotId) {
      // Same label, different id in this city's catalogue — re-point silently.
      setDeliverySlotId(outcome.slotId ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationsLoading, selectedCityData]);

  // These hooks must be called unconditionally — before any early return — to
  // comply with React's Rules of Hooks. Moving them here prevents a hooks-count
  // mismatch when showLoginGate flips or the cart hydrates from localStorage.
  const summaryDays = useMemo(
    () => dayLabels(t("checkout.day.today"), t("checkout.day.tomorrow")),
    [t],
  );
  // payCtxCountry (delivery country) still gates NON-CARD tiles (e.g. wallet
  // availability per market) — it is intentionally NOT the card-routing source.
  const payCtxCountry = countryCode ?? undefined;
  // Signed-in shoppers with a saved profile phone never render the sender
  // phone field, so derive the same "phone country" from the saved E.164
  // number via the code-split phone library. Null when unparseable → Stripe.
  useEffect(() => {
    if (!hasProfilePhone) return;
    let cancelled = false;
    import("react-phone-number-input")
      .then((m) => {
        if (cancelled) return;
        try {
          const parsed = m.parsePhoneNumber(profilePhone);
          setSenderPhoneCountry(parsed?.country ?? null);
          setSenderPhoneDialCode(parsed?.countryCallingCode ? String(parsed.countryCallingCode) : null);
        } catch {
          setSenderPhoneCountry(null);
          setSenderPhoneDialCode(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSenderPhoneCountry(null);
          setSenderPhoneDialCode(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hasProfilePhone, profilePhone]);
  const senderCountryCode = senderPhoneCountry?.trim().toUpperCase() || null;
  const paymentOptions = useMemo(() => {
    const ids = webVisiblePayMethods({
      activeCurrency: currencyCode,
      countryCode: payCtxCountry,
      isApplePlatform: appleDevice,
    }).filter((id) => {
      if (id === "apple_pay" || id === "google_pay") return walletSupported;
      return true;
    });
    return ids.map((id) => ({
      id,
      labelKey: webPaymentMethodLabelKey(id, currencyCode),
    })) as { id: PaymentMethodId; labelKey: string }[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencyCode, countryCode, senderCountryCode, walletSupported, appleDevice]);
  // If the currently selected payment method is no longer available for
  // the active currency / country, re-select a sensible default.
  useEffect(() => {
    // "klarna" is a special-cased method not in the WebPaymentMethodId union —
    // skip the fallback logic so that selecting it does not get immediately overridden.
    if (paymentMethod === "klarna") return;
    const fallback = webNextPaymentMethod(paymentMethod as WebPaymentMethodId, {
      activeCurrency: currencyCode,
      countryCode: payCtxCountry,
      isApplePlatform: appleDevice,
    });
    if (fallback !== paymentMethod) {
      setPaymentMethodState(fallback);
    }
    if (fallback === "card" || fallback === "apple_pay" || fallback === "google_pay") {
      triggerStripeLoad();
    }
  }, [currencyCode, countryCode, paymentMethod, triggerStripeLoad, payCtxCountry, walletSupported]);

  // Stripe PaymentRequest object reused for both the canMakePayment probe
  // and the actual wallet submit (non-AED). Stored after canMakePayment()
  // confirms support so it can be shown synchronously from handleSubmit.
  const paymentRequestRef = useRef<import("@stripe/stripe-js").PaymentRequest | null>(null);

  // Tracks whether the Apple Pay / Google Pay native sheet is currently open.
  // Prevents a second pr.update()/pr.show() call while the sheet is showing,
  // which would throw "cannot update Payment Request options while the payment
  // sheet is showing". Cleared in both the paymentmethod and cancel handlers.
  const walletSheetOpenRef = useRef(false);

  // Pre-created PaymentIntent for the wallet (Apple Pay / Google Pay) sheet.
  // The native sheet total MUST equal the server's authoritative charge exactly.
  // Safari requires pr.show() to run synchronously inside the click gesture (no
  // await beforehand), so we cannot create the PaymentIntent inside the click
  // handler and still know its amount before opening the sheet. Instead we
  // create it ahead of time (the effect below) whenever a wallet method is
  // selected and the amount-affecting inputs are stable, caching the server
  // amount + clientSecret keyed by a signature of those inputs. handleSubmit
  // then builds the PaymentRequest with the cached server amount and reuses the
  // same PaymentIntent for confirmation — so display and charge are byte-for-
  // byte identical. The wallet Pay button stays in a "preparing" (disabled)
  // state until a PaymentIntent matching the current inputs is ready, so the
  // native sheet is NEVER opened with a client estimate — the displayed total
  // always equals the server charge.
  const walletIntentRef = useRef<{
    signature: string;
    clientSecret: string;
    amount: number;
    currency: string;
    orderId: string;
  } | null>(null);
  // Mirror of walletIntentRef.current?.signature in state so the render can
  // reactively know whether the prepared intent matches the current inputs
  // (refs don't trigger re-renders). Drives the wallet button's preparing state.
  const [walletReadySig, setWalletReadySig] = useState<string | null>(null);
  // Set to true when PaymentIntent pre-creation fails; cleared automatically
  // when the shopper changes any amount-affecting input, which re-triggers the
  // preparation effect and effectively retries.
  const [walletPrepareFailed, setWalletPrepareFailed] = useState(false);
  // Bumped when the shopper taps the same wallet tile while preparation has
  // failed, so the effect re-runs even though paymentMethod didn't change.
  const [walletRetryNonce, setWalletRetryNonce] = useState(0);

  // Tracks whether the current viewport is mobile (≤ 767 px). Used to decide
  // whether a null canMakePayment() probe result should hide the wallet tiles
  // or leave them visible (mobile browsers probe unreliably at page load).
  const isMobile = useIsMobile();
  // Keep a mutable ref so the probe effect closure always reads the latest
  // value without needing to be added to the effect's dependency array.
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  // Probe wallet (Apple Pay / Google Pay) availability via Stripe's
  // PaymentRequest API. Runs once when the Stripe.js instance resolves.
  // If the browser / device reports no wallet is configured, silently
  // advance the selection to the next supported method so the shopper
  // is never stuck on a tile that would fail at submission.
  const walletCheckedRef = useRef(false);
  useEffect(() => {
    if (!stripe || walletCheckedRef.current) return;
    walletCheckedRef.current = true;
    // Use the Stripe merchant account's registered country (STRIPE_MERCHANT_COUNTRY,
    // default "US") — NOT the shopper's delivery country. Passing the shopper's
    // country (e.g. "LB") to stripe.paymentRequest() causes a constructor error
    // because Lebanon is not a supported Stripe merchant account country.
    let pr: import("@stripe/stripe-js").PaymentRequest;
    try {
      pr = stripe.paymentRequest({
        country: countryCode === "AE" ? STRIPE_MERCHANT_COUNTRY_GULF : STRIPE_MERCHANT_COUNTRY,
        currency: "usd",
        total: { label: "Presentail", amount: 100 }, // i18n-ignore — probe amount, updated at submit
        requestPayerName: false,
        requestPayerEmail: false,
        // Prevent Stripe Link from being injected as a wallet option in the
        // native Apple Pay / Google Pay sheet. Without this, Stripe.js v9+
        // may add a "Pay with Link" entry; selecting it redirects the page
        // to checkout.link.com instead of showing the native payment sheet.
        disableWallets: ["link", "browserCard"],
      });
    } catch (constructErr) {
      console.warn("Stripe paymentRequest() constructor failed:", constructErr, { country: countryCode === "AE" ? STRIPE_MERCHANT_COUNTRY_GULF : STRIPE_MERCHANT_COUNTRY });
      // paymentRequest() constructor failed — STRIPE_MERCHANT_COUNTRY
      // doesn't match the Stripe account's registered country, or the browser
      // doesn't support the PaymentRequest API at all. Hide wallet tiles
      // immediately so shoppers aren't left tapping a broken option.
      setWalletSupported(false);
      setPaymentMethodState((current) => {
        if (current !== "apple_pay" && current !== "google_pay") return current;
        return "card";
      });
      return;
    }
    // Cap the probe at 5 s — on Chrome iOS canMakePayment() can return a
    // promise that never settles, which would leave walletCheckedRef stuck.
    // A timeout here is safe because we don't act on the probe result anyway.
    withTimeout(pr.canMakePayment(), 5000).then((_result) => {
      // Whether the probe returns a truthy result or null, we leave the wallet
      // tiles visible. The initial probe can return null transiently — e.g. on
      // Mac, Safari Keychain or Chrome's Google Pay service may not have
      // resolved yet — so hiding tiles here would incorrectly remove them for
      // the entire page load. The definitive gate is the submit-time
      // canMakePayment() call in the wallet intent pre-creation effect: if
      // that also returns null, handleSubmit shows an error toast and switches
      // the shopper to card instead of silently proceeding.
      //
      // We do NOT store this probe PR for reuse: it was constructed with
      // currency "usd" and a PaymentRequest's currency is immutable, so
      // reusing it would force the wallet sheet to display USD. The wallet
      // intent pre-creation effect creates a fresh PR with the correct
      // currency and pre-validates it via canMakePayment() so handleSubmit
      // can call show() synchronously inside the click gesture.
    }).catch(() => {
      // Ignore errors and timeouts (e.g. Stripe not fully initialised yet, or
      // Chrome iOS canMakePayment() timing out after 5 s).
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe]);

  // Pre-create the wallet PaymentIntent so the Apple Pay / Google Pay sheet can
  // display the server's exact charge (see walletIntentRef above). Runs whenever
  // a wallet method is selected and an amount-affecting input changes; debounced
  // so rapid edits (e.g. typing an email) don't spawn a PaymentIntent per
  // keystroke. The result is cached in walletIntentRef keyed by a signature of
  // the inputs; handleSubmit consumes it synchronously on tap.
  useEffect(() => {
    const isWallet = paymentMethod === "apple_pay" || paymentMethod === "google_pay";
    if (
      !isWallet ||
      !stripe ||
      !walletSupported ||
      !isHydrated ||
      itemCount === 0
    ) {
      // Not a Stripe-wallet context: drop any prepared intent so the button
      // never shows "ready" for stale inputs.
      if (walletReadySig !== null) setWalletReadySig(null);
      setWalletPrepareFailed(false);
      return;
    }

    // Recompute the delivery fee from the same inputs calcCheckoutFees uses
    // after the early returns, so the signature and the charged amount match.
    const sCity = selectedCityData;
    const osCountry = locations?.countries.find((c) => c.code === countryCode);
    const thr = sCity?.freeDeliveryThresholdUsd ?? osCountry?.freeDeliveryThresholdUsd;
    const en = sCity?.freeDeliveryEnabled ?? osCountry?.freeDeliveryEnabled;
    const fees = calcCheckoutFees({
      subtotal,
      countryCode: countryCode ?? "LB",
      cityId: selectedCityData?.id ? String(selectedCityData.id) : null,
      noAddress,
      cityFee: sCity?.fee ?? 0,
      deliveryMode,
      timeSlots,
      deliverySlot,
      deliverySlotId: deliveryMode !== "express" ? deliverySlotId : undefined,
      deliveryDate: recipient.deliveryDate || undefined,
      freeDeliveryThresholdUsd: thr,
      freeDeliveryEnabled: en,
    });
    const deliveryFeeUsd = fees.districtFee + fees.expressFee + fees.slotFee;
    const couponCode = couponApplied && couponInput.trim() ? couponInput.trim() : undefined;
    const mappedItems = items.map((i) => ({
      wcId: i.product.wcId,
      osSlug: i.product.id,
      quantity: i.quantity,
    }));
    // Guard: cart not yet hydrated into mappedItems — wait rather than send an
    // empty-items body that the server rejects with a fast 400.
    if (mappedItems.length === 0) {
      if (walletReadySig !== null) setWalletReadySig(null);
      return;
    }
    // Guard: if slots have loaded but none is selected yet, wait until the
    // state resolves rather than pre-creating a PI with deliverySlot:"".
    // This prevents the server snapshot from recording a blank slot that
    // would cause a 402 mismatch when the order body carries the real slot.
    if (deliveryMode !== "express" && !deliverySlot && timeSlots.length > 0) {
      if (walletReadySig !== null) setWalletReadySig(null);
      return;
    }

    // Mirror _selectedDistrict: fall back to the first active city when the
    // shopper hasn't explicitly chosen a district. currentWalletSig uses the
    // same logic so the two signatures stay byte-for-byte identical.
    const effectFirstActiveCity = activeCities.find((c) => c.isActive !== false);
    const effectDistrict = recipient.district || effectFirstActiveCity?.name || "";
    const sig = walletPiSignature({
      items: mappedItems,
      currency: checkoutCurrency,
      email: sender.email || undefined,
      deliveryFeeUsd,
      expressDelivery: deliveryMode === "express",
      noAddress,
      couponCode,
      deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
      deliverySlotId: deliveryMode === "express" ? undefined : deliverySlotId,
      deliveryCityId: deliveryMode === "express" ? undefined : selectedCityData?.id,
      deliveryDate:
        deliveryMode === "express" ? undefined : recipient.deliveryDate || undefined,
      district: effectDistrict || undefined,
    });
    // A fresh PaymentIntent for these exact inputs already exists — make sure
    // the button reflects readiness and stop.
    if (walletIntentRef.current?.signature === sig) {
      if (walletReadySig !== sig) setWalletReadySig(sig);
      return;
    }

    // Inputs changed since the last prepared intent: it no longer matches the
    // amount we'd charge, so mark the button "preparing" until the new intent
    // lands. This is what prevents the sheet from ever opening with a stale or
    // estimated total.
    if (walletReadySig !== null) setWalletReadySig(null);
    // Invalidate the previously pre-validated PaymentRequest so the stale
    // instance is never shown for a different amount/currency.
    paymentRequestRef.current = null;
    // Clear any prior failure so the spinner re-arms and the shopper can see
    // preparation is retrying rather than still stuck in a failed state.
    setWalletPrepareFailed(false);

    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const orderId = await ensureOrderId();
        // Race the PI creation against a 15 s deadline. On a slow mobile
        // connection the fetch can hang indefinitely; timing out here falls
        // into the catch block below which sets walletPrepareFailed(true) and
        // shows the error toast — same UX as any other network failure.
        const res = await withTimeout(createPaymentIntent.mutateAsync({
          data: {
            items: mappedItems,
            orderId,
            currency: checkoutCurrency,
            email: sender.email || undefined,
            deliveryFeeUsd,
            district: recipient.district || undefined,
            expressDelivery: deliveryMode === "express",
            noAddress,
            ...(couponCode ? { couponCode } : {}),
            deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
            ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
            ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
            deliveryDate:
              deliveryMode === "express" ? undefined : recipient.deliveryDate || undefined,
          } as Parameters<typeof createPaymentIntent.mutateAsync>[0]["data"],
        }), 15000);
        if (cancelled) return;
        if (res.ok && res.clientSecret && typeof res.amount === "number" && res.currency) {
          walletIntentRef.current = {
            signature: sig,
            clientSecret: res.clientSecret,
            amount: res.amount,
            currency: res.currency.toLowerCase(),
            orderId,
          };
          // Fire a /checkout/fees request in parallel with canMakePayment() to
          // proactively hydrate the Order Summary with server-authoritative USD
          // amounts. This ensures the displayed total matches the PI amount even
          // before the shopper taps Pay. Best-effort: never blocks wallet readiness.
          {
            const _wBaseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
            fetch(`${_wBaseUrl}/api/checkout/fees`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                items: mappedItems,
                currency: checkoutCurrency,
                email: sender.email || undefined,
                district: effectDistrict || undefined,
                expressDelivery: deliveryMode === "express",
                noAddress,
                deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
                ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
                ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
                deliveryDate:
                  deliveryMode === "express" ? undefined : recipient.deliveryDate || undefined,
                ...(couponCode ? { couponCode } : {}),
              }),
            })
              .then(r => (r.ok ? r.json() : null))
              .then((fd: { ok?: boolean; subtotalUsd?: number; districtFeeUsd?: number; expressFeeUsd?: number; slotFeeUsd?: number; couponDiscountUsd?: number; } | null) => {
                if (!cancelled && fd?.ok) {
                  setServerFeesOverride({
                    subtotalUsd: fd.subtotalUsd ?? 0,
                    districtFeeUsd: fd.districtFeeUsd ?? 0,
                    expressFeeUsd: fd.expressFeeUsd ?? 0,
                    slotFeeUsd: fd.slotFeeUsd ?? 0,
                    couponDiscountUsd: fd.couponDiscountUsd ?? 0,
                  });
                }
              })
              .catch(() => { /* best-effort — display falls back to computed values */ });
          }
          // Pre-create and canMakePayment()-validate the submit-time
          // PaymentRequest now, while we are NOT in a user-gesture context.
          // Stripe requires canMakePayment() to be called on a PR instance
          // before pr.show() can be called on it — calling show() on a fresh
          // PR without prior canMakePayment() throws synchronously. We create
          // the PR here (where the exact server-computed currency and amount
          // are known) and store it in paymentRequestRef so handleSubmit can
          // call show() synchronously inside the click gesture with no await.
          const submitCountry = countryCode === "AE" ? STRIPE_MERCHANT_COUNTRY_GULF : STRIPE_MERCHANT_COUNTRY;
          const WALLET_CAN_MAKE_PAYMENT_MAX_RETRIES = 3;
          let canMakePaymentAttempts = 0;

          // Attempt canMakePayment() on the given PR. When null is returned
          // (common transiently on mobile before the wallet service has fully
          // initialised), automatically create a fresh PR and retry up to
          // WALLET_CAN_MAKE_PAYMENT_MAX_RETRIES times (~1 s apart) before
          // giving up and leaving paymentRequestRef null — which causes
          // handleSubmit to show the "wallet unavailable" error if tapped.
          // A PR's currency is immutable so each retry creates a fresh instance.
          function tryCanMakePayment(pr: import("@stripe/stripe-js").PaymentRequest): void {
            // withTimeoutAsNull resolves with null both on a 5 s deadline AND
            // on any canMakePayment() rejection — so a timeout or error on
            // Chrome iOS feeds the same null → retry / give-up branch as a
            // normal null result, rather than short-circuiting to the catch
            // path and skipping the remaining retry budget.
            withTimeoutAsNull(pr.canMakePayment(), 5000).then((result) => {
              if (cancelled) return;
              if (result) {
                paymentRequestRef.current = pr;
                setWalletReadySig(sig);
              } else if (canMakePaymentAttempts < WALLET_CAN_MAKE_PAYMENT_MAX_RETRIES) {
                canMakePaymentAttempts++;
                setTimeout(() => {
                  if (cancelled || !stripe) return;
                  try {
                    const retryPr = stripe.paymentRequest({
                      country: submitCountry,
                      currency: res.currency.toLowerCase(),
                      total: {
                        label: t("checkout.payment.orderTitle"),
                        amount: res.amount,
                      },
                      requestPayerName: false,
                      requestPayerEmail: false,
                      disableWallets: ["link", "browserCard"],
                    });
                    tryCanMakePayment(retryPr);
                  } catch (retryConstructErr) {
                    console.warn("Stripe paymentRequest() constructor failed:", retryConstructErr, { country: submitCountry });
                    paymentRequestRef.current = null;
                    setWalletReadySig(sig);
                  }
                }, 1000);
              } else {
                paymentRequestRef.current = null;
                setWalletReadySig(sig);
              }
            });
            // No .catch() — withTimeoutAsNull always resolves (never rejects).
          }

          try {
            const submitPr = stripe.paymentRequest({
              country: submitCountry,
              currency: res.currency.toLowerCase(),
              total: {
                label: t("checkout.payment.orderTitle"),
                amount: res.amount,
              },
              requestPayerName: false,
              requestPayerEmail: false,
              disableWallets: ["link", "browserCard"],
            });
            tryCanMakePayment(submitPr);
          } catch (constructErr) {
            console.warn("Stripe paymentRequest() constructor failed:", constructErr, { country: submitCountry });
            paymentRequestRef.current = null;
            setWalletReadySig(sig);
          }
        }
      } catch (error) {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          console.warn("Wallet payment preparation failed", error);
        }
        // Mark the failure so the spinner stops and the shopper can see an
        // error rather than a button disabled with no explanation. A later
        // input change (email, slot, coupon, etc.) clears this flag and
        // re-arms the preparation effect automatically.
        setWalletPrepareFailed(true);
        // Reset the mutation so its isPending flag clears immediately. Without
        // this, a network hang that is cut short by withTimeout still keeps
        // createPaymentIntent.isPending = true, which leaves isProcessing true
        // and the submit button disabled even after walletPrepareFailed stops
        // the wallet spinner.
        createPaymentIntent.reset();
        toast({
          title: t("checkout.toast.walletPrepareFailTitle"),
          description: t(paymentMethod === "google_pay" ? "checkout.toast.walletPrepareFailDescGoogle" : "checkout.toast.walletPrepareFailDesc"),
          variant: "destructive",
        });
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paymentMethod,
    stripe,
    walletSupported,
    countryCode,
    checkoutCurrency,
    isHydrated,
    itemCount,
    subtotal,
    selectedCityData,
    locations,
    noAddress,
    deliveryMode,
    timeSlots,
    deliverySlot,
    deliverySlotId,
    recipient.deliveryDate,
    couponApplied,
    couponInput,
    sender.email,
    recipient.district,
    activeCities,
    items,
    walletRetryNonce,
  ]);

  if (showLoginGate) {
    return (
      <>
        <CheckoutSkeleton />
        <CheckoutLoginDialog
          open
          onOpenChange={(open) => {
            if (!open && !guestContinuing.current) setLocation("/cart");
          }}
          onContinueAsGuest={() => {
            guestContinuing.current = true;
            setGuestAcked(true);
          }}
          surface="checkout-direct"
        />
      </>
    );
  }

  if (isHydrated && itemCount === 0) {
    return (
      <div className="min-h-screen pt-32 pb-24 text-center">
        <h1 className="text-3xl font-serif mb-4">{t("checkout.empty.title")}</h1>
        <Button asChild data-testid="button-back-to-shop"><Link href="/shop">{t("checkout.empty.cta")}</Link></Button>
      </div>
    );
  }

  const currentCountryCities = activeCities;
  const firstActiveCity = currentCountryCities.find((c) => c.isActive !== false);
  const hasActiveCities = firstActiveCity !== undefined;
  const _selectedDistrict = recipient.district || firstActiveCity?.name || "";
  // Per-city fees and free-delivery rules come from the OS cache (via
  // /api/delivery-locations) so changes in Presentail OS propagate within
  // the polling interval. The OS threshold/enabled flag override the
  // hardcoded per-country defaults in checkoutFees.ts.
  const selectedCity = selectedCityData;
  // City-level free-delivery settings take precedence over country-level.
  // selectedCity comes from the OS cache via /api/delivery-locations and
  // now carries per-city freeDeliveryThresholdUsd / freeDeliveryEnabled.
  const osCountryData = locations?.countries.find((c) => c.code === countryCode);
  // Effective threshold/enabled for the currently selected city — used both
  // for fee calculation and for the FreeDeliveryBanner in the order summary.
  const effectiveFreeDeliveryThresholdUsd =
    selectedCity?.freeDeliveryThresholdUsd ?? osCountryData?.freeDeliveryThresholdUsd;
  const effectiveFreeDeliveryEnabled =
    selectedCity?.freeDeliveryEnabled ?? osCountryData?.freeDeliveryEnabled;
  const { districtFee, expressFee, slotFee, isMidnightSlotActive, total } = calcCheckoutFees({
    subtotal,
    countryCode: countryCode ?? "LB",
    cityId: selectedCity?.id ? String(selectedCity.id) : null,
    noAddress,
    cityFee: selectedCity?.fee ?? 0,
    deliveryMode,
    timeSlots,
    deliverySlot,
    deliverySlotId: deliveryMode !== "express" ? deliverySlotId : undefined,
    deliveryDate: recipient.deliveryDate || undefined,
    freeDeliveryThresholdUsd: effectiveFreeDeliveryThresholdUsd,
    freeDeliveryEnabled: effectiveFreeDeliveryEnabled,
  });
  // Keep feesRef in sync so early-firing effects (checkout_step, auto-promo)
  // can read current fees without hitting a TDZ on the const declarations above.
  checkoutFeesRef.current = { districtFee, expressFee, slotFee };

  // Clear the server fee override whenever any fee-affecting input changes so a
  // stale override never persists after the shopper modifies delivery settings.
  useEffect(() => {
    setServerFeesOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, deliveryMode, _selectedDistrict, noAddress, confirmedCouponDiscount, deliverySlot]);

  // Derived display values: prefer server-authoritative USD amounts when the
  // override is set; fall back to client-computed fees otherwise. These drive
  // OrderSummaryPanel and PaymentSubmitButton so the visible total always
  // matches what the server will charge.
  const displaySubtotal = serverFeesOverride?.subtotalUsd ?? subtotal;
  const displayDistrictFee = serverFeesOverride?.districtFeeUsd ?? districtFee;
  const displayExpressFee = serverFeesOverride?.expressFeeUsd ?? expressFee;
  const displaySlotFee = serverFeesOverride?.slotFeeUsd ?? slotFee;
  const displayCouponDiscount = serverFeesOverride?.couponDiscountUsd ?? confirmedCouponDiscount;

  // Estimated payment amount (minor units) for Stripe's deferred-intent /
  // True when the shopper's subtotal meets the free-standard-delivery threshold.
  // Uses exactly the same inputs and gate condition as calcCheckoutFees so the
  // two can never disagree: (freeDeliveryEnabled && subtotal >= threshold).
  const originalCityFee = selectedCity?.fee ?? 0;
  const freeDeliveryThresholdForUnlock =
    effectiveFreeDeliveryThresholdUsd ?? freeDeliveryThresholdUsd(countryCode ?? "LB");
  const isFreeDeliveryUnlocked =
    (effectiveFreeDeliveryEnabled !== false) && subtotal >= freeDeliveryThresholdForUnlock;

  // Signature of the current amount-affecting inputs, matching the one the
  // pre-creation effect computes. A wallet PaymentIntent is "ready" only when a
  // prepared intent for this exact signature exists — in which case the native
  // sheet can be opened showing the server's exact amount. Until then the
  // wallet button shows a "preparing" state and is disabled, so the sheet is
  // never opened with a client estimate.
  const currentWalletSig = walletPiSignature({
    items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
    currency: checkoutCurrency,
    email: sender.email || undefined,
    deliveryFeeUsd: districtFee + expressFee + slotFee,
    expressDelivery: deliveryMode === "express",
    noAddress,
    couponCode: couponApplied && couponInput.trim() ? couponInput.trim() : undefined,
    deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
    deliverySlotId: deliveryMode === "express" ? undefined : deliverySlotId,
    deliveryCityId: deliveryMode === "express" ? undefined : selectedCityData?.id,
    deliveryDate:
      deliveryMode === "express" ? undefined : recipient.deliveryDate || undefined,
    district: _selectedDistrict || undefined,
  });
  const isWalletMethodSelected =
    paymentMethod === "apple_pay" || paymentMethod === "google_pay";
  // All wallet methods (including AED via Gulf Stripe) pre-create a Stripe
  // PaymentIntent, so they are gated on readiness.
  const walletNeedsStripeIntent = isWalletMethodSelected;
  const walletIntentReady = walletReadySig === currentWalletSig;
  // Stop the preparing spinner when preparation has failed: the shopper should
  // see the error toast and be able to tap the tile again (which re-selects the
  // method and triggers a fresh input-change cycle) or switch to another method.
  const walletPreparing = walletNeedsStripeIntent && !walletIntentReady && !walletPrepareFailed;

  // Build a "Today · 2:00 PM – 6:00 PM" / "Wed 13 · …" / "Express Delivery"
  // line for the order summary so the shopper can confirm their pick at a
  // glance before paying — mirrors the mobile checkout summary.
  // NOTE: summaryDays is computed above (before early returns) to satisfy Rules of Hooks.
  let deliveryRowText: string | null = null;
  try {
    deliveryRowText = formatDeliveryRow({
      mode: deliveryMode,
      date: recipient.deliveryDate,
      slotLabel: deliverySlot,
      slotTimeRange: slotTimeRangeForLabel(deliverySlot, timeSlots),
      days: summaryDays,
      expressLabel: t("checkout.expressDeliveryLabel"),
    });
  } catch {
    // safe fallback — delivery row will show the picker affordance
  }
  // ── Mobile checkout redesign: analytics + express arrival promise ──
  // Authoritative quote-derived grand total shared by the sticky footer CTA
  // (OrderSummaryPanel derives the identical value from the same inputs).
  const mobileGrandTotal = computeCartTotal(
    displaySubtotal,
    displayDistrictFee + displayExpressFee + displaySlotFee,
    displayCouponDiscount,
  );
  // Express arrival deadline — anchored when express is selected (does not
  // continuously drift forward), cleared when the shopper leaves express.
  const [expressDeadline, setExpressDeadline] = useState<Date | null>(null);
  useEffect(() => {
    if (deliveryMode === "express") {
      setExpressDeadline((prev) => prev ?? new Date(Date.now() + 90 * 60 * 1000));
    } else {
      setExpressDeadline(null);
    }
  }, [deliveryMode]);
  const expressDeadlineText = useMemo(() => {
    if (!expressDeadline) return "";
    try {
      return new Intl.DateTimeFormat(
        language === "ar" ? "ar" : language === "fr" ? "fr" : "en",
        {
          hour: "numeric",
          minute: "2-digit",
          timeZone: (countryCode ?? "LB") === "AE" ? "Asia/Dubai" : "Asia/Beirut",
        },
      ).format(expressDeadline);
    } catch {
      return "";
    }
  }, [expressDeadline, countryCode, language]);
  // Fire the delivery-confirmation-viewed event once per delivery type while
  // the mobile step-1 confirmation card is on screen.
  const deliveryConfirmationViewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isMobile || step !== 1) return;
    if (deliveryConfirmationViewedRef.current === deliveryMode) return;
    deliveryConfirmationViewedRef.current = deliveryMode;
    trackWebEvent({
      type: "mobile_checkout_delivery_confirmation_viewed",
      currency: checkoutCurrency,
      properties: {
        delivery_type: deliveryMode === "express" ? "express" : "standard",
        promise_type: deliveryMode === "express" ? "deadline" : "scheduled_window",
      },
    });
  }, [isMobile, step, deliveryMode, checkoutCurrency]);
  // Summary toggle wrapper — OrderSummaryPanel calls this from the mobile
  // header row; fires the analytics event once per toggle action.
  const handleSummaryOpenChange = (open: boolean) => {
    setSummaryOpen(open);
    if (isMobile) {
      trackWebEvent({
        type: "mobile_checkout_summary_toggled",
        currency: checkoutCurrency,
        properties: {
          expanded: open,
          delivery_type: deliveryMode === "express" ? "express" : "standard",
        },
      });
    }
  };
  // The selected delivery date/slot went stale (same-day window ended or the
  // city cutoff passed) — surface a friendly prompt and open the delivery
  // picker so the shopper re-picks. Cart and all other checkout state are
  // preserved; payment is simply not initiated.
  const promptStaleSlotRepick = () => {
    toast({
      title: t("checkout.toast.staleSlotTitle"),
      description: t("checkout.toast.staleSlotDesc"),
      variant: "destructive",
    });
    setDeliveryPickerOpen(true);
  };
  const handleMobileDeliveryChange = () => {
    trackWebEvent({
      type: "mobile_checkout_delivery_change_clicked",
      properties: {
        current_delivery_type: deliveryMode === "express" ? "express" : "standard",
      },
    });
    setDeliveryPickerOpen(true);
  };
  const handleMobileContinue = () => {
    trackWebEvent({
      type: "mobile_checkout_continue_payment_clicked",
      currency: checkoutCurrency,
      value: mobileGrandTotal,
      properties: {
        delivery_type: deliveryMode === "express" ? "express" : "standard",
        standard_delivery_free: isFreeDeliveryUnlocked || displayDistrictFee === 0,
        express_upgrade_present: deliveryMode === "express",
        promo_or_gift_card_applied: couponApplied || displayCouponDiscount > 0,
      },
    });
    const invalidField = handleValidateAndAdvance();
    if (invalidField) {
      trackWebEvent({
        type: "mobile_checkout_validation_failed",
        properties: { first_invalid_field: invalidField, surface: "mobile_sticky" },
      });
    }
  };

  // Desktop sidebar "Continue to Payment" — always clickable (no disabled
  // gate): an invalid form shows the guided inline errors and scrolls to the
  // first invalid field via handleValidateAndAdvance, and fires the same
  // validation-failed analytics as the mobile sticky CTA, tagged with the
  // desktop surface.
  const handleDesktopContinue = () => {
    const invalidField = handleValidateAndAdvance();
    if (invalidField) {
      trackWebEvent({
        type: "mobile_checkout_validation_failed",
        properties: { first_invalid_field: invalidField, surface: "desktop_sidebar" },
      });
    }
  };

  // Delivery-promise payload for the desktop sidebar confirmation panel.
  // Express: quote-anchored "Arrives by [time]"; Standard: "Arrives [day · window]".
  const deliveryPromise =
    deliveryMode === "express"
      ? { type: "express" as const, arrivesBy: expressArrivesBy }
      : { type: "standard" as const, when: deliveryRowText };

  const isProcessing =
    createOrder.isPending ||
    stripeSession.isPending ||
    createPaymentIntent.isPending ||
    mamoPayment.isPending ||
    paypalPayment.isPending ||
    tabbyPayment.isPending ||
    cardProcessing;

  // Active display currency derived from the active country. Used both
  // by the payment-method picker (to hide unavailable methods) and by
  // the submit handler (to route AED + wallet through Mamo's hosted page,
  // mirroring mobile checkout).
  const activeCurrency = activeCurrencyForCountry(countryCode ?? "LB");

  // orderId is generated once per checkout attempt and threaded through the
  // payment session creation AND the WC order payload so the server can bind
  // them together and reject any replay of a paid session for a different order.
  // ── Landmark recognition handlers ─────────────────────────────────────────

  // Resolve an Address Book place's verified district onto one of our active
  // delivery cities (the district picker's option list). Returns undefined
  // when the place's district isn't a selectable city for this country.
  const resolvePlaceCity = useCallback(
    (place: CheckoutPlace) => {
      const active = activeCities.filter((c) => c.isActive !== false);
      return active.find(
        (c) =>
          (place.districtCityId && String(c.id) === place.districtCityId) ||
          (place.districtCityName &&
            c.name.trim().toLowerCase() === place.districtCityName.trim().toLowerCase()) ||
          (place.districtName &&
            c.name.trim().toLowerCase() === place.districtName.trim().toLowerCase()),
      );
    },
    [activeCities],
  );

  // Explicit selection of a verified place from the suggestion dropdown.
  // recipient.address is intentionally left as the typed query so the Change
  // action returns to free text with the query preserved.
  const handleSelectPlace = (place: CheckoutPlace, typedQuery: string) => {
    setSelectedPlace(place);
    setPlaceTypedQuery(typedQuery);
    setPlaceInternalDetail("");
    const targetCity = resolvePlaceCity(place);
    if (targetCity && targetCity.name !== recipient.district) {
      // Different district: move the picker to the place's verified district.
      // The existing recalculation reacts to the district change
      // (serverFeesOverride is cleared on _selectedDistrict change), so
      // fees, free-delivery, dates, and the order summary update immediately.
      setRecipient((prev) => ({ ...prev, district: targetCity.name }));
      // Computed for analytics only — the actual keep/clear decision runs
      // through the district-change revalidation below, which also handles
      // fee changes, blocks payment on an invalid selection, and guards the
      // auto-pick effects so a cleared slot is never silently replaced.
      const newCitySlots = targetCity.timeSlots?.length
        ? targetCity.timeSlots
        : targetCity.slotsByDay
          ? Object.values(targetCity.slotsByDay).flat()
          : [];
      const slotStillValid =
        !deliverySlot ||
        newCitySlots.some((s) => {
          // The web /delivery-locations city type doesn't declare slotId, but
          // live OS-backed slots carry it — prefer the stable id when both
          // sides have one, otherwise fall back to the label.
          const sid = (s as { slotId?: string }).slotId;
          return deliverySlotId && sid ? sid === deliverySlotId : s.label === deliverySlot;
        });
      // Never carry an invalid slot (or a stale fee) across a district change.
      beginDistrictRevalidation(targetCity.name);
      setPlaceDistrictNotice({
        placeName: place.name,
        districtName: cityName(targetCity.id, targetCity.name),
      });
      trackWebEvent({
        type: "landmark_district_auto_changed",
        properties: {
          placeId: place.id,
          from: recipient.district || undefined,
          to: targetCity.name,
          slotCleared: !slotStillValid,
        },
      });
    } else {
      // Same district (or district not selectable) — leave it untouched, no banner.
      setPlaceDistrictNotice(null);
    }
  };

  // Change action on the verified-place card: back to the editable free-text
  // field. recipient.address still holds the pre-selection query, and the
  // district is deliberately NOT reverted (never change it silently).
  const handleClearPlace = () => {
    if (!selectedPlace) return;
    trackWebEvent({
      type: "landmark_selection_removed",
      properties: { placeId: selectedPlace.id, reason: "change_clicked" },
    });
    setSelectedPlace(null);
    setPlaceInternalDetail("");
    setPlaceDistrictNotice(null);
  };

  // "Ask the recipient for the address" bypasses landmark recognition
  // entirely — drop any selected place when it turns on.
  useEffect(() => {
    if (noAddress && selectedPlace) {
      trackWebEvent({
        type: "landmark_selection_removed",
        properties: { placeId: selectedPlace.id, reason: "ask_recipient_enabled" },
      });
      setSelectedPlace(null);
      setPlaceInternalDetail("");
      setPlaceDistrictNotice(null);
    }
  }, [noAddress, selectedPlace]);

  const buildOrderPayload = (
    overrides: {
      paymentRef?: string;
      orderId?: string;
      paymentMethod?: PaymentMethodId;
    } = {},
  ) => ({
    orderId: overrides.orderId ?? orderIdRef.current ?? `LB-0`,
    items: items.map((i) => ({
      name: i.product.name,
      quantity: i.quantity,
      price: i.product.priceValue,
      wcId: i.product.wcId,
      osSlug: i.product.id,
      image: i.product.images?.[0]?.uri,
      customInput: i.customNote?.trim() || undefined,
    })),
    billing: {
      firstName: sender.firstName,
      lastName: sender.lastName,
      email: sender.email,
      phone: sender.phone,
    },
    recipient: {
      // Single recipient-name field: the whole entered value (trimmed) travels
      // as firstName; lastName stays empty for downstream first/last-shaped
      // consumers (WooCommerce, OS) — never split the name.
      firstName: recipient.firstName.trim(),
      lastName: "",
      phone: recipient.phone,
    },
    district: _selectedDistrict,
    districtFee: districtFee,
    expressFee,
    slotFee,
    cityId: selectedCityData?.id != null ? String(selectedCityData.id) : undefined,
    noAddress,
    // Flattened address string stays populated for full backward
    // compatibility even when a verified place is selected.
    deliveryDetails: noAddress
      ? "To be confirmed"
      : selectedPlace
        ? flattenPlaceAddress(selectedPlace, placeInternalDetail)
        : recipient.address,
    deliveryDate: deliveryMode === "express" ? todayIso() : recipient.deliveryDate,
    deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
    ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
    deliveryServiceType: isMidnightSlotActive ? "midnight" : undefined,
    deliverySlotTime: deliveryMode === "express" ? undefined : slotTimeRangeForLabel(deliverySlot, timeSlots),
    cardMessage: recipient.cardMessage,
    cardTo: recipient.cardTo.trim() || undefined,
    cardFrom: buildCardFrom((() => { try { return localStorage.getItem(CARD_FROM_KEY) ?? ""; } catch { return ""; } })()),
    ...(/^https?:\/\/.+/.test(qrLink.trim()) ? { qrLink: qrLink.trim() } : {}),
    paymentMethod: overrides.paymentMethod ?? paymentMethod,
    identitySecret,
    whatsappOptIn,
    currencyCode: "USD",
    couponDiscount: confirmedCouponDiscount > 0 ? confirmedCouponDiscount : undefined,
    totalUsd: computeCartTotal(subtotal, districtFee + expressFee + slotFee, confirmedCouponDiscount),
    shippingCountry: (countryCode ?? "LB").toUpperCase().slice(0, 2),
    ...(couponApplied && couponInput.trim() ? { couponCode: couponInput.trim() } : {}),
    ...(overrides.paymentRef ? { paymentRef: overrides.paymentRef } : {}),
    ...(!noAddress && (selectedPlace || recipient.address)
      ? {
          street: selectedPlace
            ? flattenPlaceAddress(selectedPlace, placeInternalDetail)
            : recipient.address,
        }
      : {}),
    // Structured verified-place record — OS links the order back to its
    // Address Book entry (id + verified name/coords/district) alongside the
    // shopper's internal-location detail and original typed query.
    ...(!noAddress && selectedPlace
      ? {
          addressBookPlace: {
            placeId: selectedPlace.id,
            name: selectedPlace.name,
            ...(selectedPlace.officialName ? { officialName: selectedPlace.officialName } : {}),
            ...((selectedPlace.districtCityName ?? selectedPlace.districtName)
              ? { districtName: (selectedPlace.districtCityName ?? selectedPlace.districtName)! }
              : {}),
            ...(selectedPlace.districtCityId ? { districtCityId: selectedPlace.districtCityId } : {}),
            ...(typeof selectedPlace.lat === "number" ? { lat: selectedPlace.lat } : {}),
            ...(typeof selectedPlace.lng === "number" ? { lng: selectedPlace.lng } : {}),
            ...(placeInternalDetail.trim() ? { internalDetail: placeInternalDetail.trim() } : {}),
            ...(placeTypedQuery ? { typedQuery: placeTypedQuery } : {}),
            selectionSource: "suggestion",
          },
        }
      : {}),
    ...(selectedCityData?.name ? { deliveryCity: selectedCityData.name } : {}),
    ...(countryCode ? { deliveryCountry: countryCode.toUpperCase().slice(0, 2) } : {}),
    ...(savedAddressSubFieldsRef.current?.building ? { building: savedAddressSubFieldsRef.current.building } : {}),
    ...(savedAddressSubFieldsRef.current?.floor ? { floor: savedAddressSubFieldsRef.current.floor } : {}),
    ...(savedAddressSubFieldsRef.current?.apartment ? { apartment: savedAddressSubFieldsRef.current.apartment } : {}),
  });

  const finalizeOrderNow = async (paymentRef?: string, paymentMethodOverride?: PaymentMethodId) => {
    const payload = buildOrderPayload({ paymentRef, paymentMethod: paymentMethodOverride });
    const res = (await createOrder.mutateAsync(payload)) as CreateOrderResponse;
    if (res.ok) {
      // Update the confirmed discount in state so the summary briefly shows
      // the deduction before the redirect (and WC returns it in the response).
      if (res.couponDiscount > 0) setConfirmedCouponDiscount(res.couponDiscount);
      // Campaign first-order promo: this browser has now ordered — clear the
      // auto-apply flag and remember the order so the promo stays hidden.
      markHasOrdered();
      clearFirstOrderPromo();
      clearCart();
      // Clear the coupon after a successful order so it doesn't persist into
      // the next checkout session. Remove both keys together — discount key
      // must not outlive the code key or the next session silently deducts.
      try { localStorage.removeItem(COUPON_STORAGE_KEY); localStorage.removeItem(COUPON_DISCOUNT_KEY); localStorage.removeItem(ORDER_NOTE_KEY); } catch { /* best-effort */ }
      // Fire-and-forget — runs after the order is confirmed in WC so a
      // profile-update failure never blocks order completion.
      void maybeSaveProfilePhone();
      trackEvent({
        name: "order_placed",
        surface: "checkout",
        action: paymentMethod as WebPaymentMethodId,
      });
      trackWebEvent({
        type: "payment_completed",
        value: total,
        currency: checkoutCurrency,
        city: locationCity?.name ?? locationCity?.id ?? undefined,
      });
      trackWebEvent({
        type: "checkout_completed_with_whatsapp_updates",
        properties: { optedIn: payload.whatsappOptIn === true },
      });
      if (payload.addressBookPlace) {
        trackWebEvent({
          type: "landmark_order_completed",
          properties: {
            placeId: payload.addressBookPlace.placeId,
            district: payload.addressBookPlace.districtName,
          },
        });
      }
      try {
        // Bug D fix: prefer server-returned fee breakdown over client-estimated
        // values so the order confirmation screen shows the exact fees recorded
        // on the order, not the pre-payment estimate.
        const confirmedPayload = {
          ...payload,
          ...(typeof res.totalUsd === "number" ? { totalUsd: res.totalUsd } : {}),
          ...(typeof res.districtFeeUsd === "number" ? { districtFee: res.districtFeeUsd } : {}),
          ...(typeof res.expressFeeUsd === "number" ? { expressFee: res.expressFeeUsd } : {}),
          ...(typeof res.slotFeeUsd === "number" ? { slotFee: res.slotFeeUsd } : {}),
        };
        sessionStorage.setItem(
          PENDING_ORDER_KEY,
          JSON.stringify({ payload: confirmedPayload, createdAt: Date.now() }),
        );
      } catch { /* best-effort */ }
      setLocation(`/order-confirmed?status=success&ref=${payload.orderId}`);
    } else if (res.code === "expired_delivery_slot" || res.code === "past_delivery_date") {
      // The selected date/slot went stale between the client pre-check and the
      // server's authoritative validation — prompt a re-pick (cart preserved).
      promptStaleSlotRepick();
    } else if (res.code === "coupon_invalid") {
      // Coupon-specific error: surface inline below the coupon field (using
      // WC's specific message when available) so the shopper can correct the
      // code without dismissing a generic toast.
      setCouponError(res.message || t("checkout.coupon.invalidError"));
      setCouponApplied(false);
      setCouponOpen(true);
      setTimeout(() => couponInputRef.current?.focus(), 80);
    } else {
      toast({ title: t("checkout.toast.failTitle"), description: res.message || t("checkout.toast.failGeneric"), variant: "destructive" });
    }
  };

  // Stable ref kept current on every render so callbacks with limited deps can always
  // invoke the latest version of finalizeOrderNow — one that closes over the
  // current cart state and orderIdRef. Without this, a memoised callback
  // would hold a stale snapshot of finalizeOrderNow from the render where it
  // was last recreated (deps unchanged = never recreated), which may predate
  // the ensureOrderId() call that populated orderIdRef.current.
  const finalizeOrderNowRef = useRef(finalizeOrderNow);
  finalizeOrderNowRef.current = finalizeOrderNow;

  // Stash the order payload to sessionStorage so the post-redirect page can
  // finalize the WC order using the SAME orderId that was bound to the payment
  // session. Passing orderId here ensures the paymentRef↔orderId binding
  // created by the server during session creation is preserved end-to-end.
  const stashAndRedirect = (
    url: string,
    orderId: string,
    paymentMethodOverride?: PaymentMethodId,
  ) => {
    const payload = buildOrderPayload({
      orderId,
      paymentMethod: paymentMethodOverride,
    });
    // Guard against QuotaExceededError (Safari private mode, full storage).
    // If we can't stash the pending order we must NOT redirect — the shopper
    // would pay but OrderConfirmed would find nothing and show "failed".
    try {
      sessionStorage.setItem(
        PENDING_ORDER_KEY,
        JSON.stringify({ payload, createdAt: Date.now() }),
      );
    } catch {
      toast({
        title: t("checkout.toast.failTitle"),
        description: t("checkout.toast.storageError"),
        variant: "destructive",
      });
      return;
    }
    // Note: we do NOT persist the typed phone to the profile here. The
    // order isn't placed yet — it gets finalized after the shopper
    // returns from the hosted payment page — and saving the phone on a
    // payment that ends up abandoned would silently mutate the profile.
    // For hosted-payment flows the phone is only saved on a future
    // checkout that finalizes via `finalizeOrderNow`.
    window.location.href = url;
  };

  const handleSubmit = async () => {
    try {
      // Fallback: load Stripe if the user is submitting with a Stripe-backed
      // method but never interacted with the payment tiles (e.g. default
      // apple_pay selected, form filled out, submit clicked directly).
      // If Stripe hasn't resolved yet we bail early so the user can retry
      // once LazyStripeSection re-renders with the live stripe instance.
      if (paymentMethod === "card" || paymentMethod === "apple_pay" || paymentMethod === "google_pay" || paymentMethod === "klarna") {
        triggerStripeLoad();
        if (!stripe) {
          // Stripe is now loading; the component will re-render once the
          // Elements context hydrates.  Ask the user to try once more.
          toast({
            title: t("checkout.toast.stripeInitTitle"),
            description: t("checkout.toast.stripeInitDesc"),
          });
          return;
        }
      }

      // Stale-slot re-check — a tab left open can still hold a same-day slot
      // whose window has ended. Re-validate BEFORE initiating any payment and
      // prompt a re-pick instead of letting the server hard-reject later.
      {
        const staleCheck = checkStaleSlotSelection({
          deliveryMode,
          deliverySlot,
          deliverySlotId,
          deliveryDate: recipient.deliveryDate,
          timeSlots,
          countryCode,
          sameDayCutoffHour:
            typeof selectedCityData?.sameDayCutoffHour === "number"
              ? selectedCityData.sameDayCutoffHour
              : undefined,
          now,
        });
        if (!staleCheck.bookable) {
          promptStaleSlotRepick();
          return;
        }
      }

      trackWebEvent({
        type: "payment_started",
        items: items.map((i) => ({
          productId: i.product.id,
          name: i.product.name,
          price: i.product.priceValue,
          quantity: i.quantity,
        })),
        value: total,
        currency: checkoutCurrency,
        city: locationCity?.name ?? locationCity?.id ?? undefined,
        properties: {
          city: locationCity?.name ?? locationCity?.id ?? undefined,
          deliverySlot: deliverySlot || undefined,
          deliveryFee: districtFee + expressFee + slotFee,
          paymentMethod,
        },
      });

      // Fire-and-forget before any redirect so the address is saved even
      // for hosted-payment flows where we never return to this page.
      void maybeSaveNewAddress();

      // Locale-prefixed provider return URLs. Bare "/order-confirmed" landed
      // customers on a hard 404 after hosted/redirect payments and skipped
      // order finalization (Aug 2026 incident).
      const _successUrl = orderConfirmedReturnUrl("success", "&pid={CHECKOUT_SESSION_ID}");
      const _cancelUrl = orderConfirmedReturnUrl("failed");
      const returnUrl = orderConfirmedReturnUrl("success");
      const failureUrl = orderConfirmedReturnUrl("failed");

      const isWalletMethod = paymentMethod === "apple_pay" || paymentMethod === "google_pay";

      // Resolve the pre-created PaymentIntent (see walletIntentRef) for the
      // current cart/delivery/coupon state. When present, the native wallet
      // sheet shows — and the charge uses — the server's exact amount. The
      // signature is rebuilt here from the final values so it matches the one
      // the pre-creation effect computed.
      const walletSig = walletPiSignature({
        items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
        currency: checkoutCurrency,
        email: sender.email || undefined,
        deliveryFeeUsd: districtFee + expressFee + slotFee,
        expressDelivery: deliveryMode === "express",
        noAddress,
        couponCode: couponApplied && couponInput.trim() ? couponInput.trim() : undefined,
        deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
        deliverySlotId: deliveryMode === "express" ? undefined : deliverySlotId,
        deliveryCityId: deliveryMode === "express" ? undefined : selectedCityData?.id,
        deliveryDate:
          deliveryMode === "express" ? undefined : recipient.deliveryDate || undefined,
        district: _selectedDistrict || undefined,
      });
      const prefetchedIntent =
        walletIntentRef.current && walletIntentRef.current.signature === walletSig
          ? walletIntentRef.current
          : null;

      // The native wallet sheet MUST show the server's exact charge, never a
      // client estimate. If the pre-created PaymentIntent for the current inputs
      // isn't ready yet, do NOT open the sheet. The wallet button is already
      // disabled while preparing (walletPreparing), so this is a defensive
      // guard against a race (e.g. inputs changed between render and tap). We
      // simply return — the pre-creation effect re-runs and the button becomes
      // tappable again once the matching intent lands. No estimate is ever
      // shown, and wallet availability is unaffected (the tiles stay visible).
      if (isWalletMethod && !prefetchedIntent) {
        toast({
          title: t("checkout.toast.walletPrepareFailTitle"),
          description: t(paymentMethod === "google_pay" ? "checkout.toast.walletPrepareFailDescGoogle" : "checkout.toast.walletPrepareFailDesc"),
          variant: "destructive",
        });
        return;
      }

      // paymentRequestRef.current is the submit-time PaymentRequest that was
      // pre-created and canMakePayment()-validated in the wallet intent
      // pre-creation effect (above). Stripe requires canMakePayment() to have
      // been called on a PR instance before pr.show() can be called on it —
      // creating a fresh PR here and calling show() immediately always throws.
      // If the ref is null the wallet sheet is unavailable.

      const walletViaNativeSheet =
        isWalletMethod &&
        paymentRequestRef.current !== null;

      // When a wallet method is selected but the submit-time
      // canMakePayment() probe returned null, the device has no wallet
      // configured (or the PaymentRequest API is not supported). Show a
      // clear error toast, switch the selection to card so the inline card
      // fields appear, and return — do NOT silently fall through to a card
      // attempt with no explanation.
      if (isWalletMethod && !walletViaNativeSheet) {
        setPaymentMethodState("card");
        toast({
          title: t("checkout.toast.walletUnavailable"),
          description: t("checkout.toast.walletUnavailableDesc"),
          variant: "destructive",
        });
        return;
      }

      // Resolve effective method used for the non-wallet submit branches below.
      const payMethod: PaymentMethodId = paymentMethod;

      if (walletViaNativeSheet && stripe) {
        // Guard against double-invocation while the sheet is already open.
        if (walletSheetOpenRef.current) return;

        const pr = paymentRequestRef.current!;

        // Synchronous parity check for wallet flows. walletIntentRef.current.amount
        // is the server-authoritative minor-unit charge. Compare it against what the
        // client currently expects based on loaded FX rates. If they diverge (FX-rate
        // drift since PI creation), bail WITHOUT opening the sheet and clear the
        // cached intent so the next tap re-creates the PI with the refreshed rates.
        // No await is required — all inputs are already in memory.
        //
        // IMPORTANT: use serverFeesOverride when available. The wallet PI creation
        // effect fires a /checkout/fees fetch right after the PI is created and
        // stores the result in serverFeesOverride. Those amounts came from the same
        // server call that produced the PI, so they agree byte-for-byte. Using
        // client-estimated fees (districtFee + expressFee + slotFee) causes a
        // permanent false-positive loop: the server ignores the client-supplied
        // deliveryFeeUsd and computes its own, so even a $1 discrepancy between the
        // client estimate and the server value causes every tap to clear the PI,
        // re-arm the preparation spinner, and loop forever.
        {
          const _wSubtotalUsd = serverFeesOverride?.subtotalUsd ?? subtotal;
          const _wDeliveryUsd =
            (serverFeesOverride?.districtFeeUsd ?? districtFee) +
            (serverFeesOverride?.expressFeeUsd ?? expressFee) +
            (serverFeesOverride?.slotFeeUsd ?? slotFee);
          const _wCouponUsd = serverFeesOverride?.couponDiscountUsd ?? confirmedCouponDiscount;
          const _wClientTotalUsd = computeCartTotal(_wSubtotalUsd, _wDeliveryUsd, _wCouponUsd);
          // Use the PI's actual charge currency — may differ from checkoutCurrency
          // when the Stripe account doesn't support the display currency (e.g. CAD
          // on the LB main account falls back to USD server-side).
          const _wPiCurrency: string = walletIntentRef.current?.currency?.toUpperCase() ?? checkoutCurrency;
          const _wClientRate = (fxRatesData?.rates as Record<string, number> | undefined)?.[_wPiCurrency] ?? 1;
          const _wClientDisplay = roundToNearestFive(_wClientTotalUsd * _wClientRate, _wPiCurrency);
          const _wClientMinorUnits = toStripeMinorUnits(_wClientDisplay, _wPiCurrency);
          if (walletIntentRef.current && walletIntentRef.current.amount !== _wClientMinorUnits) {
            walletIntentRef.current = null;
            setWalletReadySig(null);
            toast({ title: t("checkout.toast.pricesUpdatedTitle") });
            return;
          }
        }

        // No pr.update() is needed: the PR was just constructed above with the
        // correct display currency and converted total.

        // pr.show() MUST be called synchronously within the click-handler
        // context with NO await before it. Any await beforehand removes the
        // call from the trusted user-gesture context, causing Safari to
        // redirect the page instead of opening the native Apple Pay sheet.
        walletSheetOpenRef.current = true;
        try {
          pr.show();
        } catch {
          // pr.show() threw synchronously (e.g. the device declined to open
          // the sheet, or another sheet is already showing). Reset the state,
          // switch the selected method to card so the inline card fields render,
          // and RETURN. Returning is essential: `payMethod` was resolved to
          // "apple_pay" above (walletViaNativeSheet was true), so without this
          // return execution would fall through every branch below to the
          // default `finalizeOrderNow()` and place an UNPAID order. The shopper
          // re-submits via the card fields that just became visible.
          walletSheetOpenRef.current = false;
          paymentRequestRef.current = null;
          setPaymentMethodState("card");
          trackEvent({ name: "payment_wallet_fallback", surface: "checkout", action: paymentMethod as "apple_pay" | "google_pay", errorCode: "show_failed" });
          toast({
            title: t("checkout.toast.walletUnavailable"),
            description: t("checkout.toast.walletUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }

        trackEvent({ name: "payment_wallet_opened", surface: "checkout", action: paymentMethod as "apple_pay" | "google_pay" });
        await new Promise<void>((resolve) => {
          const cleanup = () => {
            walletSheetOpenRef.current = false;
            pr.off("paymentmethod", pmHandler);
            pr.off("cancel", cancelHandler);
          };

          const cancelHandler = () => { cleanup(); resolve(); };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pmHandler = async (ev: any) => {
            cleanup();
            try {
              // The sheet was opened only after the PaymentIntent for this exact
              // cart was pre-created (see the !prefetchedIntent guard above), so
              // it is guaranteed present here. Reusing it makes the charge equal
              // the displayed total byte-for-byte.
              const orderId = prefetchedIntent!.orderId;
              const clientSecret = prefetchedIntent!.clientSecret;
              // Consume it so a later attempt re-creates a fresh intent.
              walletIntentRef.current = null;
              setWalletReadySig(null);

              const { error: stripeError, paymentIntent: confirmedIntent } =
                await stripe.confirmCardPayment(
                  clientSecret,
                  { payment_method: ev.paymentMethod.id },
                  { handleActions: false },
                );

              if (stripeError) {
                ev.complete("fail");
                trackEvent({ name: "payment_error", surface: "checkout", action: "provider", errorCode: stripeError.code ?? undefined });
                trackWebEvent({ type: "payment_failed", currency: checkoutCurrency, properties: { method: paymentMethod, errorCode: stripeError.code ?? undefined } });
                setPaymentMethodState("card");
                setStripeCardError(stripeDeclineMsg(stripeError, t) ?? stripeError.message ?? t("checkout.toast.cardPaymentFailed"));
                resolve();
                return;
              }

              let finalIntent: import("@stripe/stripe-js").PaymentIntent | undefined = confirmedIntent ?? undefined;
              if (confirmedIntent?.status === "requires_action") {
                const { error: actionError, paymentIntent: actionIntent } = await stripe.handleNextAction({
                  clientSecret,
                });
                if (actionError) {
                  ev.complete("fail");
                  trackEvent({ name: "payment_error", surface: "checkout", action: "provider", errorCode: actionError.code ?? undefined });
                  trackWebEvent({ type: "payment_failed", currency: checkoutCurrency, properties: { method: paymentMethod, errorCode: actionError.code ?? undefined } });
                  setPaymentMethodState("card");
                  setStripeCardError(stripeDeclineMsg(actionError, t) ?? actionError.message ?? t("checkout.toast.cardPaymentFailed"));
                  resolve();
                  return;
                }
                finalIntent = actionIntent;
              }

              if (finalIntent?.status !== "succeeded") {
                ev.complete("fail");
                trackWebEvent({ type: "payment_failed", currency: checkoutCurrency, properties: { method: paymentMethod } });
                setPaymentMethodState("card");
                setStripeCardError(t("checkout.toast.cardPaymentFailed"));
                resolve();
                return;
              }

              ev.complete("success");
              void maybeSaveNewAddress();
              void maybeSaveProfilePhone();
              const payload = buildOrderPayload({ paymentRef: finalIntent.id, orderId });
              // Try to stash for OrderConfirmed's seamless display. If storage
              // is unavailable (Safari private, quota exceeded, iOS app-state
              // kill), fall back to submitting directly with the payload we
              // already have — items are still in state until clearCart() below.
              let walletStashed = false;
              try {
                sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify({ payload, createdAt: Date.now() }));
                walletStashed = true;
              } catch { /* storage unavailable */ }
              if (walletStashed) {
                clearCart();
                try { localStorage.removeItem(COUPON_STORAGE_KEY); localStorage.removeItem(COUPON_DISCOUNT_KEY); localStorage.removeItem(ORDER_NOTE_KEY); } catch { /* best-effort */ }
                markHasOrdered();
                clearFirstOrderPromo();
                setLocation(`/order-confirmed?status=success`);
              } else {
                // Storage failed — call the order API directly. The payload
                // has the correct orderId from prefetchedIntent. On success we
                // navigate with ?ref so OrderConfirmed shows the summary without
                // re-submitting. On failure we stay on checkout so the shopper
                // can contact support (payment is captured — ops will reconcile).
                try {
                  const r = await createOrder.mutateAsync(payload) as CreateOrderResponse;
                  clearCart();
                  try { localStorage.removeItem(COUPON_STORAGE_KEY); localStorage.removeItem(COUPON_DISCOUNT_KEY); localStorage.removeItem(ORDER_NOTE_KEY); } catch { /* best-effort */ }
                  markHasOrdered();
                  clearFirstOrderPromo();
                  if (r.ok) {
                    setLocation(`/order-confirmed?status=success&ref=${encodeURIComponent(payload.orderId)}`);
                  }
                } catch { /* network failure — stay on checkout */ }
              }
            } catch {
              ev.complete("fail");
            } finally {
              resolve();
            }
          };

          pr.on("paymentmethod", pmHandler);
          pr.on("cancel", cancelHandler);
        });

        return;
      }

      // Reserve the order ID from the server ONCE for non-wallet flows. Retries
      // reuse the same ID because ensureOrderId returns the cached value.
      // This call is intentionally placed after the wallet branch above so that
      // no await precedes pr.show() in the Apple Pay / Google Pay path.
      const orderId = await ensureOrderId();

      // Pre-payment server fee verification for non-wallet methods.
      // Wallets already use the server's exact PI amount; for card and Mamo
      // the client computes the displayed total client-side, so we verify it
      // against the server before creating the PaymentIntent.
      if (payMethod !== "apple_pay" && payMethod !== "google_pay") {
        try {
          const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
          const feeRes = await fetch(`${baseUrl}/api/checkout/fees`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
              currency: checkoutCurrency,
              email: sender.email || undefined,
              district: _selectedDistrict || undefined,
              expressDelivery: deliveryMode === "express",
              noAddress,
              deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
              ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
              ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
              deliveryDate:
                deliveryMode === "express" ? undefined : recipient.deliveryDate || undefined,
              ...(couponApplied && couponInput.trim() ? { couponCode: couponInput.trim() } : {}),
            }),
          });
          if (feeRes.ok) {
            const feeData = await feeRes.json() as {
              ok: boolean;
              subtotalUsd?: number;
              districtFeeUsd?: number;
              expressFeeUsd?: number;
              slotFeeUsd?: number;
              couponDiscountUsd?: number;
              totalUsd?: number;
              total?: number;
              subtotal?: number;
              districtFee?: number;
              expressFee?: number;
              slotFee?: number;
              couponDiscount?: number;
              totalMinorUnits?: number;
              currency?: string;
            };
            // Compare the server-authoritative charged amount (minor units) against
            // what the client would compute from the currently-displayed total. This
            // catches both catalog/fee changes and FX-rate drift (same USD total but
            // converted amount in minor units has changed since the total was shown).
            if (feeData.ok && typeof feeData.totalMinorUnits === "number") {
              const clientTotalUsd = computeCartTotal(subtotal, districtFee + expressFee + slotFee, confirmedCouponDiscount);
              const clientRate = fxRatesData?.rates?.[checkoutCurrency] ?? 1;
              const clientDisplayTotal = roundToNearestFive(clientTotalUsd * clientRate, checkoutCurrency);
              const clientMinorUnits = toStripeMinorUnits(clientDisplayTotal, checkoutCurrency);
              if (feeData.totalMinorUnits !== clientMinorUnits) {
                // Hydrate the Order Summary immediately with server-authoritative
                // USD amounts so the displayed total reflects the actual charge
                // BEFORE the user is asked to confirm.
                setServerFeesOverride({
                  subtotalUsd: feeData.subtotalUsd ?? 0,
                  districtFeeUsd: feeData.districtFeeUsd ?? 0,
                  expressFeeUsd: feeData.expressFeeUsd ?? 0,
                  slotFeeUsd: feeData.slotFeeUsd ?? 0,
                  couponDiscountUsd: feeData.couponDiscountUsd ?? 0,
                });
                const confirmed = await new Promise<boolean>((resolve) => {
                  setPricesConfirmState({
                    open: true,
                    subtotal: feeData.subtotal ?? 0,
                    districtFee: feeData.districtFee ?? 0,
                    expressFee: feeData.expressFee ?? 0,
                    slotFee: feeData.slotFee ?? 0,
                    couponDiscount: feeData.couponDiscount ?? 0,
                    newTotal: feeData.total ?? 0,
                    currency: feeData.currency ?? checkoutCurrency,
                    resolve,
                  });
                });
                setPricesConfirmState((prev) => ({ ...prev, open: false, resolve: null }));
                if (!confirmed) return;
              }
            }
          }
        } catch {
          // Fee check is best-effort; proceed with payment if the network call fails
        }
      }

      if (payMethod === "card") {
        // Inline Stripe Elements flow — no redirect.
        if (!stripe || !elements) {
          toast({
            title: t("checkout.toast.cardUnavailable"),
            description: "Card payment is not available yet. Please refresh the page and try again.",
            variant: "destructive",
          });
          return;
        }
        setStripeCardError(null);

        // Step 1: Create a PaymentIntent server-side (prices resolved from
        // the Presentail OS catalog — client-supplied amounts are never used).
        // mutateAsync throws an ApiError on any non-2xx response, so we catch
        // here to handle the 409 already_paid case (succeeded PI found after a
        // server restart) without surfacing it as a generic card error.
        let intentRes: Awaited<ReturnType<typeof createPaymentIntent.mutateAsync>>;
        try {
          intentRes = await createPaymentIntent.mutateAsync({
            data: {
              items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity, customInput: i.customNote?.trim() || undefined })),
              orderId,
              currency: checkoutCurrency,
              email: sender.email || undefined,
              deliveryFeeUsd: districtFee + expressFee + slotFee,
              district: _selectedDistrict,
              expressDelivery: deliveryMode === "express",
              noAddress,
              ...(couponApplied && couponInput.trim() ? { couponCode: couponInput.trim() } : {}),
              // Only request card saving when using a new card (not a saved one)
              ...(saveCard && !selectedSavedCardId ? { saveCard: true } : {}),
              deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
              ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
              ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
              deliveryDate:
                deliveryMode === "express" ? undefined : recipient.deliveryDate || undefined,
            } as Parameters<typeof createPaymentIntent.mutateAsync>[0]["data"],
          });
        } catch (err: unknown) {
          const apiErr = err as { status?: number; data?: unknown };
          if (apiErr?.status === 409 && (apiErr?.data as { code?: string } | null)?.code === "already_paid") {
            // The order was already paid (e.g. the shopper retried after a
            // server restart and Stripe found a succeeded PI for this orderId).
            // Route to the confirmation screen instead of showing an error.
            setLocation(`/order-confirmed?status=success&ref=${encodeURIComponent(orderId)}`);
            return;
          }
          setStripeCardError(
            (apiErr?.data as { message?: string } | null)?.message ?? t("checkout.toast.cardUnavailableDesc"),
          );
          return;
        }

        if (!intentRes.ok || !intentRes.clientSecret) {
          setStripeCardError((intentRes as { message?: string }).message || t("checkout.toast.cardUnavailableDesc"));
          return;
        }

        // Persist the order payload server-side BEFORE confirming the card
        // payment. If the browser dies between the charge succeeding and the
        // /woo/order POST completing (3DS return failure, tab close, stale-
        // chunk reload), the Stripe webhook / pending-checkout sweeper creates
        // the order from this record — prevents charged-but-lost orders.
        // This write is REQUIRED: without it, a browser loss after the charge
        // leaves the customer charged with no recoverable order. Failing
        // closed here means the shopper retries with no money taken — the
        // safer trade-off.
        {
          const pendingBase = import.meta.env.BASE_URL.replace(/\/$/, "");
          const cardPiId = intentRes.clientSecret.split("_secret")[0];
          const pendingBody = JSON.stringify({
            orderId,
            piId: cardPiId,
            orderPayload: buildOrderPayload({ orderId, paymentMethod: "card", paymentRef: cardPiId }),
          });
          let pendingStored = false;
          for (let attempt = 0; attempt < 2 && !pendingStored; attempt++) {
            try {
              const pendingRes = await fetch(`${pendingBase}/api/checkout/klarna-pending`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: pendingBody,
              });
              pendingStored = pendingRes.ok;
            } catch {
              // Network hiccup — retry once.
            }
          }
          if (!pendingStored) {
            setStripeCardError(t("checkout.toast.cardUnavailableDesc"));
            return;
          }
        }

        // Step 2: Confirm the card payment on the client.
        //
        // Two paths:
        // A) Klarna enabled (PaymentElement mode): use stripe.confirmPayment()
        //    which handles cards, Klarna, and any other methods the PaymentElement
        //    rendered. For Klarna the browser redirects to Klarna's hosted page;
        //    we stash the order payload in sessionStorage before the redirect so
        //    OrderConfirmed can finalize on return. For card payments,
        //    confirmPayment with redirect:'if_required' resolves immediately.
        // B) Legacy (split card fields): use confirmCardPayment() + handleNextAction()
        //    for 3DS/SCA as before.
        const senderName = `${sender.firstName} ${sender.lastName}`.trim();

        setCardProcessing(true);
        let finalIntent: import("@stripe/stripe-js").PaymentIntent | undefined;
        try {
          {
            // Split card fields path: confirmCardPayment + 3DS/SCA.
            // Klarna is paid via a separate PI (klarnaClientSecret) triggered
            // from the Klarna section — it does not share this code path.
            let stripeError: import("@stripe/stripe-js").StripeError | undefined;
            let confirmedIntent: import("@stripe/stripe-js").PaymentIntent | undefined;

            if (selectedSavedCardId) {
              // Saved card: pass the payment method ID directly.
              const result = await stripe.confirmCardPayment(
                intentRes.clientSecret,
                { payment_method: selectedSavedCardId },
                { handleActions: false },
              );
              stripeError = result.error;
              confirmedIntent = result.paymentIntent ?? undefined;
            } else {
              const cardElement = elements.getElement("cardNumber");
              if (!cardElement) {
                setStripeCardError("Card fields could not be found. Please refresh and try again."); // i18n-ignore
                return;
              }
              const result = await stripe.confirmCardPayment(
                intentRes.clientSecret,
                {
                  payment_method: {
                    card: cardElement,
                    billing_details: {
                      ...(sender.email ? { email: sender.email } : {}),
                      ...(senderName ? { name: senderName } : {}),
                    },
                  },
                },
                { handleActions: false },
              );
              stripeError = result.error;
              confirmedIntent = result.paymentIntent ?? undefined;
            }
            if (stripeError) {
              trackEvent({ name: "payment_error", surface: "checkout", action: "provider", errorCode: stripeError.code ?? undefined });
              trackWebEvent({ type: "payment_failed", currency: checkoutCurrency, properties: { method: "card", errorCode: stripeError.code ?? undefined } });
              setStripeCardError(stripeDeclineMsg(stripeError, t) ?? stripeError.message ?? t("checkout.toast.cardPaymentFailed"));
              return;
            }

            // 3DS / SCA: the card issuer requires authentication. Surface
            // Stripe's built-in authentication modal and wait for the result
            // before proceeding. This covers EU/UK PSD2-mandated SCA flows.
            if (confirmedIntent?.status === "requires_action") {
              const { error: actionError, paymentIntent: actionIntent } = await stripe.handleNextAction({
                clientSecret: intentRes.clientSecret,
              });
              if (actionError) {
                trackEvent({ name: "payment_error", surface: "checkout", action: "provider", errorCode: actionError.code ?? undefined });
                trackWebEvent({ type: "payment_failed", currency: checkoutCurrency, properties: { method: "card", errorCode: actionError.code ?? undefined } });
                setStripeCardError(stripeDeclineMsg(actionError, t) ?? actionError.message ?? t("checkout.toast.cardPaymentFailed"));
                return;
              }
              if (!actionIntent) {
                setStripeCardError(t("checkout.toast.cardPaymentFailed"));
                return;
              }
              finalIntent = actionIntent;
            } else {
              finalIntent = confirmedIntent;
            }
          }
        } finally {
          setCardProcessing(false);
        }

        if (finalIntent?.status !== "succeeded") {
          setStripeCardError(t("checkout.toast.cardPaymentFailed"));
          return;
        }

        // Payment confirmed — submit the order while we're still on the
        // checkout page. Using finalizeOrderNow directly (rather than the
        // stash+navigate pattern) guarantees the order reaches OS even when
        // sessionStorage is unavailable (Safari private mode, quota exceeded,
        // iOS app-state kills). finalizeOrderNow handles clearCart and navigate.
        void maybeSaveNewAddress();
        void maybeSaveProfilePhone();
        await finalizeOrderNow(finalIntent.id);
        return;
      }

      if (payMethod === "paypal") {
        const res = await paypalPayment.mutateAsync({
          items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity, customInput: i.customNote?.trim() || undefined })),
          district: _selectedDistrict,
          expressDelivery: deliveryMode === "express",
          noAddress,
          currency: checkoutCurrency,
          returnUrl,
          cancelUrl: failureUrl,
          orderId,
          // Include delivery-slot fields so the backend calculates the same fee
          // that the checkout page computed for the shopper's chosen time slot.
          deliverySlot: deliveryMode === "express" ? undefined : deliverySlot || undefined,
          ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
          ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
          deliveryDate: deliveryMode === "express" ? undefined : recipient.deliveryDate || undefined,
        });
        if (!res.ok || !res.url) {
          toast({
            title: t("checkout.toast.paypalUnavailable"),
            description: res.message || t("checkout.toast.paypalUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }
        // Pass "paypal" as paymentMethodOverride so the stashed payload carries
        // the correct payment method for the order-confirmation step.
        stashAndRedirect(res.url, orderId, "paypal");
        return;
      }

      // AED Apple Pay / Google Pay now goes through Gulf Stripe (native sheet),
      // not Mamo. Only explicit "mamo" card tile selections go through Mamo.
      if (payMethod === "mamo") {
        const finalizedPaymentMethod: PaymentMethodId = payMethod;
        const res = await mamoPayment.mutateAsync({
          items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity, customInput: i.customNote?.trim() || undefined })),
          orderId,
          district: _selectedDistrict,
          expressDelivery: deliveryMode === "express",
          noAddress,
          currency: checkoutCurrency,
          title: t("checkout.payment.orderTitle"),
          description: t("checkout.payment.orderDesc", { name: `${sender.firstName} ${sender.lastName}`.trim() }),
          email: sender.email,
          firstName: sender.firstName,
          lastName: sender.lastName,
          returnUrl,
          failureReturnUrl: failureUrl,
          deliverySlot: deliveryMode === "express" ? undefined : deliverySlot || undefined,
          ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
          ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
          deliveryDate:
            deliveryMode === "express" ? undefined : recipient.deliveryDate || undefined,
        });
        if (!res.ok || !res.url) {
          toast({
            title: t("checkout.toast.mamoUnavailable"),
            description: res.message || t("checkout.toast.mamoUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }
        stashAndRedirect(res.url, orderId, finalizedPaymentMethod);
        return;
      }

      if (payMethod === "tabby") {
        let tabbyRes: { ok: boolean; url?: string; message?: string; code?: string } | null = null;
        try {
          tabbyRes = await tabbyPayment.mutateAsync({
            items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity, customInput: i.customNote?.trim() || undefined })),
            orderId,
            district: _selectedDistrict,
            expressDelivery: deliveryMode === "express",
            noAddress,
            currency: checkoutCurrency,
            email: sender.email,
            firstName: sender.firstName,
            lastName: sender.lastName,
            returnUrl,
            failureReturnUrl: failureUrl,
            deliverySlot: deliveryMode === "express" ? undefined : deliverySlot || undefined,
            ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
            ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
            deliveryDate:
              deliveryMode === "express" ? undefined : recipient.deliveryDate || undefined,
          });
        } catch (tabbyErr: any) {
          // apiFetch throws on non-2xx — surface a useful message instead of
          // the generic outer catch.
          toast({
            title: t("checkout.toast.tabbyUnavailable"),
            description: tabbyErr?.message || t("checkout.toast.tabbyUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }
        if (!tabbyRes?.ok || !tabbyRes?.url) {
          toast({
            title: t("checkout.toast.tabbyUnavailable"),
            description: tabbyRes?.message || t("checkout.toast.tabbyUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }
        stashAndRedirect(tabbyRes.url, orderId, "tabby");
        return;
      }

      if (payMethod === "klarna") {
        if (!stripe) {
          toast({
            title: t("checkout.toast.stripeInitTitle"),
            description: t("checkout.toast.stripeInitDesc"),
            variant: "destructive",
          });
          return;
        }

        // Step 1: Create (or reuse) the PaymentIntent with Klarna enabled.
        let klarnaIntentRes: { ok: boolean; clientSecret?: string; orderId?: string; klarnaAllowed?: boolean; message?: string } | null = null;
        try {
          klarnaIntentRes = await createPaymentIntent.mutateAsync({
            data: {
              items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity, customInput: i.customNote?.trim() || undefined })),
              orderId,
              currency: checkoutCurrency,
              email: sender.email || undefined,
              deliveryFeeUsd: districtFee + expressFee + slotFee,
              district: _selectedDistrict,
              expressDelivery: deliveryMode === "express",
              noAddress,
              ...(couponApplied && couponInput.trim() ? { couponCode: couponInput.trim() } : {}),
              deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
              ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
              ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
              deliveryDate:
                deliveryMode === "express" ? undefined : recipient.deliveryDate || undefined,
              billingCountry: klarnaBillingCountry,
            } as Parameters<typeof createPaymentIntent.mutateAsync>[0]["data"],
          });
        } catch (klarnaErr: any) {
          toast({
            title: t("checkout.toast.failTitle"),
            description: klarnaErr?.message || t("checkout.toast.cardUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }

        if (!klarnaIntentRes?.ok || !klarnaIntentRes?.clientSecret) {
          toast({
            title: t("checkout.toast.failTitle"),
            description: klarnaIntentRes?.message || t("checkout.toast.cardUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }

        // Confirm Klarna eligibility from the server response (rollout flag may
        // have changed between page load and submit).
        if (!klarnaIntentRes.klarnaAllowed) {
          toast({
            title: t("checkout.toast.failTitle"),
            description: t("checkout.toast.klarnaUnavailable"),
            variant: "destructive",
          });
          return;
        }

        const klarnaClientSecret = klarnaIntentRes.clientSecret;
        const klarnaOrderId = klarnaIntentRes.orderId ?? orderId;
        const piId = klarnaClientSecret.split("_secret_")[0]; // pi_xxx_secret_yyy → pi_xxx

        // Step 2 & 3: Build the order payload once — reused for both the
        // webhook-authoritative klarna-pending record and the browser-fallback
        // session stash. The webhook handler merges paymentRef + paymentMethod:
        // "stripe" on top before calling /woo/order.
        const klarnaPayload = buildOrderPayload({ orderId: klarnaOrderId, paymentMethod: "klarna" });

        // Register the pending checkout so the webhook can create the WC order
        // authoritatively without the browser being open. orderPayload gives
        // the webhook everything it needs to call /woo/order.
        try {
          const base = import.meta.env.BASE_URL.replace(/\/$/, "");
          await fetch(`${base}/api/checkout/klarna-pending`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: klarnaOrderId, piId, orderPayload: klarnaPayload }),
          });
        } catch {
          // Non-fatal: proceed even if the pending record can't be written.
        }

        // Stash the payload in sessionStorage for the browser-fallback path:
        // if the webhook-driven creation is slow or fails, OrderConfirmed reads
        // this stash and calls /woo/order directly (same pattern as PayPal/Mamo).
        try {
          sessionStorage.setItem(
            PENDING_ORDER_KEY,
            JSON.stringify({ payload: klarnaPayload, createdAt: Date.now() }),
          );
        } catch {
          toast({
            title: t("checkout.toast.failTitle"),
            description: t("checkout.toast.storageError"),
            variant: "destructive",
          });
          return;
        }

        // Step 4: Redirect to Klarna. Stripe appends ?payment_intent=pi_xxx
        // &redirect_status=succeeded|processing to the return_url.
        const klarnaReturnUrl = orderConfirmedReturnUrl("success");

        const { error } = await stripe.confirmPayment({
          clientSecret: klarnaClientSecret,
          confirmParams: {
            return_url: klarnaReturnUrl,
            payment_method_data: {
              billing_details: {
                email: sender.email || undefined,
                name: `${sender.firstName} ${sender.lastName}`.trim() || undefined,
                address: {
                  country: klarnaBillingCountry,
                },
              },
            },
          },
        });

        // If we reach here, confirmPayment threw a synchronous error (e.g. invalid
        // publishable key, missing billing details). The redirect never happened.
        if (error) {
          try { sessionStorage.removeItem(PENDING_ORDER_KEY); } catch { /* best-effort */ }
          toast({
            title: t("checkout.toast.failTitle"),
            description: error.message || t("checkout.toast.cardPaymentFailed"),
            variant: "destructive",
          });
        }
        return;
      }

      await finalizeOrderNow();
    } catch (err) {
      const isNetworkFailure = err instanceof TypeError;
      const apiErr = err as { status?: number; message?: string; data?: unknown } | null;
      // Server-authoritative stale-slot rejection (payment-intent / hosted
      // session / order creation). Prompt a re-pick instead of a raw failure.
      const apiErrCode = (apiErr?.data as { code?: string } | null)?.code;
      if (apiErrCode === "expired_delivery_slot" || apiErrCode === "past_delivery_date") {
        promptStaleSlotRepick();
        return;
      }
      const isColdCache = apiErr?.status === 503;
      const hasSpecificMessage =
        !isNetworkFailure &&
        !isColdCache &&
        typeof apiErr?.message === "string" &&
        !apiErr.message.startsWith("API error ");
      const description = isNetworkFailure
        ? t("checkout.toast.networkTimeout")
        : isColdCache
          ? t("checkout.toast.catalogLoading")
          : hasSpecificMessage
            ? apiErr!.message!
            : t("checkout.toast.networkError");
      toast({
        title: t("checkout.toast.errorTitle"),
        description,
        variant: "destructive",
      });
      trackEvent({ name: "payment_error", surface: "checkout", action: isNetworkFailure ? "network" : isColdCache ? "catalog_cold" : "provider" });
      trackWebEvent({ type: "payment_failed", currency: checkoutCurrency, properties: { method: paymentMethod } });
    }
  };

  // Availability / label / fallback decisions all go through the pure
  // helpers in `./checkoutPayMethods` (which wrap the shared
  // `@workspace/pay-methods` table). Methods that aren't selectable for the
  // active currency + country are hidden entirely so shoppers only see real
  // choices — this mirrors mobile and replaces the previous bespoke
  // per-method `*Hidden` flags / disabled-row UI.
  // NOTE: payCtxCountry, paymentOptions, and the payment-method fallback
  // useEffect are computed above (before early returns) to satisfy Rules of Hooks.

  // Per-field inline-error flags for the Step 1 required fields. Only true
  // after a failed continue attempt (submitAttempted) AND while the field is
  // still invalid — so each error clears on its own as soon as the shopper
  // fixes that field. The emptiness rules mirror handleValidateAndAdvance
  // exactly; the phone fields keep their own showError pattern inside
  // WebPhoneField.
  // District-change gate: while the delivery selection is invalid, or its
  // availability data is loading/errored, payment cannot proceed. The CTAs
  // stay clickable (aria-disabled + muted) — a click routes focus to the
  // notice instead of navigating. Irrelevant in the ask-recipient flow.
  const deliveryGateBlocked = !noAddress && isDeliveryGateBlocked(districtReval);
  // Localized display name of the district the notice refers to.
  const districtRevalDisplayName = (() => {
    if (districtReval.status === "idle") return "";
    if (districtReval.cityId) {
      return cityName(districtReval.cityId, districtReval.districtName);
    }
    const c = activeCities.find((x) => x.name === districtReval.districtName);
    return c ? cityName(c.id, c.name) : districtReval.districtName;
  })();

  const recipientNameError = submitAttempted && !recipient.firstName.trim();
  const districtError = submitAttempted && !noAddress && !recipient.district;
  const addressError = submitAttempted && !noAddress && !recipient.address && !selectedPlace;
  // With a verified place selected, the follow-up internal-location detail
  // ("Where inside AUBMC?") becomes the required part of the address.
  const placeDetailError = submitAttempted && !noAddress && !!selectedPlace && !placeInternalDetail.trim();
  const senderFirstNameError = submitAttempted && !isSignedIn && !sender.firstName;
  const senderEmailError = submitAttempted && !isSignedIn && !sender.email;

  // Red-border + red focus ring treatment for an invalid control, applied
  // alongside aria-invalid when the field's inline error is showing.
  const invalidControlClass = "border-destructive focus-visible:ring-destructive";

  // Validate all required Step 1 fields, focus/scroll to the first invalid one,
  // and advance to Step 2 only when all fields are valid.
  // Used by both the desktop sidebar CTA (always-clickable) and the email
  // field's Enter-key handler.
  // Returns the field-category name of the first invalid field (for the
  // mobile validation-failed analytics event), or null when advancing.
  const handleValidateAndAdvance = (): string | null => {
    // Enriched continue-to-payment analytics — fired on every click (the
    // spec's CTA event), with the same authoritative amounts the sidebar
    // and CTA display. No PII.
    trackWebEvent({
      type: "continue_to_payment_clicked",
      value: computeCartTotal(
        displaySubtotal,
        displayDistrictFee + displayExpressFee + displaySlotFee,
        displayCouponDiscount,
      ),
      currency: "USD",
      properties: {
        deliveryType: deliveryMode === "express" ? "express" : "standard",
        itemCount: items.reduce((n, i) => n + i.quantity, 0),
        deliveryFeeUsd: displayDistrictFee + displayExpressFee + displaySlotFee,
        freeDelivery: isFreeDeliveryUnlocked && displayDistrictFee === 0,
        couponApplied,
      },
    });
    // Trigger the inline-error UI for every Step-1 required field (text
    // fields, district select, and both phone fields).
    setSubmitAttempted(true);

    // Helper: scroll + focus the first invalid field so the user sees what's wrong.
    const focusInvalid = (el: HTMLElement | null) => {
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    };

    // Walk required fields in top-to-bottom form order and bail on the first gap.
    if (!recipient.firstName.trim()) {
      trackWebEvent({ type: "checkout_recipient_name_error" });
      focusInvalid(recipientFirstNameRef.current);
      return "recipient_name";
    }
    if (!recipientPhoneValid) {
      // PhoneInput renders the <input> with the data-testid directly on it;
      // fall back to an inner input, then the wrapper itself.
      focusInvalid(
        document.querySelector<HTMLElement>('input[data-testid="input-recipient-phone"]') ??
        document.querySelector<HTMLElement>('[data-testid="input-recipient-phone"] input') ??
        document.querySelector<HTMLElement>('[data-testid="input-recipient-phone"]'),
      );
      return "recipient_phone";
    }
    if (!noAddress && !recipient.district) {
      focusInvalid(document.querySelector<HTMLElement>('[data-testid="select-district"]'));
      return "district";
    }
    // District change left the delivery selection invalid (or its availability
    // data is still loading / failed): payment must not proceed. Focus the
    // persistent notice — unlike the click-to-validate fields above, there is
    // nothing to type here; the shopper must pick a valid delivery time.
    if (deliveryGateBlocked) {
      focusInvalid(districtNoticeRef.current);
      return "delivery_selection";
    }
    if (!noAddress && !recipient.address && !selectedPlace) {
      focusInvalid(document.querySelector<HTMLElement>('[data-testid="input-recipient-address"]'));
      return "address";
    }
    if (!noAddress && selectedPlace && !placeInternalDetail.trim()) {
      focusInvalid(document.querySelector<HTMLElement>('[data-testid="input-place-internal-detail"]'));
      return "place_detail";
    }
    if (!isSignedIn && !sender.firstName) {
      focusInvalid(senderFirstNameRef.current);
      return "sender_first_name";
    }
    if (!isSignedIn && !sender.email) {
      focusInvalid(senderEmailRef.current);
      return "sender_email";
    }
    if (!hasProfilePhone && !senderPhoneValid) {
      focusInvalid(
        document.querySelector<HTMLElement>('input[data-testid="input-sender-phone"]') ??
        document.querySelector<HTMLElement>('[data-testid="input-sender-phone"] input') ??
        document.querySelector<HTMLElement>('[data-testid="input-sender-phone"]'),
      );
      return "sender_phone";
    }

    if (phoneTooltipInteractedRef.current) {
      phoneTooltipInteractedRef.current = false;
      trackWebEvent({ type: "checkout_continued_after_phone_tooltip" });
    }
    // Advancing to payment acknowledges the informational fee-change notice.
    if (districtReval.status === "feeChanged") {
      setDistrictReval({ status: "idle" });
    }
    setStep(2);
    return null;
  };

  const stepLabels = [
    t("checkout.step.deliveryDetails"),
    t("checkout.step3.title"),
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f4f4f5" }}>
      {/* ── Checkout header ── */}
      <header className="z-40" style={{ backgroundColor: "hsl(var(--primary))" }}>
        <div className="max-w-content mx-auto px-page py-2 flex items-center text-primary-foreground">
          <Link href="/" aria-label={t("nav.logoAria")} className="flex items-center min-h-11">
            <Logo height={44} inverse={true} />
          </Link>
          <div className="flex-1 flex items-center justify-end sm:justify-center">
            {stepLabels.map((label, i) => {
              const n = i + 1;
              const done = step > n;
              const active = step === n;
              return (
                <Fragment key={i}>
                  <button
                    type="button"
                    onClick={() => { if (done) setStep(n); }}
                    className="flex flex-col items-center gap-1.5 min-h-11 justify-center"
                    aria-label={label}
                    aria-current={active ? "step" : undefined}
                  >
                    <div
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[13px] font-bold transition-all ${
                        done
                          ? "border-white bg-white text-primary"
                          : active
                          ? "border-white bg-white text-primary"
                          : "border-white/60 bg-transparent text-white/80"
                      }`}
                    >
                      {done ? <Check className="w-4 h-4" /> : n}
                    </div>
                    <span
                      className={`text-[11px] font-medium leading-none tracking-wide ${
                        active ? "text-white" : done ? "text-white/80" : "text-white/70"
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                  {i < 1 && (
                    <div
                      className={`w-10 sm:w-20 h-0.5 rounded-full mx-3 mb-5 transition-colors ${
                        done ? "bg-white/70" : "bg-white/35"
                      }`}
                    />
                  )}
                </Fragment>
              );
            })}
          </div>
          <Link
            href="/cart"
            className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-75"
            style={{ color: "rgba(255,255,255,0.72)" }}
            data-testid="link-back-to-cart"
          >
            <ArrowLeft className={`hidden sm:block w-4 h-4 ${dir === "rtl" ? "rotate-180" : ""}`} />
            <span className="hidden sm:inline">{t("checkout.backToCart")}</span>
          </Link>
        </div>
      </header>
      {/* ── Page content ── */}
      <div className="max-w-content mx-auto px-page py-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start">

          {/* ── Main form ── */}
          <div className="flex-1 min-w-0">

            {/* ── STEP 1 · Delivery Details ── */}
            {step === 1 && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 pb-40 max-md:pb-24 lg:pb-0">
                <div className="mb-6 max-md:mb-4">
                  <h2 className="text-2xl font-serif text-primary mb-1">{t("checkout.step.deliveryDetails")}</h2>
                  <p className="text-sm text-muted-foreground">{t("checkout.step1.desc")}</p>
                </div>

                {/* Optional sign-in card — signed-out shoppers only, never
                    blocks the guest form below. */}
                {frictionlessCheckout && !authLoading && !user && (
                  <CheckoutSignInCard
                    onContinueAsGuest={() => {
                      // Focus the first incomplete field of the delivery form.
                      const candidates: (HTMLElement | null)[] = [
                        !recipient.firstName.trim()
                          ? document.querySelector<HTMLElement>("#recipient-name-input")
                          : null,
                        !recipient.phone.trim()
                          ? (document.querySelector<HTMLElement>('[data-testid="input-recipient-phone"] input') ??
                              document.querySelector<HTMLElement>('input[data-testid="input-recipient-phone"]'))
                          : null,
                        !recipient.address.trim()
                          ? document.querySelector<HTMLElement>('[data-testid="input-recipient-address"]')
                          : null,
                      ];
                      const target =
                        candidates.find((el) => el !== null) ??
                        document.querySelector<HTMLElement>("#recipient-name-input");
                      requestAnimationFrame(() => target?.focus());
                    }}
                  />
                )}

                {/* Recipient Details */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 max-md:py-3 lg:p-6 mb-5 max-md:mb-3">
                  <h3 className="font-serif text-lg lg:text-xl font-medium text-primary mb-4 max-md:mb-3 lg:mb-5">{t("checkout.section.recipientDetails")}</h3>

                  {savedAddresses.length > 0 && (
                    <div className="mb-5 max-md:mb-4">
                      <Popover open={addressPickerOpen} onOpenChange={setAddressPickerOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary/40 transition-colors"
                            data-testid="button-use-saved-address"
                          >
                            <BookUser className="w-4 h-4 text-primary" />
                            {t("checkout.useSavedAddress")}
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 p-1">
                          <div className="py-1 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t("checkout.savedAddresses")}
                          </div>
                          {savedAddresses.map((addr) => (
                            <button
                              key={addr.id}
                              type="button"
                              onClick={() => {
                                applyAddressToRecipient(addr, setRecipient);
                                savedAddressSubFieldsRef.current = {
                                  building: addr.building ?? undefined,
                                  floor: addr.floor ?? undefined,
                                  apartment: addr.apartment ?? undefined,
                                };
                                setAddressPickerOpen(false);
                                // Applying a saved address can switch the district —
                                // revalidate the delivery selection the same way an
                                // explicit dropdown change would.
                                if (addr.district && addr.district !== _selectedDistrict) {
                                  beginDistrictRevalidation(addr.district);
                                }
                              }}
                              className="w-full flex items-start gap-2.5 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-secondary/60 transition-colors"
                              data-testid={`saved-address-option-${addr.id}`}
                            >
                              <MapPin className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                              <div className="min-w-0">
                                <div className="font-medium leading-snug">{addressDisplayLabel(addr)}</div>
                                {addr.district && (
                                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{addr.district}</div>
                                )}
                                {addr.isDefault && (
                                  <div className="text-xs text-gold font-medium mt-0.5">{t("checkout.defaultLabel")}</div>
                                )}
                              </div>
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  <div
                    className={`flex items-center gap-3 mb-6 max-md:mb-4 rounded-xl border px-3.5 py-3 transition-colors ${
                      /* ≤767px unselected: standard secondary-control border (like the
                         saved-address pill); selected keeps the primary border. Tablet/
                         desktop unchanged. */
                      noAddress ? "border-primary" : "border-primary/30 max-md:border-border"
                    }`}
                    style={{ backgroundColor: "hsl(var(--primary) / 0.05)" }}
                    data-testid="check-no-address-label"
                  >
                    <button
                      type="button"
                      onClick={() => setNoAddress(!noAddress)}
                      className="flex flex-1 items-center gap-3 text-start cursor-pointer"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                          noAddress ? "bg-primary text-primary-foreground" : "bg-white text-primary"
                        }`}
                      >
                        <MapPin className="h-[18px] w-[18px]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground">
                          {t("checkout.askRecipientForAddressTitle")}
                        </div>
                        <div className="text-xs text-muted-foreground leading-snug mt-0.5">
                          <span className="lg:hidden">{t("checkout.askRecipientNoteShort")}</span>
                          <span className="hidden lg:inline">{t("checkout.askRecipientForAddressNote")}</span>
                        </div>
                      </div>
                    </button>
                    <Switch
                      checked={noAddress}
                      onCheckedChange={setNoAddress}
                      data-testid="check-no-address"
                      aria-label={t("checkout.askRecipientForAddressTitle")}
                    />
                  </div>

                  {/* Single recipient-name field — a first name, nickname, or full
                      name is all valid. Input is preserved verbatim (no title-casing,
                      no first/last splitting); whitespace is trimmed at submit time. */}
                  <CheckoutField
                    label={t("checkout.recipientName")}
                    htmlFor="recipient-name-input"
                    required
                    className="lg:max-w-[480px]"
                    error={recipientNameError ? t("checkout.error.recipientName") : null}
                    errorId="recipient-name-error"
                    errorTestId="error-recipient-name"
                  >
                    <Input id="recipient-name-input" className={recipientNameError ? invalidControlClass : undefined} aria-invalid={recipientNameError || undefined} aria-describedby={recipientNameError ? "recipient-name-error" : undefined} ref={recipientFirstNameRef} value={recipient.firstName} onChange={(e) => setRecipient({ ...recipient, firstName: e.target.value })} onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        // PhoneInput renders the <input> with data-testid directly on it.
                        // Fall back to querying the first input inside the wrapper if needed.
                        const phoneInput =
                          document.querySelector<HTMLElement>('[data-testid="input-recipient-phone"]') ??
                          document.querySelector<HTMLElement>('[data-testid="input-recipient-phone"] input');
                        phoneInput?.focus();
                      }
                    }} placeholder={t("checkout.recipientNamePh")} data-testid="input-recipient-name" autoCapitalize="words" enterKeyHint="next" />
                  </CheckoutField>

                  {/* Label row: "Phone number *" plus the info tooltip button.
                      The tooltip explains why we need the number; its copy switches
                      with the ask-recipient-for-address toggle. The button renders
                      via `labelTrailing` so it sits right after the required marker
                      without layout shift. */}
                  <CheckoutField
                    label={t("checkout.phoneNumber")}
                    required
                    className="lg:max-w-[480px]"
                    labelTrailing={
                      <PhoneInfoTooltip
                        askRecipientForAddress={noAddress}
                        onOpen={() => {
                          phoneTooltipInteractedRef.current = true;
                          trackWebEvent({
                            type: "phone_tooltip_opened",
                            properties: { ask_recipient_for_address: noAddress },
                          });
                        }}
                      />
                    }
                  >
                    <LazyWebPhoneField
                      value={recipient.phone}
                      onChange={(v) => setRecipient({ ...recipient, phone: v })}
                      defaultCountry={(countryCode ?? "LB").toUpperCase()}
                      required
                      showError={submitAttempted}
                      errorMessage={t("checkout.phoneInvalidNumber")}
                      data-testid="input-recipient-phone"
                      onValidityChange={setRecipientPhoneValid}
                    />
                  </CheckoutField>

                  {!noAddress && (
                    <>
                      <CheckoutField
                        label={countryCode === "AE" ? t("checkout.emirate") : countryCode === "LB" ? t("checkout.governorate") : t("checkout.district")}
                        htmlFor="checkout-district"
                        required
                        className="lg:max-w-[480px]"
                        error={districtError ? (countryCode === "AE" ? t("checkout.error.emirate") : t("checkout.error.district")) : null}
                        errorId="district-error"
                        errorTestId="error-district"
                      >
                        <LocationCombobox
                          id="checkout-district"
                          value={recipient.district}
                          options={currentCountryCities}
                          onSelect={(v) => {
                            // Manual district change while a verified place is
                            // selected: if the new district conflicts with the
                            // place's verified district, drop the place (back
                            // to free text, query preserved) instead of keeping
                            // a mismatched pair — the shopper's explicit
                            // district choice wins and is never silently
                            // reverted.
                            if (selectedPlace) {
                              const placeCity = resolvePlaceCity(selectedPlace);
                              if (!placeCity || placeCity.name !== v) {
                                trackWebEvent({
                                  type: "landmark_selection_removed",
                                  properties: { placeId: selectedPlace.id, reason: "district_changed" },
                                });
                                setSelectedPlace(null);
                                setPlaceInternalDetail("");
                              }
                              setPlaceDistrictNotice(null);
                            }
                            // Sets recipient.district and revalidates the
                            // current delivery selection against the new
                            // district (clears + notice when invalid).
                            handleDistrictSelect(v);
                          }}
                          disabled={locationsLoading || !hasActiveCities}
                          /* max-md:text-base — match the mobile text size of Input/Textarea/phone field */
                          triggerClassName={cn("max-md:text-base", districtError && invalidControlClass)}
                          aria-invalid={districtError || undefined}
                          aria-describedby={districtError ? "district-error" : undefined}
                          placeholder={
                            selectedCityData
                              ? cityName(selectedCityData.id, selectedCityData.name)
                              : locationsLoading
                              ? t("checkout.districtLoading")
                              : !hasActiveCities
                              ? t("checkout.districtUnavailable")
                              : countryCode === "AE" ? t("checkout.selectEmirate") : countryCode === "LB" ? t("checkout.selectGovernorate") : t("checkout.selectDistrict")
                          }
                          searchPlaceholder={countryCode === "AE" ? t("checkout.searchEmirates") : countryCode === "LB" ? t("checkout.searchGovernorates") : t("checkout.searchDistricts")}
                          emptyText={countryCode === "AE" ? t("checkout.noEmiratesFound") : countryCode === "LB" ? t("checkout.noGovernoratesFound") : t("checkout.noDistrictsFound")}
                          unavailableLabel={t("checkout.currentlyUnavailable")}
                        />
                        {locationsError && !locations && (
                          <div className="mt-2 flex items-center gap-2 text-sm" data-testid="text-district-load-error">
                            <span className="text-destructive">{t("checkout.locationsLoadError")}</span>
                            <button
                              type="button"
                              onClick={() => { void refetchLocations(); }}
                              className="font-medium text-primary underline underline-offset-2"
                              data-testid="button-district-retry"
                            >
                              {t("checkout.retry")}
                            </button>
                          </div>
                        )}
                        <DistrictChangeNotice
                          state={districtReval}
                          districtLabel={districtRevalDisplayName}
                          countryCode={countryCode ?? null}
                          onRetry={handleDistrictRevalRetry}
                          onDismiss={() => setDistrictReval({ status: "idle" })}
                          noticeRef={districtNoticeRef}
                        />
                      </CheckoutField>

                      <CheckoutField
                        label={
                          <>
                            <span className="lg:hidden">{t("checkout.addressLabelShort")}</span>
                            <span className="hidden lg:inline">{t("checkout.address")}</span>
                          </>
                        }
                        required
                        error={addressError ? t("checkout.error.address") : null}
                        errorId="recipient-address-error"
                        errorTestId="error-recipient-address"
                      >
                        <DeliveryDetailsField
                          value={recipient.address}
                          onChange={(v) => { savedAddressSubFieldsRef.current = null; setRecipient({ ...recipient, address: v }); }}
                          countryCode={(countryCode ?? "LB").toUpperCase().slice(0, 2)}
                          selectedPlace={selectedPlace}
                          internalDetail={placeInternalDetail}
                          onInternalDetailChange={setPlaceInternalDetail}
                          onSelectPlace={handleSelectPlace}
                          onClearPlace={handleClearPlace}
                          districtNotice={placeDistrictNotice}
                          addressError={addressError}
                          detailError={placeDetailError}
                          invalidControlClass={invalidControlClass}
                          isMobile={isMobile}
                        />
                      </CheckoutField>

                      {isSignedIn && (
                        <label className="flex items-center gap-3 cursor-pointer select-none mb-1" data-testid="check-save-address-label">
                          <Switch
                            checked={saveAddress}
                            onCheckedChange={setSaveAddress}
                            data-testid="check-save-address"
                            aria-label={t("checkout.saveAddress")}
                          />
                          <div>
                            <div className="text-sm font-medium">{t("checkout.saveAddress")}</div>
                            <div className="text-xs text-muted-foreground">{t("checkout.saveAddressHint")}</div>
                          </div>
                        </label>
                      )}
                    </>
                  )}

                </div>

                {/* Delivery confirmation card — mobile only. Replaces the large
                    Delivery Time selector below (which stays desktop-only). */}
                <div className="lg:hidden bg-white rounded-2xl border border-gray-100 shadow-sm p-4 max-md:py-3 mb-4 max-md:mb-3" data-testid="card-delivery-confirmation">
                  <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 max-md:mb-2">{t("checkout.delivery.sectionLabel")}</p>
                  {deliveryGateBlocked ? (
                  <div
                    className="rounded-xl px-3.5 py-3 bg-amber-50 border border-amber-300"
                    data-testid="mobile-delivery-required"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex items-start gap-2.5">
                      {districtReval.status === "pending" ? (
                        <Loader2 className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 animate-spin" aria-hidden />
                      ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" aria-hidden />
                      )}
                      <div className="flex-1 min-w-0">
                        {districtReval.status === "pending" ? (
                          <p className="text-sm text-amber-900">
                            {t("checkout.districtChange.checking", { district: districtRevalDisplayName })}
                          </p>
                        ) : districtReval.status === "error" ? (
                          <>
                            <p className="text-sm text-amber-900">
                              {t("checkout.districtChange.loadFailed", { district: districtRevalDisplayName })}
                            </p>
                            <button
                              type="button"
                              onClick={handleDistrictRevalRetry}
                              className="mt-1 text-sm font-medium text-amber-900 underline underline-offset-2 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-sm"
                              data-testid="button-mobile-delivery-retry"
                            >
                              {t("checkout.retry")}
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-amber-900" data-testid="text-mobile-delivery-required-title">
                              {t("checkout.deliveryRequired.title")}
                            </p>
                            <p className="text-xs text-amber-800 mt-0.5">
                              {t("checkout.deliveryRequired.body", { district: districtRevalDisplayName })}
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleMobileDeliveryChange}
                              className="mt-2.5 h-9 bg-white border-amber-300 text-amber-900 hover:bg-amber-100 hover:text-amber-900"
                              data-testid="button-mobile-choose-delivery-time"
                            >
                              {t("checkout.deliveryRequired.cta")}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  ) : (
                  <div
                    className="rounded-xl px-3.5 py-3 flex items-center gap-3"
                    style={{ backgroundColor: "hsl(210 33% 96%)" }}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-primary">
                      {deliveryMode === "express" ? (
                        <Zap className="h-[18px] w-[18px]" aria-hidden />
                      ) : (
                        <CalendarDays className="h-[18px] w-[18px]" aria-hidden />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {deliveryMode === "express" ? (
                        <>
                          <p className="text-xs text-muted-foreground">{t("delivery.promise.expressTitle")}</p>
                          <p className="text-sm font-semibold text-foreground leading-snug" data-testid="text-delivery-promise">
                            {expressDeadlineText
                              ? t("delivery.promise.arrivesBy", { time: expressDeadlineText })
                              : t("checkout.expressDeliveryLabel")}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t("delivery.promise.within90")}</p>
                        </>
                      ) : deliveryRowText ? (
                        <>
                          <p className="text-xs text-muted-foreground">{t("delivery.promise.standardTitle")}</p>
                          <p className="text-sm font-semibold text-foreground leading-snug" data-testid="text-delivery-promise">
                            {t("delivery.promise.arrives", { when: deliveryRowText })}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t("delivery.promise.scheduledCaption")}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">{t("delivery.promise.standardTitle")}</p>
                          <p className="text-sm font-semibold text-foreground leading-snug" data-testid="text-delivery-promise">
                            {t("checkout.delivery.notSelected")}
                          </p>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleMobileDeliveryChange}
                      className="shrink-0 min-h-11 min-w-11 px-2 flex items-center justify-center text-sm font-medium underline underline-offset-2 text-primary hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
                      data-testid="button-mobile-change-delivery"
                      aria-label={t("delivery.row.change")}
                    >
                      {t("delivery.row.change")}
                    </button>
                  </div>
                  )}
                </div>

                {/* Sender Details */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 max-md:py-3 lg:p-6 mb-4 max-md:mb-3">
                  <h3 className="font-serif text-lg lg:text-xl font-medium text-primary mb-4 max-md:mb-3 lg:mb-5">{t("checkout.section.senderDetails")}</h3>

                  {isSignedIn ? (
                    <>
                      {/* Mobile: compact identity row */}
                      <div
                        className="lg:hidden mb-4 max-md:mb-3 rounded-xl px-3.5 py-3 flex items-center gap-3"
                        style={{ backgroundColor: "hsl(210 33% 96%)" }}
                        data-testid="sender-summary-mobile"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {t("checkout.sendingAs", {
                              summary: `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || (user?.email ?? ""),
                            })}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {[user?.email ?? "", profilePhone].filter((s) => s && s.trim()).join(" · ")}
                          </p>
                        </div>
                        <Link
                          href="/account/personal-information"
                          onClick={() => trackWebEvent({ type: "mobile_checkout_sender_edit_clicked" })}
                          className="shrink-0 min-h-11 px-2 flex items-center text-sm font-medium underline underline-offset-2 text-primary hover:opacity-70 transition-opacity rounded-lg"
                          data-testid="link-edit-account-mobile"
                        >
                          {t("checkout.recap.edit")}
                        </Link>
                      </div>
                      {/* Desktop: compact identity row — "Sending as [name] / email · phone / Edit" */}
                      <div className="mb-4 rounded-xl border bg-secondary/40 p-4 hidden lg:flex items-center justify-between gap-3" data-testid="sender-summary-desktop">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {t("checkout.sender.sendingAsName", {
                              name: `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || (user?.email ?? ""),
                            })}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {[user?.email ?? "", profilePhone].filter((s) => s && s.trim()).join(" · ")}
                          </p>
                        </div>
                        <Link
                          href="/account/personal-information"
                          className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 text-sm font-medium text-primary underline underline-offset-2"
                          data-testid="link-edit-sender-desktop"
                        >
                          {t("checkout.sender.edit")}
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* ≤767px: identity fields stack full-width in mockup order
                          (first, last, email, phone) with taller 48px inputs;
                          md+ keeps the side-by-side name pair. */}
                      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-x-3">
                        <CheckoutField label={t("checkout.firstName")} htmlFor="sender-first-name-input" required error={senderFirstNameError ? t("checkout.error.senderFirstName") : null} errorId="sender-first-name-error" errorTestId="error-sender-first-name">
                          <Input id="sender-first-name-input" className={cn("max-md:h-12", senderFirstNameError && invalidControlClass)} aria-invalid={senderFirstNameError || undefined} aria-describedby={senderFirstNameError ? "sender-first-name-error" : undefined} ref={senderFirstNameRef} value={sender.firstName} onChange={(e) => setSender({ ...sender, firstName: toTitleCase(e.target.value) })} onKeyDown={focusNextOnEnter(senderLastNameRef)} data-testid="input-sender-first-name" autoCapitalize="words" autoComplete="given-name" />
                        </CheckoutField>
                        <CheckoutField label={t("checkout.lastName")} htmlFor="sender-last-name-input" required>
                          <Input id="sender-last-name-input" className="max-md:h-12" ref={senderLastNameRef} value={sender.lastName} onChange={(e) => setSender({ ...sender, lastName: toTitleCase(e.target.value) })} onKeyDown={focusNextOnEnter(senderEmailRef)} data-testid="input-sender-last-name" autoCapitalize="words" autoComplete="family-name" />
                        </CheckoutField>
                      </div>
                      <CheckoutField label={t("checkout.emailAddress")} htmlFor="sender-email-input" required className="lg:max-w-[480px]" error={senderEmailError ? t("checkout.error.senderEmail") : null} errorId="sender-email-error" errorTestId="error-sender-email">
                        <Input id="sender-email-input" className={cn("max-md:h-12", senderEmailError && invalidControlClass)} aria-invalid={senderEmailError || undefined} aria-describedby={senderEmailError ? "sender-email-error" : undefined} ref={senderEmailRef} type="email" inputMode="email" autoComplete="email" value={sender.email} onChange={(e) => setSender({ ...sender, email: e.target.value })} onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            // Run the full validation handler directly so Enter in the
                            // email field works the same way on both mobile and desktop
                            // (desktop sidebar CTA is lg-only and may not be focusable
                            // from mobile breakpoints).
                            handleValidateAndAdvance();
                          }
                        }} data-testid="input-sender-email" />
                      </CheckoutField>
                    </>
                  )}

                  {!hasProfilePhone && (
                    <CheckoutField
                      label={t("checkout.whatsappNumber")}
                      required
                      className="lg:max-w-[480px] sender-phone-compact"
                    >
                      {ipCountrySettled ? (
                        <LazyWebPhoneField
                          value={sender.phone}
                          onChange={(v) => setSender({ ...sender, phone: v })}
                          defaultCountry={ipCountry ?? "LB"}
                          required
                          showError={submitAttempted}
                          errorMessage={t("checkout.phoneInvalidNumber")}
                          data-testid="input-sender-phone"
                          onValidityChange={setSenderPhoneValid}
                          onCountryChange={(country, dialCode) => {
                            setSenderPhoneCountry(country ?? null);
                            setSenderPhoneDialCode(dialCode ?? null);
                          }}
                        />
                      ) : (
                        <div aria-hidden className="h-9 max-md:h-12 rounded-sm bg-muted/60 animate-pulse" />
                      )}
                    </CheckoutField>
                  )}

                  {/* ≤767px: compact switch preference rows per the approved mockup.
                      Same whatsappOptIn/identitySecret state as the md+ checkbox
                      controls below; the wrapping <label> makes the whole row toggle
                      the Radix switch exactly once via native label association —
                      no row-level onClick. The switch's own focus ring is disabled
                      in favour of the row-level has-[:focus-visible] ring. */}
                  <div className="md:hidden space-y-3">
                    <label
                      className="flex items-center gap-3 min-h-14 rounded-xl border border-gray-100 px-3.5 py-2.5 cursor-pointer select-none transition-colors hover:bg-black/[0.02] active:bg-black/[0.04] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-1"
                      data-testid="switch-whatsapp-updates-row"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-6 w-6 shrink-0 fill-[#25D366]"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.019-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413" />
                      </svg>
                      <span className="min-w-0 flex-1">
                        {/* Name = title only via aria-labelledby; helper reaches AT
                            once via aria-describedby (no subtree double-announce). */}
                        <span id="whatsapp-updates-switch-title" className="block text-sm font-medium">
                          {t("checkout.whatsappUpdatesShort")}
                        </span>
                        <span id="whatsapp-updates-switch-hint" className="block text-xs text-muted-foreground leading-snug mt-0.5" data-testid="switch-whatsapp-updates-hint">
                          {t("checkout.whatsappUpdatesShortHint")}
                        </span>
                      </span>
                      <Switch
                        checked={whatsappOptIn}
                        onCheckedChange={handleWhatsappOptInToggle}
                        aria-labelledby="whatsapp-updates-switch-title"
                        aria-describedby="whatsapp-updates-switch-hint"
                        className="shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                        data-testid="switch-whatsapp-updates"
                      />
                    </label>
                    <label
                      className="flex items-center gap-3 min-h-14 rounded-xl border border-gray-100 px-3.5 py-2.5 cursor-pointer select-none transition-colors hover:bg-black/[0.02] active:bg-black/[0.04] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-1"
                      data-testid="switch-identity-secret-row"
                    >
                      <span className="min-w-0 flex-1">
                        <span id="identity-secret-switch-title" className="block text-sm font-medium">
                          {t("checkout.anonymousShort")}
                        </span>
                        <span id="identity-secret-switch-hint" className="block text-xs text-muted-foreground leading-snug mt-0.5" data-testid="switch-identity-secret-hint">
                          {t("checkout.anonymousShortHint")}
                        </span>
                      </span>
                      <Switch
                        checked={identitySecret}
                        onCheckedChange={(checked) => {
                          setIdentitySecret(checked);
                          if (isMobile) {
                            trackWebEvent({
                              type: "mobile_checkout_anonymous_toggled",
                              properties: { enabled: checked },
                            });
                          }
                        }}
                        aria-labelledby="identity-secret-switch-title"
                        aria-describedby="identity-secret-switch-hint"
                        className="shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                        data-testid="switch-identity-secret"
                      />
                    </label>
                  </div>

                  {/* "Get order updates on WhatsApp" — tablet/desktop checkbox row,
                      default checked. Sits directly below the sender phone field and
                      above the anonymous-gift control, per the checkout mockups.
                      On phones (≤767px) the switch row above replaces this control
                      (same whatsappOptIn state), so it is hidden below md. */}
                  <div className="mb-4 max-md:hidden lg:max-w-[480px]">
                    <label className="flex items-start gap-3 cursor-pointer select-none min-h-11" data-testid="check-whatsapp-updates-label">
                      <input
                        type="checkbox"
                        checked={whatsappOptIn}
                        onChange={(e) => handleWhatsappOptInToggle(e.target.checked)}
                        className="mt-1 h-4 w-4 accent-primary cursor-pointer shrink-0"
                        aria-labelledby="whatsapp-updates-title"
                        aria-describedby="whatsapp-updates-hint"
                        data-testid="check-whatsapp-updates"
                      />
                      <span className="min-w-0">
                        {/* aria-labelledby points at the title so the accessible name is
                            the title only — without it the wrapping label's subtree
                            (title + hint) becomes the name AND the hint is repeated via
                            aria-describedby (double announcement). */}
                        <span id="whatsapp-updates-title" className="flex items-center gap-1.5 text-sm">
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4 shrink-0 fill-[#25D366]"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.019-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413" />
                          </svg>
                          {t("checkout.whatsappUpdates")}
                        </span>
                        <span id="whatsapp-updates-hint" className="block text-xs text-muted-foreground mt-0.5" data-testid="whatsapp-updates-hint">
                          {t("checkout.whatsappUpdatesHint")}
                        </span>
                      </span>
                    </label>
                  </div>

                  {/* Tablet (md–lg): "Send this gift anonymously" checkbox. The helper
                      lives inside the tappable label (aria-describedby preserved) so
                      the full row — title, helper, whitespace — toggles the checkbox.
                      On phones (≤767px) the switch row above replaces this control
                      (same identitySecret state). */}
                  <div className="max-md:hidden lg:hidden">
                    <label className="flex items-start gap-3 cursor-pointer select-none min-h-11" data-testid="check-identity-secret-label">
                      <input
                        type="checkbox"
                        checked={identitySecret}
                        onChange={(e) => {
                          setIdentitySecret(e.target.checked);
                          if (isMobile) {
                            trackWebEvent({
                              type: "mobile_checkout_anonymous_toggled",
                              properties: { enabled: e.target.checked },
                            });
                          }
                        }}
                        className="mt-0.5 h-4 w-4 accent-primary cursor-pointer shrink-0"
                        aria-labelledby="identity-secret-title"
                        aria-describedby="identity-secret-hint"
                        data-testid="check-identity-secret"
                      />
                      <span className="min-w-0">
                        {/* Name = title only; hint reaches AT once via aria-describedby. */}
                        <span id="identity-secret-title" className="block text-sm">{t("checkout.anonymousGift")}</span>
                        <span id="identity-secret-hint" className="block text-xs text-gray-500 mt-1" data-testid="identity-secret-hint">
                          {t("checkout.anonymousGiftHint")}
                        </span>
                      </span>
                    </label>
                  </div>
                  {/* Desktop: "Send this gift anonymously" with always-visible explanation */}
                  <div className="hidden lg:block">
                    <label className="flex items-start gap-3 cursor-pointer select-none min-h-[44px]" data-testid="check-anonymous-gift-label">
                      <input
                        type="checkbox"
                        checked={identitySecret}
                        onChange={(e) => handleAnonymousGiftToggle(e.target.checked)}
                        className="mt-1 h-4 w-4 accent-primary cursor-pointer"
                        aria-describedby="anonymous-gift-hint"
                        data-testid="check-anonymous-gift"
                      />
                      <span>
                        <span className="block text-sm">{t("checkout.anonymousGift")}</span>
                        <span id="anonymous-gift-hint" className="block text-xs text-muted-foreground mt-0.5" data-testid="anonymous-gift-hint">
                          {t("checkout.anonymousGiftHint")}
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                {/* The Delivery Time selector card is gone from both breakpoints:
                    desktop changes delivery via the sidebar DELIVERY panel, mobile
                    via the compact delivery confirmation card's Change action. */}

                {/* Mobile sticky footer — hidden on desktop (sidebar CTA takes over).
                    Always tappable: invalid submits scroll/focus the first invalid field. */}
                <div
                  className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-sm px-4 pt-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] lg:hidden"
                  style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
                >
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-14 rounded-xl basis-1/4 min-w-[76px] px-2"
                      onClick={() => setLocation("/cart")}
                      data-testid="button-back-to-cart-from-delivery"
                    >
                      {t("checkout.back")}
                    </Button>
                    <Button
                      ref={continueToPaymentRef}
                      size="lg"
                      className={`flex-1 h-14 rounded-xl text-white font-semibold flex items-center justify-between px-4 ${deliveryGateBlocked ? "opacity-50 cursor-not-allowed hover:opacity-50" : ""}`}
                      style={{ backgroundColor: "hsl(var(--primary))" }}
                      onClick={handleMobileContinue}
                      aria-describedby="mobile-cta-secure"
                      aria-disabled={deliveryGateBlocked || undefined}
                      data-testid="button-continue-to-payment"
                    >
                      <span className="flex flex-col items-start leading-tight min-w-0">
                        <span className="text-sm font-semibold">{t("checkout.continuePayment")}</span>
                        <span className="text-xs font-normal opacity-90" data-testid="text-footer-total" role="status" aria-live="polite">
                          {buildFeeNode(t("checkout.cta.orderTotalLine"), { total: mobileGrandTotal })}
                        </span>
                      </span>
                      <ArrowRight className={`w-5 h-5 shrink-0 ${dir === "rtl" ? "rotate-180" : ""}`} aria-hidden />
                    </Button>
                  </div>
                  <div
                    id="mobile-cta-secure"
                    className="flex items-center justify-center gap-1.5 mt-2 text-xs text-muted-foreground"
                  >
                    <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    <span>{t("checkout.cta.secureCheckout")}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 2 · Payment ── */}
            {step === 2 && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="mb-6">
                  <h2 className="text-2xl font-serif text-primary mb-1">{t("checkout.step3.title")}</h2>
                  <p className="text-sm text-muted-foreground">{t("checkout.step3.descNew")}</p>
                </div>

                {/* Payment methods */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
                  <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-4">{t("checkout.section.payment")}</p>
                  <div className="space-y-2 mb-5">
                    {(paymentOptions ?? []).map((m) => {
                      const offlineDesc = m.id === "whish" ? t("checkout.pay.whishDesc") : m.id === "western" ? t("checkout.pay.westernDesc") : null;
                      type LogoSpec = { name: string; src: string; fill?: boolean; containerWidth?: number; maxH?: string };
                      const cardLogos: LogoSpec[] = [
                        { name: "Mastercard", src: mastercardLogo, fill: true },
                        { name: "Visa", src: visaLogo, fill: true },
                        { name: "American Express", src: amexLogo, fill: true },
                      ];
                      const methodLogos: Record<string, LogoSpec[]> = {
                        card: cardLogos,
                        mamo: cardLogos,
                        paypal: [{ name: "PayPal", src: paypalLogo, fill: true }],
                        apple_pay: [
                          { name: "Apple Pay", src: applePayLogo, maxH: "max-h-[14px]" },
                        ],
                        google_pay: [
                          { name: "Google Pay", src: googlePayLogo, maxH: "max-h-[14px]" },
                        ],
                        whish: [{ name: "Whish Money", src: whishLogo, fill: true }],
                        western: [{ name: "Western Union", src: westernUnionLogo, fill: true }],
                        tabby: [{ name: "Tabby", src: tabbyLogo, fill: true, containerWidth: 72 }],
                        klarna: [{ name: "Klarna", src: klarnaLogo, fill: true, containerWidth: 72 }],
                      };
                      const logos = methodLogos[m.id] ?? [];
                      return (
                        <div
                          key={m.id}
                          className={`p-4 border rounded-xl cursor-pointer transition-all ${paymentMethod === m.id ? "ring-1" : "hover:border-primary/25 hover:bg-secondary/30"}`}
                          style={paymentMethod === m.id ? { borderColor: "hsl(var(--primary))", backgroundColor: "hsl(var(--primary) / 0.04)", outlineColor: "hsl(var(--primary) / 0.15)" } : {}}
                          onClick={() => {
                            setPaymentMethod(m.id);
                            setStripeCardError(null);
                            // If the shopper taps the same wallet tile while preparation
                            // has failed, bump the nonce so the effect re-runs and retries
                            // even though paymentMethod didn't change.
                            if (walletPrepareFailed && (m.id === "apple_pay" || m.id === "google_pay")) {
                              setWalletRetryNonce((n) => n + 1);
                            }
                          }}
                          data-testid={`option-payment-${m.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors" style={paymentMethod === m.id ? { borderColor: "hsl(var(--primary))", backgroundColor: "hsl(var(--primary))" } : { borderColor: "rgba(0,0,0,0.25)" }}>
                              {paymentMethod === m.id && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                            <span className="font-medium text-sm">{t(m.labelKey)}</span>
                            {logos.length > 0 && (
                              <div className="ml-auto flex items-center gap-1">
                                {logos.map((logo) => (
                                  <span
                                    key={logo.name}
                                    title={logo.name}
                                    className={logo.fill ? "inline-flex items-center justify-center overflow-hidden rounded-[4px]" : "inline-flex items-center justify-center bg-white rounded-[4px] overflow-hidden p-[4px]"}
                                    style={{ width: logo.containerWidth ?? 48, height: 34 }}
                                  >
                                    <img
                                      src={logo.src}
                                      alt={logo.name}
                                      data-testid={`payment-option-logo-${m.id}`}
                                      className={logo.fill ? "block w-auto h-auto max-w-full max-h-full object-contain" : `block max-w-[30px] object-contain ${logo.maxH ?? ""}`}
                                      loading="lazy"
                                      decoding="async"
                                      draggable={false}
                                    />
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {paymentMethod === m.id && offlineDesc && (
                            <p className="mt-2 ms-8 text-sm text-muted-foreground leading-relaxed">{offlineDesc}</p>
                          )}
                          {/* Stripe card fields — rendered inside the card tile so they expand
                              inline directly below the card option row. stripeNeeded stays true
                              once set, keeping LazyStripeSection mounted even when mamo is
                              selected (showCardFields=false), so Stripe remains initialised
                              without unmounting the Elements provider. */}
                          {stripeNeeded && m.id === "card" && (
                            <Suspense fallback={null}>
                              <LazyStripeSection
                                stripePromise={stripePromise}
                                onStripeReady={handleStripeReady}
                                showCardFields={paymentMethod === "card"}
                                cardError={stripeCardError}
                                disabled={isProcessing}
                                isAuthenticated={isSignedIn}
                                saveCard={saveCard}
                                onSaveCardChange={setSaveCard}
                                savedPaymentMethods={savedPaymentMethods}
                                selectedSavedCardId={selectedSavedCardId}
                                onSelectSavedCard={setSelectedSavedCardId}
                                onRemoveSavedCard={handleRemoveSavedCard}
                              />
                            </Suspense>
                          )}                       </div>
                      );
                    })}

                    {klarnaEnabled && checkoutCurrency !== "AED" && countryCode !== "AE" && (
                      <div
                        className={`p-4 border rounded-xl cursor-pointer transition-all ${paymentMethod === "klarna" ? "ring-1" : "hover:border-primary/25 hover:bg-secondary/30"}`}
                        style={paymentMethod === "klarna" ? { borderColor: "hsl(var(--primary))", backgroundColor: "hsl(var(--primary) / 0.04)", outlineColor: "hsl(var(--primary) / 0.15)" } : {}}
                        onClick={() => { setPaymentMethod("klarna"); setStripeCardError(null); }}
                        data-testid="option-payment-klarna"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors" style={paymentMethod === "klarna" ? { borderColor: "hsl(var(--primary))", backgroundColor: "hsl(var(--primary))" } : { borderColor: "rgba(0,0,0,0.25)" }}>
                            {paymentMethod === "klarna" && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <span className="font-medium text-sm">{t("checkout.pay.klarnaLabel")}</span>
                          <div className="ml-auto flex items-center gap-1">
                            <span className="inline-flex overflow-hidden rounded-[4px]" style={{ width: 72, height: 34 }}>
                              <img src={klarnaLogo} alt={ALT_KLARNA} className="block w-full h-full object-contain" loading="lazy" decoding="async" draggable={false} />
                            </span>
                          </div>
                        </div>
                        {paymentMethod === "klarna" && (
                          <>
                            <p className="mt-2 ms-8 text-sm text-muted-foreground leading-relaxed">{t("checkout.pay.klarnaDesc")}</p>
                            <div className="mt-3 ms-8 flex items-center gap-2">
                              <label htmlFor="klarna-billing-country" className="text-xs text-muted-foreground whitespace-nowrap">
                                {t("checkout.pay.klarnaCountry")}
                              </label>
                              <select
                                id="klarna-billing-country"
                                value={klarnaBillingCountry}
                                onChange={(e) => {
                                  setKlarnaBillingCountry(e.target.value);
                                  klarnaBillingCountryManual.current = true;
                                }}
                                className="text-xs border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                              >
                                {KLARNA_BILLING_COUNTRIES.map((c) => (
                                  <option key={c.code} value={c.code}>{c.name}</option>
                                ))}
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Payment CTA — hidden on the Unified Checkout path: the UC
                      widget renders its own Pay button and drives the payment
                      itself (autoProcessing). */}
                  <div className="flex gap-3 mt-4">
                    <PaymentSubmitButton paymentMethod={paymentMethod} total={computeCartTotal(displaySubtotal, displayDistrictFee + displayExpressFee + displaySlotFee, displayCouponDiscount)} onClick={handleSubmit} disabled={isProcessing || (!noAddress && !_selectedDistrict)} isProcessing={isProcessing} walletPreparing={walletPreparing} />
                  </div>

                  {/* Secure payment badge */}
                  <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-muted-foreground">
                    <Lock className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t("checkout.securePaymentBadge")}</span>
                  </div>
                </div>

                {/* Order instructions (collapsible, collapsed by default) */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between"
                    onClick={() => setNoteOpen((o) => !o)}
                    aria-expanded={noteOpen}
                  >
                    <p className="text-sm font-medium text-foreground">{t("checkout.orderInstructions.label")}</p>
                    {noteOpen
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <Plus className="h-4 w-4 text-muted-foreground" />
                    }
                  </button>
                  {noteOpen && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-2">{t("checkout.orderInstructions.helper")}</p>
                      <textarea
                        value={orderNote}
                        onChange={(e) => setOrderNote(e.target.value)}
                        placeholder={t("checkout.orderInstructions.placeholder")}
                        rows={3}
                        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
                      />
                    </div>
                  )}
                </div>

                {/* Delivery recap */}
                <DeliveryRecap
                  recipientFirstName={recipient.firstName}
                  recipientLastName={recipient.lastName}
                  district={_selectedDistrict}
                  address={recipient.address}
                  recipientWillProvideAddress={noAddress}
                  selfRecipient={
                    !noAddress &&
                    !!recipient.firstName.trim() &&
                    !!sender.firstName.trim() &&
                    recipient.firstName.trim().toLowerCase() ===
                      `${sender.firstName} ${sender.lastName}`.trim().replace(/\s+/g, " ").toLowerCase() &&
                    !!recipient.phone.trim() &&
                    recipient.phone.trim() === sender.phone.trim()
                  }
                  deliveryMode={deliveryMode}
                  deliveryRowText={deliveryRowText}
                  onEdit={() => setStep(1)}
                />
              </div>
            )}
          </div>

          {/* ── Order Summary Sidebar ── */}
          <OrderSummaryPanel
            items={items}
            onSummaryOpenChange={handleSummaryOpenChange}
            subtotal={displaySubtotal}
            districtFee={displayDistrictFee}
            expressFee={displayExpressFee}
            slotFee={displaySlotFee}
            isMidnightSlotActive={isMidnightSlotActive}
            confirmedCouponDiscount={displayCouponDiscount}
            isFreeDeliveryUnlocked={isFreeDeliveryUnlocked}
            originalCityFee={originalCityFee}
            effectiveFreeDeliveryEnabled={effectiveFreeDeliveryEnabled}
            effectiveFreeDeliveryThresholdUsd={effectiveFreeDeliveryThresholdUsd}
            deliveryMode={deliveryMode}
            deliveryRowText={deliveryRowText}
            deliveryPromise={deliveryPromise}
            selectedDistrict={_selectedDistrict}
            couponApplied={couponApplied}
            couponOpen={couponOpen}
            couponInput={couponInput}
            setCouponInput={setCouponInput}
            couponError={couponError}
            setCouponError={setCouponError}
            couponValidating={couponValidating}
            couponInputRef={couponInputRef}
            handleCouponToggle={handleCouponToggle}
            handleCouponApply={handleCouponApply}
            handleCouponRemove={handleCouponRemove}
            loyaltyCoupon={loyaltyCoupon}
            loyaltyLoading={loyaltyLoading}
            loyaltyToggleOn={loyaltyToggleOn}
            onLoyaltyToggle={handleLoyaltyToggle}
            onChangeDelivery={() => {
              trackWebEvent({
                type: "desktop_checkout_delivery_change_clicked",
                properties: { deliveryType: deliveryMode === "express" ? "express" : "standard" },
              });
              setDeliveryPickerOpen(true);
            }}
            step={step}
            onContinueToPayment={handleDesktopContinue}
            deliveryRequired={
              deliveryGateBlocked
                ? {
                    status: districtReval.status as "invalid" | "pending" | "error",
                    districtLabel: districtRevalDisplayName,
                    onChoose: () => setDeliveryPickerOpen(true),
                    onRetry: handleDistrictRevalRetry,
                  }
                : null
            }
            ctaBlocked={deliveryGateBlocked}
            summaryOpen={summaryOpen}
            setSummaryOpen={setSummaryOpen}
          />

        </div>
      </div>
      {/* ── Dialogs ── */}
      {/* Pre-payment prices-updated confirmation — shown when the server's
          charged minor-unit amount differs from what the client last displayed.
          Catches both catalog/fee changes and FX-rate drift. */}
      <AlertDialog open={pricesConfirmState.open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("checkout.toast.pricesUpdatedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("checkout.toast.pricesUpdatedDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Server-authoritative breakdown — shows the exact amounts for each
              fee line so the shopper can confirm before payment proceeds. */}
          <div className="py-2 space-y-1 text-sm border-t border-b my-1">
            <div className="flex justify-between">
              <span>{t("checkout.toast.pricesUpdatedSubtotal")}</span>
              <span>{pricesConfirmState.currency} {pricesConfirmState.subtotal.toLocaleString()}</span>
            </div>
            {pricesConfirmState.districtFee > 0 && (
              <div className="flex justify-between">
                <span>{t("checkout.toast.pricesUpdatedDelivery")}</span>
                <span>+ {pricesConfirmState.currency} {pricesConfirmState.districtFee.toLocaleString()}</span>
              </div>
            )}
            {pricesConfirmState.expressFee > 0 && (
              <div className="flex justify-between">
                <span>{t("checkout.toast.pricesUpdatedExpress")}</span>
                <span>+ {pricesConfirmState.currency} {pricesConfirmState.expressFee.toLocaleString()}</span>
              </div>
            )}
            {pricesConfirmState.slotFee > 0 && (
              <div className="flex justify-between">
                <span>{isMidnightSlotActive ? t("product.midnightDelivery") : t("checkout.toast.pricesUpdatedSlot")}</span>
                <span>+ {pricesConfirmState.currency} {pricesConfirmState.slotFee.toLocaleString()}</span>
              </div>
            )}
            {pricesConfirmState.couponDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>{t("checkout.toast.pricesUpdatedCoupon")}</span>
                <span>− {pricesConfirmState.currency} {pricesConfirmState.couponDiscount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold pt-1 border-t">
              <span>{t("checkout.toast.pricesUpdatedNewTotal")}</span>
              <span>{pricesConfirmState.currency} {pricesConfirmState.newTotal.toLocaleString()}</span>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => pricesConfirmState.resolve?.(false)}>
              {t("checkout.toast.pricesUpdatedGoBack")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => pricesConfirmState.resolve?.(true)}>
              {t("checkout.toast.pricesUpdatedContinue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DeliveryPickerModal
        open={deliveryPickerOpen}
        onOpenChange={setDeliveryPickerOpen}
        onConfirm={handleDeliveryPickerConfirm}
        timeSlots={timeSlots}
        cityExpressAvailable={selectedCityData?.expressAvailable === true}
        /* The picker must show the schedule of the district selected at
           checkout — never the storefront browsing city (they can differ,
           e.g. browsing Beirut but delivering to Akkar). */
        city={selectedCityData ?? null}
      />

    </div>
  );
}
// Stripe state and the LazyStripeSection dynamic import are now fully
// managed inside CheckoutForm — no Elements wrapper needed here.
export default function Checkout() {
  return <CheckoutForm />;
}
