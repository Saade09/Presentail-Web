import { useState, useEffect, useRef, useMemo, useCallback, Fragment, lazy, Suspense } from "react";
import { useCart, effectivePrice } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LazyWebPhoneField } from "@/components/LazyWebPhoneField";
import { Textarea } from "@/components/ui/textarea";
import { CARD_MESSAGE_KEY, CARD_TO_KEY, CARD_FROM_KEY, CARD_QR_LINK_KEY, COUPON_STORAGE_KEY, COUPON_DISCOUNT_KEY, ORDER_NOTE_KEY } from "./Cart";
import { buildCardFrom } from "@/lib/cardFrom";
import {
  useCreateOrder,
  useDeliveryLocations,
  useStripeCheckoutSession,
  useMamoPayment,
  usePaypalPayment,
  useTabbyPayment,
  useCybersourceCaptureContext,
  useCybersourceCharge,
  useCybersourceUnifiedCheckoutComplete,
  type CsUnifiedCheckoutResult,
  useCybersourceAvailable,
  useCybersourceApplePaySession,
  useCybersourceWalletCharge,
  useCybersourcePayerAuthSetup,
  useCybersourcePayerAuthCheckEnrollment,
  useCybersourcePayerAuthValidate,
  useFxRates,
} from "@/lib/queries";
import { CyberSourceSection, type CyberSourceSectionRef, isCaptureContextExpiredSoon } from "./CyberSourceSection";
import { CyberSourceDeviceDataFrame } from "./CyberSourceDeviceDataFrame";
import { CyberSourceChallengeModal } from "./CyberSourceChallengeModal";
import CyberSourceUnifiedCheckout from "./CyberSourceUnifiedCheckout";
import { isCyberSourceEligible } from "@/lib/cybersource-eligibility";
import { useCreateCheckoutPaymentIntent } from "@workspace/api-client-react";
import { ArrowLeft, Check, Lock, MapPin, BookUser, ChevronDown, Loader2, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { CheckoutSkeleton } from "@/components/skeletons/CheckoutSkeleton";
import { DeliveryRecap } from "@/components/checkout/DeliveryRecap";
import { OrderSummaryPanel } from "@/components/checkout/OrderSummaryPanel";
import { trackEvent, trackWebEvent } from "@/lib/analytics";
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
  isExpressDeliveryAvailable,
  slotTimeRangeForLabel,
  timeSlotsForCountry,
} from "@workspace/delivery";
import { ScheduleInlinePanel } from "@/components/product/ScheduleInlinePanel";
import {
  isApplePayBrowser,
  webNextPaymentMethod,
  webPaymentMethodLabelKey,
  webVisiblePayMethods,
  type WebPaymentMethodId,
} from "./checkoutPayMethods";
import { calcCheckoutFees, activeCurrencyForCountry } from "./checkoutFees";
import { withTimeout, withTimeoutAsNull } from "@/lib/withTimeout";
import { computeCartTotal, toStripeMinorUnits, roundToNearestFive } from "@workspace/display-currency";
import { extractCsPayerAuthData, hasCsPayerAuthProof } from "@/lib/csPayerAuth";
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
const LazyStripeSection = lazy(() =>
  import("@/components/StripeCheckoutSection").then((m) => ({ default: m.StripeCheckoutSection })),
);

// Maps known Stripe decline codes to plain-language, actionable messages.
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
type PaymentMethodId = WebPaymentMethodId | "klarna" | "cybersource" | "cs_apple_pay" | "cs_google_pay";

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

  if (paymentMethod === "apple_pay" || paymentMethod === "cs_apple_pay") {
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

  if (paymentMethod === "google_pay" || paymentMethod === "cs_google_pay") {
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
              <img src={paypalLogo} alt={ALT_PAYPAL} style={{ height: 20, width: "auto" }} draggable={false} />
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
              <img src={whishLogo} alt={ALT_WHISH} style={{ height: 16, width: "auto" }} draggable={false} />
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
              <img src={tabbyLogo} alt={ALT_TABBY} style={{ height: 22, width: "auto" }} draggable={false} />
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

function applyAddressToRecipient(
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
    return {
      ...prev,
      firstName: fill(prev.firstName, a.recipientFirstName ?? ""),
      lastName: fill(prev.lastName, a.recipientLastName ?? ""),
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
    district: input.district ?? "",
  });
}

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
  const showLoginGate = !authLoading && !user && !guestAcked;
  const { toast } = useToast();
  const { t, dir, cityName } = useLocale();
  const { countryCode, country, city: locationCity } = useLocationSelection();
  const { currencyCode } = useDisplayCurrency();
  const { data: fxRatesData } = useFxRates();
  const ipCountry = useIpDetectedCountry();

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
  const cybersourceCapture = useCybersourceCaptureContext();
  const cybersourceCharge = useCybersourceCharge();
  const cybersourceApplePaySession = useCybersourceApplePaySession();
  const cybersourceWalletCharge = useCybersourceWalletCharge();
  const csPayerAuthSetup = useCybersourcePayerAuthSetup();
  const csPayerAuthCheckEnrollment = useCybersourcePayerAuthCheckEnrollment();
  const csPayerAuthValidate = useCybersourcePayerAuthValidate();
  // Probe once on mount to silently hide the tile when CS is not configured.
  const { data: csAvailableData } = useCybersourceAvailable();
  const csAvailable = csAvailableData?.available !== false; // optimistic: show until confirmed unavailable
  // Feature flag: payer authentication (3DS) enabled by the backend.
  // Default false so existing cached responses (without the field) are safe.
  const payerAuthEnabled = csAvailableData?.payerAuthEnabled === true;
  // ── Unified Checkout rollout gate ─────────────────────────────────────────
  // BOTH flags must be true: the web build's VITE_CYBERSOURCE_UNIFIED_CHECKOUT_ENABLED
  // and the API server's CYBERSOURCE_UNIFIED_CHECKOUT_ENABLED (surfaced via
  // /payment/cybersource/available). A half-enabled rollout therefore always
  // falls back to the Microform + payer-auth path instead of stranding the
  // shopper. Only consulted inside CyberSource-gated contexts (LB + USD).
  const unifiedCheckoutActive =
    import.meta.env.VITE_CYBERSOURCE_UNIFIED_CHECKOUT_ENABLED === "true" &&
    csAvailableData?.unifiedCheckoutEnabled === true;
  const csUnifiedComplete = useCybersourceUnifiedCheckoutComplete();
  // Confirmed orderId for the UC session (the session bakes the orderId and
  // total at creation time) + attempt UUID for cross-stage log correlation.
  const [ucOrderId, setUcOrderId] = useState<string | null>(null);
  const ucAttemptIdRef = useRef<string | null>(null);
  // Ref to the CyberSource card-form component — exposes createToken().
  const csFormRef = useRef<CyberSourceSectionRef>(null);
  // The capture context JWT returned from POST /payment/cybersource/capture-context.
  const [csCaptureContext, setCsCaptureContext] = useState<string | null>(null);
  // CyberSource environment derived from the capture-context response ("test"|"live").
  const [csCaptureEnv, setCsCaptureEnv] = useState<"test" | "live">("test");
  // Error message shown inside CyberSourceSection when the prefetch fails.
  const [csCaptureContextError, setCsCaptureContextError] = useState<string | null>(null);
  // True once BOTH CyberSource hosted iframes have fired their onload event.
  // Place Order stays disabled until this flips to true.
  const [csFieldsReady, setCsFieldsReady] = useState(false);

  // ── CyberSource Payer Authentication (3DS) state ──────────────────────────
  // Stage-level state for the payer-auth flow.  Reset to "idle" at the start
  // of each fresh attempt so the submit button re-enables on retry.
  type CsPayerAuthStage =
    | "idle"
    | "collecting_device_data"
    | "authentication_pending"
    | "authentication_succeeded"
    | "authentication_failed"
    | "authorization_pending";
  const [csPayerAuthStage, setCsPayerAuthStage] = useState<CsPayerAuthStage>("idle");
  // Unique ID for each CyberSource payment attempt — prevents duplicate charges
  // on page refresh mid-flow.  Generated with crypto.randomUUID() at the start
  // of each attempt and stored in a ref so beforeunload can read it without a
  // closure capture.
  const csPaymentAttemptIdRef = useRef<string | null>(null);
  // Props for the invisible device-data iframe; null = not mounted.
  const [csDeviceDataProps, setCsDeviceDataProps] = useState<{
    deviceDataCollectionUrl: string;
    accessToken: string;
  } | null>(null);
  // Resolver for the promise that awaits device-data collection completion.
  const csDeviceDataResolverRef = useRef<((success: boolean) => void) | null>(null);
  // Props for the challenge modal; null = not mounted.
  const [csChallengeProps, setCsChallengeProps] = useState<{
    stepUpUrl: string;
    accessToken: string;
  } | null>(null);
  // Resolver for the promise that awaits challenge completion/cancellation.
  type ChallengeResult = { completed: boolean; status?: string };
  const csChallengeResolverRef = useRef<((result: ChallengeResult) => void) | null>(null);
  // ─────────────────────────────────────────────────────────────────────────
  // Expiry field managed here so we can read it in the submit handler.
  const { data: locations, isLoading: locationsLoading } = useDeliveryLocations();
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
          recipientFirstName: recipient.firstName.trim() || null,
          recipientLastName: recipient.lastName.trim() || null,
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
  // into the checkout summary. Falls back to "schedule" + the first slot
  // when there's no persisted choice (legacy behaviour).
  const persistedScheduleMode =
    deliverySelection.mode && deliverySelection.mode !== "express"
      ? "schedule"
      : deliverySelection.mode === "express"
        ? "express"
        : "schedule";
  const [deliverySlot, setDeliverySlot] = useState<string>(
    deliverySelection.slotLabel ?? timeSlotsForCountry(countryCode)[0]?.label ?? "",
  );
  const [deliverySlotId, setDeliverySlotId] = useState<string | undefined>(undefined);
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
    // Clear any stale CS prefetch error so re-selecting the tile triggers a
    // fresh attempt and doesn't leave the error banner stuck on screen.
    if (m !== "cybersource") {
      setCsCaptureContextError(null);
    }
    // Trigger Stripe initialisation immediately when the shopper explicitly
    // picks a Stripe-backed method.  Mamo, PayPal, Whish, and Western Union
    // never load Stripe.  triggerStripeLoad() is idempotent.
    if (m === "card" || m === "apple_pay" || m === "google_pay" || m === "klarna") {
      triggerStripeLoad();
    }
  };

  const [noAddress, setNoAddress] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [identitySecret, setIdentitySecret] = useState(false);
  const [phoneSubmitAttempted, setPhoneSubmitAttempted] = useState(false);
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
  const couponInputRef = useRef<HTMLInputElement>(null);
  // Stores the server-assigned order ID for the current checkout attempt.
  // Generated once via /api/orders/next-id and reused across retries so
  // a shopper who retries after a card decline reuses the same order ID.
  const orderIdRef = useRef<string | null>(null);

  // Refs for Return-key focus chaining between checkout text fields.
  const recipientFirstNameRef = useRef<HTMLInputElement>(null);
  const recipientLastNameRef = useRef<HTMLInputElement>(null);
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
          cartTotalUsd: subtotal,
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
      } else {
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
      setTimeout(() => couponInputRef.current?.focus(), 80);
    }
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
    }
  };

  // All cities for the selected country (both active and inactive) — sourced
  // from the OS cache so toggling a city in Presentail OS propagates within
  // the polling interval. Inactive cities are shown greyed-out and unclickable;
  // only active cities (isActive !== false) can be selected.
  const activeCities = useMemo(
    () =>
      locations?.countries.find((c) => c.code === countryCode)?.cities ?? [],
    [locations, countryCode],
  );

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

  // Use OS city time slots when available; fall back to hardcoded per-country defaults.
  // `selectedCityData?.timeSlots` is populated from /api/delivery-locations once loaded.
  // Safety net: if the flat list is empty but slotsByDay is present (e.g. Akkar),
  // derive the effective flat list as the deduplicated union of all per-day arrays
  // before reaching the country-wide fallback.
  const timeSlots = useMemo(() => {
    if (selectedCityData?.timeSlots?.length) return selectedCityData.timeSlots;
    if (selectedCityData?.slotsByDay) {
      const derived = Object.values(selectedCityData.slotsByDay)
        .flat()
        .filter((s, i, arr) => arr.findIndex((t) => t.cutoffHour === s.cutoffHour) === i);
      if (derived.length > 0) return derived;
    }
    return timeSlotsForCountry(countryCode);
  }, [selectedCityData, countryCode]);

  useEffect(() => {
    // Only fall back once city data has loaded; firing before that would
    // reset a seeded "express" selection while expressAvailable is still
    // false simply because selectedCityData hasn't arrived yet.
    if (locationsLoading) return;
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
        deliveryFee: districtFee + expressFee + slotFee,
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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryMode, deliverySlot, recipient.deliveryDate]);

  const prevCountryRef = useRef(countryCode);
  useEffect(() => {
    if (countryCode !== prevCountryRef.current) {
      prevCountryRef.current = countryCode;
      setRecipient((r) => ({ ...r, district: "" }));
      // Use city OS slots when already loaded, otherwise fall back to hardcoded.
      const newSlots = selectedCityData?.timeSlots?.length
        ? selectedCityData.timeSlots
        : timeSlotsForCountry(countryCode);
      setDeliverySlot(newSlots[0]?.label ?? "");
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
  useEffect(() => {
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
      setRecipient((r) => ({ ...r, deliveryDate: result.iso }));
      setDeliverySlot(result.slot.label);
      if (result.iso !== today) setDeliveryMode("schedule");
      // Persist the corrected selection so the product page / cart stay in sync.
      deliverySelection.setSelection({
        mode: result.iso !== today ? "schedule" : "today_slot",
        date: result.iso,
        slotLabel: result.slot.label,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeSlots]);

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
  // STRICT payment routing rule — the ONLY country source is the sender
  // phone field's displayed country (senderPhoneCountry). CyberSource renders
  // ONLY when that country is Lebanon AND the checkout currency is USD.
  // Everything else — non-LB phone, LB + non-USD, or an unknown/unmounted
  // phone country — routes to Stripe. NEVER derived from delivery country,
  // IP location, browser locale, persisted market, currency alone, or a
  // hardcoded "LB" fallback.
  const senderCountryCode = senderPhoneCountry?.trim().toUpperCase() || null;
  const useCyberSource = isCyberSourceEligible(senderCountryCode, currencyCode);
  // Reset csFieldsReady whenever the user switches away from the CyberSource
  // tile so a stale "ready" doesn't carry over if they come back.
  useEffect(() => {
    if (paymentMethod !== "cybersource") setCsFieldsReady(false);
  }, [paymentMethod]);
  // Temporary diagnostic — proves which state payment routing consumed.
  useEffect(() => {
    console.log("PAYMENT_ROUTING", {
      phoneCountryCode: senderPhoneCountry,
      phoneDialCode: senderPhoneDialCode,
      senderCountryCode,
      currencyCode,
      useCyberSource,
    });
  }, [senderPhoneCountry, senderPhoneDialCode, senderCountryCode, currencyCode, useCyberSource]);
  const paymentOptions = useMemo(() => {
    const isLbUsd = isCyberSourceEligible(senderCountryCode, currencyCode);
    const ids = webVisiblePayMethods({
      activeCurrency: currencyCode,
      countryCode: payCtxCountry,
      isApplePlatform: appleDevice,
    }).filter((id) => {
      // CyberSource is the card processor for Lebanon + USD — hide all
      // Stripe-backed card/wallet tiles when CS credentials are configured
      // and the capture-context hasn't already returned an error.
      // Falls back to Stripe when csAvailable is false (credentials unset)
      // OR when the capture-context prefetch has already returned an error.
      if (isLbUsd && csAvailable && !csCaptureContextError) {
        if (id === "card" || id === "apple_pay" || id === "google_pay") return false;
      }
      if (id === "apple_pay" || id === "google_pay") return walletSupported;
      return true;
    });
    const result: { id: PaymentMethodId; labelKey: string }[] = ids.map((id) => ({
      id,
      labelKey: webPaymentMethodLabelKey(id, currencyCode),
    }));
    // Inject the CyberSource tiles at the top of the list for LB USD,
    // but only when the availability probe confirms credentials are set
    // and the capture context hasn't already failed.
    if (isLbUsd && csAvailable && !csCaptureContextError) {
      // The CS inline-card tile sits directly under the CS native-wallet tile
      // (Apple Pay on Apple devices, Google Pay on all others), so unshift the
      // card tile first, then the wallet tile above it when supported.
      result.unshift({
        id: "cybersource",
        labelKey: "checkout.pay.cybersource",
      });
      if (walletSupported) {
        const csWalletId: PaymentMethodId = appleDevice ? "cs_apple_pay" : "cs_google_pay";
        result.unshift({
          id: csWalletId,
          labelKey: appleDevice ? "checkout.pay.apple_pay" : "checkout.pay.google_pay",
        });
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencyCode, countryCode, senderCountryCode, walletSupported, csAvailable, csCaptureContextError, appleDevice]);
  // If the currently selected payment method is no longer available for
  // the active currency / country, re-select a sensible default through
  // the same shared helper the mobile checkout uses.
  useEffect(() => {
    // "klarna" is not in WebPaymentMethodId so webNextPaymentMethod won't
    // fallback from it — leave klarna selection alone.
    // "cybersource" likewise, BUT if it is no longer eligible (credentials
    // unavailable or context changed away from LB+USD) we must reset to a
    // valid method; treat it as "card" for the fallback computation.
    if (paymentMethod === "klarna") return;
    const isLbUsdContext = isCyberSourceEligible(senderCountryCode, currencyCode);
    const isCsActive = csAvailable && isLbUsdContext && !csCaptureContextError;
    // CS-backed methods are already correct for LB+USD — leave them alone.
    if (
      isCsActive &&
      (paymentMethod === "cybersource" ||
        paymentMethod === "cs_apple_pay" ||
        paymentMethod === "cs_google_pay")
    ) return;
    // Stripe wallet tiles (apple_pay / google_pay / card) selected while CS is
    // active for LB+USD: switch to the CS-backed equivalent without loading Stripe.
    if (isCsActive) {
      if (paymentMethod === "apple_pay") {
        setPaymentMethodState(walletSupported ? "cs_apple_pay" : "cybersource");
        return;
      }
      if (paymentMethod === "google_pay") {
        setPaymentMethodState(walletSupported ? "cs_google_pay" : "cybersource");
        return;
      }
      if (paymentMethod === "card") {
        setPaymentMethodState("cybersource");
        return;
      }
    }
    const baseMethod =
      paymentMethod === "cybersource" ||
      paymentMethod === "cs_apple_pay" ||
      paymentMethod === "cs_google_pay"
        ? "card"
        : paymentMethod;
    const fallback = webNextPaymentMethod(baseMethod, {
      activeCurrency: currencyCode,
      countryCode: payCtxCountry,
      isApplePlatform: appleDevice,
    });
    if (fallback !== paymentMethod) {
      setPaymentMethodState(fallback);
    }
    // Ensure Stripe is initialised whenever the resolved method is Stripe-backed,
    // including on first render when apple_pay is already the default selection
    // and the method didn't change (so the block above doesn't fire).
    // triggerStripeLoad() is idempotent — safe to call on every run.
    if (fallback === "card" || fallback === "apple_pay" || fallback === "google_pay") {
      triggerStripeLoad();
    }
  }, [currencyCode, countryCode, paymentMethod, triggerStripeLoad, csAvailable, payCtxCountry, senderCountryCode, csCaptureContextError, walletSupported]);

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
      } catch {
        if (cancelled) return;
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
  const { districtFee, expressFee, slotFee, total } = calcCheckoutFees({
    subtotal,
    countryCode: countryCode ?? "LB",
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

  // Clear the server fee override whenever any fee-affecting input changes so a
  // stale override never persists after the shopper modifies delivery settings.
  useEffect(() => {
    setServerFeesOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, deliveryMode, _selectedDistrict, noAddress, confirmedCouponDiscount, deliverySlot]);

  // Prefetch CyberSource capture context as soon as the shopper selects the
  // tile so Microform can initialise immediately — no blank-field wait on submit.
  useEffect(() => {
    if (paymentMethod !== "cybersource" || step !== 2) return;
    // Unified Checkout replaces Microform entirely — never spend a Microform
    // capture context on that path. While the build flag is on but the
    // availability probe (which carries the server-side unifiedCheckoutEnabled
    // flag) hasn't resolved yet, defer prefetching: we don't know which card
    // UI will render. With the build flag off this block is dead code and the
    // legacy prefetch behaviour is byte-for-byte unchanged.
    if (import.meta.env.VITE_CYBERSOURCE_UNIFIED_CHECKOUT_ENABLED === "true") {
      if (!csAvailableData) return;
      if (unifiedCheckoutActive) return;
    }
    if (csCaptureContext || cybersourceCapture.isPending) return;
    let cancelled = false;
    (async () => {
      try {
        const oid = await ensureOrderId();
        if (cancelled) return;
        const res = await cybersourceCapture.mutateAsync({
          items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
          orderId: oid,
          district: _selectedDistrict || undefined,
          expressDelivery: deliveryMode === "express",
          noAddress,
          deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
          ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
          ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
          targetOrigin: window.location.origin,
        });
        if (!cancelled && res.ok && res.captureContext) {
          setCsCaptureContext(res.captureContext);
          setCsCaptureEnv(res.environment ?? "test");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          // Surface a friendly error so the user sees something instead of
          // an infinite skeleton. The submit handler will retry on tap.
          setCsCaptureContextError(msg || "Unable to load card form"); // i18n-ignore
          // Automatically fall back to Stripe card — the paymentOptions memo
          // re-runs on csCaptureContextError change and re-shows the Stripe tile.
          setPaymentMethodState("card");
          triggerStripeLoad();
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, step, csAvailableData, unifiedCheckoutActive]);

  // ── Unified Checkout prep ──────────────────────────────────────────────────
  // The UC session bakes clientReferenceInformation (orderId) and the charge
  // total at creation time, so a confirmed orderId must exist before the
  // widget can request its session. Resolve it as soon as the tile is active.
  useEffect(() => {
    if (!unifiedCheckoutActive || paymentMethod !== "cybersource" || step !== 2) return;
    if (ucOrderId) return;
    let cancelled = false;
    (async () => {
      try {
        const oid = await ensureOrderId();
        if (cancelled) return;
        if (!ucAttemptIdRef.current) {
          ucAttemptIdRef.current =
            typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `uc-${Date.now()}`;
        }
        setUcOrderId(oid);
      } catch {
        // ensureOrderId failure leaves the widget in its loading state; the
        // shopper can retry by re-selecting the tile or switching methods.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unifiedCheckoutActive, paymentMethod, step, ucOrderId]);

  // Serialized fee-affecting inputs for the UC session. When any of these
  // change, the widget remounts and creates a fresh session so the amount UC
  // charges always matches the visible cart (the server re-verifies too).
  const ucSessionKey = useMemo(
    () =>
      [
        ucOrderId ?? "",
        _selectedDistrict || "",
        deliveryMode,
        noAddress ? "1" : "0",
        deliveryMode === "express" ? "" : deliverySlot || "",
        deliveryMode === "express" ? "" : deliverySlotId || "",
        selectedCityData?.id != null ? String(selectedCityData.id) : "",
        items.map((i) => `${i.product.id}x${i.quantity}`).join(","),
      ].join("|"),
    [ucOrderId, _selectedDistrict, deliveryMode, noAddress, deliverySlot, deliverySlotId, selectedCityData?.id, items],
  );

  // ── Payer-auth refresh guard ───────────────────────────────────────────────
  // When the page is refreshed or navigated away during an active payer-auth
  // stage, clear the in-flight attempt so the shopper gets a clean form on
  // return rather than a stuck or duplicate-charge state.
  // Uses a ref (not localStorage) so nothing survives the unload.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (csPaymentAttemptIdRef.current) {
        csPaymentAttemptIdRef.current = null;
        setCsPayerAuthStage("idle");
        setCsDeviceDataProps(null);
        setCsChallengeProps(null);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

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
  // PaymentElement mode. Used only for display purposes inside the
  // PaymentElement (e.g. Klarna installment plan amounts). The actual charge
  // is always the server-verified total from the PaymentIntent.
  const estimatedStripeMinorUnits = Math.max(
    50,
    toStripeMinorUnits(
      roundToNearestFive(
        computeCartTotal(
          displaySubtotal,
          displayDistrictFee + displayExpressFee + displaySlotFee,
          displayCouponDiscount,
        ) * (fxRatesData?.rates?.[checkoutCurrency] ?? 1),
        checkoutCurrency,
      ),
      checkoutCurrency,
    ),
  );

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
  const isProcessing =
    csUnifiedComplete.isPending ||
    createOrder.isPending ||
    stripeSession.isPending ||
    createPaymentIntent.isPending ||
    mamoPayment.isPending ||
    paypalPayment.isPending ||
    tabbyPayment.isPending ||
    cybersourceCapture.isPending ||
    cybersourceCharge.isPending ||
    cybersourceWalletCharge.isPending ||
    csPayerAuthSetup.isPending ||
    csPayerAuthCheckEnrollment.isPending ||
    csPayerAuthValidate.isPending ||
    csPayerAuthStage === "collecting_device_data" ||
    csPayerAuthStage === "authentication_pending" ||
    csPayerAuthStage === "authentication_succeeded" ||
    csPayerAuthStage === "authorization_pending" ||
    cardProcessing;

  // Active display currency derived from the active country. Used both
  // by the payment-method picker (to hide unavailable methods) and by
  // the submit handler (to route AED + wallet through Mamo's hosted page,
  // mirroring mobile checkout).
  const activeCurrency = activeCurrencyForCountry(countryCode ?? "LB");

  // orderId is generated once per checkout attempt and threaded through the
  // payment session creation AND the WC order payload so the server can bind
  // them together and reject any replay of a paid session for a different order.
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
      firstName: recipient.firstName,
      lastName: recipient.lastName,
      phone: recipient.phone,
    },
    district: _selectedDistrict,
    districtFee: districtFee,
    expressFee,
    slotFee,
    cityId: selectedCityData?.id != null ? String(selectedCityData.id) : undefined,
    noAddress,
    deliveryDetails: noAddress ? "To be confirmed" : recipient.address,
    deliveryDate: deliveryMode === "express" ? todayIso() : recipient.deliveryDate,
    deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
    ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
    deliverySlotTime: deliveryMode === "express" ? undefined : slotTimeRangeForLabel(deliverySlot, timeSlots),
    cardMessage: recipient.cardMessage,
    cardTo: recipient.cardTo.trim() || undefined,
    cardFrom: buildCardFrom((() => { try { return localStorage.getItem(CARD_FROM_KEY) ?? ""; } catch { return ""; } })()),
    ...(/^https?:\/\/.+/.test(qrLink.trim()) ? { qrLink: qrLink.trim() } : {}),
    // "cs_apple_pay" / "cs_google_pay" are client-side UX IDs for the
    // CyberSource wallet tiles; the API server only recognises the base
    // "apple_pay" / "google_pay" values, which are passed through so the
    // OS payload and analytics can distinguish which wallet was used.
    paymentMethod: (() => {
      const m = overrides.paymentMethod ?? paymentMethod;
      if (m === "cs_apple_pay") return "apple_pay";
      if (m === "cs_google_pay") return "google_pay";
      return m;
    })(),
    identitySecret,
    currencyCode: "USD",
    couponDiscount: confirmedCouponDiscount > 0 ? confirmedCouponDiscount : undefined,
    totalUsd: computeCartTotal(subtotal, districtFee + expressFee + slotFee, confirmedCouponDiscount),
    shippingCountry: (countryCode ?? "LB").toUpperCase().slice(0, 2),
    ...(couponApplied && couponInput.trim() ? { couponCode: couponInput.trim() } : {}),
    ...(overrides.paymentRef ? { paymentRef: overrides.paymentRef } : {}),
    ...(!noAddress && recipient.address ? { street: recipient.address } : {}),
    ...(selectedCityData?.name ? { deliveryCity: selectedCityData.name } : {}),
    ...(countryCode ? { deliveryCountry: countryCode.toUpperCase().slice(0, 2) } : {}),
    ...(savedAddressSubFieldsRef.current?.building ? { building: savedAddressSubFieldsRef.current.building } : {}),
    ...(savedAddressSubFieldsRef.current?.floor ? { floor: savedAddressSubFieldsRef.current.floor } : {}),
    ...(savedAddressSubFieldsRef.current?.apartment ? { apartment: savedAddressSubFieldsRef.current.apartment } : {}),
  });

  const finalizeOrderNow = async (paymentRef?: string) => {
    const payload = buildOrderPayload({ paymentRef });
    const res = (await createOrder.mutateAsync(payload)) as CreateOrderResponse;
    if (res.ok) {
      // Update the confirmed discount in state so the summary briefly shows
      // the deduction before the redirect (and WC returns it in the response).
      if (res.couponDiscount > 0) setConfirmedCouponDiscount(res.couponDiscount);
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

  // ── Unified Checkout result handlers ───────────────────────────────────────
  // By the time onResult fires, the UC widget (autoProcessing) has already run
  // 3DS and the CAPTURE itself. The server's strict paid gate at
  // /unified-checkout/complete decides whether the result counts as paid; only
  // its ok + paymentRef finalizes the order. setupPayerAuth / checkEnrollment /
  // validateAuthentication are never called on this path.
  const handleUnifiedCheckoutResult = async (ucRes: CsUnifiedCheckoutResult) => {
    // isProcessing derives from mutation isPending flags (csUnifiedComplete +
    // createOrder are both in it), so no manual toggling — this guard only
    // prevents a double-fire while a previous result is still finalizing.
    if (isProcessing) return;
    try {
      const orderId = ucOrderId ?? (await ensureOrderId());
      const completeRes = await csUnifiedComplete.mutateAsync({
        orderId,
        paymentAttemptId: ucAttemptIdRef.current ?? undefined,
        items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
        district: _selectedDistrict,
        expressDelivery: deliveryMode === "express",
        noAddress,
        deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
        ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
        ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
        result: ucRes,
      });
      if (!completeRes.ok || !completeRes.paymentRef) {
        toast({
          title: t("checkout.toast.cybersourceDeclined"),
          description: completeRes.message || t("checkout.toast.cybersourceDeclinedDesc"),
          variant: "destructive",
        });
        trackEvent({ name: "payment_error", surface: "checkout", action: "provider" });
        trackWebEvent({ type: "payment_failed", currency: checkoutCurrency, properties: { method: "cybersource" } });
        return;
      }
      void maybeSaveNewAddress();
      void maybeSaveProfilePhone();
      await finalizeOrderNow(completeRes.paymentRef);
    } catch (err) {
      const apiErr = err as { status?: number; data?: { code?: string; message?: string }; message?: string };
      const serverCode = apiErr?.data?.code;
      const serverMessage = apiErr?.data?.message;
      console.log("PAYMENT_DIAG", {
        stage: "unifiedCheckoutComplete",
        frontendEndpoint: "/api/payment/cybersource/unified-checkout/complete",
        status: apiErr?.status ?? null,
        code: serverCode ?? null,
      });
      if (serverCode === "payment_not_approved" || serverCode === "result_mismatch" || serverCode === "verification_failed") {
        // Paid gate rejected the result — the order was NOT placed.
        toast({
          title: t("checkout.toast.cybersourceDeclined"),
          description: serverMessage || t("checkout.toast.cybersourceDeclinedDesc"),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("checkout.toast.cybersourceUnavailable"),
          description: serverMessage || t("checkout.toast.cybersourceUnavailableDesc"),
          variant: "destructive",
        });
      }
      trackEvent({ name: "payment_error", surface: "checkout", action: "provider" });
      trackWebEvent({ type: "payment_failed", currency: checkoutCurrency, properties: { method: "cybersource" } });
    }
  };

  // mount() rejected: cancelled/failed 3DS challenge, declined card, session
  // or SDK failure. Nothing was stored server-side, so the order stays unpaid.
  const handleUnifiedCheckoutError = (message: string, reason?: string) => {
    console.log("PAYMENT_DIAG", {
      stage: "unifiedCheckout",
      frontendEndpoint: "/api/payment/cybersource/unified-checkout/session",
      reason: reason ?? null,
      message,
    });
    const key = `${reason ?? ""} ${message}`.toUpperCase();
    if (key.includes("AUTH") || key.includes("CHALLENGE")) {
      // 3DS verification failed or was abandoned — bank-verification copy.
      toast({ title: t("checkout.toast.csPayerAuthFailed"), variant: "destructive" });
    } else if (key.includes("DECLIN")) {
      toast({
        title: t("checkout.toast.cybersourceDeclined"),
        description: t("checkout.toast.cybersourceDeclinedDesc"),
        variant: "destructive",
      });
    } else {
      toast({
        title: t("checkout.toast.cybersourceUnavailable"),
        description: t("checkout.toast.cybersourceUnavailableDesc"),
        variant: "destructive",
      });
    }
    trackEvent({ name: "payment_error", surface: "checkout", action: "provider" });
    trackWebEvent({ type: "payment_failed", currency: checkoutCurrency, properties: { method: "cybersource" } });
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

      const origin = window.location.origin;
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const _successUrl = `${origin}${base}/order-confirmed?status=success&pid={CHECKOUT_SESSION_ID}`;
      const _cancelUrl = `${origin}${base}/order-confirmed?status=failed`;
      const returnUrl = `${origin}${base}/order-confirmed?status=success`;
      const failureUrl = `${origin}${base}/order-confirmed?status=failed`;

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
          const _wClientRate = fxRatesData?.rates?.[checkoutCurrency] ?? 1;
          const _wClientDisplay = roundToNearestFive(_wClientTotalUsd * _wClientRate, checkoutCurrency);
          const _wClientMinorUnits = toStripeMinorUnits(_wClientDisplay, checkoutCurrency);
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

        // Step 0 (Klarna / PaymentElement mode only): submit the Elements form
        // before creating the PI. elements.submit() validates the form data and
        // returns an error without creating a PI if the shopper's payment details
        // are incomplete. Skip this step when a saved card is selected (no form
        // to validate) and when Klarna is off (split card fields use a different
        // confirmation path that doesn't need submit()).
        if (klarnaEnabled && !selectedSavedCardId && elements) {
          const { error: submitError } = await elements.submit();
          if (submitError) {
            setStripeCardError(submitError.message ?? t("checkout.toast.cardPaymentFailed"));
            return;
          }
        }

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
          if (klarnaEnabled) {
            // Path A: PaymentElement (cards + Klarna + other methods).
            //
            // Stash the order payload BEFORE calling confirmPayment so it
            // survives a Klarna redirect away from this page. For card
            // payments, confirmPayment resolves before any navigation.
            const _piId = intentRes.clientSecret.split("_secret_")[0] ?? "";
            const _stashPayload = buildOrderPayload({ paymentRef: _piId, orderId });
            try {
              sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify({ payload: _stashPayload, createdAt: Date.now() }));
            } catch {
              // Quota / private mode — proceed. Card payments won't need the
              // stash; Klarna payments may fail to auto-finalize on return.
            }

            const _klarnaReturnUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${import.meta.env.BASE_URL ?? "/"}order-confirmed?status=success`;

            // For saved cards: pass the payment method ID via confirmParams.
            // For new cards via PaymentElement: pass elements so Stripe reads
            // the card details from the PaymentElement automatically.
            // stripe.confirmPayment with redirect:'if_required' resolves
            // immediately for card payments and redirects for Klarna/redirect-
            // required methods. Cast needed because older @stripe/stripe-js
            // type declarations only expose redirect:'always'.
            const _peResult = await (stripe.confirmPayment as (
              o: object,
            ) => Promise<{
              error?: import("@stripe/stripe-js").StripeError;
              paymentIntent?: import("@stripe/stripe-js").PaymentIntent;
            }>)({
              ...(selectedSavedCardId ? {} : { elements }),
              clientSecret: intentRes.clientSecret,
              confirmParams: {
                return_url: _klarnaReturnUrl,
                ...(selectedSavedCardId
                  ? { payment_method: selectedSavedCardId }
                  : {
                      payment_method_data: {
                        billing_details: {
                          ...(sender.email ? { email: sender.email } : {}),
                          ...(senderName ? { name: senderName } : {}),
                        },
                      },
                    }),
              },
              redirect: "if_required",
            });
            const peError = _peResult.error;
            const peIntent = _peResult.paymentIntent;

            if (peError) {
              trackEvent({ name: "payment_error", surface: "checkout", action: "provider", errorCode: peError.code ?? undefined });
              trackWebEvent({ type: "payment_failed", currency: checkoutCurrency, properties: { method: "card_or_klarna", errorCode: peError.code ?? undefined } });
              setStripeCardError(stripeDeclineMsg(peError, t) ?? peError.message ?? t("checkout.toast.cardPaymentFailed"));
              return;
            }
            finalIntent = peIntent;
          } else {
            // Path B: Legacy split card fields (confirmCardPayment + 3DS).
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
        });
        if (!res.ok || !res.url) {
          toast({
            title: t("checkout.toast.paypalUnavailable"),
            description: res.message || t("checkout.toast.paypalUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }
        stashAndRedirect(res.url, orderId);
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
        const origin = window.location.origin;
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        const klarnaReturnUrl = `${origin}${base}/order-confirmed?status=success`;

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

      // ── CyberSource Google Pay ────────────────────────────────────────────
      // Shows the native Google Pay sheet in the browser, collects the
      // encrypted payment token, and charges it via CyberSource server-side.
      // Restricted to Lebanon + USD (same gate as CyberSource inline card).
      if (payMethod === "cs_google_pay") {
        const csGpayEnv =
          (csAvailableData as { environment?: string } | undefined)?.environment === "live"
            ? "PRODUCTION"
            : "TEST";
        const csGatewayMerchantId =
          (csAvailableData as { merchantId?: string } | undefined)?.merchantId ?? "";
        const gpayMerchantId =
          import.meta.env.VITE_GOOGLE_PAY_MERCHANT_ID ?? "BCR2DN4TWLDH45P4"; // i18n-ignore

        // Load the Google Pay JS library if not already present.
        await new Promise<void>((resolve, reject) => {
          if ((window as any).google?.payments?.api?.PaymentsClient) {
            resolve();
            return;
          }
          const existing = document.getElementById("google-pay-js");
          if (existing) { existing.addEventListener("load", () => resolve()); return; }
          const script = document.createElement("script");
          script.id = "google-pay-js";
          script.src = "https://pay.google.com/gp/p/js/pay.js"; // i18n-ignore
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Google Pay")); // i18n-ignore
          document.head.appendChild(script);
        });

        const gPayClient = new (window as any).google.payments.api.PaymentsClient({
          environment: csGpayEnv,
        });

        const paymentDataRequest = {
          apiVersion: 2,
          apiVersionMinor: 0,
          allowedPaymentMethods: [
            {
              type: "CARD", // i18n-ignore
              parameters: {
                allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"], // i18n-ignore
                allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX"], // i18n-ignore
              },
              tokenizationSpecification: {
                type: "PAYMENT_GATEWAY", // i18n-ignore
                parameters: {
                  gateway: "cybersource", // i18n-ignore
                  gatewayMerchantId: csGatewayMerchantId,
                },
              },
            },
          ],
          merchantInfo: {
            merchantId: gpayMerchantId,
            merchantName: "Presentail", // i18n-ignore
          },
          transactionInfo: {
            totalPriceStatus: "FINAL", // i18n-ignore
            totalPrice: computeCartTotal(subtotal, districtFee + expressFee + slotFee, confirmedCouponDiscount).toFixed(2),
            currencyCode: "USD", // i18n-ignore
            countryCode: "LB", // i18n-ignore
          },
        };

        let gpayData: any;
        try {
          gpayData = await gPayClient.loadPaymentData(paymentDataRequest);
        } catch (gpayErr: any) {
          // User dismissed the sheet — statusCode "CANCELED" is not an error.
          if (gpayErr?.statusCode === "CANCELED" || gpayErr?.statusCode === "USER_DISMISSED") return;
          toast({
            title: t("checkout.toast.cybersourceDeclined"),
            description: gpayErr?.message || t("checkout.toast.cybersourceDeclinedDesc"),
            variant: "destructive",
          });
          return;
        }

        const googlePayToken = gpayData.paymentMethodData.tokenizationData.token;

        const walletChargeRes = await cybersourceWalletCharge.mutateAsync({
          walletType: "googlepay",
          walletToken: googlePayToken,
          orderId,
          items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
          district: _selectedDistrict,
          expressDelivery: deliveryMode === "express",
          noAddress,
          deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
          ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
          ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
          billingDetails: {
            firstName: sender.firstName,
            lastName: sender.lastName,
            email: sender.email,
          },
        });

        if (!walletChargeRes.ok || !walletChargeRes.paymentRef) {
          toast({
            title: t("checkout.toast.cybersourceDeclined"),
            description: walletChargeRes.message || t("checkout.toast.cybersourceDeclinedDesc"),
            variant: "destructive",
          });
          return;
        }

        void maybeSaveNewAddress();
        void maybeSaveProfilePhone();
        await finalizeOrderNow(walletChargeRes.paymentRef);
        return;
      }

      // ── CyberSource Apple Pay ─────────────────────────────────────────────
      // Shows the native Apple Pay sheet in the browser. Merchant validation
      // is proxied through CyberSource via /payment/cybersource/applepay-session.
      // Requires the CyberSource account to have an Apple Pay certificate
      // configured in Business Center (Setup → Payment Configuration → Apple Pay).
      if (payMethod === "cs_apple_pay") {
        const applePayTotal = computeCartTotal(
          subtotal, districtFee + expressFee + slotFee, confirmedCouponDiscount,
        ).toFixed(2);

        // ApplePaySession.begin() MUST be called synchronously within the user
        // gesture — any await before this point must already be settled.
        const applePayRequest = {
          countryCode: "LB", // i18n-ignore
          currencyCode: "USD", // i18n-ignore
          supportedNetworks: ["visa", "masterCard", "amex"], // i18n-ignore
          merchantCapabilities: ["supports3DS"], // i18n-ignore
          total: { label: "Presentail", amount: applePayTotal }, // i18n-ignore
        };

        let applePayToken: string | null = null;
        let applePayError: string | null = null;

        await new Promise<void>((resolve) => {
          const session = new (window as any).ApplePaySession(14, applePayRequest);

          session.onvalidatemerchant = async (event: any) => {
            try {
              const validationRes = await cybersourceApplePaySession.mutateAsync({
                validationURL: event.validationURL,
                displayName: "Presentail", // i18n-ignore
                domainName: window.location.hostname,
              });
              if (validationRes.ok && validationRes.merchantSession) {
                session.completeMerchantValidation(validationRes.merchantSession);
              } else {
                session.abort();
                applePayError = validationRes.message ?? t("checkout.toast.cybersourceDeclinedDesc");
                resolve();
              }
            } catch (err: any) {
              session.abort();
              applePayError = err?.message ?? t("checkout.toast.cybersourceDeclinedDesc");
              resolve();
            }
          };

          session.onpaymentauthorized = (event: any) => {
            applePayToken = JSON.stringify(event.payment.token);
            session.completePayment((window as any).ApplePaySession.STATUS_SUCCESS);
            resolve();
          };

          session.oncancel = () => { resolve(); };
          session.begin();
        });

        if (applePayError) {
          toast({
            title: t("checkout.toast.cybersourceDeclined"),
            description: applePayError,
            variant: "destructive",
          });
          return;
        }
        if (!applePayToken) {
          // User cancelled the Apple Pay sheet — silent exit.
          return;
        }

        const appleWalletRes = await cybersourceWalletCharge.mutateAsync({
          walletType: "applepay",
          walletToken: applePayToken,
          orderId,
          items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
          district: _selectedDistrict,
          expressDelivery: deliveryMode === "express",
          noAddress,
          deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
          ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
          ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
          billingDetails: {
            firstName: sender.firstName,
            lastName: sender.lastName,
            email: sender.email,
          },
        });

        if (!appleWalletRes.ok || !appleWalletRes.paymentRef) {
          toast({
            title: t("checkout.toast.cybersourceDeclined"),
            description: appleWalletRes.message || t("checkout.toast.cybersourceDeclinedDesc"),
            variant: "destructive",
          });
          return;
        }

        void maybeSaveNewAddress();
        void maybeSaveProfilePhone();
        await finalizeOrderNow(appleWalletRes.paymentRef);
        return;
      }

      // ── CyberSource inline card payment ─────────────────────────────────
      if (payMethod === "cybersource") {
        // Unified Checkout owns the entire payment lifecycle (3DS + capture)
        // inside its widget and finalizes via handleUnifiedCheckoutResult —
        // its submit button is hidden, and this guard makes sure no stray
        // call can ever run the legacy Microform/payer-auth pipeline below
        // while UC is active.
        if (unifiedCheckoutActive) return;
        // Step 1: Get capture context from server (re-use cached one if
        // already fetched for the same orderId).
        let captureCtx = csCaptureContext;

        // CyberSource capture contexts expire after ~15 minutes.  If the
        // cached one is already expired (or within 30 s of expiry), drop it so
        // a fresh one is fetched below — using a stale context makes
        // createToken() fail with "Server-side validation has rejected your
        // request." and the Microform must be re-initialised before retrying.
        const contextWasStale =
          captureCtx !== null && isCaptureContextExpiredSoon(captureCtx, 30);
        if (contextWasStale) captureCtx = null;

        if (!captureCtx) {
          const ccRes = await cybersourceCapture.mutateAsync({
            items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
            orderId,
            district: _selectedDistrict,
            expressDelivery: deliveryMode === "express",
            noAddress,
            deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
            ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
            ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
            targetOrigin: window.location.origin,
          });
          if (!ccRes.ok || !ccRes.captureContext) {
            console.log("PAYMENT_DIAG", {
              stage: "captureContext",
              frontendEndpoint: "/api/payment/cybersource/capture-context",
              ok: ccRes.ok === true,
              hasCaptureContext: Boolean(ccRes.captureContext),
              serverMessage: ccRes.message ?? null,
            });
            toast({
              title: t("checkout.toast.cybersourceUnavailable"),
              description: ccRes.message || t("checkout.toast.cybersourceUnavailableDesc"),
              variant: "destructive",
            });
            return;
          }
          captureCtx = ccRes.captureContext;
          setCsCaptureContext(captureCtx);

          // If we just replaced a stale context the Microform is now
          // re-initialising asynchronously with the new one.  createToken()
          // cannot succeed until that completes — abort this attempt and ask
          // the shopper to re-enter their card details once the form reloads.
          if (contextWasStale) {
            toast({
              title: t("checkout.toast.csFormExpired"),
              description: t("checkout.toast.csFormExpiredDesc"),
            });
            return;
          }
        }

        // Step 2: Tokenize card in-browser via the CyberSource Microform SDK.
        if (!csFormRef.current) {
          console.log("PAYMENT_DIAG", {
            stage: "formRef",
            reason: "CyberSource form ref is null — the card form is not mounted",
            hadCaptureContext: Boolean(captureCtx),
            csFieldsReady,
          });
          toast({
            title: t("checkout.toast.cybersourceUnavailable"),
            description: t("checkout.toast.cybersourceUnavailableDesc"),
            variant: "destructive",
          });
          return;
        }

        // Staged, safe diagnostics for the token→charge flow. NEVER contains
        // the PAN, CVC, REST secret, or the full transient token.
        const paymentDiag: {
          stage: string;
          tokenCreated: boolean;
          frontendEndpoint: string;
          frontendStatus: number | null;
          backendRouteMatched: boolean | null;
          cybersourceStatus: number | null;
          cybersourceRequestId: string | null;
          cybersourceReason: string | null;
          cybersourceMessage: string | null;
        } = {
          stage: "createToken",
          tokenCreated: false,
          frontendEndpoint: "/api/payment/cybersource/charge",
          frontendStatus: null,
          backendRouteMatched: null,
          cybersourceStatus: null,
          cybersourceRequestId: null,
          cybersourceReason: null,
          cybersourceMessage: null,
        };

        let transientToken: string;
        try {
          transientToken = await csFormRef.current.createToken();
          paymentDiag.tokenCreated = Boolean(transientToken);
          paymentDiag.stage = "charge";
          console.log("PAYMENT_DIAG", {
            ...paymentDiag,
            tokenSegments: transientToken?.split(".").length,
          });
        } catch (tokenErr: any) {
          // Tokenization failed before any network call to our server —
          // this is a "card details could not be secured" problem, not a
          // decline and not a service outage.
          console.log("PAYMENT_DIAG", paymentDiag);
          toast({
            title: t("checkout.toast.csTokenFailed"),
            description: tokenErr?.message || t("checkout.toast.csTokenFailedDesc"),
            variant: "destructive",
          });
          return;
        }

        // Step 3 (optional): CyberSource Payer Authentication (3DS).
        // Active only when the backend feature flag is on AND the user is on LB+USD.
        // When payerAuthEnabled is false, this block is skipped entirely and the
        // flow falls through to the existing charge call unchanged.
        let payerAuthData: Parameters<typeof cybersourceCharge.mutateAsync>[0]["payerAuthData"] | undefined;

        if (payerAuthEnabled && useCyberSource) {
          // Generate a fresh attempt ID for this payment attempt.
          const attemptId = crypto.randomUUID();
          csPaymentAttemptIdRef.current = attemptId;
          setCsPayerAuthStage("collecting_device_data");

          // 3a. Setup — get deviceDataCollectionUrl + accessToken.
          let setupRes: Awaited<ReturnType<typeof csPayerAuthSetup.mutateAsync>>;
          try {
            setupRes = await csPayerAuthSetup.mutateAsync({
              transientTokenJwt: transientToken,
              orderId,
              paymentAttemptId: attemptId,
            });
          } catch {
            setCsPayerAuthStage("authentication_failed");
            csPaymentAttemptIdRef.current = null;
            toast({ title: t("checkout.toast.csSetupFailed"), variant: "destructive" });
            return;
          }
          if (!setupRes.ok || !setupRes.deviceDataCollectionUrl || !setupRes.accessToken || !setupRes.referenceId) {
            setCsPayerAuthStage("authentication_failed");
            csPaymentAttemptIdRef.current = null;
            toast({ title: t("checkout.toast.csSetupFailed"), variant: "destructive" });
            return;
          }

          // 3b. Mount the invisible device-data iframe and await collection.
          const deviceDataSuccess = await new Promise<boolean>((resolve) => {
            csDeviceDataResolverRef.current = resolve;
            setCsDeviceDataProps({
              deviceDataCollectionUrl: setupRes.deviceDataCollectionUrl!,
              accessToken: setupRes.accessToken!,
            });
          });
          setCsDeviceDataProps(null);
          csDeviceDataResolverRef.current = null;
          // A timeout (deviceDataSuccess === false) is not fatal — proceed anyway.
          if (!deviceDataSuccess) {
            // Log but continue; 3DS can still proceed without device fingerprint.
            console.log("PAYMENT_DIAG", { stage: "deviceData", result: "timeout_or_failed" }); // i18n-ignore
          }

          // 3c. Collect browser info for the enrollment check. Field names
          // and string types follow the CyberSource Payer Auth spec (mirrors
          // PayerAuthBrowserInfo in the API server).
          const browserInfo = {
            javaEnabled: false,
            javaScriptEnabled: true,
            acceptHeaders: "application/json, text/plain, */*", // i18n-ignore
            colorDepth: String(screen.colorDepth),
            screenHeight: String(screen.height),
            screenWidth: String(screen.width),
            timeZone: String(new Date().getTimezoneOffset()),
            userAgentBrowserValue: navigator.userAgent,
          };

          setCsPayerAuthStage("authentication_pending");

          // 3d. Check enrollment. The request/response contract mirrors the
          // backend route: amount/currency/returnUrl are required, and the
          // response is FLAT ({ enrolled, ...3DS fields }) — there is no
          // nested payerAuthData object.
          const enrollmentAmount = computeCartTotal(
            subtotal,
            districtFee + expressFee + slotFee,
            confirmedCouponDiscount,
          ).toFixed(2);
          let enrollRes: Awaited<ReturnType<typeof csPayerAuthCheckEnrollment.mutateAsync>>;
          try {
            enrollRes = await csPayerAuthCheckEnrollment.mutateAsync({
              paymentAttemptId: attemptId,
              transientTokenJwt: transientToken,
              referenceId: setupRes.referenceId,
              orderId,
              amount: enrollmentAmount,
              currency: "USD", // i18n-ignore
              // The issuer step-up iframe navigates here when the challenge
              // finishes; the page (served by our API on the same origin)
              // posts a completion message back to the checkout window.
              returnUrl: `${window.location.origin}/api/payment/cybersource/payer-auth/return`,
              browserInfo,
              billTo: {
                firstName: sender.firstName,
                lastName: sender.lastName,
                email: sender.email,
              },
            });
          } catch {
            setCsPayerAuthStage("authentication_failed");
            csPaymentAttemptIdRef.current = null;
            toast({ title: t("checkout.toast.csPayerAuthFailed"), variant: "destructive" });
            return;
          }

          if (enrollRes.ok && enrollRes.enrolled === false) {
            // Frictionless — no shopper interaction needed. Extract the 3DS
            // metadata from the flat response fields.
            payerAuthData = extractCsPayerAuthData(enrollRes);
            if (!hasCsPayerAuthProof(payerAuthData)) {
              // No usable 3DS proof — the backend charge would reject with
              // pa_required anyway, so fail here with the bank toast.
              setCsPayerAuthStage("authentication_failed");
              csPaymentAttemptIdRef.current = null;
              toast({ title: t("checkout.toast.csPayerAuthFailed"), variant: "destructive" });
              return;
            }
            setCsPayerAuthStage("authentication_succeeded");
          } else if (enrollRes.ok && enrollRes.enrolled === true) {
            // Challenge required. Keep the enrollment's transaction id — the
            // validate call is keyed by it, never by anything the challenge
            // iframe posts back.
            const challengeTxnId = enrollRes.authenticationTransactionId;
            if (!enrollRes.stepUpUrl || !enrollRes.accessToken || !challengeTxnId) {
              setCsPayerAuthStage("authentication_failed");
              csPaymentAttemptIdRef.current = null;
              toast({ title: t("checkout.toast.csPayerAuthFailed"), variant: "destructive" });
              return;
            }

            // 3e. Show the challenge modal and await shopper interaction.
            const challengeResult = await new Promise<{ completed: boolean; status?: string }>((resolve) => {
              csChallengeResolverRef.current = resolve;
              setCsChallengeProps({
                stepUpUrl: enrollRes.stepUpUrl!,
                accessToken: enrollRes.accessToken!,
              });
            });
            setCsChallengeProps(null);
            csChallengeResolverRef.current = null;

            if (!challengeResult.completed) {
              // Shopper dismissed the dialog or the 5-minute timeout fired.
              setCsPayerAuthStage("authentication_failed");
              csPaymentAttemptIdRef.current = null;
              toast({ title: t("checkout.toast.csChallengeCancelled"), variant: "destructive" });
              return;
            }

            // 3f. Validate after challenge completion. The completion message
            // only signals "the challenge is over" — validation decides
            // pass/fail and returns the 3DS metadata as flat fields.
            let validateRes: Awaited<ReturnType<typeof csPayerAuthValidate.mutateAsync>>;
            try {
              validateRes = await csPayerAuthValidate.mutateAsync({
                authenticationTransactionId: challengeTxnId,
                paymentAttemptId: attemptId,
              });
            } catch {
              setCsPayerAuthStage("authentication_failed");
              csPaymentAttemptIdRef.current = null;
              toast({ title: t("checkout.toast.csPayerAuthFailed"), variant: "destructive" });
              return;
            }
            payerAuthData = extractCsPayerAuthData(validateRes);
            if (!validateRes.ok || !hasCsPayerAuthProof(payerAuthData)) {
              setCsPayerAuthStage("authentication_failed");
              csPaymentAttemptIdRef.current = null;
              toast({ title: t("checkout.toast.csPayerAuthFailed"), variant: "destructive" });
              return;
            }
            setCsPayerAuthStage("authentication_succeeded");
          } else {
            // Enrollment refused (pa_* error) or unexpected response shape.
            setCsPayerAuthStage("authentication_failed");
            csPaymentAttemptIdRef.current = null;
            toast({ title: t("checkout.toast.csPayerAuthFailed"), variant: "destructive" });
            return;
          }

          setCsPayerAuthStage("authorization_pending");
          // csPaymentAttemptIdRef deliberately stays set through the charge
          // call so the backend can correlate the pa_* stages with the charge
          // in the PAYMENT_DIAG logs; it is cleared once the charge settles.
        }

        // Step 4: Charge the card server-side.
        // The API client throws on non-2xx, so map the failure here instead of
        // letting the generic outer catch mislabel it. Only HTTP 402 is a real
        // card decline — 502 (gateway/config error) must show the "service
        // unavailable" toast, never "payment declined". The server relays
        // CyberSource's own message; we never invent an entitlement claim.
        let chargeRes: { ok?: boolean; paymentRef?: string; message?: string };
        try {
          chargeRes = await cybersourceCharge.mutateAsync({
            orderId,
            ...(csPaymentAttemptIdRef.current ? { paymentAttemptId: csPaymentAttemptIdRef.current } : {}),
            transientTokenJwt: transientToken,
            items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
            district: _selectedDistrict,
            expressDelivery: deliveryMode === "express",
            noAddress,
            deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
            ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
            ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
            billingDetails: {
              firstName: sender.firstName,
              lastName: sender.lastName,
              email: sender.email,
              phone: sender.phone,
            },
            ...(payerAuthData ? { payerAuthData } : {}),
          });
        } catch (chargeErr) {
          const apiErr = chargeErr as {
            status?: number;
            data?: {
              code?: string;
              message?: string;
              declineCode?: string;
              requestId?: string;
              cybersourceStatus?: number;
            } | null;
            message?: string;
          };
          const serverMessage =
            (apiErr?.data && typeof apiErr.data === "object" && typeof apiErr.data.message === "string"
              ? apiErr.data.message
              : undefined);
          const serverCode =
            (apiErr?.data && typeof apiErr.data === "object" && typeof apiErr.data.code === "string"
              ? apiErr.data.code
              : undefined);
          paymentDiag.frontendStatus = typeof apiErr?.status === "number" ? apiErr.status : null;
          // A 404 from OUR server means the frontend hit a route that is not
          // registered; any other HTTP status proves the backend route matched.
          paymentDiag.backendRouteMatched =
            typeof apiErr?.status === "number" ? apiErr.status !== 404 : null;
          paymentDiag.cybersourceStatus =
            typeof apiErr?.data?.cybersourceStatus === "number" ? apiErr.data.cybersourceStatus : null;
          paymentDiag.cybersourceRequestId =
            typeof apiErr?.data?.requestId === "string" ? apiErr.data.requestId : null;
          paymentDiag.cybersourceReason =
            (typeof apiErr?.data?.declineCode === "string" ? apiErr.data.declineCode : null) ??
            serverCode ??
            null;
          paymentDiag.cybersourceMessage = serverMessage ?? null;
          console.log("PAYMENT_DIAG", paymentDiag);
          if (apiErr?.status === 402) {
            // Genuine processor decline — the only case that may say "declined".
            toast({
              title: t("checkout.toast.cybersourceDeclined"),
              description: serverMessage || t("checkout.toast.cybersourceDeclinedDesc"),
              variant: "destructive",
            });
          } else if (chargeErr instanceof TypeError) {
            // Genuine network failure — let the outer catch handle it.
            throw chargeErr;
          } else if (apiErr?.status === 404 || serverCode === "gateway_endpoint_error") {
            // 404 from our own API = route mismatch; gateway_endpoint_error =
            // CyberSource returned 404 for /pts/v2/payments (the server relays
            // the exact upstream response — cause is confirmed with CyberSource,
            // not inferred here).
            toast({
              title: t("checkout.toast.csEndpointNotFound"),
              description: serverMessage || t("checkout.toast.cybersourceUnavailableDesc"),
              variant: "destructive",
            });
          } else if (serverCode === "gateway_auth_error") {
            toast({
              title: t("checkout.toast.csAuthFailed"),
              description: serverMessage || t("checkout.toast.cybersourceUnavailableDesc"),
              variant: "destructive",
            });
          } else if (typeof serverCode === "string" && serverCode.startsWith("pa_")) {
            // Backend pa_* codes indicate a payer-auth failure at the charge
            // stage — show the bank-verification toast, NOT "Card declined".
            toast({
              title: t("checkout.toast.csPayerAuthFailed"),
              description: serverMessage || undefined,
              variant: "destructive",
            });
          } else {
            // gateway_validation_error surfaces its sanitized upstream message
            // here; anything else falls back to the generic unavailable copy.
            toast({
              title: t("checkout.toast.cybersourceUnavailable"),
              description: serverMessage || t("checkout.toast.cybersourceUnavailableDesc"),
              variant: "destructive",
            });
          }
          setCsPayerAuthStage("idle");
          csPaymentAttemptIdRef.current = null;
          trackEvent({ name: "payment_error", surface: "checkout", action: "provider" });
          trackWebEvent({ type: "payment_failed", currency: checkoutCurrency, properties: { method: paymentMethod } });
          return;
        }

        paymentDiag.stage = "complete";
        paymentDiag.frontendStatus = 200;
        paymentDiag.backendRouteMatched = true;
        console.log("PAYMENT_DIAG", paymentDiag);

        if (!chargeRes.ok || !chargeRes.paymentRef) {
          setCsPayerAuthStage("idle");
          csPaymentAttemptIdRef.current = null;
          toast({
            title: t("checkout.toast.cybersourceDeclined"),
            description: chargeRes.message || t("checkout.toast.cybersourceDeclinedDesc"),
            variant: "destructive",
          });
          return;
        }

        // Step 5: Create the order with the CyberSource paymentRef.
        setCsPayerAuthStage("idle");
        csPaymentAttemptIdRef.current = null;
        void maybeSaveNewAddress();
        void maybeSaveProfilePhone();
        await finalizeOrderNow(chargeRes.paymentRef);
        return;
      }

      await finalizeOrderNow();
    } catch (err) {
      const isNetworkFailure = err instanceof TypeError;
      const apiErr = err as { status?: number; message?: string } | null;
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

  // Shared disabled condition for the Step 1 "Continue to Payment" CTA —
  // used by both the mobile fixed-bottom button and the desktop sidebar button
  // so they stay in sync without duplicating the expression.
  const step1CtaDisabled =
    !recipient.firstName ||
    !recipientPhoneValid ||
    (!noAddress && !recipient.district) ||
    (!noAddress && !recipient.address) ||
    (!isSignedIn && (!sender.firstName || !sender.email)) ||
    (!hasProfilePhone && !sender.phone.trim());

  // Validate all required Step 1 fields, focus/scroll to the first invalid one,
  // and advance to Step 2 only when all fields are valid.
  // Used by both the desktop sidebar CTA (always-clickable) and the email
  // field's Enter-key handler.
  const handleValidateAndAdvance = () => {
    // Trigger phone-error UI for both phone fields.
    setPhoneSubmitAttempted(true);

    // Helper: scroll + focus the first invalid field so the user sees what's wrong.
    const focusInvalid = (el: HTMLElement | null) => {
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    };

    // Walk required fields in top-to-bottom form order and bail on the first gap.
    if (!recipient.firstName) {
      focusInvalid(recipientFirstNameRef.current);
      return;
    }
    if (!recipientPhoneValid) {
      focusInvalid(document.querySelector<HTMLElement>('[data-testid="input-recipient-phone"] input'));
      return;
    }
    if (!noAddress && !recipient.district) {
      focusInvalid(document.querySelector<HTMLElement>('[data-testid="select-district"]'));
      return;
    }
    if (!noAddress && !recipient.address) {
      focusInvalid(document.querySelector<HTMLElement>('[data-testid="input-recipient-address"]'));
      return;
    }
    if (!isSignedIn && !sender.firstName) {
      focusInvalid(senderFirstNameRef.current);
      return;
    }
    if (!isSignedIn && !sender.email) {
      focusInvalid(senderEmailRef.current);
      return;
    }
    if (!hasProfilePhone && !senderPhoneValid) {
      focusInvalid(document.querySelector<HTMLElement>('[data-testid="input-sender-phone"] input'));
      return;
    }

    setStep(2);
  };

  const stepLabels = [
    t("checkout.step.deliveryDetails"),
    t("checkout.step3.title"),
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f4f4f5" }}>
      {/* ── Checkout header ── */}
      <header className="z-40" style={{ backgroundColor: "hsl(var(--primary))" }}>
        <div className="max-w-content mx-auto px-page py-3 flex items-center text-primary-foreground">
          <Link href="/" aria-label={t("nav.logoAria")}>
            <Logo height={56} inverse={true} />
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
                    className="flex flex-col items-center gap-1.5"
                    aria-label={label}
                  >
                    <div
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                        done
                          ? "border-white bg-white text-primary"
                          : active
                          ? "border-white bg-white text-primary"
                          : "border-white/25 bg-transparent text-white/30"
                      }`}
                    >
                      {done ? <Check className="w-3.5 h-3.5" /> : n}
                    </div>
                    <span
                      className={`text-[11px] font-medium leading-none tracking-wide ${
                        active ? "text-white" : done ? "text-white/65" : "text-white/30"
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                  {i < 1 && (
                    <div
                      className={`w-10 sm:w-20 h-px mx-3 mb-5 transition-colors ${
                        done ? "bg-white/50" : "bg-white/15"
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
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 pb-24 lg:pb-0">
                <div className="mb-6">
                  <h2 className="text-2xl font-serif text-primary mb-1">{t("checkout.step.deliveryDetails")}</h2>
                  <p className="text-sm text-muted-foreground">{t("checkout.step1.desc")}</p>
                </div>

                {/* Recipient Details */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
                  <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-5">{t("checkout.section.recipientDetails")}</p>

                  {savedAddresses.length > 0 && (
                    <div className="mb-5">
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
                    className={`flex items-center gap-3 mb-4 rounded-xl border px-3.5 py-3 bg-card transition-colors ${
                      noAddress ? "border-primary" : "border-border"
                    }`}
                    data-testid="check-no-address-label"
                  >
                    <button
                      type="button"
                      onClick={() => setNoAddress(!noAddress)}
                      className="flex flex-1 items-center gap-3 text-start cursor-pointer"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                          noAddress ? "bg-primary text-primary-foreground" : "bg-muted text-primary"
                        }`}
                      >
                        <MapPin className="h-[18px] w-[18px]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground">
                          {t("checkout.askRecipientForAddressTitle")}
                        </div>
                        <div className="text-xs text-muted-foreground leading-snug mt-0.5">
                          {t("checkout.askRecipientForAddressNote")}
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

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("checkout.firstName")}<span className="text-destructive ms-0.5">*</span></label>
                      <Input ref={recipientFirstNameRef} value={recipient.firstName} onChange={(e) => setRecipient({ ...recipient, firstName: toTitleCase(e.target.value) })} onKeyDown={focusNextOnEnter(recipientLastNameRef)} placeholder={t("checkout.firstNamePh")} data-testid="input-recipient-first-name" autoCapitalize="words" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("checkout.lastName")}<span className="text-destructive ms-0.5">*</span></label>
                      <Input ref={recipientLastNameRef} value={recipient.lastName} onChange={(e) => setRecipient({ ...recipient, lastName: toTitleCase(e.target.value) })} autoCapitalize="words" onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          // PhoneInput renders the <input> with data-testid directly on it.
                          // Fall back to querying the first input inside the wrapper if needed.
                          const phoneInput =
                            document.querySelector<HTMLElement>('[data-testid="input-recipient-phone"]') ??
                            document.querySelector<HTMLElement>('[data-testid="input-recipient-phone"] input');
                          phoneInput?.focus();
                        }
                      }} placeholder={t("checkout.lastNamePh")} data-testid="input-recipient-last-name" />
                    </div>
                  </div>

                  <div className="mb-4">
                    <LazyWebPhoneField
                      label={t("checkout.phoneNumber")}
                      value={recipient.phone}
                      onChange={(v) => setRecipient({ ...recipient, phone: v })}
                      defaultCountry={(countryCode ?? "LB").toUpperCase()}
                      required
                      showError={phoneSubmitAttempted}
                      errorMessage={t("checkout.phoneInvalidNumber")}
                      data-testid="input-recipient-phone"
                      onValidityChange={setRecipientPhoneValid}
                    />
                  </div>

                  {!noAddress && (
                    <>
                      <div className="space-y-2 mb-4">
                        <label className="text-sm font-medium">{t("checkout.district")}<span className="text-destructive ms-0.5">*</span></label>
                        <Select
                          value={recipient.district}
                          onValueChange={(v) => setRecipient({ ...recipient, district: v })}
                          disabled={locationsLoading || !hasActiveCities}
                        >
                          <SelectTrigger data-testid="select-district">
                            <SelectValue
                              placeholder={
                                selectedCityData
                                  ? cityName(selectedCityData.id, selectedCityData.name)
                                  : locationsLoading
                                  ? t("checkout.districtLoading")
                                  : !hasActiveCities
                                  ? t("checkout.districtUnavailable")
                                  : t("checkout.selectDistrict")
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {currentCountryCities.map((city) => {
                              const inactive = city.isActive === false;
                              const label = cityName(city.id, city.name);
                              return (
                                <SelectItem key={city.id} value={city.name} disabled={inactive}>
                                  {label}
                                  {inactive && (
                                    // contrast-ok: inside disabled={inactive} SelectItem – WCAG 1.4.3 inactive UI exception
                                    <span className="ml-1.5 text-xs text-muted-foreground/70">
                                      {t("location.cityUnavailable")}
                                    </span>
                                  )}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2 mb-4">
                        <label className="text-sm font-medium">{t("checkout.address")}<span className="text-destructive ms-0.5">*</span></label>
                        <Textarea rows={3} value={recipient.address} onChange={(e) => { savedAddressSubFieldsRef.current = null; setRecipient({ ...recipient, address: e.target.value }); }} placeholder={t("checkout.addressPh")} data-testid="input-recipient-address" />
                      </div>

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

                {/* Sender Details */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
                  <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-5">{t("checkout.section.senderDetails")}</p>

                  {isSignedIn ? (
                    <div className="mb-4 rounded-xl border bg-secondary/40 p-4" data-testid="sender-summary">
                      <p className="text-sm">
                        {t("checkout.sendingAs", {
                          summary: [
                            `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim(),
                            user?.email ?? "",
                            profilePhone,
                          ].filter((s) => s && s.trim()).join(" · "),
                        })}
                      </p>
                      <Link href="/account/personal-information" className="mt-1 inline-block text-xs underline" data-testid="link-edit-account">
                        {t("checkout.editInAccount")}
                      </Link>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t("checkout.firstName")}<span className="text-destructive ms-0.5">*</span></label>
                          <Input ref={senderFirstNameRef} value={sender.firstName} onChange={(e) => setSender({ ...sender, firstName: toTitleCase(e.target.value) })} onKeyDown={focusNextOnEnter(senderLastNameRef)} data-testid="input-sender-first-name" autoCapitalize="words" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t("checkout.lastName")}<span className="text-destructive ms-0.5">*</span></label>
                          <Input ref={senderLastNameRef} value={sender.lastName} onChange={(e) => setSender({ ...sender, lastName: toTitleCase(e.target.value) })} onKeyDown={focusNextOnEnter(senderEmailRef)} data-testid="input-sender-last-name" autoCapitalize="words" />
                        </div>
                      </div>
                      <div className="space-y-2 mb-4">
                        <label className="text-sm font-medium">{t("checkout.emailAddress")}<span className="text-destructive ms-0.5">*</span></label>
                        <Input ref={senderEmailRef} type="email" value={sender.email} onChange={(e) => setSender({ ...sender, email: e.target.value })} onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            // Run the full validation handler directly so Enter in the
                            // email field works the same way on both mobile and desktop
                            // (desktop sidebar CTA is lg-only and may not be focusable
                            // from mobile breakpoints).
                            handleValidateAndAdvance();
                          }
                        }} data-testid="input-sender-email" />
                      </div>
                    </>
                  )}

                  {!hasProfilePhone && (
                    <div className="mb-4">
                      <LazyWebPhoneField
                        label={t("checkout.phoneNumber")}
                        value={sender.phone}
                        onChange={(v) => setSender({ ...sender, phone: v })}
                        defaultCountry={ipCountry ?? "LB"}
                        required
                        showError={phoneSubmitAttempted}
                        errorMessage={t("checkout.phoneInvalidNumber")}
                        data-testid="input-sender-phone"
                        onValidityChange={setSenderPhoneValid}
                        onCountryChange={(country, dialCode) => {
                          setSenderPhoneCountry(country ?? null);
                          setSenderPhoneDialCode(dialCode ?? null);
                        }}
                      />
                    </div>
                  )}

                  <label className="flex items-start gap-3 cursor-pointer select-none" data-testid="check-identity-secret-label">
                    <input type="checkbox" checked={identitySecret} onChange={(e) => setIdentitySecret(e.target.checked)} className="mt-1 h-4 w-4 accent-primary cursor-pointer" data-testid="check-identity-secret" />
                    <span className="text-sm">{t("checkout.keepIdentitySecret")}</span>
                  </label>
                  {identitySecret && (
                    <p className="text-xs text-gray-500 mt-1 ml-7" data-testid="identity-secret-hint">{t("checkout.keepIdentitySecretHint")}</p>
                  )}
                </div>

                {/* Delivery Time */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
                  <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-5">{t("checkout.section.deliveryTime")}</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => expressAvailable && setDeliveryMode("express")}
                      disabled={!expressAvailable}
                      data-testid="delivery-mode-express"
                      className={`px-4 py-4 rounded-xl border text-sm font-medium transition-all text-left ${
                        deliveryMode === "express" ? "text-white" : "border-border bg-card text-foreground hover:border-primary/30"
                      } ${!expressAvailable ? "opacity-50 cursor-not-allowed" : ""}`}
                      style={deliveryMode === "express" ? { borderColor: "hsl(var(--primary))", backgroundColor: "hsl(var(--primary))" } : {}}
                    >
                      <div className="font-semibold">{t("checkout.expressDelivery")}</div>
                      <div className="text-xs opacity-80 mt-1">{expressAvailable ? <><span>+</span><FormattedPrice usdValue={expressSurcharge} /></> : t("checkout.expressUnavailable")}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryMode("schedule")}
                      data-testid="delivery-mode-schedule"
                      className={`px-4 py-4 rounded-xl border text-sm font-medium transition-all text-left ${
                        deliveryMode === "schedule" ? "text-white" : "border-border bg-card text-foreground hover:border-primary/30"
                      }`}
                      style={deliveryMode === "schedule" ? { borderColor: "hsl(var(--primary))", backgroundColor: "hsl(var(--primary))" } : {}}
                    >
                      <div className="font-semibold">{t("checkout.scheduleDelivery")}</div>
                      <div className="text-xs opacity-80 mt-1">{t("checkout.scheduleDeliveryDesc")}</div>
                    </button>
                  </div>
                  {deliveryMode === "schedule" && (
                    <ScheduleInlinePanel
                      countryCode={countryCode}
                      initialDate={recipient.deliveryDate || undefined}
                      initialSlotLabel={deliverySlot || undefined}
                      timeSlots={timeSlots}
                      onChange={({ date, slotLabel, slotId }) => {
                        setRecipient((r) => ({ ...r, deliveryDate: date }));
                        setDeliverySlot(slotLabel);
                        setDeliverySlotId(slotId);
                      }}
                    />
                  )}
                </div>

                {/* Mobile fixed-bottom CTA — hidden on desktop (sidebar CTA takes over) */}
                <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-sm px-4 py-3 border-t border-gray-100 shadow-md flex gap-3 lg:hidden">
                  <Button variant="outline" size="lg" className="h-14 rounded-xl px-8" onClick={() => setLocation("/cart")} data-testid="button-back-to-cart-from-delivery">{t("checkout.back")}</Button>
                  <Button
                    ref={continueToPaymentRef}
                    size="lg"
                    className="flex-1 h-14 rounded-xl text-white font-semibold"
                    style={{ backgroundColor: "hsl(var(--primary))" }}
                    onClick={handleValidateAndAdvance}
                    disabled={step1CtaDisabled}
                    data-testid="button-continue-to-payment"
                  >
                    {t("checkout.continuePayment")}
                  </Button>
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
                      type LogoSpec = { name: string; src: string; fill?: boolean; contain?: boolean; containerWidth?: number; maxH?: string };
                      const cardLogos: LogoSpec[] = [
                        { name: "Mastercard", src: mastercardLogo, fill: true },
                        { name: "Visa", src: visaLogo, fill: true },
                        { name: "American Express", src: amexLogo, fill: true },
                      ];
                      const methodLogos: Record<string, LogoSpec[]> = {
                        card: cardLogos,
                        cybersource: cardLogos,
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
                        tabby: [{ name: "Tabby", src: tabbyLogo, fill: true, contain: true, containerWidth: 72 }],
                        klarna: [{ name: "Klarna", src: klarnaLogo, fill: true, contain: true, containerWidth: 72 }],
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
                                    className={logo.fill ? "inline-flex overflow-hidden rounded-[4px]" : "inline-flex items-center justify-center bg-white rounded-[4px] overflow-hidden p-[4px]"}
                                    style={{ width: logo.containerWidth ?? 48, height: 34 }}
                                  >
                                    <img
                                      src={logo.src}
                                      alt={logo.name}
                                      className={logo.fill ? `block w-full h-full ${logo.contain ? "object-contain" : "object-fill"}` : `block max-w-[30px] object-contain ${logo.maxH ?? ""}`}
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
                                usePaymentElement={false}
                                paymentAmount={undefined}
                                paymentCurrency={undefined}
                              />
                            </Suspense>
                          )}
                          {useCyberSource && m.id === "cybersource" && paymentMethod === "cybersource" && (
                            unifiedCheckoutActive ? (
                              ucOrderId && (noAddress || Boolean(_selectedDistrict)) ? (
                                <CyberSourceUnifiedCheckout
                                  key={ucSessionKey}
                                  payload={{
                                    items: items.map((i) => ({ wcId: i.product.wcId, osSlug: i.product.id, quantity: i.quantity })),
                                    orderId: ucOrderId,
                                    district: _selectedDistrict || undefined,
                                    expressDelivery: deliveryMode === "express",
                                    noAddress,
                                    deliverySlot: deliveryMode === "express" ? "" : deliverySlot,
                                    ...(deliveryMode !== "express" && deliverySlotId ? { deliverySlotId } : {}),
                                    ...(selectedCityData?.id != null ? { cityId: String(selectedCityData.id) } : {}),
                                    targetOrigin: window.location.origin,
                                    billingDetails: {
                                      firstName: sender.firstName,
                                      lastName: sender.lastName,
                                      email: sender.email,
                                      phone: sender.phone,
                                    },
                                    paymentAttemptId: ucAttemptIdRef.current ?? undefined,
                                  }}
                                  sessionKey={ucSessionKey}
                                  onResult={handleUnifiedCheckoutResult}
                                  onError={handleUnifiedCheckoutError}
                                />
                              ) : (
                                <div
                                  className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 py-6 text-sm text-muted-foreground"
                                  data-testid="loading-unified-checkout-init"
                                >
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span>{t("checkout.cybersource.loading")}</span>
                                </div>
                              )
                            ) : (
                              <CyberSourceSection
                                ref={csFormRef}
                                captureContext={csCaptureContext ?? ""}
                                prefetchError={csCaptureContextError}
                                environment={csCaptureEnv}
                                className="mt-3"
                                onFieldsReady={() => setCsFieldsReady(true)}
                                onFieldsFailed={(msg) => {
                                  setCsFieldsReady(false);
                                  setCsCaptureContextError(msg);
                                }}
                              />
                            )
                          )}
                        </div>
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
                  {!(paymentMethod === "cybersource" && unifiedCheckoutActive) && (
                    <div className="flex gap-3 mt-4">
                      <PaymentSubmitButton paymentMethod={paymentMethod} total={computeCartTotal(displaySubtotal, displayDistrictFee + displayExpressFee + displaySlotFee, displayCouponDiscount)} onClick={handleSubmit} disabled={isProcessing || (!noAddress && !_selectedDistrict) || (paymentMethod === "cybersource" && !csFieldsReady)} isProcessing={isProcessing} walletPreparing={walletPreparing} />
                    </div>
                  )}

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
                    recipient.firstName.trim().toLowerCase() === sender.firstName.trim().toLowerCase() &&
                    recipient.lastName.trim().toLowerCase() === sender.lastName.trim().toLowerCase() &&
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
            subtotal={displaySubtotal}
            districtFee={displayDistrictFee}
            expressFee={displayExpressFee}
            slotFee={displaySlotFee}
            confirmedCouponDiscount={displayCouponDiscount}
            isFreeDeliveryUnlocked={isFreeDeliveryUnlocked}
            originalCityFee={originalCityFee}
            effectiveFreeDeliveryEnabled={effectiveFreeDeliveryEnabled}
            effectiveFreeDeliveryThresholdUsd={effectiveFreeDeliveryThresholdUsd}
            deliveryMode={deliveryMode}
            deliveryRowText={deliveryRowText}
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
            onChangeDelivery={() => setDeliveryPickerOpen(true)}
            step={step}
            step1CtaDisabled={step1CtaDisabled}
            handleValidateAndAdvance={handleValidateAndAdvance}
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
                <span>{t("checkout.toast.pricesUpdatedSlot")}</span>
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
      />
      {/* ── CyberSource Payer Authentication (3DS) components ── */}
      {/* Invisible device-data collection iframe — mounts only during the
          collecting_device_data stage and unmounts immediately after. */}
      {csDeviceDataProps && (
        <CyberSourceDeviceDataFrame
          deviceDataCollectionUrl={csDeviceDataProps.deviceDataCollectionUrl}
          accessToken={csDeviceDataProps.accessToken}
          onComplete={(success) => {
            const resolver = csDeviceDataResolverRef.current;
            if (resolver) {
              csDeviceDataResolverRef.current = null;
              resolver(success);
            }
          }}
        />
      )}
      {/* Issuer challenge modal — mounts only when a step-up is required. */}
      {csChallengeProps && (
        <CyberSourceChallengeModal
          stepUpUrl={csChallengeProps.stepUpUrl}
          accessToken={csChallengeProps.accessToken}
          onComplete={(status) => {
            const resolver = csChallengeResolverRef.current;
            if (resolver) {
              csChallengeResolverRef.current = null;
              resolver({ completed: true, status });
            }
          }}
          onCancel={() => {
            const resolver = csChallengeResolverRef.current;
            if (resolver) {
              csChallengeResolverRef.current = null;
              resolver({ completed: false });
            }
          }}
        />
      )}
    </div>
  );
}

// Stripe state and the LazyStripeSection dynamic import are now fully
// managed inside CheckoutForm — no Elements wrapper needed here.
export default function Checkout() {
  return <CheckoutForm />;
}

